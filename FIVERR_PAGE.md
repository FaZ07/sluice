# FIVERR page v2 — 4 new gigs, zero blocked on Wire

The [FIVERR.md](FIVERR.md) gigs need a live Anakin Wire key before you can
fulfil real orders. These 4 gigs don't — every one is fulfillable **today**
with skills and code you already have. Setup order, money-flow, and the
first-order playbook are in FIVERR.md §5–7 and apply unchanged.

**⚠ One account only.** Fiverr's ToS bans multiple accounts and links them
by device/payment info — both get banned. "New page" = your ONE seller
profile. If you already created an account, edit its gigs; don't register
a second one. New sellers get **4 active gig slots** — this file fills all
four. Swap gig 4 for a FIVERR.md scraping gig once Wire is verified.

---

## Profile (broader positioning than the data-only page)

- **Tagline:** Clean data · AI chatbots · Python automation
- **Description (≤600 chars):**

> AI/ML engineer (M.Tech CSE) who ships working software fast. I clean and
> validate messy datasets (with a QA report showing every fix), build AI
> chatbots that answer from your own documents, write Python automation
> scripts, and build interactive data dashboards. Everything I deliver is
> tested — my data pipeline alone carries 59 automated tests — and comes
> with honest documentation of what was done. Most jobs delivered in
> 24–48h. If I can't do it well, I'll tell you before you pay.

- **Skills:** Data Cleaning, Python, AI Chatbot Development, RAG,
  Automation, Data Visualization, Excel/CSV, React

---

## Gig 1 — DATA CLEANING (publish first: fulfilled by SLUICE in minutes, zero cost)

- **Title:** I will clean dedupe and validate your messy excel or csv data
- **Category:** Data → Data Processing → Data Cleaning (locks on publish)
- **Tags:** data cleaning · remove duplicates · excel cleanup · csv · data formatting
- **Description (≤1,200):**

> Send me your messy spreadsheet — CRM export, scraped list, merged
> contact sheets — and get back data you can actually use:
>
> - Duplicates removed, even sneaky ones ("Studio Verve" vs "studio verve"
>   vs extra spaces = one record)
> - Phone numbers normalized to one consistent format
> - Emails and URLs validated — bad values flagged, not silently kept
> - Junk placeholders (n/a, null, "—") cleaned out
> - Multiple files merged into one deduplicated sheet
>
> **Every order includes an HTML QA report**: quality grade, per-column
> completeness bars, and a corrections log listing every single fix — you
> see exactly what was wrong and what I did about it. Plus a checksum
> manifest for integrity.
>
> My cleaning pipeline is real software with 59 automated tests, not
> hand-editing in Excel — so it's fast, consistent, and nothing gets
> mangled. Excel-ready CSV output (UTF-8, opens clean).
>
> Unsure? Message me with 10 sample rows and I'll clean them free so you
> can judge before ordering.

- **Packages (launch → raise after 5 reviews):**

| | Basic $15 | Standard $40 | Premium $90 |
|---|---|---|---|
| Rows | up to 1,000 | up to 10,000 | up to 50,000 |
| Files | 1 file | up to 3 merged | up to 5 merged |
| Extras | QA report | + custom validation rules | + one free re-clean within 30 days |
| Delivery | 1 day | 1 day | 2 days |

- **Requirements form:**
  1. Attach your file(s) (CSV or Excel; I'll convert Excel).
  2. Which columns matter, and what should each contain (phone/email/URL/text/number)?
  3. What makes two rows "the same record" for duplicate removal?
- **FAQ:**
  - *Excel or CSV?* — Either. Delivery is Excel-ready CSV; .xlsx on request.
  - *Is my data safe?* — Processed locally, never shared or reused, deleted
    after order completion on request.
  - *What if my data is beyond saving?* — The QA report grades honestly. If
    a file is mostly junk I tell you what's salvageable before you pay.
- **Gallery:** screenshot of `deliverables/clean-crm-export-001/report.html`
  (regenerate with `python sluice.py run jobs/demo_clean_csv.json`) + a
  before/after split image of the messy vs clean CSV in Excel.
- **Fulfilment:** client file → `jobs/<order>.json` with `csv_source` →
  `python sluice.py run` → send data.csv + report.html. Minutes, no credits.

## Gig 2 — AI CHATBOT ON YOUR DOCUMENTS (highest ticket; your RAG skill)

- **Title:** I will build an ai chatbot that answers from your own documents
- **Category:** Programming & Tech → AI Development → Chatbot (closest available)
- **Tags:** ai chatbot · rag · document chatbot · knowledge base bot · llm
- **Description:**

> Get a chatbot that answers questions from YOUR content — product docs,
> PDFs, policies, course material, website — not generic AI guesses.
>
> - Answers grounded in your documents, with source citations
> - Says "I don't know" instead of inventing facts
> - Clean web chat interface, or embed into your existing site
> - Your documents stay yours — no training on your data
>
> I build retrieval-augmented (RAG) systems as my specialty — including
> fully offline ones for privacy-sensitive use. I'll tell you honestly
> what your documents can and can't support before you order.

- **Packages:** Basic $50 — chatbot over up to 10 docs, hosted demo link,
  1 revision. Standard $150 — up to 50 docs, custom-branded UI, deploy to
  your hosting, 2 revisions. Premium $400 — unlimited docs, embeddable
  widget, admin panel to update documents, 30 days support.
- **Requirements:** the documents (or site URL), where it should live
  (demo link / your site), any tone/branding rules.
- **FAQ:** *Which AI does it use?* — Groq/OpenAI/local models depending on
  your privacy and budget needs; API costs (usually a few $/mo) are yours,
  and I set it up transparently. *Can it be fully offline?* — Yes, that's
  my specialty; premium option.
- **Gallery:** screenshots of your multimodal RAG UI (ragproject — the
  repo stays private; screenshots are fine) + LifeLine's AI status strip.

## Gig 3 — PYTHON AUTOMATION (volume gig; catches broad searches)

- **Title:** I will write a python script to automate your repetitive tasks
- **Category:** Programming & Tech → Software Development → Scripting
- **Tags:** python script · automation · file processing · excel automation · web automation
- **Description:**

> Doing the same thing every week by hand? I'll turn it into a script you
> run with one click: file renaming/sorting, Excel/CSV processing and
> merging, report generation, format conversion, folder watching, web
> form filling, scheduled tasks.
>
> What you get: a working script + a plain-English README (how to run it,
> what it does) + I test it on YOUR actual files before delivery, not toy
> examples. Windows/Mac/Linux. Python is free — no licenses, no lock-in.

- **Packages:** Basic $20 — one task, single script, README. Standard $50 —
  multi-step workflow, error handling, runs on schedule. Premium $120 —
  full workflow with config file, logging, 30 days of fixes.
- **Requirements:** describe the manual process step by step; attach sample
  input files and one example of the desired output.
- **Gallery:** before/after screenshot (folder chaos → sorted; manual
  spreadsheet → generated report).

## Gig 4 — DATA DASHBOARD (uses AutoYield/PulseGrid muscle; swap for scraping gig once Wire works)

- **Title:** I will build an interactive data dashboard for your business data
- **Category:** Data → Data Visualization
- **Tags:** dashboard · data visualization · streamlit · analytics · kpi dashboard
- **Description:**

> Turn your spreadsheet into a live dashboard your team actually looks at:
> KPI cards, trend charts, filters, drill-downs. Built in Streamlit or
> React — opens in any browser, no Tableau/PowerBI license needed.
> Includes honest metric definitions (no vanity numbers) and a 2-minute
> Loom walkthrough of how to use and update it.

- **Packages:** Basic $40 — 1 page, up to 4 charts, from 1 data file.
  Standard $100 — multi-page, filters, auto-refresh from your file/sheet.
  Premium $250 — live data source (DB/API), deployment, 30 days support.
- **Gallery:** AutoYield wafer console screenshots (port 8095) — blur any
  WM-811K-specific labels if needed; PulseGrid dashboard views.

---

## Launch order (fits one SPINE block per day)

1. **Today:** profile + Gig 1 (cleaning) + Gig 3 (automation). Both need
   zero setup. Regenerate the cleaning demo report for the gallery first.
2. **Tomorrow:** Gig 2 (chatbot) — spend the block making one polished
   demo chatbot + screenshots.
3. **Day 3:** Gig 4 (dashboard) with AutoYield screenshots.
4. **Every day after:** FIVERR.md §5 playbook — 1h response, Briefs on,
   5 Upwork proposals. The free-sample closer works for all four gigs:
   10 rows cleaned free / 1-page automation spec free / chatbot demo on
   3 of their docs free.
