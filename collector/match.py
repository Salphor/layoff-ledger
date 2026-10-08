import psycopg2
from psycopg2.extras import RealDictCursor
import os
import json

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

            # Match Window: Search up to 90 days backward from announcement/notice date
            # Handles WARN filings (~60 days prior) matching with subsequent news articles
            cur.execute(
                """
                SELECT id, source_count, status, employees_affected, notice_date, effective_date
                FROM layoff_events 
                WHERE company_id = %s 
                  AND (
                      (%s::date IS NOT NULL AND notice_date BETWEEN (%s::date - INTERVAL '14 days') AND (%s::date + INTERVAL '90 days'))
                      OR (%s::date IS NOT NULL AND date_announced BETWEEN (%s::date - INTERVAL '14 days') AND (%s::date + INTERVAL '90 days'))
                      OR (created_at >= NOW() - INTERVAL '90 days')
                  )
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (company_id, date_announced, date_announced, date_announced, date_announced, date_announced, date_announced)
            )
            existing_event = cur.fetchone()

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
                event_slug = f"{data['company_name'].lower().replace(' ', '-')}-{date_announced or 'recent'}"
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