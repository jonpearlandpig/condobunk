

## Fix Multi-City SMS Queries in TourText

### Problem
When a user texts about two cities (e.g., "Low steel in Boston and haze in Cleveland"), TELA only finds one city and builds its data window around that single city's event date. The second city's data gets excluded, causing TELA to say it doesn't exist on the schedule.

### Root Cause
`extractRelevanceFromMessage()` returns a single `targetCity: string | null`. It uses a `break` on first match (line 205), so only the first city found in the iteration order is captured.

### Solution
Change `targetCity` from a single value to an **array** (`targetCities: string[]`), and update the date window logic to cover all matched cities' event dates.

### Changes

**File: `supabase/functions/tourtext-inbound/index.ts`**

1. **Update `extractRelevanceFromMessage` return type** (~line 124):
   - Change `targetCity: string | null` to `targetCities: string[]`
   - Remove the `break` on line 205 so all matching cities are collected
   - Deduplicate matches

2. **Update the date window builder** (~lines 534-558):
   - When multiple cities are matched, find events for ALL matched cities
   - Build the date window spanning from the earliest to latest matched event date (+1 day buffer)
   - This ensures Boston (March 13) and Cleveland (March 6) both fall within the window

3. **Update the destructuring** on line 516:
   - Change `const { targetDates, targetCity, targetVenue }` to `const { targetDates, targetCities, targetVenue }`

4. **Update the city/venue branch condition** on line 534:
   - Change `targetCity` check to `targetCities.length > 0`
   - Update city filtering logic to check against all target cities

### Technical Details

| Area | Before | After |
|------|--------|-------|
| Return type | `targetCity: string \| null` | `targetCities: string[]` |
| City matching | `break` after first match | Collect all matches |
| Date window | Built from single city's dates | Union of all matched cities' dates |
| Condition check | `targetCity \|\| targetVenue` | `targetCities.length > 0 \|\| targetVenue` |

### Expected Result
"Low steel in Boston and haze in Cleveland" will now match both cities. The date window will span March 5-14, including both events. TELA's context will contain schedule and VAN data for both venues, enabling a complete answer.

### No database changes needed.

