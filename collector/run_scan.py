import asyncio
import os
import re
import time
import psycopg2
from psycopg2.extras import RealDictCursor, Json, execute_values
import requests
from bs4 import BeautifulSoup
from adapters.google_news_rss import GoogleNewsAdapter
from adapters.state_warn import StateWarnAdapter
from extract import GeminiQuotaExhausted, _is_temporary_error, extract_layoff_facts
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

# ---------------------------------------------------------------------------
# Settings (environment variables, set in the workflow files)
#
# SCAN_NEWS / SCAN_WARN  "1" or "0". The 30-minute workflow scans news only;
#                        the WARN workflow scans WARN notices only.
# GEMINI_BATCH_SIZE      articles per Gemini request (default 10). Each request
#                        counts against the free tier's 20 requests per day.
# RUN_BUDGET_SECONDS     stop starting new work after this long (default 11
#                        min), so the 15-minute job limit never cuts a run off
#                        mid-save.
# SOURCE_LIMIT           how many unprocessed sources one run picks up
#                        (0 = only save new sources; the WARN workflow uses this).

def _flag(name, default="1"):
    return os.environ.get(name, default).strip().lower() not in ("0", "false", "no", "")

SCAN_NEWS = _flag("SCAN_NEWS")
SCAN_WARN = _flag("SCAN_WARN")
GEMINI_BATCH_SIZE = int(os.environ.get("GEMINI_BATCH_SIZE") or 10)
RUN_BUDGET_SECONDS = int(os.environ.get("RUN_BUDGET_SECONDS") or 11 * 60)
SOURCE_LIMIT = int(os.environ.get("SOURCE_LIMIT") or 40)
# A Gemini batch can take a couple of minutes; don't start one with less left.
MIN_SECONDS_FOR_BATCH = 150

STARTED = time.monotonic()


def seconds_left():
    return RUN_BUDGET_SECONDS - (time.monotonic() - STARTED)


def mark_checked(conn, source_ids, status):
    """
    Records that Gemini has looked at these news sources. Articles Gemini judged
    "not a layoff" never get a candidate row, so without this mark they were
    picked up again every run, blocking the queue and wasting the daily quota.
    """
    if not source_ids:
        return
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE sources
                SET metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb
                WHERE id::text = ANY(%s)
                """,
                (Json({"extraction_status": status}), [str(i) for i in source_ids]),
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"Could not mark sources as checked: {e}", flush=True)


async def run_pipeline():
    conn = get_db_connection()
    print(f"Mode: news={'on' if SCAN_NEWS else 'off'}, WARN={'on' if SCAN_WARN else 'off'}", flush=True)

    # 1. Fetch fresh items
    all_incoming_items = []
    if SCAN_NEWS:
        print("Fetching News feeds...", flush=True)
        news_adapter = GoogleNewsAdapter()
        raw_news_items = await news_adapter.fetch_latest()
        all_incoming_items += pre_filter_candidates(raw_news_items)

    if SCAN_WARN:
        print("Fetching State WARN databases...", flush=True)
        warn_adapter = StateWarnAdapter()  # states from WARN_STATES; last 45 days (see adapters/state_warn.py)
        all_incoming_items += await warn_adapter.fetch_latest()

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
    print(f"Saved {len(new_to_insert)} new sources.", flush=True)

    # 3. Pull unprocessed sources of the kinds this run handles, newest first so
    #    fresh news isn't stuck behind an old backlog. News already checked by
    #    Gemini (marked in metadata) is skipped.
    kinds = []
    if SCAN_WARN:
        kinds.append("s.source_key LIKE 'warn-%%'")
    if SCAN_NEWS:
        kinds.append("(s.source_key NOT LIKE 'warn-%%' AND (s.metadata->>'extraction_status') IS NULL)")
    if not kinds:
        print("Nothing to do: both SCAN_NEWS and SCAN_WARN are off.", flush=True)
        conn.close()
        return
    if SOURCE_LIMIT <= 0:
        # WARN workflow: the Event Processing Worker (process_queue.py) turns the
        # saved notices into events, so the two jobs never process the same row.
        print("Sources saved; processing is left to the Event Processing Worker.", flush=True)
        conn.close()
        return

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            f"""
            SELECT s.id AS source_id, s.source_key, s.publisher, s.url, s.title, s.metadata
            FROM sources s
            LEFT JOIN candidates c ON s.id = c.source_id
            WHERE c.id IS NULL AND ({' OR '.join(kinds)})
            ORDER BY s.published_at DESC NULLS LAST
            LIMIT %s
            """,
            (SOURCE_LIMIT,),
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

    # 4. Process structured WARN items (no Gemini needed)
    if structured_items:
        print(f"Processing {len(structured_items)} structured WARN notices...", flush=True)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            for item in structured_items:
                if seconds_left() < 30:
                    print("Time budget reached; remaining WARN notices wait for the next run.", flush=True)
                    break
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
        batch_size = max(1, GEMINI_BATCH_SIZE)
        total_batches = (len(items_for_gemini) + batch_size - 1) // batch_size
        print(f"Processing {len(items_for_gemini)} news articles via Gemini ({total_batches} requests)...", flush=True)

        for i in range(0, len(items_for_gemini), batch_size):
            if seconds_left() < MIN_SECONDS_FOR_BATCH:
                print("Time budget reached; remaining articles wait for the next run.", flush=True)
                break

            batch = items_for_gemini[i:i + batch_size]
            print(f"Processing batch {i // batch_size + 1} of {total_batches}...", flush=True)

            batch_prompt_parts = []
            for idx, item in enumerate(batch, 1):
                cleaned_content = fetch_and_clean_text(item["url"], item["title"])
                batch_prompt_parts.append(
                    f"--- Article [{idx}] ---\nSource UUID: {item['source_id']}\nTitle: {item['title']}\nContent: {cleaned_content}\n"
                )

            batch_text = "\n".join(batch_prompt_parts)

            try:
                extractions = extract_layoff_facts(batch_text)
            except GeminiQuotaExhausted:
                print("Gemini daily free-tier limit reached; skipping the rest of the news until the quota resets.", flush=True)
                break
            except Exception as e:
                print(f"Batch extraction failed for batch starting at index {i}. Error: {str(e)[:300]}", flush=True)
                if _is_temporary_error(e):
                    # Gemini is overloaded (503). The next batches would almost
                    # certainly fail too, and every failed try uses up part of
                    # the 20-a-day quota. These articles stay unread and are
                    # picked up by the next run.
                    print("Gemini is busy; stopping here so the daily quota isn't spent on failed tries.", flush=True)
                    break
                continue

            saved = 0
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                for extraction in extractions or []:
                    is_layoff = extraction.get("is_layoff") if isinstance(extraction, dict) else getattr(extraction, "is_layoff", False)
                    if not is_layoff:
                        continue

                    target_source_id = extraction.get("source_id") if isinstance(extraction, dict) else getattr(extraction, "source_id", None)
                    confidence = extraction.get("confidence", 0.0) if isinstance(extraction, dict) else getattr(extraction, "confidence", 0.0)
                    json_data = extraction if isinstance(extraction, dict) else extraction.model_dump()

                    # Gemini usually returns the article number (1, 2, ...) rather than the UUID
                    if isinstance(target_source_id, int) or (isinstance(target_source_id, str) and target_source_id.isdigit()):
                        idx_val = int(target_source_id) - 1
                        if 0 <= idx_val < len(batch):
                            target_source_id = batch[idx_val]["source_id"]

                    valid_batch_uuids = [str(b["source_id"]) for b in batch]
                    if not target_source_id or str(target_source_id) not in valid_batch_uuids:
                        if len(batch) == 1:
                            target_source_id = batch[0]["source_id"]
                        else:
                            continue

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
                    saved += 1

                    process_candidate(candidate_id)

            # Every article in a successful batch has now been read by Gemini.
            mark_checked(conn, [b["source_id"] for b in batch], "checked")
            print(f"  {saved} of {len(batch)} articles were layoffs.", flush=True)
            await asyncio.sleep(3)

    conn.close()
    print(f"Scan pipeline complete batch successfully ({int(time.monotonic() - STARTED)}s).", flush=True)

if __name__ == "__main__":
    asyncio.run(run_pipeline())
