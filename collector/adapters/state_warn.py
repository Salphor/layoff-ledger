import subprocess
import csv
import os
import hashlib
from datetime import datetime

class StateWarnAdapter:
    def __init__(self, states=["ca", "ny", "wa", "tx"]):
        self.states = states
        # GitHub Actions has a generic /tmp directory we can use for file writes
        self.output_dir = "/tmp/warn_data"

    def _generate_fingerprint(self, company, notice_date):
        """Create a unique hash to prevent duplicate insertions."""
        unique_string = f"WARN-{company}-{notice_date}".lower().encode('utf-8')
        return hashlib.sha256(unique_string).hexdigest()

    async def fetch_latest(self):
        os.makedirs(self.output_dir, exist_ok=True)
        structured_candidates = []

        for state in self.states:
            try:
                # Run the warn-scraper CLI command for the specific state
                subprocess.run(
                    ["warn", "scrape", state, "--data-dir", self.output_dir], 
                    check=True, 
                    capture_output=True
                )
                
                csv_file = os.path.join(self.output_dir, f"{state}.csv")
                if not os.path.exists(csv_file):
                    continue
                    
                with open(csv_file, 'r', encoding='utf-8-sig') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        # Map generic WARN CSV headers (headers vary slightly by state, 
                        # you may need to adjust these keys based on the actual CSV output)
                        company = row.get('Company', row.get('company_name', 'Unknown'))
                        headcount = row.get('Employees', row.get('employees_affected', 0))
                        notice_date = row.get('Notice Date', row.get('notice_date', datetime.now().strftime('%Y-%m-%d')))
                        
                        if company == 'Unknown':
                            continue
                            
                        fingerprint = self._generate_fingerprint(company, notice_date)
                        
                        # Build the exact same JSON structure Gemini would return
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
                            "url": f"https://warn-registry-{state}.local", # Placeholder URL
                            "title": f"WARN Notice: {company} ({state.upper()})",
                            "published_at": notice_date,
                            "fingerprint": fingerprint,
                            "metadata": {"state": state, "raw_row": row},
                            "pre_extracted_json": extracted_json # This flag tells run_scan to skip Gemini
                        })

            except Exception as e:
                print(f"Failed to scrape WARN data for {state.upper()}: {e}")

        return structured_candidates
