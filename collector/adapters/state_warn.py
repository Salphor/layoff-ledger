import asyncio
import csv
import hashlib
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

class StateWarnAdapter:
    def __init__(self, states=["ca", "ny", "wa", "tx"], max_days_old=2):
        self.states = states
        self.output_dir = Path("/tmp/warn_data")
        self.cache_dir = Path("/tmp/warn_cache")
        self.cutoff_date = datetime.now() - timedelta(days=max_days_old)

    def _generate_fingerprint(self, company, notice_date):
        unique_string = f"WARN-{company}-{notice_date}".lower().encode('utf-8')
        return hashlib.sha256(unique_string).hexdigest()

    def _get_field(self, row, possible_keys, default=None):
        row_lower = {str(k).lower().strip(): v for k, v in row.items() if k}
        for key in possible_keys:
            val = row_lower.get(key.lower())
            if val is not None and str(val).strip():
                return str(val).strip()
        return default

    def _is_recent(self, date_str):
        if not date_str:
            return True
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y-%m-%dT%H:%M:%S"):
            try:
                dt = datetime.strptime(date_str.split()[0], fmt)
                return dt >= self.cutoff_date
            except ValueError:
                continue
        return True

    def _run_state_scrape(self, state):
        """Synchronous subprocess execution run in a separate thread."""
        cmd = [
            sys.executable, "-m", "warn",
            "--data-dir", str(self.output_dir),
            "--cache-dir", str(self.cache_dir),
            state
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if result.returncode != 0:
                cmd_fallback = [
                    "warn-scraper",
                    "--data-dir", str(self.output_dir),
                    "--cache-dir", str(self.cache_dir),
                    state
                ]
                subprocess.run(cmd_fallback, capture_output=True, text=True, timeout=300)
        except subprocess.TimeoutExpired:
            print(f"Failed to scrape WARN data for {state.upper()}: Timed out after 300 seconds", flush=True)

    async def fetch_latest(self):
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        structured_candidates = []

        for state in self.states:
            try:
                await asyncio.to_thread(self._run_state_scrape, state)

                csv_file = self.output_dir / f"{state}.csv"
                if not csv_file.exists():
                    continue
                    
                with open(csv_file, 'r', encoding='utf-8-sig') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        company = self._get_field(row, ['company', 'company_name', 'employer', 'organization', 'business_name'], 'Unknown')
                        headcount = self._get_field(row, ['employees', 'employees_affected', 'number_of_workers', 'headcount', 'layoff_num'], 0)
                        notice_date = self._get_field(row, ['notice_date', 'notice_date_formatted', 'date', 'warn_date'], datetime.now().strftime('%Y-%m-%d'))
                        
                        if company == 'Unknown' or not self._is_recent(notice_date):
                            continue
                            
                        fingerprint = self._generate_fingerprint(company, notice_date)
                        affected_count = int(headcount) if str(headcount).isdigit() else None
                        
                        extracted_json = {
                            "company_name": company,
                            "headcount": affected_count,
                            "date_announced": notice_date,
                            "is_layoff": True,
                            "source_type": "warn_database",
                            "state": state.upper()
                        }
                        
                        structured_candidates.append({
                            "source_key": f"warn-{state}",
                            "publisher": f"{state.upper()} State WARN Registry",
                            "url": f"https://warn-registry-{state}.local",
                            "title": f"WARN Notice: {company} ({state.upper()})",
                            "published_at": notice_date,
                            "fingerprint": fingerprint,
                            "metadata": {
                                "company_name": company,
                                "affected_count": affected_count,
                                "notice_date": notice_date,
                                "raw_source": "WARN",
                                "state": state,
                                "raw_row": row
                            },
                            "pre_extracted_json": extracted_json
                        })

            except Exception as e:
                print(f"Failed to scrape WARN data for {state.upper()}: {e}", flush=True)

        return structured_candidates