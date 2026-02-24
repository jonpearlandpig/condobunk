
## Fix: Auto-Generate Calendar Events from VAN Date Data

### Problem
The advance master was extracted successfully — all 30+ venues have their dates clearly embedded in the `day_and_date` text field (e.g., "Load-In (Wed): 2026-03-18 | Show Day 1 (Thu): 2026-03-19 @ 7:30 PM | Show Day 2 (Fri): 2026-03-20 @ 7:30 PM"). But the AI failed to populate the `event_dates` array, so zero `schedule_events` rows were created and the calendar is empty.

### Two-Part Fix

**Part 1: Post-Extraction Date Backfill (extract-document edge function)**

Add a deterministic date-parsing step that runs AFTER the AI extraction for advance master documents. Instead of relying solely on the AI to populate `event_dates`, the engine will:

1. After inserting VANs, scan each VAN's `event_details.day_and_date` text field
2. Parse all `YYYY-MM-DD` dates using a regex
3. Classify each date as LOAD_IN, SHOW, TRAVEL, or OFF based on surrounding text ("Load-In", "Show Day", etc.)
4. Extract show times from patterns like `@ 7:30 PM`
5. Create `schedule_events` rows for every parsed date

This is a safety net — if the AI populates `event_dates` correctly, those take priority. If not, the deterministic parser catches what the AI missed.

**Part 2: Backfill Existing Keepers PAC Data Now**

Create a one-time backfill function (or inline logic in the edge function) that can be triggered to re-parse existing VAN `day_and_date` fields and generate the missing `schedule_events`. This way the user doesn't have to re-upload the document.

### Technical Detail

**File: `supabase/functions/extract-document/index.ts`**

Add a new helper function `parseDatesFromVanText(dayAndDate: string)` that:

```text
Input:  "Load-In (Wed): 2026-03-18 | Show Day 1 (Thu): 2026-03-19 @ 7:30 PM Show Day 2 (Fri): 2026-03-20 @ 7:30 PM"

Output: [
  { date: "2026-03-18", type: "LOAD_IN", show_time: null },
  { date: "2026-03-19", type: "SHOW", show_time: "19:30" },
  { date: "2026-03-20", type: "SHOW", show_time: "19:30" }
]
```

Insert this parsing step at ~line 1318 in the advance master VAN loop, right before the `datesToInsert` logic. If `eventDates` (from the AI) is empty but `day_and_date` text contains parseable dates, use the deterministic parser as fallback.

**Changes summary:**

| File | Change |
|------|--------|
| `supabase/functions/extract-document/index.ts` | Add `parseDatesFromVanText()` helper; integrate as fallback after AI extraction in the advance master VAN loop |

### What This Means for You

- Re-extracting the Keepers advance master document will now populate the calendar with all load-in days, show days, and travel days
- Every venue's dates are already in the system — they just need to be parsed from text into calendar events
- Future advance master uploads will always generate calendar events, even if the AI misses the `event_dates` array
