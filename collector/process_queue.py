import os
import psycopg2
from psycopg2.extras import RealDictCursor
from match import process_candidate

BATCH_SIZE = 50

def get_db_connection():
    return psycopg2.connect(os.environ["SUPABASE_DATABASE_URL"])

def run_queue_processor():
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Fetch un-extracted sources from backlog safely
            cur.execute(
                """
                SELECT s.id AS source_id, s.source_key, s.publisher, s.url, s.title, s.metadata
                FROM sources s
                LEFT JOIN candidates c ON s.id = c.source_id
                WHERE c.id IS NULL
                ORDER BY s.id DESC
                LIMIT %s
                FOR UPDATE SKIP LOCKED
                """,
                (BATCH_SIZE,)
            )
            sources = cur.fetchall()

        if not sources:
            print("Queue is empty. All sources are fully processed and categorized!", flush=True)
            return

        print(f"Queue Processor: Found {len(sources)} sources to extract & categorize.", flush=True)

        for src in sources:
            # Example queue processing step:
            # 1. Extract facts via Gemini or WARN parser
            # 2. Insert into candidates table
            # 3. Process candidate into companies and layoff_events
            # process_candidate(candidate_id)
            pass

    finally:
        conn.close()

if __name__ == "__main__":
    run_queue_processor()