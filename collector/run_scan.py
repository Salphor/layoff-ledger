import asyncio
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from adapters.google_news_rss import GoogleNewsAdapter
from extract import extract_layoff_facts
from match import process_candidate

def get_db_connection():
    return psycopg2.connect(os.environ["SUPABASE_DATABASE_URL"])

async def run_pipeline():
    conn = get_db_connection()
    adapter = GoogleNewsAdapter()
    print("Fetching feeds...")
    items = await adapter.fetch_latest()
    print(f"Discovered {len(items)} source candidates.")

    for item in items:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Skip existing fingerprints
            cur.execute("SELECT id FROM sources WHERE fingerprint = %s", (item["fingerprint"],))
            if cur.fetchone():
                continue

            # Store new source
            cur.execute(
                """
                INSERT INTO sources (source_key, publisher, url, title, published_at, fingerprint, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
                """,
                (item["source_key"], item["publisher"], item["url"], item["title"], 
                 item["published_at"], item["fingerprint"], psycopg2.extras.Json(item["metadata"]))
            )
            source_id = cur.fetchone()["id"]
            conn.commit()

            # Perform Gemini extraction
            extraction = extract_layoff_facts(item["title"], item["title"])
            if extraction and extraction.is_layoff:
                cur.execute(
                    """
                    INSERT INTO candidates (source_id, classification, extracted_json, confidence, status)
                    VALUES (%s, %s, %s, %s, 'pending') RETURNING id
                    """,
                    (source_id, "layoff", psycopg2.extras.Json(extraction.model_dump()), extraction.confidence)
                )
                candidate_id = cur.fetchone()["id"]
                conn.commit()

                # Deduplicate and match
                process_candidate(candidate_id)

    conn.close()
    print("Scan pipeline complete.")

if __name__ == "__main__":
    asyncio.run(run_pipeline())
