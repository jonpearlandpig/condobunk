

## Demo Mode Implementation

### Overview
Allow any Google sign-in user to try a read-only demo of your live tour data via a "TRY DEMO" button on the empty workspace screen.

### Database Migration

Create migration to:
1. Add `'DEMO'` value to `tour_role` enum
2. Create `activate_demo_mode()` SECURITY DEFINER RPC that adds the caller as `DEMO` member to all of jonathan@pearlandpig.com's active tours
3. Create `deactivate_demo_mode()` SECURITY DEFINER RPC that removes all `DEMO` memberships for the caller

No RLS changes needed -- existing SELECT policies use `is_tour_member()` (any role), while INSERT/UPDATE/DELETE policies use `is_tour_admin_or_mgmt()` (TA/MGMT only), so DEMO users can read but not write.

### Code Changes

#### 1. `src/hooks/useTour.tsx`
- Add `isDemoMode` and `exitDemo()` to context
- After loading tours, query `tour_members` for the user's roles
- If ALL memberships are `DEMO`, set `isDemoMode = true`
- `exitDemo()` calls `deactivate_demo_mode()` RPC, clears tours, reloads

#### 2. `src/pages/bunk/BunkOverview.tsx`
- When `tours.length === 0`, show a card with two options:
  - "NEW TOUR" button (existing `/bunk/setup` flow)
  - "TRY DEMO" button that calls `activate_demo_mode()` RPC then reloads tours
- When `isDemoMode` is true, hide the "NEW TOUR" button in the header and edit/delete controls on tour cards

#### 3. `src/pages/bunk/BunkLayout.tsx`
- When `isDemoMode`, show a fixed banner below the header:
  ```
  DEMO MODE -- Viewing live tour data (read-only)  [EXIT DEMO]
  ```
- "EXIT DEMO" calls `exitDemo()` from the tour context

#### 4. `src/pages/bunk/BunkChat.tsx`
- When `isDemoMode`, disable the input textarea and show placeholder "TELA is read-only in demo mode"
- Hide edit/delete controls on messages

#### 5. `src/pages/bunk/BunkDocuments.tsx`
- When `isDemoMode`, hide the upload zone and archive/delete/rename dropdown items
- Keep document list and expanded details visible (read-only)

#### 6. `src/pages/bunk/BunkAdmin.tsx`
- When `isDemoMode`, show a disabled state card: "Admin is disabled in demo mode"
- Hide all team management, integration, and invite controls

#### 7. `src/pages/bunk/BunkArtifacts.tsx`
- When `isDemoMode`, hide the "New Artifact" button and edit/delete controls on cards
- Keep read-only view of existing artifacts

#### 8. `src/pages/bunk/BunkSetup.tsx`
- When `isDemoMode`, redirect to `/bunk` (no tour creation in demo)

#### 9. `src/components/bunk/BunkSidebar.tsx`
- When `isDemoMode`, hide the "INVITE ALL" bulk invite button and DM compose actions

### Security

- DEMO users cannot write to any table (RLS blocks INSERT/UPDATE/DELETE for non-TA/MGMT roles)
- The `activate_demo_mode` RPC is SECURITY DEFINER so it can look up jonathan's tours without the caller needing prior access
- DEMO memberships are cleaned up via `exitDemo()` or can be manually removed by jonathan from Admin
- No sensitive data beyond what CREW already sees is exposed

### Files Summary

| File | Action |
|------|--------|
| New migration SQL | Add DEMO enum, create RPCs |
| `src/hooks/useTour.tsx` | Add isDemoMode, exitDemo |
| `src/pages/bunk/BunkOverview.tsx` | Empty state + hide edits |
| `src/pages/bunk/BunkLayout.tsx` | Demo banner |
| `src/pages/bunk/BunkChat.tsx` | Disable input |
| `src/pages/bunk/BunkDocuments.tsx` | Hide upload/archive |
| `src/pages/bunk/BunkAdmin.tsx` | Disabled message |
| `src/pages/bunk/BunkArtifacts.tsx` | Hide create/edit |
| `src/pages/bunk/BunkSetup.tsx` | Redirect if demo |
| `src/components/bunk/BunkSidebar.tsx` | Hide invite controls |

