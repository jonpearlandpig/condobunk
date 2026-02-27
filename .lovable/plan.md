

## Proactive Bug Hunt: Fuzzy Connections and Silent Failures

After auditing all edge functions and data flows, here are the issues I found -- categorized by risk level.

---

### HIGH RISK -- Will Cause Bugs

**1. Multi-Tour Contact Collision (tourtext-inbound)**
Right now, when someone texts in, the function scans ALL contacts across ALL tours and picks the FIRST match. If your phone number appears as a contact on multiple tours, it will always resolve to whichever tour the database returns first -- which is non-deterministic.

**Fix:** Filter contacts to only ACTIVE tours, then prefer the most recently active tour (latest upcoming event). Add `.eq("scope", "TOUR")` to avoid matching venue staff contacts.

**2. Contacts Query Fetches ALL Contacts Globally (tourtext-inbound)**
The phone-matching query on line 118 does `.from("contacts").select(...).not("phone", "is", null)` with NO tour filter. This scans every contact in the entire database. With growth, this becomes slow and returns incorrect matches.

**Fix:** Restructure the query to filter by active tours, or add an index and limit scope.

**3. Profile Fallback Picks Arbitrary Tour (tourtext-inbound)**
When matching via the `profiles` table (line 149), the code does `.from("tour_members").select("tour_id").limit(1).single()` -- picking any random tour the user belongs to, with no preference for active or recent tours.

**Fix:** Order by tour activity (most recent event date) or filter to only ACTIVE tours.

---

### MEDIUM RISK -- Edge Cases That Will Confuse Users

**4. Guest List Regex Too Greedy (tourtext-inbound)**
The regex `/tickets?\s*for/i` will match innocent questions like "What time do tickets for the show go on sale?" and route them into the guest list extraction flow instead of the normal Q&A flow.

**Fix:** Tighten the regex or add a secondary AI classification step before committing to the guest list path.

**5. SMS Inbound Insert Can Fail Silently (tourtext-inbound)**
When `matchedTourId` is null, the function inserts into `sms_inbound` with `tour_id: null`. But the `sms_inbound` table has `tour_id` typed as `uuid` -- if it's NOT nullable, this insert silently fails and the message is lost.

**Fix:** Verify the column allows null, or handle the error path.

**6. Calendar Feed Has No Auth (calendar-feed)**
The `calendar-feed` function accepts a `tour_id` as a query parameter and returns the full schedule with no authentication. Anyone with the tour ID can see the entire schedule.

**Fix:** Add a signed token or secret parameter to the calendar feed URL so it can't be guessed.

**7. `getClaims` Compatibility Risk (multiple functions)**
Five edge functions use `supabase.auth.getClaims(token)`, which is a newer Supabase client method. If the client library version doesn't support it, these functions will crash silently. The `tourtext-insights`, `mt-sync`, `elevenlabs-conversation-token`, `google-drive-proxy`, and `inbound-sync` functions all use it.

**Fix:** Ensure all functions using `getClaims` are on a compatible Supabase client version, or fall back to `getUser()`.

---

### LOW RISK -- Resilience Improvements

**8. No Error Handling on AI Gateway Failures (tourtext-inbound, guest list path)**
If the AI extraction call for guest list fails (network error, timeout), the code falls through silently to the normal TELA flow. This is okay behavior, but the user gets no indication their guest list request was even detected.

**9. Schedule Data Missing `doors`, `soundcheck`, `curfew` in TourText Context**
The `tourtext-inbound` function queries schedule_events with `.select("event_date, venue, city, load_in, show_time, notes")` -- missing `doors`, `soundcheck`, and `curfew` columns that exist in the schema. If someone texts "What time are doors?" or "Soundcheck time?", TELA won't have the data.

**Fix:** Add `doors, soundcheck, curfew` to the select query.

**10. Conversation History Off-by-One (tourtext-inbound)**
The history builder does `recentHistory.slice(0, -1)` to skip "the current message." But the current inbound message was already inserted into `sms_inbound` before the history query runs (line 167). So the "current message" IS in the query results, and the slice correctly removes it. However, if timing is tight (insert hasn't propagated), the slice would remove the PREVIOUS message instead.

**Fix:** Filter the history query to exclude messages created in the last 2 seconds, or exclude by matching the exact message text.

---

### Implementation Plan

I'll fix items 1, 2, 3, 4, and 9 in `tourtext-inbound` as one batch -- these are all in the same file and address the most impactful issues:

1. Restructure the contact matching to join with `tours` and filter by `status = 'ACTIVE'`, preferring the tour with the nearest upcoming event
2. Add `doors, soundcheck, curfew` to the AKB data query
3. Tighten the guest list regex to reduce false positives
4. Add proper error logging on the sms_inbound insert

Items 6 and 7 (calendar auth, getClaims) can be addressed in a follow-up pass.

---

### Technical Details

**Contact matching rewrite (items 1-3):**
```text
Current flow:
  contacts (all tours, no filter) -> first phone match -> done

New flow:
  contacts (join tours where status=ACTIVE, scope=TOUR)
    -> filter by phone match
    -> if multiple matches, pick tour with nearest future event
    -> fallback to profiles table with same logic
```

**Schedule select fix (item 9):**
```text
Current: "event_date, venue, city, load_in, show_time, notes"
New:     "event_date, venue, city, load_in, show_time, doors, soundcheck, curfew, notes"
```

**Guest list regex tightening (item 4):**
```text
Current: /guest\s*list|comp\s*ticket|put\s.+\s*on\s*the\s*list|tickets?\s*for|\+\s*\d|plus\s*\d|will\s*call/i
New:     /guest\s*list|comp\s*ticket|put\s.+\s*on\s*the\s*list|will\s*call|can\s+i\s+get\s+\d|i\s+need\s+\d\s+ticket/i
```
Remove `tickets?\s*for` (too broad) and `\+\s*\d|plus\s*\d` (matches math/general text). Add more specific intent patterns.

