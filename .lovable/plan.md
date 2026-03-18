

# Add Advance Ledger to Mobile Navigation

## Problem
Advance Ledger is only accessible via the desktop sidebar (`BunkSidebar.tsx`). The mobile bottom nav (`MobileBottomNav.tsx`) has 5 fixed items and no entry for Advance Ledger. At 393px viewport, users cannot reach `/bunk/advance`.

## Solution
Add "Advance" as a nav item in the mobile bottom nav. Since the bottom bar already has 5 items (the typical max for thumb-reach), the cleanest approach is to nest Advance Ledger under the **Admin** tab as a sub-route, or replace one of the existing items. However, given Advance Ledger is a primary workflow module, I recommend adding it as a 6th item using a compact icon layout (shrinking icon+label sizing slightly to fit 6).

Alternatively, the Admin screen likely already links to sub-features — I can add an "Advance Ledger" card/link on the Admin page so mobile users can navigate there from Admin.

**Recommended approach:** Add a prominent "Advance Ledger" navigation card on the `/bunk/admin` page (where the user currently is) that links to `/bunk/advance`, keeping the bottom nav at 5 items. This follows the existing pattern where Admin acts as a hub for management features.

## Changes

### `src/pages/bunk/BunkAdmin.tsx`
- Add an "Advance Ledger" card/link near the top that navigates to `/bunk/advance`
- Use the `BookOpen` icon (already imported in sidebar) with the operational styling

### `src/components/bunk/MobileBottomNav.tsx`  
- No changes to the 5-item bottom nav (keeps thumb-reach optimization intact)

This keeps mobile UX clean while making Advance Ledger discoverable from the Admin hub, which is already the settings/management entry point on mobile.

