import asyncio
import os
import re
import psycopg2
from psycopg2.extras import RealDictCursor, Json, execute_values
import requests
from bs4 import BeautifulSoup
from adapters.google_news_rss import GoogleNewsAdapter
from adapters.state_warn import StateWarnAdapter
from extract import extract_layoff_facts
from match import process_candidate
from warn_fields import build_warn_payload

def pre_filter_candidates(candidates):
    keywords = [
        r"layoff", r"laid off", r"job cut", r"cutting jobs", r"headcount",
        r"reduction in force", r"rif", r"downsiz", r"restructur",
        r"furlough", r"severance", r"let go", r"closing", r"shut down"
    ]
    pattern = re.compile(r'\b(?:' + '|'.join(keywords) + r')\b', re.IGNORECASE)
    filtered = []
    for candidate in candidates:
        text = f"{candidate.get('title', '')} {candidate.get('summary', '') or candidate.get('description', '')}"
        if pattern.search(text):
            filtered.append(candidate)
    return filtered

def get_db_connection():
    return psycopg2.connect(os.environ["SUPABASE_DATABASE_URL"])

def fetch_and_clean_text(url: str, title: str) -> str:
    if "news.google.com" in url or ".local" in url:
        return title

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LayoffLedger/1.0"}
    try:
        resp = requests.get(url, headers=headers, timeout=3, allow_redirects=True)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, 'html.parser')
            paragraphs = [p.get_text(strip=True) for p in soup.find_all('p')]
            body_text = " ".join(paragraphs)[:1200]
            if body_text.strip():
                return body_text
    except Exception:
        pass
    return title

async def run_pipeline():
    conn = get_db_connection()
    
    # 1. Fetch fresh data from feeds
    print("Fetching News feeds...", flush=True)
    news_adapter = GoogleNewsAdapter()
    raw_news_items = await news_adapter.fetch_latest()
    news_items = pre_filter_candidates(raw_news_items)

    print("Fetching State WARN databases...", flush=True)
    warn_adapter = StateWarnAdapter()  # CA, NY, WA, TX; last 45 days (see adapters/state_warn.py)
    warn_items = await warn_adapter.fetch_latest()

    all_incoming_items = news_items + warn_items
    print(f"Discovered {len(all_incoming_items)} total scraped items.", flush=True)

    # 2. FAST BULK DEDUPLICATION & INSERTION
    print("Saving incoming sources to database...", flush=True)
    with conn.cursor() as cur:
        cur.execute("SELECT fingerprint FROM sources WHERE fingerprint IS NOT NULL")
        existing_fingerprints = {row[0] for row in cur.fetchall()}

        # Filter out fingerprints already in DB OR duplicated within this scraped batch
        seen_batch_fingerprints = set()
        new_to_insert = []
        for item in all_incoming_items:
            fp = item["fingerprint"]
            if fp not in existing_fingerprints and fp not in seen_batch_fingerprints:
                seen_batch_fingerprints.add(fp)
                new_to_insert.append(item)

        if new_to_insert:
            insert_query = """
                INSERT INTO sources (source_key, publisher, url, title, published_at, fingerprint, metadata)
                VALUES %s
                ON CONFLICT (fingerprint) DO NOTHING
            """
            data_tuples = [
                (
                    item["source_key"],
                    item["publisher"],
                    item["url"],
                    item["title"],
                    item["published_at"],
                    item["fingerprint"],
                    Json(item["metadata"])
                )
                for item in new_to_insert
            ]
            execute_values(cur, insert_query, data_tuples)
            conn.commit()

    # 3. Pull unextracted sources directly from DB (Capped at 30 per run)
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT s.id AS source_id, s.source_key, s.publisher, s.url, s.title, s.metadata
            FROM sources s
            LEFT JOIN candidates c ON s.id = c.source_id
            WHERE c.id IS NULL
            ORDER BY s.id ASC
            LIMIT 30
            """
        )
        unextracted_sources = cur.fetchall()

    print(f"Discovered {len(unextracted_sources)} un-extracted sources for this run batch.", flush=True)

    if not unextracted_sources:
        print("All sources are fully processed! Scan pipeline complete.", flush=True)
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
        print(f"Processing {len(structured_items)} structured WARN notices...", flush=True)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            for item in structured_items:
                # Same field reading as process_queue.py (see warn_fields.py).
                extracted_data = build_warn_payload(item)

                cur.execute(
                    """
                    INSERT INTO candidates (source_id, classification, extracted_json, confidence, status)
                    VALUES (%s, %s, %s, %s, 'pending') RETURNING id
                    """,
                    (str(item["source_id"]), "layoff", Json(extracted_data), 1.0)
                )
                candidate_id = cur.fetchone()["id"]
                conn.commit()

                process_candidate(candidate_id)

    # 5. Process unstructured News items via Gemini Batching
    if items_for_gemini:
        print(f"Processing {len(items_for_gemini)} news articles via Gemini...", flush=True)
        batch_size = 5

        for i in range(0, len(items_for_gemini), batch_size):
            batch = items_for_gemini[i:i + batch_size]
            print(f"Processing batch {i // batch_size + 1} of {(len(items_for_gemini) + batch_size - 1) // batch_size}...", flush=True)

            batch_prompt_parts = []
            for idx, item in enumerate(batch, 1):
                cleaned_content = fetch_and_clean_text(item["url"], item["title"])
                batch_prompt_parts.append(
                    f"--- Article [{idx}] ---\nSource UUID: {item['source_id']}\nTitle: {item['title']}\nContent: {cleaned_content}\n"
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

                                # Fallback: If Gemini returned a 1-based index (e.g., 1 or 2) instead of the full UUID string
                                if isinstance(target_source_id, int) or (isinstance(target_source_id, str) and target_source_id.isdigit()):
                                    idx_val = int(target_source_id) - 1
                                    if 0 <= idx_val < len(batch):
                                        target_source_id = batch[idx_val]["source_id"]

                                # Single-item or fallback mapping safety check
                                valid_batch_uuids = [str(b["source_id"]) for b in batch]
                                if not target_source_id or str(target_source_id) not in valid_batch_uuids:
                                    if len(batch) == 1:
                                        target_source_id = batch[0]["source_id"]

                                if target_source_id:
                                    target_source_id_str = str(target_source_id)
                                    if isinstance(json_data, dict):
                                        json_data["source_id"] = target_source_id_str

                                    cur.execute(
                                        """
                                        INSERT INTO candidates (source_id, classification, extracted_json, confidence, status)
                                        VALUES (%s, %s, %s, %s, 'pending') RETURNING id
                                        """,
                                        (target_source_id_str, "layoff", Json(json_data), confidence)
                                    )
                                    candidate_id = cur.fetchone()["id"]
                                    conn.commit()

                                    process_candidate(candidate_id)

            except Exception as e:
                print(f"Batch extraction failed for batch starting at index {i}. Error: {e}", flush=True)

            print("Throttling for 3 seconds between batches...", flush=True)
            await asyncio.sleep(3)

    conn.close()
    print("Scan pipeline complete batch successfully.", flush=True)

if __name__ == "__main__":
    asyncio.run(run_pipeline())