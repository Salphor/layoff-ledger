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
    
    # Compile a single regex pattern for efficiency
    pattern = re.compile(r'\b(?:' + '|'.join(keywords) + r')\b', re.IGNORECASE)
    
    filtered_candidates = []
    
    for candidate in candidates:
        title = candidate.get('title', '')
        summary = candidate.get('summary', '') or candidate.get('description', '')
        
        # Combine fields to search the entire available text surface
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
    
    # 1. Fetch from Google News (Requires Gemini filtering/extraction)
    news_adapter = GoogleNewsAdapter()
    print("Fetching News feeds...")
    raw_news_items = await news_adapter.fetch_latest()
    print(f"Discovered {len(raw_news_items)} raw news candidates.")
    news_items = pre_filter_candidates(raw_news_items)
    print(f"News pre-filter kept {len(news_items)} relevant candidates.")

    # 2. Fetch from State WARN databases (Pre-structured, bypasses Gemini)
    warn_adapter = StateWarnAdapter()
    print("Fetching State WARN databases...")
    warn_items = await warn_adapter.fetch_latest()
    print(f"Discovered {len(warn_items)} WARN candidates.")

    # Combine all items for unified database deduplication
    all_items = news_items + warn_items

    # 3. Deduplicate & persist sources into DB
    new_items = []
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        for item in all_items:
            cur.execute("SELECT id FROM sources WHERE fingerprint = %s", (item["fingerprint"],))
            existing_source = cur.fetchone()

            if existing_source:
                source_id = existing_source["id"]
                # Only skip if this source already has a corresponding candidate entry
                cur.execute("SELECT id FROM candidates WHERE source_id = %s", (source_id,))
                if cur.fetchone():
                    continue
            else:
                cur.execute(
                    """
                    INSERT INTO sources (source_key, publisher, url, title, published_at, fingerprint, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
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
                source_id = cur.fetchone()["id"]
                conn.commit()

            # Attach DB source_id to item for downstream processing
            item["source_id"] = source_id
            new_items.append(item)

    print(f"Processing {len(new_items)} total un-extracted sources...")

    # Separate structured WARN data from unstructured news items needing Gemini
    structured_items = [item for item in new_items if item.get("pre_extracted_json")]
    items_for_gemini = [item for item in new_items if not item.get("pre_extracted_json")]

    # --- PROCESS STRUCTURED WARN DATA (Instant, 0 Gemini API Cost) ---
    if structured_items:
        print(f"Pushing {len(structured_items)} structured WARN notices directly to candidates table...")
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            for item in structured_items:
                extracted_data = item["pre_extracted_json"]
                extracted_data["source_id"] = item["source_id"]

                cur.execute(
                    """
                    INSERT INTO candidates (source_id, classification, extracted_json, confidence, status)
                    VALUES (%s, %s, %s, %s, 'pending') RETURNING id
                    """,
                    (
                        item["source_id"],
                        "layoff",
                        Json(extracted_data),
                        1.0  # 100% confidence for official government filings
                    )