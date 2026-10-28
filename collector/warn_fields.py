"""
Reads WARN rows from any state into one consistent shape.

Each state's file (from the warn-scraper library) uses its own column names:
  CA: company, notice_date, effective_date, num_employees, city, county
  TX: JOB_SITE_NAME, NOTICE_DATE, LayOff_Date, TOTAL_LAYOFF_NUMBER, CITY_NAME
  WA, NY: headers copied from the state's own website/dashboard
Instead of an exact list of names (which silently dropped TX rows and lost WA
worker counts), columns are matched by the words they contain.

Used by adapters/state_warn.py (when scraping), run_scan.py and
process_queue.py (when turning a saved WARN source into a candidate), so all
three always agree.
"""
import json
import re
from datetime import datetime

# Column-name keywords, checked in order. Names are compared lowercased with
# punctuation turned into spaces, e.g. "TOTAL_LAYOFF_NUMBER" -> "total layoff number".
# A keyword matches a column that equals it or contains it; keywords starting
# with "=" only match a column with exactly that name (for short, generic words).
# The state comments show which states each addition is for.
COMPANY_KEYS = [
    "company name", "company", "employer name", "employer", "job site name",
    "business name", "organization", "business", "name of company",
    "=title",  # MO
]
HEADCOUNT_KEYS = [
    "num employees", "number of employees", "employees affected", "employees",
    "number of workers", "workers affected", "workers", "total layoff number",
    "layoff number", "affected", "headcount", "layoff num",
    "laid off",  # OR
    "=jobs",     # PA, SC, OK
    "=emp",      # IA "Emp #"
]
NOTICE_KEYS = [
    "notice date", "date of notice", "notice dated", "warn date",
    "initial report date",  # AL
    "warn document date",   # CT
    "notice",
    "=date",                # NE, SC
]
RECEIVED_KEYS = [
    "received date", "date received", "wfdd received date", "received",
    "date posted", "month posted",  # NJ (month only)
]
EFFECTIVE_KEYS = [
    "effective date", "layoff start date", "layoff date", "start date",
    "layoff closure starts",   # NY: "Date Layoff/Closure Starts"
    "planned starting date",   # AL
    "date of separation",      # GA: "First Date of Separation"
    "layoff begin date",       # WI
    "date of impact", "impact date",  # MT, VA
    "lo cl date",              # IN
    "closure date", "separation date", "effective", "starts",
]
CITY_KEYS = ["city name", "city", "location"]  # TX CITY_NAME, CA city, WA Location
ADDRESS_KEYS = ["impacted site address", "address"]  # CA, NY street addresses
COUNTY_KEYS = ["county name", "county"]

DATE_FORMATS = (
    "%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S",
    "%m-%d-%Y", "%b %d, %Y", "%B %d, %Y", "%d-%b-%y", "%d-%b-%Y",
    "%B %Y", "%b %Y", "%m/%Y", "%Y-%m",  # month-only dates (NJ) -> 1st of month
)


def _norm_key(key) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(key).lower()).strip()


def _find(row: dict, candidates: list, exclude: tuple = ()):
    """Value of the first column whose name matches a candidate keyword."""
    keyed = {_norm_key(k): v for k, v in row.items() if k is not None}
    # Keywords are tried in order; each one first as an exact column name, then
    # (unless it starts with "=") as part of a longer column name.
    for want in candidates:
        exact = want.lstrip("=")
        v = keyed.get(exact)
        if v is not None and str(v).strip():
            return str(v).strip()
        if want.startswith("="):
            continue
        for k, v in keyed.items():
            if want in k and not any(x in k for x in exclude):
                if v is not None and str(v).strip():
                    return str(v).strip()
    return None


def parse_date(value):
    """Returns 'YYYY-MM-DD' or None. Accepts the date styles states use."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    # Excel-style "2026-10-21 00:00:00" or ISO with time
    candidates = [text, text.split()[0], text.split("T")[0]]
    for c in candidates:
        for fmt in DATE_FORMATS:
            try:
                return datetime.strptime(c, fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
    return None


def parse_headcount(value):
    """'1,234' -> 1234; '120 (est.)' -> 120; '' or 'TBD' -> None."""
    if value is None:
        return None
    m = re.search(r"\d[\d,]*", str(value))
    if not m:
        return None
    n = int(m.group(0).replace(",", ""))
    return n if 0 < n < 1_000_000 else None


def clean_company(name):
    """Trim whitespace and a trailing ' (WA)'-style state tag added by older code."""
    if not name:
        return None
    name = re.sub(r"\s+", " ", str(name)).strip()
    name = re.sub(r"\s*\((?:[A-Z]{2})\)$", "", name)
    return name or None


def _city_from_address(address):
    """'5815 Owens Drive  Pleasanton CA 94588' -> 'Pleasanton'; 'x  New York, NY, 10003' -> 'New York'."""
    if not address:
        return None
    parts = re.split(r"\s{2,}", address.strip())
    if len(parts) < 2:
        return None  # street and city run together; can't split reliably
    tail = parts[-1]
    tail = re.sub(r"[,\s]+\d{5}(?:-\d{4})?\s*$", "", tail)   # zip
    tail = re.sub(r"[,\s]+[A-Z]{2}\s*$", "", tail)              # state
    tail = tail.strip(" ,")
    return tail if tail and not re.search(r"\d", tail) else None


def _county(value):
    if not value:
        return None
    value = re.sub(r"\s+", " ", value).strip()
    return value if value.lower().endswith("county") else f"{value} County"


def normalize_warn_row(row: dict, state: str) -> dict:
    """One WARN row -> consistent fields. Values are None when the state doesn't provide them."""
    st = state.upper()
    company_raw = _find(row, COMPANY_KEYS, exclude=("address", "city", "county"))
    notice_raw = _find(row, NOTICE_KEYS, exclude=("received",))
    received_raw = _find(row, RECEIVED_KEYS)
    effective_raw = _find(row, EFFECTIVE_KEYS, exclude=("notice", "received", "posted"))
    headcount_raw = _find(row, HEADCOUNT_KEYS, exclude=("date",))
    city = _find(row, CITY_KEYS, exclude=("county", "address"))
    address = _find(row, ADDRESS_KEYS)
    county = _county(_find(row, COUNTY_KEYS))

    # Use the notice date if that column really holds a date (WA also has a
    # "Notice" column that may not), otherwise the date the state received it.
    if parse_date(notice_raw):
        date_raw = notice_raw
    elif parse_date(received_raw):
        date_raw = received_raw
    else:
        date_raw = None

    place = city or _city_from_address(address)
    if place:
        location = f"{place}, {st}"
    elif county:
        location = f"{county}, {st}"
    elif address:
        location = address
    else:
        location = None

    return {
        "company": clean_company(company_raw),
        # Kept exactly as the state wrote it: the duplicate check (fingerprint)
        # is built from this raw text, so changing it would re-import old notices.
        "company_raw": company_raw,
        "notice_date_raw": date_raw,
        "notice_date": parse_date(date_raw),
        "effective_date": parse_date(effective_raw),
        # Some states (GA, PA) list only the layoff date, not when notice was
        # given. That date is used for the duplicate check and the 45-day window.
        "key_date_raw": date_raw or effective_raw,
        "key_date": parse_date(date_raw) or parse_date(effective_raw),
        "headcount": parse_headcount(headcount_raw),
        "location": location,
        "state": st,
    }


def build_warn_payload(source: dict) -> dict:
    """
    extracted_json for a saved WARN source (a row of the `sources` table).

    Re-reads the original state row stored in metadata.raw_row, so older WARN
    sources saved before this fix also get the right company name and count.
    match.py rejects candidates without a top-level "company_name".
    """
    metadata = source.get("metadata") or {}
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except Exception:
            metadata = {}

    state = str(metadata.get("state") or (source.get("source_key") or "warn-us").replace("warn-", "")).upper()
    raw_row = metadata.get("raw_row") or {}
    fields = normalize_warn_row(raw_row, state) if raw_row else {}

    title_name = (source.get("title") or "").replace("WARN Notice: ", "")
    company_name = (
        fields.get("company")
        or clean_company(metadata.get("company_name"))
        or clean_company(title_name)
        or "Unknown Company"
    )
    headcount = fields.get("headcount") or parse_headcount(metadata.get("affected_count"))
    notice_date = fields.get("notice_date") or parse_date(metadata.get("notice_date"))
    effective_date = fields.get("effective_date") or parse_date(metadata.get("effective_date"))
    location = fields.get("location") or metadata.get("location")

    summary = f"{company_name} filed an official WARN notice with {state}"
    summary += f" covering {headcount:,} workers." if headcount else "."
    if effective_date:
        d = datetime.strptime(effective_date, "%Y-%m-%d")
        when = f"{d:%B} {d.day}, {d.year}"  # portable (no %-d on Windows)
        summary += f" Layoffs are scheduled to begin {when}."

    return {
        "source_id": str(source["source_id"]),
        "company_name": company_name,
        "headcount": headcount,
        "date_announced": notice_date,
        "notice_date": notice_date,
        "effective_date": effective_date,
        "locations": [location] if location else [],
        "is_layoff": True,
        "source_type": "warn_database",
        "summary": summary,
    }
