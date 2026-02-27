

## Fix: TELA SMS Not Recognizing Boston

### Diagnosis
Boston, MA (March 13, TD Garden) IS on the schedule for the correct tour. The multi-city code change looks logically correct. The likely issue is one of:

1. **Stale deployment** -- the previous deploy may not have taken effect, so the old single-city code is still running
2. **Context not reaching AI** -- the date window or event filtering may have a subtle bug that excludes Boston's data from the AI prompt

### Plan

**File: `supabase/functions/tourtext-inbound/index.ts`**

1. **Add debug logging** after city extraction (~line 520) to confirm `targetCities` array contents:
   ```
   console.log("Smart Context:", JSON.stringify({ targetCities, targetVenue, targetDates }));
   ```

2. **Add debug logging** after date window calculation (~line 560) to confirm the window spans both cities:
   ```
   console.log("Date window:", { startDate, endDate });
   ```

3. **Add debug logging** after event fetch (~line 630) to confirm Boston events are included in the AI context:
   ```
   console.log("Events in context:", (eventsRes.data || []).length, (eventsRes.data || []).map(e => e.city));
   ```

4. **Force redeploy** the `tourtext-inbound` function to ensure the latest code is active.

### Expected Outcome
With the logging in place, we can verify whether:
- Both cities are detected (targetCities includes Boston, MA and Cleveland, OH)
- The date window spans March 5-14 (covering both events)
- Both events appear in the AI context

If all three are confirmed, the issue is the AI hallucinating and we may need to strengthen the system prompt to explicitly list schedule cities. If any step fails, we fix the specific issue.

### Minimal changes -- single file edit + redeploy.
