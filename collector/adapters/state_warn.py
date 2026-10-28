import asyncio
import csv
import hashlib
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

from warn_fields import normalize_warn_row, parse_date

# States we collect. Each one is a separate scraper in the warn-scraper library
# (https://github.com/biglocalnews/warn-scraper), so one state failing never
# stops the others.
DEFAULT_STATES = ["ca", "ny", "wa", "tx"]

# How far back a notice can be and still be picked up. States post notices days
# or weeks after the notice date (California's spreadsheet is refreshed about
# weekly), so a 2-day window missed most of them. Duplicates are prevented by
# the fingerprint check in run_scan.py, so a wider window is safe.
DEFAULT_MAX_DAYS_OLD = 45

SCRAPE_TIMEOUT_SECONDS = 300


class StateWarnAdapter:
    def __init__(self, states=None, max_days_old=DEFAULT_MAX_DAYS_OLD):
        self.states = states or DEFAULT_STATES
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
            if not fields["notice_date"]:
                no_date += 1
                continue
            if fields["notice_date"] < self.cutoff:
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
                "published_at": fields["notice_date"],
                "fingerprint": self._fingerprint(fields["company_raw"], fields["notice_date_raw"]),
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
        if no_company == len(rows) or no_date == len(rows):
            self.report[state] += "  <-- CHECK: column names not recognised"
        return kept

    async def fetch_latest(self):
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        results = []

        for state in self.states:
            try:
                ok = await asyncio.to_thread(self._run_state_scrape, state)
                items = self._read_state(state)
                if not ok and state in self.report:
                    self.report[state] = "scraper failed; " + self.report[state]
                results.extend(items)
            except Exception as e:
                self.report[state] = f"error: {e!r}"

        print("WARN scrape summary:", flush=True)
        for state in self.states:
            print(f"  {state.upper()}: {self.report.get(state, 'not run')}", flush=True)
        return results
