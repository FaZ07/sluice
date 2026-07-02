# SLUICE gig kit — paste-ready listings + the money math

Companion to [freelance-kit.md](../freelance-kit.md) (RAG vertical). This is
the **data-extraction vertical** — higher volume, faster wins, and SLUICE
fulfils each order in minutes.

---

## 1. Fiverr gig

**Title:** I will extract clean, verified data from any website into Excel/CSV

**Description:**
Need business leads, product prices, listings, or directory data in a clean
spreadsheet? I deliver **validated** data, not raw scrapes:

- Phone numbers normalized, emails verified for format, URLs checked
- Duplicates removed (I catch "Studio Verve" vs "studio verve" as one)
- A QA report with every dataset: completeness per column, a corrections
  log, and a quality grade — you see exactly what was fixed
- Delivered as Excel-ready CSV + an HTML quality report

I use enterprise scraping infrastructure (no blocks, no half-finished
datasets) and a tested cleaning engine (54 automated tests).

Public business data only. I don't do personal-data harvesting or anything
against a site's terms.

**Packages (intro pricing — raise after 5 reviews):**
- **Basic — $40:** up to 200 rows, 1 site, 5 columns, CSV + QA report. 24h.
- **Standard — $110:** up to 1,000 rows, 2 sites merged & deduped, QA
  report + integrity manifest. 48h.
- **Premium — $260:** up to 5,000 rows, 3 sites, custom validation rules,
  re-run within 30 days included (refresh the data once, free). 4 days.

> The 30-day re-run in Premium is the recurring-revenue hook: refreshed
> data = repeat buyers. A re-run costs you one command.

---

## 2. Upwork proposal template (scraping jobs)

Hi [Name],

Your post about [their data need] — I can deliver this as a **validated
dataset**, not a raw scrape: deduplicated, phone/email/URL-checked, with a
QA report showing per-column completeness and every correction made, plus
a checksum manifest so you can verify integrity.

One scoping question: [roughly how many rows / which specific fields
matter most / one-time or refreshed monthly?]

I can send you a 20-row sample from your exact target within 24 hours so
you can judge the quality before committing.

— Fazil

> The free 20-row sample is the closer. It costs you ~2 minutes and a few
> Wire credits; nobody else offers proof before payment.

---

## 3. Where the money actually is (priority order)

1. **Lead generation** (Google Maps / directories → business name, phone,
   email, website). Highest volume on both platforms. Demo job 1 is
   literally this — show `report.html` as your portfolio image.
2. **E-commerce price/competitor monitoring** (Amazon.in, Flipkart,
   Meesho). Sellers pay monthly for refreshes → convert one-time gigs into
   ₹1,500–3,000/mo retainers ("same dataset, every Monday"). Demo job 2.
3. **Listings aggregation** (real estate, jobs, events) — merged from 2–3
   sources, deduped. SLUICE's normalized-key dedupe is the differentiator.

## 4. Unit economics

- Wire is the only variable cost — price every gig ≥ 10× expected credit
  spend; the free sample proves the target works before you quote.
- Mock mode costs zero: portfolio screenshots, demos, and all 54 tests
  burn no credits.
- Fulfilment time per gig after spec-writing: minutes. At $40–110/gig and
  2–3 gigs/week, this clears more than a typical fresher stipend — while
  every deliverable doubles as portfolio proof.

## 5. First-week checklist

- [ ] Check Wire credit balance / pricing at anakin.io dashboard (Blitz
      runner-ups got 2,000 credits — check if any landed on your account)
- [ ] Screenshot both demo `report.html` files → gig gallery images
- [ ] Post the Fiverr gig (above, verbatim)
- [ ] Send 5 Upwork proposals/day on lead-gen + scraping jobs (template §2)
- [ ] For each real gig: write spec → `sluice.py run` → send csv + report
