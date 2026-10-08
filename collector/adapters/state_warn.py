import os
import csv
import hashlib
import subprocess
import sys
from datetime import datetime
from pathlib import Path

class StateWarnAdapter:
    def __init__(self, states=["ca", "ny", "wa", "tx"], max_days_old=2):
        self.states = states
        self.output_dir = Path("/tmp/warn_data")
        self.cutoff_date = datetime.now() - timedelta(days=max_days_old)

    def _generate_fingerprint(self, company, notice_date):
        unique_string = f"WARN-{company}-{notice_date}".lower().encode('utf-8')
        return hashlib.sha256(unique_string).hexdigest()

    def _get_field(self, row, possible_keys, default=None):
        """Case-insensitive helper to extract fields from varying state CSV headers."""
        row_lower = {str(k).lower().strip(): v for k, v in row.items() if k}
        for key in possible_keys:
            val = row_lower.get(key.lower())
            if val is not None and str(val).strip():
                return str(val).strip()
        return default

    async def fetch_latest(self):
        self.output_dir.mkdir(parents=True, exist_ok=True)
        structured_candidates = []

        for state in self.states:
            try:
                cmd = [sys.executable, "-m", "warn", "--data-dir", str(self.output_dir), state]
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                if result.returncode != 0:
                    cmd_fallback = ["warn-scraper", "--data-dir", str(self.output_dir), state]
                    subprocess.run(cmd_fallback, capture_output=True, text=True)

                csv_file = self.output_dir / f"{state}.csv"
                if not csv_file.exists():
                    continue
                    
                with open(csv_file, 'r', encoding='utf-8-sig') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        company = self._get_field(row, ['company', 'company_name', 'employer', 'organization', 'business_name'], 'Unknown')
                        headcount = self._get_field(row, ['employees', 'employees_affected', 'number_of_workers', 'headcount', 'layoff_num'], 0)
                        notice_date = self._get_field(row, ['notice_date', 'notice_date_formatted', 'date', 'warn_date'], datetime.now().strftime('%Y-%m-%d'))
                        
                        if company == 'Unknown':
                            continue
                            
                        fingerprint = self._generate_fingerprint(company, notice_date)
                        
                        extracted_json = {
                            "company_name": company,
                            "headcount": int(headcount) if str(headcount).isdigit() else None,
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
                            "metadata": {"state": state, "raw_row": row},
                            "pre_extracted_json": extracted_json
                        })

            except Exception as e:
                print(f"Failed to scrape WARN data for {state.upper()}: {e}")

        return structured_candidates