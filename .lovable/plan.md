

# Fix Advance Master Extraction: Complete Data Capture

## Problem

Three root causes are preventing proper extraction of contacts, dates, cities, and advance notes:

1. **Section header matching is too broad**: `upperLabel.includes("DOCK")` matches data rows like "Number and type of loading dock" and "Distance from loading dock to stage". Same for "LABOR" matching "Labor Notes", "Labor Call". This corrupts the text structure, confusing the AI.

2. **Block header is ambiguous**: The `VENUE COLUMN DATA:` header gives the AI no venue identity. Row 0 often contains `#VALUE!` or a numbered city header (e.g., "2. Cleveland, OH") that the AI either ignores or splits into a second venue object -- creating duplicates with fragmented data.

3. **Flash model is too imprecise**: `gemini-2.5-flash` is hallucinating duplicate venues and dropping fields. The structured extraction needs Pro-level accuracy.

## Solution

### 1. Fix section header matching (line 1478)

Replace `includes()` with exact or `startsWith()` matching to prevent data rows from being misidentified as section headers:

```typescript
// Before: SECTION_HEADERS.some(h => upperLabel.includes(h))
// After:
SECTION_HEADERS.some(h => upperLabel === h || upperLabel.startsWith(h + " ") || upperLabel.startsWith(h + ":"))
```

Also expand the SECTION_HEADERS list to use full names:
```
"DOCK AND LOGISTICS", "LOADING DOCK AND LOGISTICS"
```
Remove the short ambiguous entries `"DOCK"` and `"SCHEDULE"`.

### 2. Rewrite block header format (lines 1466-1501)

Replace the ambiguous `VENUE COLUMN DATA:` header with a clear, unambiguous format:

```
=== SINGLE VENUE ===
Column Header: Ft Wayne
City (from header): Ft Wayne
```

- Parse city/state from the column header using regex (strip leading numbers like "2. Cleveland, OH" -> "Cleveland, OH")
- Skip row 0 in the data loop (start at `r = 1`) to avoid the raw header polluting data rows
- This gives the AI clear venue identity without duplication risk

### 3. Add explicit single-venue instruction to VAN prompt (lines 665-789)

Add to ADVANCE_MASTER_VAN_PROMPT:

```
IMPORTANT: Each text block separated by "---" represents EXACTLY ONE venue.
The "Column Header" line identifies the venue. Do NOT create multiple venue
objects from a single text block. Extract exactly ONE venue per block.
If you see a "City (from header)" line, use that as the city field.
```

### 4. Switch back to gemini-2.5-pro (line 1574)

The per-column data requires accurate structured extraction. Flash model creates duplicate venues and drops fields. Pro model with cleaner input (from fixes 1-2) will be accurate and still fast enough with parallel batching.

### 5. Keep parallel batching

Retain `Promise.all` and batch size of 6 for performance. With Pro model, each batch takes ~30-60s. Total time with parallel execution stays well under the 300s limit.

## Files Modified

- `supabase/functions/extract-document/index.ts`
  - Lines 665-789: Add single-venue instruction to VAN prompt
  - Lines 1429-1434: Fix SECTION_HEADERS list (remove "DOCK", "SCHEDULE"; add full names)
  - Lines 1466-1501: Rewrite block header format with city parsing, skip row 0
  - Line 1478: Fix section header matching from `includes()` to exact/startsWith
  - Line 1574: Switch model back to `google/gemini-2.5-pro`

## Expected Result

- Each venue column produces exactly 1 venue object (no duplicates)
- All fields populated: production_contact, house_rigger_contact, event_dates, city, labour, dock_and_logistics, power, staging, etc.
- Section headers correctly identified without corrupting data rows
- Parallel batching keeps total time under 2 minutes

## What Stays the Same

- VAN schema (all field definitions)
- VAN storage path (venue_advance_notes.van_data JSONB)
- Contact extraction from production_contact + house_rigger_contact
- Schedule event insertion with multi-date support
- Delta computation, risk flags
- Review dialog (ExtractionReviewDialog)
- Parallel batch processing with Promise.all
- Column filtering (8 non-empty cells minimum)

