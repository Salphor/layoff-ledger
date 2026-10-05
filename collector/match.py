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

            data = candidate["extracted_json"]
            if not data.get("is_layoff") or not data.get("company_name"):
                cur.execute("UPDATE candidates SET status = 'rejected' WHERE id = %s", (candidate_id,))
                conn.commit()
                return

            company_id = find_or_create_company(conn, data["company_name"])
            
            # Match existing event for same company within 30 days
            cur.execute(
                """
                SELECT id FROM layoff_events 
                WHERE company_id = %s 
                  AND (announcement_date IS NULL OR announcement_date >= NOW() - INTERVAL '30 days')
                ORDER BY created_at DESC LIMIT 1
                """,
                (company_id,)
            )
            existing_event = cur.fetchone()

            if existing_event:
                # Link source to existing event
                event_id = existing_event["id"]
                cur.execute(
                    "INSERT INTO event_sources (event_id, source_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                    (event_id, candidate["source_id"])
                )
                cur.execute("UPDATE candidates SET status = 'matched_existing' WHERE id = %s", (candidate_id,))
            else:
                # Create candidate event requiring publish approval if confidence is moderate
                event_slug = f"{data['company_name'].lower().replace(' ', '-')}-{data.get('announcement_date', 'recent')}"
                status = "published" if candidate["confidence"] >= 0.85 else "review"
                
                cur.execute(
                    """
                    INSERT INTO layoff_events 
                    (company_id, event_slug, announcement_date, effective_date, employees_affected, 
                     employee_count_text, locations, departments, roles, reason_provided, summary, status, confidence)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        company_id, event_slug, data.get("announcement_date"), data.get("effective_date"),
                        data.get("employees_affected"), data.get("employee_count_text"),
                        json.dumps(data.get("locations", [])), json.dumps(data.get("departments", [])),
                        json.dumps(data.get("roles", [])), data.get("reason_provided"),
                        data["summary"], status, candidate["confidence"]
                    )
                )
                event_id = cur.fetchone()["id"]
                cur.execute(
                    "INSERT INTO event_sources (event_id, source_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                    (event_id, candidate["source_id"])
                )
                cur.execute("UPDATE candidates SET status = 'created_event' WHERE id = %s", (candidate_id,))
            
            conn.commit()
    finally:
        conn.close()
