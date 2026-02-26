
# Cascade UI Cleanup When a Tour AKB is Deleted

## Current State

**Database layer: Already correct.** All child tables (`schedule_events`, `contacts`, `direct_messages`, `documents`, `tela_threads`, `tela_messages`, `finance_lines`, `venue_advance_notes`, `calendar_conflicts`, `knowledge_gaps`, `tour_members`, etc.) use `ON DELETE CASCADE` referencing `tours(id)`. When a tour row is deleted, all associated data is automatically purged at the database level.

**Frontend layer: Incomplete.** The `confirmDelete` function in `BunkOverview.tsx` only calls `reload()` (which re-fetches the tour list). It does NOT notify the sidebar contacts, calendar, TELA threads, DM unread counts, or other components that are caching stale data.

## Problem

After deleting a tour (e.g., "BBots"), the sidebar still shows BBots contacts, the calendar may still show BBots events, TELA threads for that tour still appear, and unread DM badges may linger -- until the user does a full page refresh.

## Solution

Dispatch global refresh events after a successful tour deletion so all listening components re-fetch their data, and reset `selectedTourId` if the deleted tour was the active one.

### Changes

**File: `src/pages/bunk/BunkOverview.tsx`** -- `confirmDelete` function (~line 378)

After the successful `reload()` call, add:
1. Dispatch `akb-changed` event (already listened to by Calendar, Gaps, Overview counts)
2. Dispatch `contacts-changed` event (already listened to by sidebar contacts)
3. If the deleted tour was the currently selected tour, reset `selectedTourId` to the next available tour or empty string
4. Force a brief timeout then dispatch events to ensure the tour list has updated first

**File: `src/hooks/useTour.tsx`** -- `loadTours` function (~line 109)

After re-fetching tours, if the currently selected `selectedTourId` is no longer in the returned list, auto-switch to the first available tour (or clear it). This already partially exists (line 121) but only fires when `selectedTourId` is empty. Add an additional check: if `selectedTourId` is set but no longer in the fetched tour list, reset it.

**File: `src/hooks/useTelaThreads.ts`** -- Add a listener for `akb-changed` to re-fetch threads, so deleted-tour threads disappear from the sidebar.

**File: `src/hooks/useUnreadDMs.ts`** -- Add a listener for `akb-changed` to re-fetch unread counts, clearing badges for the deleted tour's DMs.

### Technical Detail

```text
confirmDelete (BunkOverview.tsx):
  1. Delete tour from DB (already done)
  2. Call reload() (already done)
  3. NEW: Dispatch window events:
     - "akb-changed"    -> refreshes Calendar, Gaps, Overview
     - "contacts-changed" -> refreshes sidebar contact lists
  4. NEW: If deletingTour.id === selectedTourId, call
     setSelectedTourId("") so useTour picks the next tour

loadTours (useTour.tsx):
  - After fetching tours, if selectedTourId not in results,
    reset to data[0]?.id or ""

useTelaThreads.ts:
  - Add useEffect listener for "akb-changed" that calls refetch

useUnreadDMs.ts:
  - Add useEffect listener for "akb-changed" that calls refetch
```

This ensures that when any tour AKB is deleted, every component across the app -- calendar, sidebar (tour team + venue partners), TELA chat threads, unread DM badges, knowledge gaps, and overview stats -- all refresh asynchronously and stop showing data from the deleted tour.
