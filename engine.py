"""
SLUICE engine — deterministic clean / validate / dedupe / QA.

Pure functions, no I/O, no network, no randomness. Same rows + same spec
in, byte-identical result out. This is the part a client is actually
paying for: raw scraped rows go in, graded deliverable-quality rows come
out, with every correction logged.

Row lifecycle:
  raw row -> per-field validation -> (reject | keep with blanked fields)
          -> dedupe on normalized key -> completeness stats -> grade
"""
from __future__ import annotations

import re

ENGINE_VERSION = "1.0.0"

# ---------------------------------------------------------------------------
# Field validators.
# Each takes the raw cell value and returns (status, cleaned_value) where
# status is "ok", "blank" (empty / treated-as-empty), or "invalid".
# ---------------------------------------------------------------------------

_WS = re.compile(r"\s+")
_EMAIL = re.compile(r"^[\w.+-]+@[\w-]+(\.[\w-]+)+$")
_DOMAIN = re.compile(r"^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(/.*)?$", re.I)
_NON_DIGIT = re.compile(r"\D")
_NA_WORDS = {"", "-", "--", "—", "n/a", "na", "none", "null", "nil"}


def _clean(value) -> str:
    """Collapse whitespace; map n/a-style placeholders to empty."""
    s = _WS.sub(" ", str(value if value is not None else "")).strip()
    return "" if s.lower() in _NA_WORDS else s


def validate_string(value):
    s = _clean(value)
    return ("blank", "") if not s else ("ok", s)


def validate_email(value):
    s = _clean(value).lower()
    if not s:
        return ("blank", "")
    return ("ok", s) if _EMAIL.match(s) else ("invalid", "")


def validate_phone_in(value):
    """Indian phone numbers. Mobiles -> '+91 XXXXX XXXXX'; landlines kept
    as 'STD-number'. Anything that can't be a real Indian number is invalid."""
    s = _clean(value)
    if not s:
        return ("blank", "")
    d = _NON_DIGIT.sub("", s)
    if d.startswith("91") and len(d) == 12:
        d = d[2:]
    if d.startswith("0") and len(d) == 11 and d[1] in "6789":
        d = d[1:]                                   # 0-prefixed mobile
    if len(d) == 10 and d[0] in "6789":
        return ("ok", f"+91 {d[:5]} {d[5:]}")       # mobile
    if d.startswith("0") and len(d) == 11:
        return ("ok", f"{d[:3]}-{d[3:]}")           # landline w/ STD code
    return ("invalid", "")


def validate_url(value):
    s = _clean(value)
    if not s:
        return ("blank", "")
    if " " in s:
        return ("invalid", "")
    bare = re.sub(r"^https?://", "", s, flags=re.I).rstrip("/")
    if not _DOMAIN.match(bare):
        return ("invalid", "")
    return ("ok", f"https://{bare}")


def validate_number(value):
    """Numbers as they appear in the wild: '₹1,299', '1,29,900', '4.8'."""
    s = _clean(value)
    if not s:
        return ("blank", "")
    s = s.replace("₹", "").replace("Rs.", "").replace(",", "").strip()
    try:
        x = float(s)
    except ValueError:
        return ("invalid", "")
    return ("ok", str(int(x)) if x == int(x) else str(round(x, 2)))


VALIDATORS = {
    "string": validate_string,
    "email": validate_email,
    "phone_in": validate_phone_in,
    "url": validate_url,
    "number": validate_number,
}

# ---------------------------------------------------------------------------
# Processing pipeline
# ---------------------------------------------------------------------------


def _dedupe_key(row: dict, keys: list[str]) -> str:
    return "|".join(re.sub(r"[^a-z0-9]", "", str(row.get(k, "")).lower()) for k in keys)


def grade(reject_rate: float, overall_completeness: float) -> str:
    if reject_rate <= 0.05 and overall_completeness >= 0.90:
        return "A"
    if reject_rate <= 0.15 and overall_completeness >= 0.75:
        return "B"
    return "C"


def process(raw_rows: list[dict], spec: dict) -> dict:
    """Run the full pipeline. Returns {"rows": [...], "qa": {...}}."""
    fields = spec["fields"]
    dedupe_keys = spec.get("dedupe_keys", [])
    issues: list[dict] = []
    kept: list[dict] = []

    for i, raw in enumerate(raw_rows, start=1):
        out, rejected = {}, False
        for f in fields:
            name, ftype, required = f["name"], f.get("type", "string"), f.get("required", False)
            validator = VALIDATORS.get(ftype)
            if validator is None:
                raise ValueError(f"unknown field type: {ftype}")
            status, cleaned = validator(raw.get(name, ""))
            if status == "invalid" and required:
                issues.append({"row": i, "field": name, "problem": f"invalid_{ftype}",
                               "action": "row_rejected"})
                rejected = True
                break
            if status == "blank" and required:
                issues.append({"row": i, "field": name, "problem": "missing_required",
                               "action": "row_rejected"})
                rejected = True
                break
            if status == "invalid":
                issues.append({"row": i, "field": name, "problem": f"invalid_{ftype}",
                               "action": "blanked"})
                cleaned = ""
            out[name] = cleaned
        if not rejected:
            kept.append((i, out))

    # Dedupe: keep first occurrence of each normalized key.
    rows: list[dict] = []
    seen: dict[str, int] = {}
    dupes = 0
    for i, row in kept:
        key = _dedupe_key(row, dedupe_keys) if dedupe_keys else str(i)
        if key in seen:
            dupes += 1
            issues.append({"row": i, "field": ",".join(dedupe_keys),
                           "problem": f"duplicate_of_row_{seen[key]}", "action": "deduped"})
            continue
        seen[key] = i
        rows.append(row)

    rows_in, rows_out = len(raw_rows), len(rows)
    rejected_n = rows_in - len(kept)
    completeness = {
        f["name"]: (round(sum(1 for r in rows if r[f["name"]] != "") / rows_out, 4)
                    if rows_out else 0.0)
        for f in fields
    }
    overall = round(sum(completeness.values()) / len(completeness), 4) if completeness else 0.0
    reject_rate = round(rejected_n / rows_in, 4) if rows_in else 0.0

    return {
        "rows": rows,
        "qa": {
            "engine_version": ENGINE_VERSION,
            "rows_in": rows_in,
            "rows_out": rows_out,
            "rejected": rejected_n,
            "dupes_removed": dupes,
            "reject_rate": reject_rate,
            "field_completeness": completeness,
            "overall_completeness": overall,
            "grade": grade(reject_rate, overall),
            "issues": issues,
        },
    }
