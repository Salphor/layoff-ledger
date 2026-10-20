import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from match import process_candidate

BATCH_SIZE = 50

def get_db_connection():
    return psycopg2.connect(os.environ["SUPABASE_DATABASE_URL"])

def build_warn_payload(source):
    """
    Builds the extracted_json for an official WARN notice. This mirrors the
    structured-WARN branch of run_scan.py so both paths produce identical
    candidates (same company naming, same field names).

    IMPORTANT: match.py rejects any candidate whose JSON has no top-level
    "company_name", so it must be included here.
    """
    metadata = source.get("metadata") or {}
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except Exception:
            metadata = {}

    raw_row = metadata.get("raw_row") or {}
    state = str(metadata.get("state") or "US").upper()
    company_name = (
        raw_row.get("company")
        or raw_row.get("company_name")
        or (source.get("title") or "").replace("WARN Notice: ", "")
        or "Unknown Company"
    )

    employees = raw_row.get("employees", 0)
    headcount = int(employees) if str(employees).isdigit() else None
    if not headcount:
        headcount = metadata.get("affected_count") or None

    notice_date = metadata.get("notice_date") or metadata.get("date") or None

    summary = f"Official {state} State WARN Notice filed by {company_name}."
    if headcount:
        summary += f" Affects {headcount} workers."

    return {
        "source_id": str(source["source_id"]),
        "company_name": company_name,
        "headcount": headcount,
        "date_announced": notice_date,
        "is_layoff": True,
        "source_type": "warn_database",
        "summary": summary,
    }


def extract_and_save_candidate(conn, source):
    """Creates a pending candidate for an official WARN notice source."""
    payload = build_warn_payload(source)

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            INSERT INTO candidates (
                source_id, company_name, classification, extracted_json, confidence, status, created_at
            ) VALUES (
                %s, %s, 'layoff', %s, 1.000, 'pending', NOW()
            )
            ON CONFLICT (source_id) DO UPDATE SET
                company_name = EXCLUDED.company_name,
                extracted_json = EXCLUDED.extracted_json
            RETURNING id;
            """,
            (source["source_id"], payload["company_name"], json.dumps(payload)),
        )
        row = cur.fetchone()
        conn.commit()
        return row["id"] if row else None

def run_queue_processor():
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Fetch un-extracted sources from backlog safely targeting table 's'
            cur.execute(
                """
                SELECT s.id AS source_id, s.source_key, s.publisher, s.url, s.title, s.metadata
                FROM sources s
                LEFT JOIN candidates c ON s.id = c.source_id
                WHERE c.id IS NULL
                  AND s.source_key LIKE 'warn-%%'   -- news articles are extracted by run_scan.py, never here
                ORDER BY s.id DESC
                LIMIT %s
                FOR UPDATE OF s SKIP LOCKED
                """,
                (BATCH_SIZE,)
            )
            sources = cur.fetchall()

        if not sources:
            print("Queue is empty. All sources are fully processed and categorized!", flush=True)
            return

        print(f"Queue Processor: Found {len(sources)} official WARN sources to categorize.", flush=True)

        processed_count = 0
        for src in sources:
            try:
                # 1 & 2. Create candidate entry from source data
                candidate_id = extract_and_save_candidate(conn, src)
                
                if candidate_id:
                    # 3. Categorize candidate into companies and layoff_events
                    process_candidate(candidate_id)
                    processed_count += 1

            except Exception as e:
                print(f"Error processing source ID {src.get('source_id')}: {e}", flush=True)
                conn.rollback()

        print(f"Queue Processor completed: Successfully processed {processed_count}/{len(sources)} items.", flush=True)

    finally:
        conn.close()

if __name__ == "__main__":
    run_queue_processor()