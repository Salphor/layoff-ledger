import asyncio
import csv
import hashlib
import os
import time
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

from warn_fields import normalize_warn_row, parse_date

# States we collect. Each one is a separate scraper in the warn-scraper library
# (https://github.com/biglocalnews/warn-scraper), so one state failing never
# stops the others. Override with the WARN_STATES environment variable:
# "ca,ny,wa" for a list, or "all" for every state the library supports.
DEFAULT_STATES = ["ca", "ny", "wa", "tx"]

# Every state the library has a scraper for, except LA and MA, which need a
# paid proxy service (Zyte) to work.
ALL_STATES = [
    "ak", "al", "az", "ca", "co", "ct", "dc", "de", "fl", "ga", "hi", "ia", "id",
    "il", "in", "ks", "ky", "md", "me", "mi", "mo", "ms", "mt", "nd", "ne", "nj",
    "nm", "ny", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "va",
    "vt", "wa", "wi",
]

# How many states are scraped at the same time.
PARALLEL_STATES = 6


def states_from_env(value):
    """'all' -> ALL_STATES; 'ca, ny' -> ['ca', 'ny']; empty -> DEFAULT_STATES."""
    value = (value or "").strip().lower()
    if not value:
        return list(DEFAULT_STATES)
    if value == "all":
        return list(ALL_STATES)
    return [s.strip() for s in value.split(",") if s.strip()]

# How far back a notice can be and still be picked up. States post notices days
# or weeks after the notice date (California's spreadsheet is refreshed about
# weekly), so a 2-day window missed most of them. Duplicates are prevented by
# the fingerprint check in run_scan.py, so a wider window is safe.
DEFAULT_MAX_DAYS_OLD = 45

SCRAPE_TIMEOUT_SECONDS = 300



class StateWarnAdapter:
    def __init__(self, states=None, max_days_old=DEFAULT_MAX_DAYS_OLD):
        self.states = states or states_from_env(os.environ.get("WARN_STATES"))
        self.output_dir = Path("/tmp/warn_data")
        self.cache_dir = Path("/tmp/warn_cache")
        self.cutoff = (datetime.now() - timedelta(days=max_days_old)).strftime("%Y-%m-%d")
        self.report = {}  # state -> summary line, printed at the end

    @staticmethod
    def _fingerprint(company_raw, notice_raw):
        # Unchanged from the original adapter so notices already saved are not imported twice.
        unique_string = f"WARN-{company_raw}-{notice_raw}".lower().encode("utf-8")
        return hashlib.sha256(unique_string).hexdigest()

    def _run_state_scrape(self, state) -> bool:
        """Runs the warn-scraper CLI for one state. Returns True if it finished."""
        csv_file = self.output_dir / f"{state}.csv"
        if csv_file.exists():
            csv_file.unlink()  # never read a stale file from an earlier run
        cmd = [
            sys.executable, "-m", "warn.cli",
            "--data-dir", str(self.output_dir),
            "--cache-dir", str(self.cache_dir),
            "--log-level", "WARNING",
            state,
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=SCRAPE_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            print(f"[WARN {state.upper()}] scraper timed out after {SCRAPE_TIMEOUT_SECONDS}s", flush=True)
            return False
        if result.returncode != 0:
            # Show the end of the error so failures are visible in the Actions log.
            tail = "\n".join((result.stderr or result.stdout or "").strip().splitlines()[-6:])
            print(f"[WARN {state.upper()}] scraper failed (exit {result.returncode}):\n{tail}", flush=True)
            return False
        return True

    def _read_state(self, state):
        csv_file = self.output_dir / f"{state}.csv"
        if not csv_file.exists():
            self.report[state] = "no file produced"
            return []

        with open(csv_file, "r", encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
        if not rows:
            self.report[state] = "file was empty"
            return []

        columns = list(rows[0].keys())
        kept, no_company, no_date, old = [], 0, 0, 0
        for row in rows:
            fields = normalize_warn_row(row, state)
            if not fields["company"]:
                no_company += 1
                continue
            if not fields["key_date"]:
                no_date += 1
                continue
            if fields["key_date"] < self.cutoff:
                old += 1
                continue

            extracted = {
                "company_name": fields["company"],
                "headcount": fields["headcount"],
                "date_announced": fields["notice_date"],
                "notice_date": fields["notice_date"],
                "effective_date": fields["effective_date"],
                "location": fields["location"],
                "is_layoff": True,
                "source_type": "warn_database",
                "state": state.upper(),
            }
            kept.append({
                "source_key": f"warn-{state}",
                "publisher": f"{state.upper()} State WARN Registry",
                "url": f"https://warn-registry-{state}.local",
                "title": f"WARN Notice: {fields['company']}",
                # Date we first saw it if the state gives no notice date (GA, PA).
                "published_at": fields["notice_date"] or datetime.now().strftime("%Y-%m-%d"),
                "fingerprint": self._fingerprint(fields["company_raw"], fields["key_date_raw"]),
                "metadata": {
                    "company_name": fields["company"],
                    "affected_count": fields["headcount"],
                    "notice_date": fields["notice_date"],
                    "effective_date": fields["effective_date"],
                    "location": fields["location"],
                    "raw_source": "WARN",
                    "state": state,
                    "raw_row": row,
                },
                "pre_extracted_json": extracted,
            })

        self.report[state] = (
            f"{len(rows)} rows, {len(kept)} recent (since {self.cutoff}); skipped {old} older, "
            f"{no_company} without company, {no_date} without a date. Columns: {columns}"
        )
        # If nothing could be read at all, the column names have probably changed.
        if kept and not any(k["metadata"]["notice_date"] for k in kept):
            sample = {k: v for k, v in kept[0]["metadata"]["raw_row"].items() if k}
            self.report[state] += f"  (no notice dates read; first row: {sample})"
        if no_company == len(rows) or no_date == len(rows):
            sample = {k: v for k, v in rows[0].items() if k}
            self.report[state] += f"  <-- CHECK: column names not recognised. First row: {sample}"
        return kept

    async def _one_state(self, state, gate):
        async with gate:
            started = time.monotonic()
            try:
                ok = await asyncio.to_thread(self._run_state_scrape, state)
                items = self._read_state(state)
                if not ok and state in self.report:
                    self.report[state] = "scraper failed; " + self.report[state]
            except Exception as e:
                items = []
                self.report[state] = f"error: {e!r}"
            self.report[state] = f"[{time.monotonic() - started:.0f}s] " + self.report.get(state, "")
            return items

    async def fetch_latest(self):
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        gate = asyncio.Semaphore(PARALLEL_STATES)
        batches = await asyncio.gather(*(self._one_state(s, gate) for s in self.states))
        results = [item for batch in batches for item in batch]

        working = sum(1 for s in self.states if "recent" in self.report.get(s, ""))
        print(f"WARN scrape summary ({working} of {len(self.states)} states returned data):", flush=True)
        for state in self.states:
            print(f"  {state.upper()}: {self.report.get(state, 'not run')}", flush=True)
        return results
