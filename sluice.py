"""
SLUICE — raw web in, gold out.

CLI:
  python sluice.py run jobs/demo_leads.json     # fulfil one job spec
  python sluice.py demo                         # run every bundled demo job

A "job" is one client gig: where the rows come from, which fields the
client is paying for, and what counts as a duplicate. Everything else —
fetch, clean, grade, package — is automatic.

Row source (exactly one per job):
  "action_id": "..."      Wire action (scraping gigs; live mode costs credits)
  "csv_source": "..."     client-supplied CSV file, or a list of CSVs to merge
                          (data-cleaning gigs; offline, zero credits)
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import engine
import wire
from deliver import deliver

ROOT = Path(__file__).parent


def read_csv_rows(source: str | list[str]) -> list[dict]:
    """Client-supplied CSV(s) -> raw rows. utf-8-sig eats Excel's BOM; a list
    of paths is merged in order (multi-file cleaning gigs)."""
    paths = [source] if isinstance(source, str) else list(source)
    rows: list[dict] = []
    for p in paths:
        with open(ROOT / p, newline="", encoding="utf-8-sig") as fh:
            rows.extend(dict(r) for r in csv.DictReader(fh))
    return rows


def run_job(job_path: Path) -> dict:
    job = json.loads(job_path.read_text(encoding="utf-8"))
    if "csv_source" in job:
        raw = read_csv_rows(job["csv_source"])
    else:
        raw = wire.fetch(job["action_id"], job.get("params", {}))
    result = engine.process(raw, job)
    package = deliver(job, result, ROOT / job.get("output_dir", "deliverables"))
    qa = result["qa"]
    print(f"\n  {job['title']}")
    print(f"  grade {qa['grade']} | {qa['rows_in']} raw -> {qa['rows_out']} delivered "
          f"({qa['dupes_removed']} dupes, {qa['rejected']} rejected, "
          f"{qa['overall_completeness'] * 100:.0f}% complete)")
    print(f"  -> {package['dir']}  [{', '.join(package['files'])}]")
    return package


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[0] == "run":
        run_job(Path(argv[1]))
        return 0
    if argv and argv[0] == "demo":
        jobs = sorted((ROOT / "jobs").glob("*.json"))
        if not jobs:
            print("no job specs found in jobs/")
            return 1
        for p in jobs:
            run_job(p)
        print(f"\n  {len(jobs)} job(s) fulfilled. Open report.html in any deliverable folder.")
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
