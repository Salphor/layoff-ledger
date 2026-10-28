"""
Dry run of the WARN scrape: downloads each state's notices and prints what the
pipeline WOULD save. It never connects to the database, so it is safe to run
from any branch or on your own computer.

    python collector/warn_check.py            # CA, NY, WA, TX
    python collector/warn_check.py tx ny      # just these states
"""
import asyncio
import sys
from collections import defaultdict

from adapters.state_warn import StateWarnAdapter
from warn_fields import build_warn_payload


async def main():
    states = [s.lower() for s in sys.argv[1:]] or None
    adapter = StateWarnAdapter(states=states)
    items = await adapter.fetch_latest()  # prints the per-state summary

    by_state = defaultdict(list)
    for it in items:
        by_state[it["source_key"]].append(it)

    print("\nSample of what would be saved (up to 5 per state):")
    for key, rows in sorted(by_state.items()):
        with_count = sum(1 for r in rows if r["metadata"]["affected_count"])
        with_eff = sum(1 for r in rows if r["metadata"]["effective_date"])
        print(f"\n{key.upper()}: {len(rows)} notices, {with_count} with a worker count, {with_eff} with a layoff start date")
        for it in rows[:5]:
            p = build_warn_payload({"source_id": "dry-run", "source_key": it["source_key"],
                                    "title": it["title"], "metadata": it["metadata"]})
            print(f"  - {p['company_name']} | workers: {p['headcount'] or '—'} | notice: {p['notice_date']} "
                  f"| starts: {p['effective_date'] or '—'} | {', '.join(p['locations']) or '—'}")
    print("\nDry run only: nothing was written to the database.")


if __name__ == "__main__":
    asyncio.run(main())
