"""
SLUICE — deliverable writer. Turns an engine result into the package a
client actually receives:

  deliverables/<job_id>/
    data.csv        UTF-8 with BOM so Excel renders ₹ / Indian names correctly
    report.html     self-contained branded QA report (the "looks like $300" part)
    manifest.json   sha256 of the CSV + spec echo — provenance, disputes settled

Deterministic: same rows + same spec + same timestamp -> identical bytes.
"""
from __future__ import annotations

import csv
import hashlib
import html
import io
import json
from datetime import datetime, timezone
from pathlib import Path

GRADE_COLORS = {"A": "#0e9f6e", "B": "#d97706", "C": "#dc2626"}
GRADE_LABEL = {"A": "Deliverable quality: excellent", "B": "Deliverable quality: good",
               "C": "Deliverable quality: needs review"}


def csv_bytes(rows: list[dict], field_names: list[str]) -> bytes:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=field_names, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return b"\xef\xbb\xbf" + buf.getvalue().encode("utf-8")


def _bar(pct: float) -> str:
    color = "#0e9f6e" if pct >= 0.9 else ("#d97706" if pct >= 0.7 else "#dc2626")
    return (f'<div style="background:#e5e7eb;border-radius:4px;height:8px;width:160px">'
            f'<div style="background:{color};border-radius:4px;height:8px;width:{pct * 100:.0f}%">'
            f"</div></div>")


def render_html(job: dict, qa: dict, rows: list[dict], generated_at: str) -> str:
    e = html.escape
    fields = [f["name"] for f in job["fields"]]
    g = qa["grade"]

    completeness_rows = "".join(
        f"<tr><td>{e(name)}</td><td>{_bar(pct)}</td><td>{pct * 100:.1f}%</td></tr>"
        for name, pct in qa["field_completeness"].items()
    )
    issue_rows = "".join(
        f"<tr><td>{i['row']}</td><td>{e(str(i['field']))}</td>"
        f"<td>{e(i['problem'])}</td><td>{e(i['action'])}</td></tr>"
        for i in qa["issues"][:25]
    ) or '<tr><td colspan="4">No issues — clean source.</td></tr>'
    more_issues = (f'<p class="dim">…and {len(qa["issues"]) - 25} more (all logged in manifest).</p>'
                   if len(qa["issues"]) > 25 else "")
    preview_head = "".join(f"<th>{e(f)}</th>" for f in fields)
    preview_rows = "".join(
        "<tr>" + "".join(f"<td>{e(r[f]) or '—'}</td>" for f in fields) + "</tr>"
        for r in rows[:10]
    )

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SLUICE — {e(job['title'])}</title>
<style>
  body{{font-family:Segoe UI,system-ui,sans-serif;color:#111827;margin:0;background:#f8fafc}}
  .wrap{{max-width:860px;margin:0 auto;padding:28px 20px 60px}}
  header{{background:#0f172a;color:#f1f5f9;padding:26px 20px}}
  header .inner{{max-width:860px;margin:0 auto}}
  .brand{{letter-spacing:.35em;font-weight:700;color:#5eead4;font-size:13px}}
  h1{{margin:6px 0 2px;font-size:24px}}
  .dim{{color:#64748b;font-size:13px}}
  .cards{{display:flex;gap:14px;flex-wrap:wrap;margin:22px 0}}
  .card{{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 20px;min-width:120px}}
  .card b{{display:block;font-size:26px}}
  .grade{{background:{GRADE_COLORS[g]};color:#fff;border:none}}
  h2{{font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:#334155;margin:30px 0 10px}}
  table{{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:8px;font-size:13px}}
  th,td{{text-align:left;padding:8px 12px;border-bottom:1px solid #f1f5f9}}
  th{{background:#f1f5f9;color:#334155}}
  footer{{margin-top:36px;font-size:12px;color:#94a3b8}}
</style></head><body>
<header><div class="inner">
  <div class="brand">S L U I C E</div>
  <h1>{e(job['title'])}</h1>
  <div class="dim" style="color:#94a3b8">Prepared for {e(job.get('client', 'Client'))} · {e(generated_at)}</div>
</div></header>
<div class="wrap">
  <div class="cards">
    <div class="card grade"><b>{g}</b>{e(GRADE_LABEL[g])}</div>
    <div class="card"><b>{qa['rows_out']}</b>rows delivered</div>
    <div class="card"><b>{qa['dupes_removed']}</b>duplicates removed</div>
    <div class="card"><b>{qa['rejected']}</b>unusable rows rejected</div>
    <div class="card"><b>{qa['overall_completeness'] * 100:.0f}%</b>overall completeness</div>
  </div>
  <h2>Field completeness</h2>
  <table><tr><th>Field</th><th></th><th>Filled</th></tr>{completeness_rows}</table>
  <h2>Corrections log</h2>
  <table><tr><th>Source row</th><th>Field</th><th>Problem</th><th>Action</th></tr>{issue_rows}</table>
  {more_issues}
  <h2>Data preview (first 10 of {qa['rows_out']})</h2>
  <div style="overflow-x:auto"><table><tr>{preview_head}</tr>{preview_rows}</table></div>
  <footer>Every row above is verifiable at the source. Full dataset: data.csv ·
  Integrity: manifest.json (sha256) · Engine v{e(qa['engine_version'])}</footer>
</div></body></html>"""


def deliver(job: dict, result: dict, out_root: str | Path, now: str | None = None) -> dict:
    """Write the full package. Returns paths + csv sha256."""
    generated_at = now or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    out_dir = Path(out_root) / job["job_id"]
    out_dir.mkdir(parents=True, exist_ok=True)

    field_names = [f["name"] for f in job["fields"]]
    data = csv_bytes(result["rows"], field_names)
    sha = hashlib.sha256(data).hexdigest()

    (out_dir / "data.csv").write_bytes(data)
    (out_dir / "report.html").write_text(
        render_html(job, result["qa"], result["rows"], generated_at), encoding="utf-8")
    manifest = {
        "job_id": job["job_id"],
        "title": job["title"],
        "client": job.get("client", ""),
        "generated_at": generated_at,
        "spec": {"fields": job["fields"], "dedupe_keys": job.get("dedupe_keys", [])},
        "qa": result["qa"],
        "csv_sha256": sha,
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8")

    return {"dir": str(out_dir), "csv_sha256": sha,
            "files": ["data.csv", "report.html", "manifest.json"]}
