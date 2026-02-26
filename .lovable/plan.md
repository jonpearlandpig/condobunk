

# Fix Advance Master Extraction: Complete Data Capture + Smart Cross-Linking

## Current State

The extraction produces venue names (e.g., "CFG BANK ARENA", "Charleston Coliseum") but **every VAN record has null** for:
- `production_contact` (name, phone, email all null)
- `house_rigger_contact` (all null)
- `city` (all null despite "City (from header)" being in the text block)
- `event_date` / `event_dates` (null)
- `labour`, `dock_and_logistics`, `power`, `staging`, `misc` (all sub-fields null)
- Only `event_details.bus_arrival_time`, `onsale_capacity`, and `production_rider_sent` are populated

Meanwhile, `schedule_events` has correct venue names, cities, and dates from a separate extraction pass -- but these aren't being cross-linked to the VANs.

## Root Causes

### 1. Section header matching is too strict now
The fix from `includes()` to `=== h || startsWith(h + " ")` is too aggressive. In the spreadsheet, section headers like "PRODUCTION CONTACT" may have trailing text or slight variations (e.g., "Production Contact:"). The current matching requires EXACT upper-case match, but the label from column A may have mixed case or extra characters. The `upperLabel.startsWith(h + ":")` variant was added but the colon check may not catch all variations.

More critically: many section headers in advance masters use short forms or variations that no longer match. For example, "DOCK" no longer matches at all, so the entire DOCK AND LOGISTICS section's data rows are never grouped under a section header -- the AI receives them as flat unlabeled key-value pairs and can't map them to the right schema fields.

### 2. Row 0 skip drops the venue identification row
Starting at `r = 1` skips row 0, which often contains the actual venue name (not just `#VALUE!`). The city is now parsed from the header, but if the actual venue name was in row 0, it's lost.

### 3. City from header not being used by AI
The `City (from header)` line is in the text but the AI model returns city as null because the column header often contains just a city abbreviation like "Ft Wayne" or "7. Baltimore, MD" -- the AI doesn't confidently map this to the `city` field when it also sees a venue name elsewhere.

### 4. No post-extraction cross-linking
When extraction creates VANs with null venue names or null dates, and schedule_events exist with the same tour_id and matching date/city, there's no reconciliation step to fill in the gaps.

## Solution

### Fix 1: Relax section header matching (keep startsWith but add contains for short headers)
Use a two-tier approach:
- **Long headers** (>= 10 chars like "PRODUCTION CONTACT", "DOCK AND LOGISTICS"): use `startsWith` matching (safe, no false positives)
- **Short headers** (< 10 chars like "POWER", "STAGING", "MISC"): use `includes` matching (these are unique enough to not false-positive on data rows)

Also restore "SCHEDULE" to the list (maps to `venue_schedule`).

### Fix 2: Don't skip row 0 -- instead skip only if it matches the column header
Instead of blindly skipping row 0, check if row 0's value matches the header value. If it does, skip it (it's a duplicate). If it doesn't, include it (it may contain the venue name or other data).

### Fix 3: Post-extraction cross-link step
After all VANs and schedule_events are inserted, run a reconciliation pass:
- For each VAN with a null city: look for a schedule_event on the same tour_id with a matching venue name (fuzzy) and backfill the city
- For each VAN with a null event_date: look for a schedule_event on the same tour_id with a matching venue name and backfill the date
- For each schedule_event with "Unknown Venue" or null venue: look for a VAN on the same tour_id with the same event_date and backfill the venue name
- For each VAN with null city but a known event_date: look for a schedule_event on the same tour_id + date and copy the city

### Fix 4: Strengthen the prompt for contact extraction
Add explicit instructions to the VAN prompt:
```
PRODUCTION CONTACT and HOUSE RIGGER CONTACT sections: The name, phone, and email 
may appear as separate rows under the section header (e.g., "Name: John Smith", 
"Phone: 555-1234", "Email: john@venue.com") OR as a single combined value on the 
section header row itself. Extract ALL contact details you find. If a phone number 
or email appears anywhere in the section, capture it.
```

### Fix 5: Force city from parsedCity in the extraction result
After AI extraction, if the AI returned `city: null` but we have `parsedCity` from the column header, inject it directly into the venue object before storing. Don't rely on the AI to do this -- do it deterministically in the post-processing code.

## Technical Changes

**File: `supabase/functions/extract-document/index.ts`**

1. **Section header matching** (~line 1492): Two-tier matching approach
2. **Row 0 handling** (~line 1484): Conditional skip instead of blanket skip
3. **VAN prompt** (~line 665): Add contact extraction guidance
4. **Post-extraction city injection** (~line 1662-1700): If AI returns null city, use parsedCity from column header
5. **Cross-linking reconciliation** (~after line 1844): New step after all VANs + events are inserted:
   - Match VANs to schedule_events by venue name (fuzzy) or by date on same tour
   - Backfill missing city, event_date on VANs
   - Backfill missing venue name on schedule_events

## Expected Result

- Production contacts, house rigger contacts extracted from advance master
- Cities populated on every VAN (from column header deterministically)
- Event dates populated on VANs (from AI extraction + cross-link fallback)
- Schedule events with "Unknown Venue" auto-populated from matching VAN data
- All advance note categories (labour, dock, power, staging, etc.) properly captured

