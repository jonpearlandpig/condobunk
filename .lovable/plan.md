

## Fix: TELA Not Finding Labor Notes (City Matching + Date Window Bug)

### Root Cause

Two linked bugs prevent TELA from returning VAN data when a user asks about a specific venue by partial city name:

1. **City matching is too strict**: The user texted "Search labor notes for Belmont" but the known city is "Belmont Park, NY". The matching logic checks if the full `cityName` ("belmont park") is contained in the message — but the message only contains "belmont", not "belmont park". So `targetCities` comes back empty.

2. **Date window excludes the venue**: With no city match, the system falls back to "next 5 upcoming events" (March 5-13), which excludes UBS Arena on March 15. The VAN data — which contains extensive labor notes — is never fetched.

The VAN database already has all the labor data (full union rules, straight-time, split calls, show calls, meal breaks, cancellation policies, camera ops notes). TELA just can't see it.

### Solution

**File: `supabase/functions/tourtext-inbound/index.ts`**

#### 1. Fix city matching to support partial/substring matches (lines 210-219)

Current logic: `msgLower.includes(cityName)` where `cityName` = "belmont park"
- This requires the FULL city name to appear in the message

New logic: Also check if ANY word from the cityName (3+ chars) appears in the message, and if that word is unique enough to avoid false positives. Specifically:
- Keep exact substring match as primary
- Add fallback: split `cityName` into words, if the FIRST word (3+ chars) matches and it's not a common word, count it as a match
- Example: "belmont" matches "Belmont Park, NY" via the first-word rule

#### 2. Use `effectiveCities` (not just `targetCities`) for date window calculation (lines 605-633)

Currently the date window logic uses `targetCities` but the city-carryover populates `effectiveCities`. The date window branch should use `effectiveCities` so carried-over cities also expand the window correctly.

#### 3. Increase the default "no city" event window from 5 to 8 (line 639)

When no city/venue/date is mentioned, the system currently shows the next 5 upcoming events. Increasing to 8 ensures broader coverage for generic queries like "Labor notes" that don't specify a venue.

### Technical Details

| Change | Lines | Description |
|--------|-------|-------------|
| City matching | 210-219 | Add first-word partial match for multi-word city names |
| Date window | 605 | Use `effectiveCities` instead of `targetCities` |
| Default window | 639 | Change `Math.min(4, ...)` to `Math.min(7, ...)` for 8 events |

### Expected Result
- "Search labor notes for Belmont" -- matches "Belmont Park, NY", date window includes March 15, VAN labor data returned
- "Labor notes" (no city) -- wider default window now includes March 15, all VANs in range shown
- Existing exact matches (e.g., "Boston", "Cleveland") continue to work unchanged

### Single file change + redeploy. No database changes.
