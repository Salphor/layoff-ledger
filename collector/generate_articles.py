"""
Worker: writes the public article for every layoff event that qualifies.

An event qualifies when it is published/verified AND either
  - it is backed by an official WARN notice, or
  - three or more independent sources report it.

An event is (re)written when it has no article yet, or when new sources have
been attached since the article was last generated.

Env:
  SUPABASE_DATABASE_URL, GEMINI_API_KEY   (required)
  JINA_READER_API_KEY                      (optional, improves news text)
  ARTICLE_BATCH_LIMIT   events per run          (default 20)
  ARTICLE_TIME_BUDGET   seconds before stopping (default 900)
"""
import json
import os
import sys
import time

from psycopg2.extras import Json, RealDictCursor

from article import build_source_blocks, call_gemini, finalize_article
from match import get_db_connection

BATCH_LIMIT = int(os.environ.get("ARTICLE_BATCH_LIMIT", "20"))
TIME_BUDGET = int(os.environ.get("ARTICLE_TIME_BUDGET", "900"))
MAX_ATTEMPTS = 5
PAUSE_BETWEEN_EVENTS = 4  # seconds; keeps us under Gemini rate limits

QUALIFYING_EVENTS_SQL = """
SELECT e.id, e.company_id, e.date_announced, e.notice_date, e.effective_date,
       e.employees_affected, e.employee_count_text, e.locations, e.reason_provided,
       e.summary, c.canonical_name,
       (SELECT count(*) FROM event_sources es WHERE es.layoff_event_id = e.id) AS linked_sources
FROM layoff_events e
JOIN companies c ON c.id = e.company_id
WHERE e.status IN ('published', 'verified')
  AND e.article_attempts < %s
  AND (
        e.article IS NULL
        OR e.article_source_count < (SELECT count(*) FROM event_sources es WHERE es.layoff_event_id = e.id)
      )
  AND (
        (SELECT count(*) FROM event_sources es WHERE es.layoff_event_id = e.id) >= 3
        OR EXISTS (
            SELECT 1 FROM event_sources es JOIN sources s ON s.id = es.source_id
            WHERE es.layoff_event_id = e.id AND s.source_key LIKE 'warn-%%'
        )
      )
ORDER BY e.created_at DESC
LIMIT %s
"""

SOURCES_SQL = """
SELECT s.id, s.source_key, s.publisher, s.url, s.title, s.published_at, s.metadata,
       c.extracted_json
FROM event_sources es
JOIN sources s ON s.id = es.source_id
LEFT JOIN candidates c ON c.id = es.candidate_id
WHERE es.layoff_event_id = %s
ORDER BY (s.source_key LIKE 'warn-%%') DESC, s.published_at DESC NULLS LAST
"""


def generate_for_event(conn, event) -> None:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(SOURCES_SQL, (event["id"],))
        sources = cur.fetchall()

    blocks = build_source_blocks(sources)
    known = {
        "Employer": event["canonical_name"],
        "Date announced": event["date_announced"],
        "Effective date": event["effective_date"],
        "Employees affected": event["employees_affected"],
        "Employee count wording": event["employee_count_text"],
        "Locations": event["locations"],
        "Reason provided": event["reason_provided"],
    }
    generated = call_gemini(event["canonical_name"], known, blocks)
    article = finalize_article(generated, dict(event), blocks, int(event["linked_sources"]))

    facts = article["facts"]
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE layoff_events
            SET article = %s,
                article_generated_at = NOW(),
                article_source_count = %s,
                article_attempts = 0,
                summary = %s,
                employees_affected = COALESCE(employees_affected, %s),
                effective_date = COALESCE(effective_date, %s::date),
                reason_provided = COALESCE(reason_provided, %s),
                updated_at = NOW()
            WHERE id = %s
            """,
            (
                Json(article),
                int(event["linked_sources"]),
                article["summary"],
                facts["employees_affected"],
                facts["effective_date"],
                facts["reason_provided"],
                event["id"],
            ),
        )
    conn.commit()


def main() -> int:
    started = time.time()
    conn = get_db_connection()
    done = failed = 0
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(QUALIFYING_EVENTS_SQL, (MAX_ATTEMPTS, BATCH_LIMIT))
            events = cur.fetchall()

        print(f"Article generator: {len(events)} event(s) need an article.", flush=True)

        for event in events:
            if time.time() - started > TIME_BUDGET:
                print("Time budget reached; remaining events will be picked up next run.", flush=True)
                break
            try:
                generate_for_event(conn, event)
                done += 1
                print(f"  OK   {event['canonical_name']} ({event['id']})", flush=True)
            except Exception as exc:  # one bad event must never stop the run
                conn.rollback()
                failed += 1
                print(f"  FAIL {event['canonical_name']} ({event['id']}): {exc}", flush=True)
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE layoff_events SET article_attempts = article_attempts + 1 WHERE id = %s",
                        (event["id"],),
                    )
                conn.commit()
            time.sleep(PAUSE_BETWEEN_EVENTS)
    finally:
        conn.close()

    print(f"Article generator finished: {done} written, {failed} failed.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
