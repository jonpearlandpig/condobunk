

# Fix: Advance Notes Disappearing + "Cannot coerce" Error

## Root Causes

### 1. "Cannot coerce the result to a single JSON object" Error
In `useTelaActions.ts`, the `create_contact` action (lines 169-171) queries `tour_members` with `.single()`:
```typescript
const { data: membership } = await supabase
  .from("tour_members")
  .select("tour_id")
  .limit(1)
  .single();
```
The current user belongs to **2 tours**. PostgREST's `.single()` checks the total result set size before applying `.limit()`, so it sees 2 rows and throws "Cannot coerce the result to a single JSON object".

**Fix**: Replace `.single()` with `.maybeSingle()` across all action cases in `useTelaActions.ts`, or better, use `.limit(1)` without `.single()` and access `data?.[0]` instead. Apply the same fix to every `.single()` call in the file to prevent future issues.

### 2. Advance Notes Not Showing on Event Cards
The events visible in the screenshot ("TBD Venue, Nashville, TN") have `venue: null` in the database. The VAN lookup in both `BunkCalendar.tsx` and `BunkOverview.tsx` matches by normalized venue name. When `venue` is null, `normalize(null)` produces an empty string `""`, which never matches any VAN record keyed by actual venue names.

The VANs exist in the database (e.g., "Harbor City Church Nashville" for Nashville, TN), but they cannot be matched to events that lack a venue name.

**Fix**: Add a fallback matching path. When the event has no venue name, attempt to match VANs by **city + tour_id** combination. This ensures events without a venue name still pick up advance notes for the same city within the same tour.

## Changes

### File 1: `src/hooks/useTelaActions.ts`
Replace all `.single()` calls with `.maybeSingle()` to handle cases where the user belongs to multiple tours or where a record lookup returns 0 or 2+ rows:
- Line 113: `calendar_conflicts` select -> `.maybeSingle()`
- Line 125: `knowledge_gaps` select -> `.maybeSingle()`
- Line 138: `schedule_events` select -> `.maybeSingle()`
- Line 158: `contacts` select -> `.maybeSingle()`
- Line 171: `tour_members` select -> `.maybeSingle()`
- Line 183: `contacts` insert+select -> `.maybeSingle()`
- Line 199: `venue_advance_notes` select -> `.maybeSingle()`

### File 2: `src/pages/bunk/BunkCalendar.tsx`
Add city-based fallback VAN matching:
- In the VAN lookup builder (~line 194-204), also key by `tourId::city` so events without venue names can still find VANs
- In the event VAN check (~line 278-281), add a third fallback key: `normalize(s.city)` scoped to the tour

### File 3: `src/pages/bunk/BunkOverview.tsx`
Add the same city-based fallback VAN matching:
- In the VAN lookup builder (~line 150-158), add a city-based key: `tourId::city::normalizedCity`
- In the event card VAN lookup (~line 596-597), add the same fallback

