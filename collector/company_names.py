"""
Company names: cleaning, matching and parent groups.

State WARN files often put a site, store number or note into the company
column, e.g.
    "(131) San Diego LGBT Community Center"         -> site number
    "Agile Physical Therapy (Sutter Health Dublin)"  -> clinic
    "Accelerate360 Distribution, LLC - Dakota Merchandising Work Unit"
    "Air Wisconsin Airlines LLC (MKE)<br/></a><a><em ...>* The company provided ..."
    "AeroFarms Inc. - Rescinded"
and the same employer is spelled several ways ("AbbVie", "AbbVie Inc.").

split_company()  -> the employer name, the site part (kept for the event) and
                    whether the notice was rescinded.
company_key()    -> a matching key that ignores case, punctuation, spaces,
                    legal endings (Inc, LLC, Corp...) and parentheses, so all
                    spellings of one employer land on one company.
resolve_company() also applies config/company_aliases.yaml, the reviewed list
                    of parent groups ("Adventist Health Bakersfield" ->
                    "Adventist Health"). Prefix rules can't be automatic:
                    "Acme", "Acme Brick Co" and "Acme Markets" are different
                    companies.
"""
import html
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

import yaml

ALIASES_FILE = Path(__file__).resolve().parent.parent / "config" / "company_aliases.yaml"

# Legal endings dropped from the matching key (never from the displayed name).
LEGAL_SUFFIXES = {
    "inc", "incorporated", "llc", "llp", "lp", "ltd", "limited", "corp",
    "corporation", "co", "company", "plc", "pc", "pllc", "pa", "na", "lc",
}

# Legal forms left off the displayed name. "Co"/"Company" stay: "The Walt
# Disney Company" reads wrong without it.
DISPLAY_DROP = {"inc", "incorporated", "llc", "llp", "lp", "ltd", "corp", "corporation", "plc", "pllc", "pc"}

US_STATES = {
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut",
    "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa",
    "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan",
    "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada",
    "new hampshire", "new jersey", "new mexico", "new york", "north carolina",
    "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island",
    "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
    "virginia", "washington", "west virginia", "wisconsin", "wyoming",
}

RESCINDED = re.compile(r"\b(rescind\w*|rescission)\b", re.I)


def _strip_html(text: str) -> str:
    # Anything after a tag is page markup or a footnote, not the name.
    text = html.unescape(text)
    text = re.split(r"<\s*(br|/?a|em|span|p|div)\b", text, maxsplit=1, flags=re.I)[0]
    text = re.sub(r"<[^>]*>", " ", text)
    return text


def _trailing_paren(text: str):
    """'Name (site (2) here)' -> ('Name', 'site (2) here'); None if no trailing group."""
    text = text.rstrip()
    if not text.endswith(")"):
        return None
    depth = 0
    for i in range(len(text) - 1, -1, -1):
        if text[i] == ")":
            depth += 1
        elif text[i] == "(":
            depth -= 1
            if depth == 0:
                if i == 0 or not text[i - 1].isspace():
                    return None  # "Employee(s)" is part of the word
                return text[:i].rstrip(" ,-"), text[i + 1:-1].strip()
    return None


def _has_name(text: str) -> bool:
    """At least two letters: '#3113' is not a company name."""
    return len(re.findall(r"[A-Za-z]", text or "")) >= 2


def split_company(raw):
    """
    Raw company cell -> {"name", "site", "rescinded"}.
    name = the employer, site = the location/unit part (or None).
    """
    if not raw:
        return {"name": None, "site": None, "rescinded": False}
    text = _strip_html(str(raw))
    text = re.sub(r"\s+", " ", text).strip(" ,;*")
    sites = []

    rescinded = bool(RESCINDED.search(text))
    if rescinded:
        text = re.sub(r"\s*[-–—,:]?\s*\(?\b(rescind\w*|rescission)\b\)?\s*", " ", text, flags=re.I).strip(" ,-–—")

    # Leading "(131) " site numbers, or a leading "(Remote Employees) ".
    m = re.match(r"^\(([^()]*)\)\s*(.+)$", text)
    if m and _has_name(m.group(2)):
        if not re.fullmatch(r"\d+", m.group(1).strip()):
            sites.append(m.group(1).strip())
        text = m.group(2)

    # Trailing "(...)" groups: "(5500)", "(MKE Hangar)", "(Sutter Health ...)".
    while True:
        tp = _trailing_paren(text)
        if not tp or not _has_name(tp[0]):
            break
        text, inner = tp
        if inner and not re.fullmatch(r"\d+", inner):
            sites.insert(0, inner)

    # "Employer - Site" (also en/em dashes). Not when the left side has no
    # letters ("#3113 - Beaverton" stays whole).
    m = re.match(r"^(.+?)\s+[-–—]\s+(.+)$", text)
    if (m and _has_name(m.group(1)) and len(m.group(1)) >= 3
            and m.group(1).strip(" ,").lower() not in US_STATES):
        text, sites = m.group(1).strip(" ,"), [m.group(2).strip()] + sites

    # "State WARN tag" added by very old code: "Acme (WA)" already removed above.
    text = text.strip(" ,;-–—")
    return {
        "name": text or None,
        "site": "; ".join(s for s in sites if s) or None,
        "rescinded": rescinded,
    }


def company_key(name) -> str:
    """'Advance Stores Company, Incorporated' and 'Advance Stores Co Inc' -> 'advancestores'."""
    if not name:
        return ""
    text = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode()
    text = text.lower().replace("&", " and ")
    text = re.sub(r"\([^)]*\)", " ", text)          # parentheses
    text = re.sub(r",?\s+d/?b/?a\b.*$", " ", text)   # ", dba Catch Steak"
    text = re.sub(r"[^a-z0-9]+", " ", text)
    words = text.split()
    if words and words[0] == "the" and len(words) > 1:
        words = words[1:]
    while len(words) > 1 and words[-1] in LEGAL_SUFFIXES:
        words.pop()
    # "l l c" after punctuation was removed
    joined = " ".join(words)
    joined = re.sub(r"\s+l\s?l\s?c$", "", joined)
    return joined.replace(" ", "")


@lru_cache(maxsize=1)
def _aliases():
    """[(compiled pattern, parent name)] from config/company_aliases.yaml."""
    try:
        data = yaml.safe_load(ALIASES_FILE.read_text(encoding="utf-8")) or {}
    except FileNotFoundError:
        return []
    out = []
    for group in data.get("groups") or []:
        parent = group.get("parent")
        for pattern in group.get("match") or []:
            out.append((re.compile(pattern, re.I), parent))
    return out


def display_name(name):
    """'Applied Materials, Inc.' -> 'Applied Materials' (legal endings dropped for display)."""
    if not name:
        return name
    shown = name.strip()
    while True:
        m = re.match(r"^(.*?)[,\s]+([A-Za-z.]+)\.?$", shown)
        if not m or m.group(2).replace(".", "").lower() not in DISPLAY_DROP or not _has_name(m.group(1)):
            break
        shown = m.group(1).rstrip(" ,")
    return shown


def resolve_company(raw):
    """
    Raw company cell -> {"name", "key", "site", "rescinded"}.
    name = the company it's listed under on the site (a parent group when one
    applies), site = what distinguishes this location or unit.
    """
    parts = split_company(raw)
    name, site = parts["name"], parts["site"]
    if name:
        for pattern, parent in _aliases():
            m = pattern.search(name)
            if m:
                rest = name[m.end():].strip(" ,-–—") if m.start() == 0 else ""
                if rest and _has_name(rest) and company_key(rest) != company_key(parent):
                    site = f"{rest}; {site}" if site else rest
                name = parent
                break
    key = company_key(name)
    if site:  # drop site parts that just repeat the company ("(80 Acres Farms)")
        kept = [x for x in site.split("; ") if company_key(x) != key]
        site = "; ".join(kept) or None
    return {"name": display_name(name), "key": key, "site": site, "rescinded": parts["rescinded"]}


# Company cells that name a store or office instead of the employer (Oregon:
# "#4184 - Portland", "Administrative Office").
STORE_ONLY = re.compile(r"^#?\s*\d+\s*[-–—:]\s*\S")
GENERIC_NAMES = {
    "administrative office", "administrative offices", "corporate office",
    "corporate offices", "headquarters", "main office", "remote employees",
    "remote employee", "remote employee(s)", "remote workers",
}


def is_unnamed(name) -> bool:
    """True when the company cell holds only a store number or a generic office."""
    if not name:
        return True
    text = name.strip().lower()
    return bool(STORE_ONLY.match(text)) or text in GENERIC_NAMES


def slugify(name) -> str:
    """'AT&T Inc.' -> 'at-and-t-inc' (letters, digits and dashes only)."""
    text = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode()
    text = text.lower().replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-") or "company"
