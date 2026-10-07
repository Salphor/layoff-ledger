import asyncio
import os
import re
import psycopg2
from psycopg2.extras import RealDictCursor, Json
import requests
from bs4 import BeautifulSoup
from adapters.google_news_rss import GoogleNewsAdapter
from adapters.state_warn import StateWarnAdapter
from extract import extract_layoff_facts
from match import process_candidate

def pre_filter_candidates(candidates):
    """
    Filters a list of RSS entry dictionaries based on layoff-related keywords.
    Expects candidates to have 'title' and optionally 'summary' or 'description' keys.
    """
    keywords = [
        r"layoff", r"laid off", r"job cut", r"cutting jobs", r"headcount",
        r"reduction in force", r"rif", r"downsiz", r"restructur",
        r"furlough", r"severance", r"let go", r"closing", r"shut down"
    ]
    
    pattern = re.compile(r'\b(?:' + '|'.join(keywords) + r')\b', re.IGNORECASE)
    filtered_candidates = []
    
    for candidate in candidates:
        title = candidate.get('title', '')
        summary = candidate.get('summary', '') or candidate.get('description', '')
        text_to_search = f"{title} {summary}"
        
        if pattern.search(text_to_search):
            filtered_candidates.append(candidate)
            
    return filtered_candidates

def get_db_connection():
    return psycopg2.connect(os.environ["SUPABASE_DATABASE_URL"])

def fetch_and_clean_text(url: str, title: str) -> str:
    """Attempts to fetch paragraph text from article. Fallback to title if request fails."""
    try:
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, 'html.parser')
            paragraphs = [p.get_text(strip=True) for p in soup.find_all('p')]
            body_text = " ".join(paragraphs)[:1500]  # Limit token length per article
            if body_text.strip():
                return body_text
    except Exception:
        pass
    return title

async def run_pipeline():
    conn = get_db_connection()
    
    # 1. Fetch fresh data from feeds
    news_adapter = GoogleNewsAdapter()
    print("Fetching News feeds...")
    raw_news_items = await news_adapter.fetch_latest()
    news_items = pre_filter_candidates(raw_news_items)

    warn_adapter = StateWarnAdapter()
    print("Fetching State WARN databases...")
    warn_items = await warn_adapter.fetch_latest()

    all_incoming_items = news_items + warn_items

    # 2. Ingest new items into sources table (deduplicated by fingerprint)
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        for item in all_incoming_items:
            cur.execute("SELECT id FROM sources WHERE fingerprint = %s", (item["fingerprint"],))
            if not cur.fetchone():
                cur.execute(
                    """
                    INSERT INTO sources (source_key, publisher, url, title, published_at, fingerprint, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        item["source_key"],
                        item["publisher"],
                        item["url"],
                        item["title"], 
                        item["published_at"],
                        item["fingerprint"],
                        Json(item["metadata"])
                    )
                )
        conn.commit()

    # 3. Pull ALL unextracted sources directly from DB (Self-Healing / Backfill)
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT s.id AS source_id, s.source_key, s.publisher, s.url, s.title, s.metadata
            FROM sources s
            LEFT JOIN candidates c ON s.id = c.source_id
            WHERE c.id IS NULL
            """
        )
        unextracted_sources = cur.fetchall()

    print(f"Discovered {len(unextracted_sources)} total un-extracted sources in database.")

    if not unextracted_sources:
        print("All sources are already processed. Scan pipeline complete.")
        conn.close()
        return

    # Separate WARN (structured) from News (needs Gemini)
    structured_items = []
    items_for_gemini = []

    for item in unextracted_sources:
        meta = item.get("metadata") or {}
        if item["source_key"].startswith("warn-") or "pre_extracted_json" in meta:
            structured_items.append(item)
        else:
            items_for_gemini.append(item)

    # 4. Process structured WARN items
    if structured_items:
        print(f"Processing {len(structured_items)} un-extracted WARN notices...")
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            for item in structured_items:
                meta = item.get("metadata") or {}
                raw_row = meta.get("raw_row", {})
                
                extracted_data = {
                    "source_id": item["source_id"],
                    "company_name": raw_row.get("company") or raw_row.get("company_name") or item["title"].replace("WARN Notice: ", ""),
                    "headcount": int(raw_row.get("employees", 0)) if str(raw_row.get("employees", "")).isdigit() else None,
                    "date_announced": meta.get("notice_date"),
                    "is_layoff": True,
                    "source_type": "warn_database"
                }

                cur.execute(
                    """
                    INSERT INTO candidates (source_id, classification, extracted_json, confidence, status)
                    VALUES (%s, %s, %s, %s, 'pending') RETURNING id
                    """,
                    (item["source_id"], "layoff", Json(extracted_data), 1.0)
                )
                candidate_id = cur.fetchone()["id"]
                conn.commit()

                process_candidate(candidate_id)

    # 5. Process unstructured News items via Gemini Batching
    if items_for_gemini:
        print(f"Processing {len(items_for_gemini)} un-extracted news articles via Gemini...")
        
        batch_size = 10 if len(items_for_gemini) > 50 else 5

        for i in range(0, len(items_for_gemini), batch_size):
            batch = items_for_gemini[i:i + batch_size]
            print(f"Processing batch {i // batch_size + 1} of {(len(items_for_gemini) + batch_size - 1) // batch_size}...")

            batch_prompt_parts = []
            for idx, item in enumerate(batch, 1):
                cleaned_content = fetch_and_clean_text(item["url"], item["title"])
                batch_prompt_parts.append(
                    f"--- Item [{idx}] ---\nID: {item['source_id']}\nTitle: {item['title']}\nContent: {cleaned_content}\n"
                )
            
            batch_text = "\n".join(batch_prompt_parts)

            try:
                extractions = extract_layoff_facts(batch_text)

                if extractions:
                    with conn.cursor(cursor_factory=RealDictCursor) as cur:
                        for extraction in extractions:
                            is_layoff = extraction.get("is_layoff") if isinstance(extraction, dict) else getattr(extraction, "is_layoff", False)
                            
                            if is_layoff:
                                target_source_id = extraction.get("source_id") if isinstance(extraction, dict) else getattr(extraction, "source_id", None)
                                confidence = extraction.get("confidence", 0.0) if isinstance(extraction, dict) else getattr(extraction, "confidence", 0.0)
                                json_data = extraction if isinstance(extraction, dict) else extraction.model_dump()

                                if target_source_id:
                                    cur.execute(
                                        """
                                        INSERT INTO candidates (source_id, classification, extracted_json, confidence, status)
                                        VALUES (%s, %s, %s, %s, 'pending') RETURNING id
                                        """,
                                        (target_source_id, "layoff", Json(json_data), confidence)
                                    )
                                    candidate_id = cur.fetchone()["id"]
                                    conn.commit()

                                    process_candidate(candidate_id)

            except Exception as e:
                print(f"Batch extraction failed for batch starting at index {i}. Error: {e}")

            print("Throttling for 5 seconds between batches...")
            await asyncio.sleep(5)

    conn.close()
    print("Scan pipeline complete.")

if __name__ == "__main__":
    asyncio.run(run_pipeline())