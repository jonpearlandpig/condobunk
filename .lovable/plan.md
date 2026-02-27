

## Comprehensive Bug Prevention: TourText Smart Context + Cross-System Parity Fixes

### Problem Summary

There are two categories of remaining issues:

1. **TourText (SMS) is blind to venue-specific data** -- The previously approved "Smart Context Selection" plan has not been implemented yet. The function dumps all 26 schedule events (~14K chars) + all 13 VANs (~48K chars) = ~63K chars into a 12K character limit. VAN data (haze, labor, rigging, power, docks) gets completely truncated.

2. **akb-chat (web app) has its own data gaps** -- Missing `doors`, `soundcheck`, `curfew` from schedule queries, missing `tour_routing` and `tour_policies` data entirely.

3. **Venue name mismatches between tables** -- Schedule says "Allen County War Memorial Coliseum" but VAN says "Allen War Memorial Coliseum". Same for "Xfinity Mobile Arena" vs "Wells Fargo Center / Xfinity Mobile Arena". City mismatches too ("Fort Wayne, IN" vs "Ft Wayne"). Without fuzzy matching, date-based lookups for the wrong venue name will miss the VAN.

---

### Fix 1: Smart Context Selection for TourText (tourtext-inbound)

Replace the bulk-dump approach with relevance-filtered queries:

**Step A -- Date/city extraction from the user's message:**
- Regex patterns for dates: `3/5`, `March 5`, `tomorrow`, `tonight`, `next show`
- City/venue name matching against a quick pre-query of known cities from `schedule_events`
- Default: next 3 upcoming events if no specific date/venue mentioned

**Step B -- Filtered data fetches:**
- Schedule: only events within +/- 2 days of detected date (or next 3 upcoming)
- VANs: match by `event_date` from the filtered schedule events (not by venue name, to avoid mismatch issues)
- Contacts: keep full list (only 7 contacts, small)
- Add `tour_routing` query filtered by same date range (hotel info)
- Add `tour_policies` query (guest/safety SOPs -- small data, include all)

**Step C -- Increase context cap to 16K** since filtered data will be much smaller

**Step D -- Update system prompt** to tell TELA that VAN data contains venue-specific technical details (haze, rigging, labor, power, docks, etc.)

### Fix 2: akb-chat Schedule Query Parity

The web-based TELA (`akb-chat`) queries schedule_events with:
```
.select("id, event_date, venue, city, load_in, show_time, notes")
```

Missing: `doors`, `soundcheck`, `curfew` (same bug we fixed in tourtext-inbound). Also missing: `tour_routing` and `tour_policies` data entirely. Fix all three.

### Fix 3: Venue Name Fuzzy Matching

When matching VANs to schedule events by date, use `event_date` as the primary join key rather than venue name. This avoids the "Allen County War Memorial Coliseum" vs "Allen War Memorial Coliseum" mismatch problem entirely.

### Fix 4: Double-SMS Prevention

Currently `tourtext-inbound` both returns a TwiML `<Message>` AND calls `sendTwilioSms()`. This can cause duplicate SMS delivery. Fix: always return empty TwiML and rely solely on the REST API send.

### Fix 5: sms_inbound/sms_outbound Insert Failures with null tour_id

When `matchedTourId` is null, inserts into `sms_inbound` and `sms_outbound` with `tour_id: null`. Verify the column is nullable. If not, skip the insert or use a sentinel value.

---

### Implementation Details

**File: `supabase/functions/tourtext-inbound/index.ts`**

1. Add a `extractRelevanceFromMessage()` function:
   - Parse date patterns (`M/D`, `month D`, `tomorrow`, `tonight`, `next show`, day names)
   - Parse city mentions by comparing against a pre-fetched list of cities from schedule_events
   - Return `{ targetDate: string | null, targetCity: string | null }`

2. Before AKB fetch, run relevance extraction:
   - Quick query: `SELECT DISTINCT city, venue, event_date FROM schedule_events WHERE tour_id = X ORDER BY event_date`
   - Match message against cities/venues
   - Determine date window

3. Replace bulk AKB fetch with filtered queries:
   - Schedule: `.gte("event_date", startDate).lte("event_date", endDate)` (or next 3 upcoming)
   - VANs: `.in("event_date", matchedDates)` (join by date, not venue name)
   - Add: `tour_routing` filtered by same dates
   - Add: `tour_policies` (all, they're small)

4. Fix double-SMS: always return empty TwiML, remove message from TwiML responses

5. Increase `.substring(0, 12000)` to `.substring(0, 16000)`

**File: `supabase/functions/akb-chat/index.ts`**

1. Update schedule select to include `doors, soundcheck, curfew`
2. Add `tour_routing` and `tour_policies` queries to the parallel fetch
3. Include routing/policies data in the AKB context section

---

### Expected Outcomes

- "Haze for Boston?" will return the actual haze policy from the Boston VAN
- "Distance to steel Cleveland?" will return the measurement from the Cleveland VAN
- "Hotel in Detroit?" will return routing data
- "What time are doors?" will return the actual doors time
- No more duplicate SMS messages
- Web TELA and SMS TELA will have the same data available

