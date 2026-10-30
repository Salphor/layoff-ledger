import os
import json
import time
import psycopg2
from psycopg2.extras import RealDictCursor
from match import ensure_company_keys, process_candidate
# Shared with run_scan.py so both paths read WARN rows the same way.
from warn_fields import build_warn_payload

# WARN notices need no Gemini calls, so large batches are cheap. Override with the
# QUEUE_BATCH_SIZE environment variable if needed.
BATCH_SIZE = int(os.environ.get("QUEUE_BATCH_SIZE") or 300)
# Stop before the workflow's time limit (12 min for the hourly worker; the
# history import sets QUEUE_TIME_BUDGET_SECONDS much higher).
TIME_BUDGET_SECONDS = int(os.environ.get("QUEUE_TIME_BUDGET_SECONDS") or 12 * 60)

def get_db_connection():
    return psycopg2.connect(os.environ["SUPABASE_DATABASE_URL"])

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

def retry_stuck_candidates(conn, limit=50):
    """
    Candidates left 'pending' by an earlier crash or timeout would otherwise be
    stranded: the source query below skips any source that already has a
    candidate row. Give those another attempt here. The 15-minute grace period
    keeps us away from candidates another job is processing right now.
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id FROM candidates
            WHERE status = 'pending' AND created_at < NOW() - INTERVAL '15 minutes'
            ORDER BY created_at ASC
            LIMIT %s
            """,
            (limit,),
        )
        stuck_ids = [row["id"] for row in cur.fetchall()]
    conn.commit()  # end the read transaction

    if not stuck_ids:
        return
    print(f"Retrying {len(stuck_ids)} candidate(s) stranded in 'pending'.", flush=True)
    for candidate_id in stuck_ids:
        try:
            process_candidate(candidate_id)
        except Exception as e:
            print(f"Retry failed for candidate {candidate_id}: {e}", flush=True)
            conn.rollback()


def fetch_batch(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # Unprocessed WARN sources, newest notices first. (Sorting by id was
        # effectively random, since ids are UUIDs.)
        cur.execute(
            """
            SELECT s.id AS source_id, s.source_key, s.publisher, s.url, s.title, s.metadata
            FROM sources s
            LEFT JOIN candidates c ON s.id = c.source_id
            WHERE c.id IS NULL
              AND s.source_key LIKE 'warn-%%'   -- news articles are extracted by run_scan.py, never here
            ORDER BY s.published_at DESC NULLS LAST
            LIMIT %s
            FOR UPDATE OF s SKIP LOCKED
            """,
            (BATCH_SIZE,)
        )
        return cur.fetchall()


def run_queue_processor():
    conn = get_db_connection()
    started = time.time()
    total = 0
    try:
        # Companies made before matching keys existed get one now (and
        # duplicates are merged). Instant when there is nothing to do.
        ensure_company_keys(conn)
        retry_stuck_candidates(conn, limit=BATCH_SIZE)

        # Keep taking batches until the queue is empty or time runs out.
        while time.time() - started < TIME_BUDGET_SECONDS:
            sources = fetch_batch(conn)
            if not sources:
                print("Queue is empty. All sources are fully processed and categorized!", flush=True)
                break

            print(f"Queue Processor: Found {len(sources)} official WARN sources to categorize.", flush=True)
            processed_count = 0
            for src in sources:
                if time.time() - started > TIME_BUDGET_SECONDS:
                    print("Time budget reached; the rest will be picked up next run.", flush=True)
                    break
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

            conn.commit()  # release the batch's row locks
            total += processed_count
            print(f"  processed {processed_count}/{len(sources)} (total {total}, "
                  f"{int(time.time() - started)}s elapsed)", flush=True)
            if len(sources) < BATCH_SIZE:
                break

        print(f"Queue Processor completed: {total} sources processed.", flush=True)
    finally:
        conn.close()

if __name__ == "__main__":
    run_queue_processor()