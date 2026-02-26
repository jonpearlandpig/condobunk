

# Rework Advance Master Per-Column Extraction

## Problem

The advance master spreadsheet (e.g. `KOH_Advance_Master-2.xlsx`) has venues across columns (B through Q+) and category labels down column A. The current extraction flattens the entire sheet into CSV text via `sheet_to_csv()`, which:

1. Creates a massive text blob where the AI loses track of which data belongs to which venue
2. Exceeds practical context limits for 16+ venue columns with dense labor notes, power specs, etc.
3. Causes data loss and cross-venue contamination

The VAN prompt schema already maps correctly to all the fields you listed (event_details, production_contact, house_rigger_contact, summary, venue_schedule, plant_equipment, labour, dock_and_logistics, power, staging, misc, lighting, video, notes). The issue is purely in how the spreadsheet data is fed to the AI.

## Solution

### 1. Per-Column Excel Parsing for Advance Masters

In `supabase/functions/extract-document/index.ts`, when an advance master Excel file is detected, replace the generic `sheet_to_csv()` with deterministic per-column parsing:

- Read the worksheet as a 2D array using `XLSX.utils.sheet_to_json(ws, { header: 1 })`
- Identify column A as category labels (EVENT DETAILS, PRODUCTION CONTACT, etc.)
- For each venue column (B, C, D...), build a structured key-value text block:
  ```
  VENUE COLUMN DATA:
  EVENT DETAILS
  Day and Date: Thursday, March 05, 2026
  Venue: Allen War Memorial Coliseum
  Onsale Capacity: 10,918 capacity. Sold out.
  ...
  PRODUCTION CONTACT
  Name: Eric
  Phone: Direct: 260-480-2129
  ...
  ```
- Each venue column produces a clean, isolated text block with zero cross-venue contamination

### 2. Batch Processing (3-4 Venues per AI Call)

- Process venue columns in parallel batches of 3-4 to stay within context limits
- Each batch uses the existing `ADVANCE_MASTER_VAN_PROMPT` (which already has the correct schema)
- Merge all batch results into a single `{ venues: [...] }` response
- Use `google/gemini-2.5-pro` for advance masters (accuracy over speed)

### 3. Null Enforcement in VAN Prompt

Add explicit instruction to the `ADVANCE_MASTER_VAN_PROMPT`:
- "For EVERY field in the schema, if the data is not present in the source text, set the value to null. Do NOT omit any field from the output."

### 4. Section Header Detection

When building per-column text, detect section headers in column A (EVENT DETAILS, PRODUCTION CONTACT, HOUSE RIGGER CONTACT, SUMMARY, VENUE SCHEDULE, PLANT EQUIPMENT, LABOUR, STAGING, MISC, LIGHTING, VIDEO, NOTES, POWER) and group the key-value pairs under them. This gives the AI clear structural context.

## Files Modified

- `supabase/functions/extract-document/index.ts`
  - Lines ~1410-1420: Add per-column parsing branch for advance master Excel files
  - Lines ~1448-1462: Add batched AI calls for per-column data
  - Lines ~665-787: Add null-enforcement rule to VAN prompt, switch model to gemini-2.5-pro for advance masters

## What Stays the Same

- The VAN prompt schema (already maps to all your fields correctly)
- VAN storage path (venue_advance_notes.van_data JSONB)
- Contact extraction (production_contact + house_rigger_contact)
- Schedule event insertion with multi-date support
- Delta computation for version updates
- Risk flag detection
- The review dialog (ExtractionReviewDialog) -- no changes needed

