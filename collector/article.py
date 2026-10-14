"""
Builds the public "article" for a layoff event from the sources attached to it.

Gemini is only allowed to use the text we hand it. Everything it returns is
post-validated in finalize_article() so that an invented number or malformed
date never reaches the website.
"""
import os
import re
from datetime import date
from typing import Any, Dict, List, Optional

import httpx
from bs4 import BeautifulSoup
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from tenacity import retry, stop_after_attempt, wait_exponential

# Same model name the extractor already uses; override with GEMINI_MODEL if needed.
MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")

MAX_SOURCES_PER_EVENT = 8
MAX_NEWS_FETCHES_PER_EVENT = 4
MAX_CHARS_PER_SOURCE = 5000


class GeneratedArticle(BaseModel):
    headline: str = Field(description="Neutral, factual headline, max 100 characters.")
    summary: str = Field(description="2-4 sentence factual summary using ONLY the provided sources.")
    key_points: List[str] = Field(
        default_factory=list,
        description="2-5 short bullet facts, each stated explicitly in the sources. Empty if there is nothing more to add.",
    )
    employees_affected: Optional[int] = Field(None, description="Exact number of employees affected, only if explicitly stated.")
    employee_count_text: Optional[str] = Field(None, description="Non-exact count wording from the sources, e.g. 'about 10% of staff'. Only if explicitly stated.")
    announced_date: Optional[str] = Field(None, description="YYYY-MM-DD, only if explicitly stated.")
    effective_date: Optional[str] = Field(None, description="YYYY-MM-DD when the layoff takes effect, only if explicitly stated.")
    locations: List[str] = Field(default_factory=list, description="Affected cities/states/sites named in the sources.")
    departments: List[str] = Field(default_factory=list, description="Departments or divisions named in the sources.")
    roles: List[str] = Field(default_factory=list, description="Job roles named in the sources.")
    reason_provided: Optional[str] = Field(None, description="The reason the company gave, only if the sources state one.")


# --------------------------------------------------------------------------
# Source text gathering
# --------------------------------------------------------------------------
def is_warn_source(source_key: Optional[str]) -> bool:
    return bool(source_key) and source_key.startswith("warn-")


def warn_source_text(src: Dict[str, Any]) -> str:
    meta = src.get("metadata") or {}
    lines = [f"State: {str(meta.get('state', '')).upper()}", f"Notice date: {meta.get('notice_date')}"]
    for k, v in (meta.get("raw_row") or {}).items():
        if k and v not in (None, ""):
            lines.append(f"{k}: {v}")
    return "\n".join(lines)


def fetch_article_text(url: str, title: str) -> str:
    """Best-effort fetch of a news article body. Returns '' if nothing usable."""
    if not url or ".local" in url:
        return ""

    jina_key = os.environ.get("JINA_READER_API_KEY")
    if jina_key:
        try:
            r = httpx.get(
                f"https://r.jina.ai/{url}",
                headers={"Authorization": f"Bearer {jina_key}", "X-Return-Format": "text"},
                timeout=25.0,
                follow_redirects=True,
            )
            text = r.text.strip()
            if r.status_code == 200 and len(text) > 300 and "consent.google.com" not in text[:3000]:
                return text[:MAX_CHARS_PER_SOURCE]
        except Exception:
            pass

    if "news.google.com" in url:
        return ""  # Google News links are redirect pages with no article body.

    try:
        r = httpx.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LayoffRadar/1.0"},
            timeout=12.0,
            follow_redirects=True,
        )
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, "html.parser")
            body = " ".join(p.get_text(strip=True) for p in soup.find_all("p"))
            if len(body) > 200:
                return body[:MAX_CHARS_PER_SOURCE]
    except Exception:
        pass
    return ""


def build_source_blocks(sources: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Turns DB source rows into {label, kind, publisher, date, text} blocks."""
    blocks: List[Dict[str, Any]] = []
    news_fetches = 0
    for src in sources[:MAX_SOURCES_PER_EVENT]:
        if is_warn_source(src.get("source_key")):
            blocks.append({
                "kind": "official WARN notice",
                "publisher": src.get("publisher") or "State WARN registry",
                "date": str(src.get("published_at") or ""),
                "title": src.get("title") or "",
                "text": warn_source_text(src),
            })
            continue

        text = ""
        if news_fetches < MAX_NEWS_FETCHES_PER_EVENT:
            news_fetches += 1
            text = fetch_article_text(src.get("url") or "", src.get("title") or "")
        if not text:
            # Fall back to what the extractor already pulled out of this source.
            extracted = src.get("extracted_json") or {}
            text = (extracted.get("summary") or "").strip()
        blocks.append({
            "kind": "news article",
            "publisher": src.get("publisher") or "Unknown publisher",
            "date": str(src.get("published_at") or ""),
            "title": src.get("title") or "",
            "text": text or "(Only the headline was available.)",
        })
    return blocks


# --------------------------------------------------------------------------
# Gemini call
# --------------------------------------------------------------------------
def _build_prompt(company_name: str, known: Dict[str, Any], blocks: List[Dict[str, Any]]) -> str:
    known_lines = "\n".join(f"- {k}: {v}" for k, v in known.items() if v not in (None, "", [], {}))
    source_text = "\n\n".join(
        f"=== SOURCE {i} ({b['kind']}) ===\nPublisher: {b['publisher']}\nDate: {b['date']}\nHeadline: {b['title']}\nText:\n{b['text']}"
        for i, b in enumerate(blocks, 1)
    )
    return f"""
You are writing a short, neutral reference entry about ONE workforce reduction at "{company_name}" for a public layoff-tracking website.

STRICT RULES
- Use ONLY the facts in the sources and the "facts already on record" below. Never use outside knowledge.
- Never invent or estimate numbers, dates, locations, reasons, or roles. If something is not stated, leave it null or empty.
- Do not speculate about why the layoff happened or what will happen next.
- Write in plain, neutral, journalistic language. No advice, no marketing, no mention of any job-search product.
- If the only source is an official WARN notice, say plainly that it is an official advance notice and that the sources provide limited detail.
- If sources disagree, mention the discrepancy rather than choosing a side.
- Do NOT comment on missing information (for example a missing employee count). The website adds that note automatically; just leave the field null.
- Dates must be YYYY-MM-DD.

FACTS ALREADY ON RECORD
{known_lines or '- (none)'}

{source_text}
""".strip()


@retry(wait=wait_exponential(multiplier=2, min=4, max=60), stop=stop_after_attempt(3), reraise=True)
def call_gemini(company_name: str, known: Dict[str, Any], blocks: List[Dict[str, Any]]) -> GeneratedArticle:
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    response = client.models.generate_content(
        model=MODEL,
        contents=_build_prompt(company_name, known, blocks),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=GeneratedArticle,
            temperature=0.1,
        ),
    )
    return GeneratedArticle.model_validate_json(response.text)


# --------------------------------------------------------------------------
# Validation / assembly (pure functions, no network)
# --------------------------------------------------------------------------
def _valid_date(value: Optional[str]) -> Optional[str]:
    if not value or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value.strip()):
        return None
    try:
        date.fromisoformat(value.strip())
        return value.strip()
    except ValueError:
        return None


def _number_in_corpus(n: int, corpus: str) -> bool:
    candidates = {str(n), f"{n:,}"}
    # Digits that are part of a date, ID, or longer number don't count.
    return any(re.search(rf"(?<![\d,.\-/]){re.escape(c)}(?![\d,\-/]|\.\d)", corpus) for c in candidates)


def _clean_list(items: Optional[List[str]], limit: int = 12) -> List[str]:
    seen, out = set(), []
    for item in items or []:
        item = (item or "").strip()
        if item and item.lower() not in seen:
            seen.add(item.lower())
            out.append(item)
    return out[:limit]


def finalize_article(
    generated: GeneratedArticle,
    event: Dict[str, Any],
    blocks: List[Dict[str, Any]],
    source_count: int,
) -> Dict[str, Any]:
    """Validates model output against the sources and returns the stored JSON."""
    event_text_keys = ("canonical_name", "summary", "locations", "reason_provided", "employee_count_text", "employees_affected")
    corpus = " ".join(f"{b['title']} {b['text']}" for b in blocks) + " " + " ".join(
        str(event[k]) for k in event_text_keys if event.get(k) is not None
    )

    # Employee count: trust the database value first; accept the model's value
    # only if that exact number really appears in the source text.
    employees = event.get("employees_affected")
    if employees is None and generated.employees_affected is not None:
        if _number_in_corpus(generated.employees_affected, corpus):
            employees = generated.employees_affected

    count_text = event.get("employee_count_text")
    if not count_text and generated.employee_count_text:
        nums = re.findall(r"\d[\d,]*", generated.employee_count_text)
        if all(_number_in_corpus(int(n.replace(",", "")), corpus) for n in nums if n.replace(",", "").isdigit()):
            count_text = generated.employee_count_text.strip()

    announced = _valid_date(str(event.get("date_announced") or "")) or _valid_date(generated.announced_date)
    effective = _valid_date(str(event.get("effective_date") or "")) or _valid_date(generated.effective_date)

    has_warn = any(b["kind"] == "official WARN notice" for b in blocks)
    has_news = any(b["kind"] == "news article" for b in blocks)

    return {
        "version": 1,
        "headline": generated.headline.strip()[:140],
        "summary": generated.summary.strip(),
        "key_points": _clean_list(generated.key_points, 5),
        "facts": {
            "employees_affected": employees,
            "employee_count_text": count_text or None,
            "announced_date": announced,
            "effective_date": effective,
            "locations": _clean_list(generated.locations),
            "departments": _clean_list(generated.departments),
            "roles": _clean_list(generated.roles),
            "reason_provided": (generated.reason_provided or "").strip() or None,
        },
        "is_warn_notice": has_warn,
        "has_news_coverage": has_news,
        "sources_reviewed": source_count,
    }
