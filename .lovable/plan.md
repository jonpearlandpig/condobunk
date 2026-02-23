

# Fix: VAN Record Not Found + Advance Notes Disappearing

## Problem 1: "VAN record not found"

The TELA AI generates `update_van` actions referencing a VAN ID, but for venues like "Allen County War Memorial Coliseum" (Fort Wayne, IN), no VAN record exists in the database. The `update_van` handler in `useTelaActions.ts` does a strict lookup by ID and throws "VAN record not found" when there is no match.

**Fix:** Convert `update_van` to an upsert. If the VAN record doesn't exist by ID, fall back to matching by `venue_name + city + tour_id`. If still not found, create a new VAN record with the provided fields instead of throwing an error.

## Problem 2: Advance Notes Disappearing (Stale Closure)

The `loadCalendar` function is defined in the component body and captures `selectedEntry` from the current render. However, event handlers in `useEffect` (realtime subscriptions, `akb-changed` listener) capture a stale version of `loadCalendar` from when the effect was set up. When those handlers call `loadCalendar(true)`, the stale closure has `selectedEntry = null`, so the sync logic on lines 345-348 never runs. Additionally, any scenario that triggers the non-silent `loadCalendar()` call (effect re-run) sets `loading=true`, unmounting the entire UI including the dialog.

**Fix:** Replace the direct `selectedEntry` reference with a functional state updater (`setSelectedEntry(prev => ...)`) so it always reads the CURRENT state, regardless of closure staleness. Also wrap `loadCalendar` in `useCallback` with proper dependencies.

## Technical Changes

### File: `src/hooks/useTelaActions.ts`

In the `update_van` case (lines 191-224):
- Keep the existing lookup by `action.id`
- If `existingVan` is null, attempt a fallback lookup by `venue_name + city + tour_id` using fields from `action.fields` (e.g., `action.fields.venue_name`, `action.fields.city`) and the `action.tour_id`
- If still not found, INSERT a new `venue_advance_notes` row with `tour_id`, `venue_name`, `city`, and `van_data` from `action.fields`, then log the change as a CREATE action
- This converts a hard failure into a graceful upsert

### File: `src/pages/bunk/BunkCalendar.tsx`

1. Replace the direct `selectedEntry` reference in `loadCalendar` with a functional updater:
   ```
   // Before (stale closure):
   if (selectedEntry) {
     const updated = merged.find(e => e.id === selectedEntry.id);
     if (updated) setSelectedEntry(updated);
   }

   // After (always reads current state):
   setSelectedEntry(prev => {
     if (!prev) return prev;
     const updated = merged.find(e => e.id === prev.id);
     return updated || prev;
   });
   ```

2. Remove `selectedEntry` dependency from `loadCalendar` entirely -- the functional updater eliminates the need for it.

## Files Modified

1. `src/hooks/useTelaActions.ts` -- Upsert logic for `update_van` (create VAN if not found)
2. `src/pages/bunk/BunkCalendar.tsx` -- Functional state updater to fix stale closure bug

