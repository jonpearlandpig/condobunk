

## Fix: Schedule Events Not Created from Advance Master

### Root Cause

The Keepers Advance Master PDF has **multiple dates per venue** (load-in Wednesday, show Thursday, show Friday). But the extraction prompt (`ADVANCE_MASTER_VAN_PROMPT`) only asks for a single `event_date` field per venue. The AI couldn't pick just one, so it returned `null` for all 35 venues. Since schedule event creation is gated by `if (eventDate)` (line 1293), zero events were created.

The 70 contacts and 71 VANs were extracted successfully -- only the schedule is missing.

### Fix (Two Parts)

#### Part 1: Update `ADVANCE_MASTER_VAN_PROMPT` to capture multiple dates

Change the prompt schema from:
```
"event_date": "YYYY-MM-DD" or null
```
to:
```
"event_dates": [
  {"date": "YYYY-MM-DD", "type": "LOAD_IN" | "SHOW" | "TRAVEL" | "OFF" | "REHEARSAL", "show_time": "HH:MM" or null}
]
```

Add a rule: "Each venue may have multiple dates (load-in, show days, travel days). Extract ALL dates into the event_dates array. If only one date is mentioned, still use the array format."

**File:** `supabase/functions/extract-document/index.ts` (ADVANCE_MASTER_VAN_PROMPT, around line 547-665)

#### Part 2: Update the schedule event insertion logic for advance masters

Currently (lines 1292-1336), the code does:
```typescript
if (eventDate) { /* insert one event */ }
```

Change to handle the new `event_dates` array:
1. Read `v.event_dates` as an array
2. Fall back to the single `v.event_date` for backward compatibility
3. Loop through all dates and insert one `schedule_events` row per date
4. Set appropriate notes per event type (e.g., "Load-In Day" vs "Show Day")
5. Dedup by tour_id + event_date before inserting

**File:** `supabase/functions/extract-document/index.ts` (around lines 1292-1336)

### Technical Details

**Single file changed:** `supabase/functions/extract-document/index.ts`

**Prompt changes (ADVANCE_MASTER_VAN_PROMPT):**
- Replace `"event_date": "YYYY-MM-DD" or null` with `"event_dates": [{"date": "YYYY-MM-DD", "type": "LOAD_IN|SHOW|TRAVEL|OFF|REHEARSAL", "show_time": "HH:MM or null"}]`
- Keep `"event_date"` in the schema as a convenience alias (first show date) for VAN storage
- Add extraction rule: "CRITICAL: Most venues have multiple dates (load-in day + show days). Extract ALL dates into the event_dates array. Do NOT collapse multiple dates into one."

**Insertion logic changes:**
- After VAN insertion, read `v.event_dates` array (or fall back to `[{date: v.event_date, type: "SHOW"}]`)
- For each date entry, insert a `schedule_events` row with:
  - `event_date` = the date
  - `venue` = venue name
  - `city` = city
  - `show_time` = parsed from the entry's `show_time` field (for SHOW type) or null
  - `notes` = include the event type (e.g., "Load-In Day" or "Show Day 1")
  - `source_doc_id` = document_id
- Dedup: delete existing events for same tour_id + event_date before inserting
- Increment `totalEvents` for each successfully inserted row

**Expected result for Keepers tour:** ~105 schedule events (35 venues x 3 dates each: 1 load-in + 2 shows)

**No database migration needed.** The `schedule_events` table already supports all required fields.

After deploying, the user would need to re-extract the Keepers document (archive and re-upload, or we could add a "re-extract" button) to populate the schedule.

