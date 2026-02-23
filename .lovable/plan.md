

# Implement Both Approved Plans

## Plan 1: Convert Messaging Drawer to Side Sheet

**File: `src/components/bunk/MobileBottomNav.tsx`**

- Replace `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerTitle` imports with `Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle` from `@/components/ui/sheet`
- Use `side={isLeft ? "left" : "right"}` based on hand preference
- Set width classes: `w-[80vw] max-w-[320px]` for proper mobile sidebar
- Stack Ask TELA, Tour Team, and Venue Partners sections vertically (full-width collapsible sections)
- Add pinned user profile footer at bottom of sheet (avatar + display name, border-top separator)
- All sections start collapsed by default (matching existing sidebar behavior)

**File: `src/components/bunk/SidebarContactList.tsx`**

- When `onContactTap` prop is provided, make the contact row tap directly call `onContactTap(contact)` instead of expanding inline action buttons
- This ensures tapping a contact in the messaging panel immediately opens full-screen chat (online) or triggers SMS fallback (offline)
- Desktop sidebar behavior (expand/action buttons) remains unchanged when `onContactTap` is not provided

## Plan 2: Fix Advance Notes Disappearing

**File: `src/pages/bunk/BunkCalendar.tsx`**

- Add `silent` parameter to `loadCalendar`: `const loadCalendar = async (silent = false) => { if (!silent) setLoading(true); ... }`
- Update all secondary triggers to use silent mode:
  - Realtime subscription callbacks: `loadCalendar(true)`
  - `akb-changed` event handler: `loadCalendar(true)`
  - `EventNoteEditor.onUpdated` callback: `loadCalendar(true)`
  - `AddEventDialog.onCreated` callback: `loadCalendar(true)`
- Keep `loadCalendar(false)` for initial mount and pull-to-refresh (user expects visible feedback)
- After silent reload, update `selectedEntry` if dialog is open so detail view reflects fresh data

## Files Modified

1. `src/components/bunk/MobileBottomNav.tsx` -- Drawer to Sheet conversion + vertical layout + profile footer
2. `src/components/bunk/SidebarContactList.tsx` -- Direct tap behavior when `onContactTap` is provided
3. `src/pages/bunk/BunkCalendar.tsx` -- Silent reload parameter to prevent spinner flicker

