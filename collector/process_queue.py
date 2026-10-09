import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from match import process_candidate

BATCH_SIZE = 50

def get_db_connection():
    return psycopg2.connect(os.environ["SUPABASE_DATABASE_URL"])

def extract_and_save_candidate(conn, source):
    """
    Transforms a raw source record into a candidate record.
    Supports both pre-parsed structured WARN metadata and news extraction.
    """
    metadata = source.get("metadata") or {}
    
    # Handle WARN notice structured data if present
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except Exception:
            metadata = {}

    company_name = metadata.get("company_name") or source.get("title") or "Unknown Company"
    impacted_count = metadata.get("affected_count") or metadata.get("impacted_count") or None
    notice_date = metadata.get("notice_date") or metadata.get("date") or None

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            INSERT INTO candidates (
                source_id, company_name, impacted_count, notice_date, status, created_at
            ) VALUES (
                %s, %s, %s, %s, 'pending', NOW()
            )
            ON CONFLICT (source_id) DO UPDATE SET updated_at = NOW()
            RETURNING id;
            """,
            (source["source_id"], company_name, impacted_count, notice_date)
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

        print(f"Queue Processor: Found {len(sources)} sources to extract & categorize.", flush=True)

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