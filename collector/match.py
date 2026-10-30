import psycopg2
from psycopg2.extras import RealDictCursor
import os
import json
import re
import uuid
from datetime import date, datetime

from company_names import company_key, resolve_company, slugify

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
# Locations: each location of a company is its own event. A WARN notice only
# joins another WARN event at the same location (city or county). Several rows
# of one filing at one location (California lists every site) are added
# together into one event. News can join any event of the company.
#
# "Gap" below = (new source's date) - (event's date), in days.
# ---------------------------------------------------------------------------
LOOKBACK_DAYS = 14        # a source may be dated slightly BEFORE the event (late / out-of-order arrival)
WINDOW_WARN_NEWS = 90     # news about an event that has an official WARN notice
WINDOW_WARN_WARN = 30     # another WARN filing for the same wave (extra sites, amendments)
WINDOW_NEWS_ONLY = 21     # events with no WARN notice: one news cycle, then it's a new event

CLOSED_STATUSES = ("rejected", "archived")
RESCINDED_STATUS = "archived"  # hidden from the site (it shows only published/verified)


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


def as_list(value):
    if isinstance(value, list):
        return [str(v) for v in value if v]
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(v) for v in parsed if v]
        except ValueError:
            return [value]
    return []


def location_key(locations, site=None) -> str:
    """'Bakersfield, CA' -> 'bakersfieldca'. Falls back to the site name."""
    first = (as_list(locations) or [site or ""])[0]
    return re.sub(r"[^a-z0-9]+", "", first.lower())


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


def pick_matching_event(events, candidate_date: date, candidate_is_warn: bool, candidate_loc: str = ""):
    """Returns the existing event this source belongs to, or None for a new event."""
    best, best_key = None, None
    for ev in events:
        has_warn = bool(ev.get("has_warn"))
        # A WARN notice for another location is another event.
        if candidate_is_warn and has_warn and location_key(ev.get("locations")) != candidate_loc:
            continue
        gap = (candidate_date - event_anchor_date(ev)).days
        if gap < -LOOKBACK_DAYS or gap > max_gap_days(has_warn, candidate_is_warn):
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


def find_or_create_company(conn, company_name: str, key: str = None, domain: str = None) -> str:
    """One company per matching key (companies.name_key, see db/migrations/003)."""
    key = key or company_key(company_name)
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT id FROM companies WHERE name_key = %s LIMIT 1", (key,))
        row = cur.fetchone()
        if row:
            return row["id"]

        base = slugify(company_name)
        slug, n = base, 2
        while True:
            cur.execute("SELECT 1 FROM companies WHERE slug = %s", (slug,))
            if not cur.fetchone():
                break
            slug, n = f"{base}-{n}", n + 1

        cur.execute(
            "INSERT INTO companies (canonical_name, slug, website_domain, name_key) VALUES (%s, %s, %s, %s) RETURNING id",
            (company_name, slug, domain, key),
        )
        new_id = cur.fetchone()["id"]
        conn.commit()
        return new_id


def ensure_company_keys(conn):
    """
    Fills companies.name_key for companies made before keys existed, and
    merges companies whose names turn out to be the same employer (their
    events move to the oldest one). Cheap when there is nothing to do.
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT id, canonical_name FROM companies WHERE name_key IS NULL ORDER BY canonical_name")
        todo = cur.fetchall()
        merged = 0
        for row in todo:
            resolved = resolve_company(row["canonical_name"])
            key = resolved["key"] or company_key(row["canonical_name"])
            cur.execute("SELECT id FROM companies WHERE name_key = %s AND id <> %s LIMIT 1", (key, row["id"]))
            keep = cur.fetchone()
            if keep:
                cur.execute("UPDATE layoff_events SET company_id = %s WHERE company_id = %s", (keep["id"], row["id"]))
                cur.execute("DELETE FROM companies WHERE id = %s", (row["id"],))
                merged += 1
            else:
                name = resolved["name"] or row["canonical_name"]
                cur.execute(
                    "UPDATE companies SET name_key = %s, canonical_name = %s WHERE id = %s",
                    (key, name, row["id"]),
                )
                # Old slugs could hold "(", "." or "&"; switch to a clean one if free.
                cur.execute("SELECT 1 FROM companies WHERE slug = %s AND id <> %s", (slugify(name), row["id"]))
                if not cur.fetchone():
                    cur.execute("UPDATE companies SET slug = %s WHERE id = %s", (slugify(name), row["id"]))
        conn.commit()
    if todo:
        print(f"Company keys: filled {len(todo) - merged}, merged {merged} duplicate companies.", flush=True)


def _was_rescinded(cur, key, loc, when) -> bool:
    """A rescission for this company and location within the WARN window?"""
    cur.execute(
        """
        SELECT c.extracted_json AS data FROM candidates c
        WHERE c.status = 'rejected'
          AND c.extracted_json->>'rescinded' = 'true'
          AND c.extracted_json->>'company_key' = %s
        """,
        (key,),
    )
    for row in cur.fetchall():
        data = row["data"] or {}
        if isinstance(data, str):
            data = json.loads(data)
        other = parse_date(data.get("date_announced") or data.get("notice_date"))
        if (location_key(data.get("locations"), data.get("site")) == loc and other
                and -LOOKBACK_DAYS <= (other - when).days <= WINDOW_WARN_WARN):
            return True
    return False


def _warn_summary(cur, event_id, company_name, total):
    """Summary for an event built from several WARN rows."""
    cur.execute(
        """
        SELECT c.extracted_json->>'site' AS site, c.extracted_json->>'state' AS state
        FROM candidates c JOIN sources s ON s.id = c.source_id
        WHERE c.layoff_event_id = %s AND s.source_key LIKE 'warn-%%'
        """,
        (event_id,),
    )
    rows = cur.fetchall()
    states = sorted({r["state"] for r in rows if r["state"]})
    sites = sorted({r["site"] for r in rows if r["site"]})
    text = f"{company_name} filed {len(rows)} official WARN notices"
    if states:
        text += f" with {', '.join(states)}"
    text += f" covering {total:,} workers." if total else "."
    if sites and len(sites) <= 6:
        text += f" Sites: {'; '.join(sites)}."
    return text


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

            # Is the incoming source an official WARN notice? Look at the source
            # record itself rather than trusting the payload.
            source_id = candidate["source_id"]
            cur.execute("SELECT source_key, published_at FROM sources WHERE id = %s", (source_id,))
            src_row = cur.fetchone() or {}
            candidate_is_warn = (src_row.get("source_key") or "").startswith("warn-")

            # WARN payloads arrive already cleaned (warn_fields.py); news names
            # from Gemini go through the same cleaning and parent groups.
            if candidate_is_warn and data.get("company_key"):
                company_name, key = data["company_name"], data["company_key"]
            else:
                resolved = resolve_company(data["company_name"])
                company_name, key = resolved["name"] or data["company_name"], resolved["key"]
            company_id = find_or_create_company(conn, company_name, key)

            # Extract facts from candidate JSON payload
            date_announced = data.get("date_announced") or data.get("announcement_date")
            effective_date = data.get("effective_date")
            headcount = data.get("employees_affected") or data.get("headcount")
            notice_date = data.get("notice_date") if candidate_is_warn else None
            locations = as_list(data.get("locations"))
            loc = location_key(locations, data.get("site")) if candidate_is_warn else ""

            # The date this source is about: its own announcement/notice date,
            # else when it was published, else today (it was just discovered).
            candidate_date = (
                parse_date(date_announced)
                or parse_date(notice_date)
                or parse_date(src_row.get("published_at"))
                or date.today()
            )
            # Without this, an article with no date in its text was listed on
            # the day it happened to be processed.
            date_announced = date_announced or candidate_date.isoformat()

            # Candidate events: this company's open events, with a flag for
            # whether each is backed by an official WARN notice.
            cur.execute(
                """
                SELECT e.id, e.source_count, e.status, e.employees_affected, e.notice_date,
                       e.date_announced, e.effective_date, e.created_at, e.locations,
                       EXISTS (
                           SELECT 1 FROM event_sources es
                           JOIN sources s ON s.id = es.source_id
                           WHERE es.layoff_event_id = e.id AND s.source_key LIKE 'warn-%%'
                       ) AS has_warn
                FROM layoff_events e
                WHERE e.company_id = %s
                  AND e.status NOT IN %s
                ORDER BY e.created_at DESC
                LIMIT 200
                """,
                (company_id, CLOSED_STATUSES),
            )
            existing_event = pick_matching_event(cur.fetchall(), candidate_date, candidate_is_warn, loc)

            # A rescinded notice: the layoff was called off. Hide the event it
            # belongs to (if we have it) and don't create a new one.
            if data.get("rescinded"):
                if existing_event and existing_event.get("has_warn"):
                    cur.execute(
                        "UPDATE layoff_events SET status = %s, updated_at = NOW() WHERE id = %s",
                        (RESCINDED_STATUS, existing_event["id"]),
                    )
                cur.execute("UPDATE candidates SET status = 'rejected' WHERE id = %s", (candidate_id,))
                conn.commit()
                return

            if existing_event:
                # --- MATCH FOUND: Attach source to existing event ---
                event_id = existing_event["id"]
                new_count = (existing_event["source_count"] or 1) + 1

                # Upgrade verification status once 3+ distinct sources report it.
                # Extra rows of the same WARN filing don't count as confirmation.
                warn_on_warn = candidate_is_warn and existing_event.get("has_warn")
                new_status = 'verified' if (new_count >= 3 and not warn_on_warn) else existing_event["status"]

                current = existing_event["employees_affected"]
                same_filing = (
                    candidate_is_warn and existing_event.get("has_warn")
                    and parse_date(existing_event.get("notice_date")) == parse_date(notice_date)
                )
                if same_filing and headcount and current:
                    # Another site of the same filing: add it up.
                    updated_headcount = current + int(headcount)
                elif candidate_is_warn and existing_event.get("has_warn") and headcount and current:
                    # A later amendment: keep the larger number, never double count.
                    updated_headcount = max(current, int(headcount))
                else:
                    updated_headcount = current or headcount
                updated_effective = effective_date or existing_event["effective_date"]
                merged_locations = as_list(existing_event.get("locations"))
                for place in locations:
                    if place not in merged_locations:
                        merged_locations.append(place)

                cur.execute(
                    """
                    UPDATE layoff_events
                    SET source_count = %s,
                        status = %s,
                        employees_affected = %s,
                        effective_date = %s,
                        locations = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (new_count, new_status, updated_headcount, updated_effective,
                     json.dumps(merged_locations), event_id)
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

                # Several WARN rows on one event: describe them together.
                if candidate_is_warn and existing_event.get("has_warn"):
                    cur.execute(
                        "UPDATE layoff_events SET summary = %s WHERE id = %s",
                        (_warn_summary(cur, event_id, company_name, updated_headcount), event_id),
                    )

            else:
                # --- NO MATCH: Create new layoff event ---
                event_slug = unique_event_slug(cur, f"{slugify(company_name)}-{date_announced}")
                initial_status = "published" if candidate["confidence"] >= 0.85 else "review"
                # Sources are processed newest first, so a rescission can arrive
                # before the notice it cancels. Then the new event starts hidden.
                if candidate_is_warn and _was_rescinded(cur, key, loc, candidate_date):
                    initial_status = RESCINDED_STATUS

                cur.execute(
                    """
                    INSERT INTO layoff_events
                    (company_id, event_slug, date_announced, notice_date, effective_date, employees_affected,
                     employee_count_text, locations, departments, roles, reason_provided, summary, status, confidence, source_count)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1)
                    RETURNING id
                    """,
                    (
                        company_id, event_slug, date_announced, notice_date, effective_date,
                        headcount, data.get("employee_count_text"),
                        json.dumps(locations), json.dumps(data.get("departments", [])),
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
