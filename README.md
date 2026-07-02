# SLUICE — _raw web in, gold out_

A gig-fulfilment engine for data-extraction freelancing. A client request
becomes a small JSON job spec; SLUICE pulls the raw rows through **Anakin
Wire**, runs them through a deterministic clean/validate/dedupe/QA engine,
and packages a client-ready deliverable — clean CSV, a branded QA report,
and a provenance manifest — in minutes.

> **Why this makes money:** "scrape site X into a clean spreadsheet" is one
> of the highest-volume gig categories on Fiverr/Upwork ($50–500/job). Most
> sellers fulfil slowly with brittle scripts and deliver a bare CSV. SLUICE
> fulfils in minutes and delivers a *graded, verifiable package* — the same
> gig, priced like a premium service. Wire does the hard part (zero-block,
> logged-in-session access); the engine does the part clients actually
> judge you on (clean, deduped, validated data).

Zero dependencies — Python stdlib only. Mock mode is keyless and offline.

---

## The demo in 30 seconds

```bash
python sluice.py demo
```

Two bundled jobs run end-to-end (no keys, no network, zero credits):

| Job | Raw | Delivered | What the engine caught |
|---|---|---|---|
| Chennai interior-designer leads | 18 | 14 (grade B) | 2 dupes (incl. normalized-key), 2 unusable rows, bad emails/URLs blanked, all phones → `+91` format |
| Amazon.in electronics prices | 12 | 10 (grade B) | 1 duplicate listing, 1 row missing price, `₹1,04,990` lakh-format parsed |

Open `deliverables/<job_id>/report.html` — that's what the client receives.

## Tests

```bash
python -m unittest discover -s tests    # 54 tests, offline, deterministic
```

---

## Anatomy of a gig

1. Client: "I need interior designers in Chennai with phone + email."
2. You write a 20-line job spec (`jobs/*.json`): Wire action, paid-for
   fields with types, dedupe keys.
3. `python sluice.py run jobs/the_job.json`
4. Send the client `data.csv` + `report.html`. The report shows the grade,
   per-field completeness bars, and a corrections log — every fix visible,
   every row verifiable at the source, sha256 in `manifest.json` if anyone
   disputes what was delivered.

## Mock → Live (the only switch)

```env
MODE=live
WIRE_BASE_URL=https://api.anakin.io/v1/wire
WIRE_API_KEY=sk_wire_xxx
```

Mock fixtures have the identical nested shape as live Wire responses
(`data.data.data`), so going live changes the source and nothing else.
Live polling is bounded: 90s hard ceiling, capped exponential backoff.

## Architecture

```
job spec (jobs/*.json)          ← one client gig, declaratively
   │
   ▼
wire.py     → the ONLY file that talks outside; mock/live; stdlib urllib
engine.py   → pure functions: validate (email/phone_in/url/number/string),
              reject-or-blank, normalized-key dedupe, completeness, grade
deliver.py  → data.csv (UTF-8 BOM for Excel) + report.html + manifest.json
sluice.py   → CLI: run one job / demo all
```

- **Deterministic**: same rows + spec + timestamp → byte-identical package
  (tested). Disputes end at the manifest hash.
- **Fails safe**: every Wire failure is a clean `WireError`; a gig fetch
  can never hang past 90s.
- **Grades are honest**: A requires ≤5% rejects and ≥90% completeness.
  Dirty sources get a B — which is itself a sales artifact ("here's what
  was wrong with the source, and here's what I fixed").

## Scope rules (protects the Fiverr account)

- Public business data only — no personal-data harvesting, no scraping
  behind other people's logins, no bulk-email lists from private sources.
- Respect target-site terms; decline gigs that require evasion.
- GDPR-flavoured requests (EU consumer PII) → declined by default.

## Stack

Python 3 stdlib · Anakin Wire (data) · nothing else to install.
