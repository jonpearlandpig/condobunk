
I agree — this is a real data-quality regression, and the root cause is now clear from your current run.

What I confirmed from your backend data:
- The latest uploaded doc is `KOH26 Advance Master v3.xlsx` (`06602362-b73a-45b0-b3f0-0cfc87386dcb`).
- Extracted rows for that doc have clearly wrong dates (example: `UBS Arena` = `2025-11-01`, `Lenovo Center` = `2026-07-22`).
- In the stored VAN payload, `event_details.day_and_date` is often Excel serial text (`46086`, `46087`, `46096`, etc.).
- Those serials map correctly to March 2026 (e.g. `46086 -> 2026-03-05`, `46103 -> 2026-03-22`), proving dates are available but being misinterpreted.
- The uploaded spreadsheet itself shows plain human dates in the “Day and Date” row, so this should be deterministic.

Why this happened:
1) In the column-based Excel parser path, cell values are read as raw values and written as strings directly, so date cells become serial numbers (`46086`) instead of formatted dates.
2) The extraction then relies on AI to infer `event_date` from these serial strings, which produced incorrect dates.
3) Schedule cleanup in advance-master insertion is date-based per tour, not source-doc scoped, so stale/wrong rows can survive or collide in bad ways.

Implementation plan (high priority, deterministic-first):

1. Fix Excel date normalization in the column-based parser
- File: `supabase/functions/extract-document/index.ts`
- In the column-based loop, add a strict date normalizer for “Day and Date” / date-like labels:
  - Detect numeric Excel serials and convert to ISO (`YYYY-MM-DD`) deterministically.
  - Prefer worksheet formatted text when available.
  - Preserve non-date numeric fields (capacity, counts) untouched.
- Add helper(s) near parser utilities:
  - `excelSerialToISO(serial: number): string`
  - `normalizeDateCell(label: string, rawValue: unknown): { isoDate: string | null; display: string }`

2. Stop trusting AI for primary event_date when deterministic date exists
- File: `supabase/functions/extract-document/index.ts`
- During advance-master per-column parsing, capture per-column deterministic date and venue hints (by index).
- In VAN/schedule insertion:
  - Use deterministic parsed date as source of truth when present.
  - Use AI `event_date` only as fallback.
  - If AI returns numeric `day_and_date`, normalize it before any date parsing/fallback logic.

3. Make schedule cleanup source-doc scoped (prevent stale/partial cross-contamination)
- File: `supabase/functions/extract-document/index.ts`
- At start of advance-master branch:
  - `DELETE schedule_events WHERE source_doc_id = document_id`
- Replace current per-event delete (`tour_id + event_date`) with safer logic:
  - Source-doc replacement first.
  - Optional authority dedupe as a separate step (not broad date wipe).
- This ensures a re-extract produces a clean, exact replacement for the same uploaded file.

4. Harden venue fallback to avoid city-as-venue / Unknown Venue
- File: `supabase/functions/extract-document/index.ts`
- Persist per-column deterministic venue from the “Venue” row.
- If AI venue is missing, equals city, or equals “Unknown Venue”, substitute deterministic venue.
- Keep city from header as secondary fallback, not venue.

5. Add extraction sanity checks + guardrails before final write
- File: `supabase/functions/extract-document/index.ts`
- Add lightweight validation counters and warnings in logs/response:
  - `excel_serial_dates_converted`
  - `deterministic_dates_used`
  - `ai_dates_overridden`
  - `unknown_venue_fallbacks`
- Add a fail-safe warning path if date spread is implausible for a single tour segment (for visibility, not hard failure).

6. Data repair for your current broken run
- Backend data action after code fix:
  - Re-run extraction for `06602362-b73a-45b0-b3f0-0cfc87386dcb`.
  - Because of source-doc scoped cleanup, bad rows from this run get replaced cleanly.
- Verify corrected outputs:
  - `event_date` range should align with March 2026 sequence from the sheet.
  - No leftover Nov/May/Jul outliers for this source doc.

Validation checklist (using your exact file):
1) Upload/use `KOH26_Advance_Master_v3.xlsx` and run EXTRACT.
2) Confirm VANs:
- `day_and_date` not raw serials in effective date logic.
- `event_date` matches spreadsheet “Day and Date”.
3) Confirm schedule:
- Dates align to expected run (e.g. 3/5, 3/6, … 3/22).
- No “Unknown Venue” where “Venue” row has data.
4) Confirm idempotency:
- Re-run extract on same file, row counts and dates remain stable (no drift, no duplicates, no stale leftovers).
5) Check calendar view:
- Cards display corrected dates/venues for this tour only, with no old-date artifacts.

Technical notes:
- No schema migration required.
- No auth/RLS changes required.
- This is an extraction-engine correctness fix plus safe replacement behavior.

