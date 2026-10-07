import os
import csv
import hashlib
from datetime import datetime
from pathlib import Path
import warn_scraper

class StateWarnAdapter:
    def __init__(self, states=["ca", "ny", "wa", "tx"]):
        self.states = states
        self.output_dir = Path("/tmp/warn_data")

    def _generate_fingerprint(self, company, notice_date):
        unique_string = f"WARN-{company}-{notice_date}".lower().encode('utf-8')
        return hashlib.sha256(unique_string).hexdigest()

    async def fetch_latest(self):
        self.output_dir.mkdir(parents=True, exist_ok=True)
        structured_candidates = []

        for state in self.states:
            try:
                # Direct Python API call instead of subprocess CLI
                warn_scraper.scrape(state, self.output_dir)
                
                csv_file = self.output_dir / f"{state}.csv"
                if not csv_file.exists():
                    continue
                    
                with open(csv_file, 'r', encoding='utf-8-sig') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        company = row.get('Company', row.get('company_name', 'Unknown'))
                        headcount = row.get('Employees', row.get('employees_affected', 0))
                        notice_date = row.get('Notice Date', row.get('notice_date', datetime.now().strftime('%Y-%m-%d')))
                        
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
