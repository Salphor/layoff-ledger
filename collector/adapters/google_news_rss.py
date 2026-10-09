import hashlib
import httpx
import feedparser
from datetime import datetime
from typing import List, Dict, Any

class GoogleNewsAdapter:
    source_key = "google_news_rss"

    def __init__(self, queries: List[str] = None):
        self.queries = queries or [
            "layoffs", "laid off", "job cuts", "workforce reduction", "positions eliminated"
        ]

    def _generate_fingerprint(self, url: str, title: str) -> str:
        raw_string = f"{url.strip().lower()}|{title.strip().lower()}"
        return hashlib.sha256(raw_string.encode("utf-8")).hexdigest()

    async def fetch_latest(self) -> List[Dict[Any, Any]]:
        results = []
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            for query in self.queries:
                feed_url = f"https://news.google.com/rss/search?q={query}+when:2d&hl=en-US&gl=US&ceid=US:en"
                response = await client.get(feed_url)
                feed = feedparser.parse(response.text)

                for entry in feed.entries:
                    fingerprint = self._generate_fingerprint(entry.link, entry.title)
                    published_at = None
                    if hasattr(entry, "published_parsed") and entry.published_parsed:
                        published_at = datetime(*entry.published_parsed[:6]).isoformat()

                    results.append({
                        "source_key": self.source_key,
                        "publisher": getattr(entry, "source", {}).get("title", "Google News"),
                        "url": entry.link,
                        "title": entry.title,
                        "published_at": published_at,
                        "fingerprint": fingerprint,
                        "metadata": {
                            "company_name": None,
                            "affected_count": None,
                            "notice_date": published_at,
                            "raw_source": "news",
                            "search_query": query
                        }
                    })
        return results