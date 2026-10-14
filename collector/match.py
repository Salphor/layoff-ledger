import psycopg2
from psycopg2.extras import RealDictCursor
import os
import json
import uuid
from datetime import date, datetime

# ---------------------------------------------------------------------------
# Event-matching rules
#
# A new source is attached to an existing event for the same company only if
# its date falls close enough to that event's date. How close depends on what
# kind of event it is:
#
#   * Events backed by an official WARN notice keep collecting sources for
#     ~90 days (the notice period is 60 days, and coverage / amended filings
#     trail it).
#   * Events that exist only because of news coverage stay "open" for a short
#     news cycle. A story about the same company weeks later is almost always
#     a new event.
#
# "Gap" below = (new source's date) - (event's date), in days.
# ---------------------------------------------------------------------------
LOOKBACK_DAYS = 14        # a source may be dated slightly BEFORE the event (late / out-of-order arrival)
WINDOW_WARN_NEWS = 90     # news about an event that has an official WARN notice
WINDOW_WARN_WARN = 30     # another WARN filing for the same wave (extra sites, amendments)
WINDOW_NEWS_ONLY = 21     # events with no WARN notice: one news cycle, then it's a new event

CLOSED_STATUSES = ("rejected", "archived")


def parse_date(value):
    """Best-effort date parsing for ISO strings, timestamps and US WARN formats."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    text = text.split("T")[0].split(" ")[0]
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def event_anchor_date(event) -> date:
    return (
        parse_date(event.get("date_announced"))
        or parse_date(event.get("notice_date"))
        or parse_date(event.get("created_at"))
        or date.today()
    )


def max_gap_days(event_has_warn: bool, candidate_is_warn: bool) -> int:
    if event_has_warn:
        return WINDOW_WARN_WARN if candidate_is_warn else WINDOW_WARN_NEWS
    return WINDOW_NEWS_ONLY


def pick_matching_event(events, candidate_date: date, candidate_is_warn: bool):
    """Returns the existing event this source belongs to, or None for a new event."""
    best, best_key = None, None
    for ev in events:
        gap = (candidate_date - event_anchor_date(ev)).days
        if gap < -LOOKBACK_DAYS or gap > max_gap_days(bool(ev.get("has_warn")), candidate_is_warn):
            continue
        created = ev.get("created_at")
        created_ts = created.timestamp() if isinstance(created, datetime) else 0
        key = (abs(gap), -created_ts)  # closest in time wins; ties go to the newest event
        if best_key is None or key < best_key:
            best, best_key = ev, key
    return best


def unique_event_slug(cur, base: str) -> str:
    cur.execute("SELECT 1 FROM layoff_events WHERE event_slug = %s", (base,))
    if cur.fetchone():
        return f"{base}-{uuid.uuid4().hex[:6]}"
    return base


def get_db_connection():
    return psycopg2.connect(os.environ["SUPABASE_DATABASE_URL"])

def find_or_create_company(conn, company_name: str, domain: str = None) -> str:
    slug = company_name.lower().replace(" ", "-").replace(",", "").replace(".", "")
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT id FROM companies WHERE slug = %s OR canonical_name ILIKE %s", (slug, company_name))
        row = cur.fetchone()
        if row:
            return row["id"]
        
        cur.execute(
            "INSERT INTO companies (canonical_name, slug, website_domain) VALUES (%s, %s, %s) RETURNING id",
            (company_name, slug, domain)
        )
        conn.commit()
        return cur.fetchone()["id"]

def process_candidate(candidate_id: str):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM candidates WHERE id = %s", (candidate_id,))
            candidate = cur.fetchone()
            if not candidate or candidate["status"] != "pending":
                return

            data = candidate["extracted_json"] or {}
            if not data.get("is_layoff") or not data.get("company_name"):
                cur.execute("UPDATE candidates SET status = 'rejected' WHERE id = %s", (candidate_id,))
                conn.commit()
                return

            company_id = find_or_create_company(conn, data["company_name"])
            
            # Extract facts from candidate JSON payload
            date_announced = data.get("date_announced") or data.get("announcement_date")
            effective_date = data.get("effective_date")
            headcount = data.get("employees_affected") or data.get("headcount")
            source_id = candidate["source_id"]

            # Is the incoming source an official WARN notice? Look at the source
            # record itself rather than trusting the payload.
            cur.execute("SELECT source_key, published_at FROM sources WHERE id = %s", (source_id,))
            src_row = cur.fetchone() or {}
            candidate_is_warn = (src_row.get("source_key") or "").startswith("warn-")

            # The date this source is about: its own announcement/notice date,
            # else when it was published, else today (it was just discovered).
            candidate_date = (
                parse_date(date_announced)
                or parse_date(data.get("notice_date"))
                or parse_date(src_row.get("published_at"))
                or date.today()
            )

            # Candidate events: this company's open events, with a flag for
            # whether each is backed by an official WARN notice.
            cur.execute(
                """
                SELECT e.id, e.source_count, e.status, e.employees_affected, e.notice_date,
                       e.date_announced, e.effective_date, e.created_at,
                       EXISTS (
                           SELECT 1 FROM event_sources es
                           JOIN sources s ON s.id = es.source_id
                           WHERE es.layoff_event_id = e.id AND s.source_key LIKE 'warn-%%'
                       ) AS has_warn
                FROM layoff_events e
                WHERE e.company_id = %s
                  AND e.status NOT IN %s
                ORDER BY e.created_at DESC
                LIMIT 50
                """,
                (company_id, CLOSED_STATUSES),
            )
            existing_event = pick_matching_event(cur.fetchall(), candidate_date, candidate_is_warn)

            if existing_event:
                # --- MATCH FOUND: Attach source to existing event ---
                event_id = existing_event["id"]
                new_count = (existing_event["source_count"] or 1) + 1
                
                # Upgrade verification status once 3+ distinct sources report it
                new_status = 'verified' if new_count >= 3 else existing_event["status"]
                
                updated_headcount = headcount if (headcount and not existing_event["employees_affected"]) else existing_event["employees_affected"]
                updated_effective = effective_date or existing_event["effective_date"]

                cur.execute(
                    """
                    UPDATE layoff_events 
                    SET source_count = %s,
                        status = %s,
                        employees_affected = %s,
                        effective_date = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (new_count, new_status, updated_headcount, updated_effective, event_id)
                )

                # Link source and candidate in junction table
                cur.execute(
                    """
                    INSERT INTO event_sources (layoff_event_id, source_id, candidate_id) 
                    VALUES (%s, %s, %s) 
                    ON CONFLICT DO NOTHING
                    """,
                    (event_id, source_id, candidate_id)
                )
                cur.execute("UPDATE candidates SET status = 'matched_existing', layoff_event_id = %s WHERE id = %s", (event_id, candidate_id))

            else:
                # --- NO MATCH: Create new layoff event ---
                event_slug = unique_event_slug(
                    cur, f"{data['company_name'].lower().replace(' ', '-')}-{date_announced or 'recent'}"
                )
                initial_status = "published" if candidate["confidence"] >= 0.85 else "review"

                cur.execute(
                    """
                    INSERT INTO layoff_events 
                    (company_id, event_slug, date_announced, notice_date, effective_date, employees_affected, 
                     employee_count_text, locations, departments, roles, reason_provided, summary, status, confidence, source_count)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1)
                    RETURNING id
                    """,
                    (
                        company_id, event_slug, date_announced, date_announced, effective_date,
                        headcount, data.get("employee_count_text"),
                        json.dumps(data.get("locations", [])), json.dumps(data.get("departments", [])),
                        json.dumps(data.get("roles", [])), data.get("reason_provided"),
                        data.get("summary", ""), initial_status, candidate["confidence"]
                    )
                )
                event_id = cur.fetchone()["id"]

                cur.execute(
                    """
                    INSERT INTO event_sources (layoff_event_id, source_id, candidate_id) 
                    VALUES (%s, %s, %s) 
                    ON CONFLICT DO NOTHING
                    """,
                    (event_id, source_id, candidate_id)
                )
                cur.execute("UPDATE candidates SET status = 'created_event', layoff_event_id = %s WHERE id = %s", (event_id, candidate_id))

            conn.commit()
    finally:
        conn.close()