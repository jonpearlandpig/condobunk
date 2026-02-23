

# Mobile Bottom "L" Navigation with Handedness Toggle

## Overview
Build the mobile-only bottom navigation as an "L" shape, with a user preference to flip the layout for left-handed vs right-handed use. The "L" mirrors horizontally depending on the setting:

- **Right-hand mode (default)**: Menu button bottom-right, DM panel slides up on the right, nav tabs extend left from the corner
- **Left-hand mode**: Menu button bottom-left, DM panel slides up on the left, nav tabs extend right from the corner (original plan)

The preference persists in the user's profile so it survives sessions.

## Visual Layouts

```text
LEFT-HAND MODE ("L")              RIGHT-HAND MODE (backwards "L")
+---------------------------+     +---------------------------+
|                           |     |                           |
|      Main Content         |     |      Main Content         |
|                           |     |                           |
|                      DM   |     | DM                        |
|                    Panel   |     | Panel                     |
|                   (slides  |     | (slides                   |
|                    up)     |     |  up)                      |
+---+-------------------+---+     +---+-------------------+---+
| M | TLDR CAL TELA AKB ADM|     |TLDR CAL TELA AKB ADM | M |
+---+------------------------+   +------------------------+---+
```

## What Changes

### 1. Database: Add `hand_preference` column to `profiles`
- New column: `hand_preference TEXT DEFAULT 'right'` (values: `'left'` or `'right'`)
- No RLS changes needed -- existing profile policies already cover reads/updates for own row

### 2. New hook: `src/hooks/useHandPreference.ts`
- Reads `hand_preference` from the user's profile
- Provides a `setHandPreference` function that updates the DB and invalidates the query
- Returns `'left' | 'right'` with `'right'` as default
- Uses React Query for caching

### 3. New component: `src/components/bunk/MobileBottomNav.tsx`
The core mobile navigation component:
- Renders `null` on desktop (uses `useIsMobile()`)
- Accepts handedness from the hook to determine layout direction
- **Bottom bar** (~48px, fixed, safe-area-aware with `pb-safe`):
  - Corner side (left or right based on preference): animated menu button (hamburger/X morph)
  - Opposite side: avatar/account dropdown
  - Center: 5 nav icons (TL;DR, Calendar, Ask Tela, AKB, Admin) with tiny labels
- **DM panel**: Slides up from the corner side using framer-motion
  - Contains `SidebarContactList` and `SidebarTelaThreads`
  - Positioned on the same side as the menu button
- All positioning uses conditional classes based on the `handPreference` value (e.g., `left-0` vs `right-0`, `flex-row` vs `flex-row-reverse`)

### 4. Handedness toggle UI
- Inside the account dropdown menu (avatar button), add a "Switch to left/right hand" menu item
- Uses `HandMetal` icon from lucide-react
- Taps update the preference via the hook, layout flips instantly

### 5. Modify `BunkLayout.tsx`
- Top header: add `hidden md:flex` (hide on mobile, keep on desktop)
- Render `<MobileBottomNav />` inside the flex-1 container on mobile
- Main content area: add `pb-16 md:pb-0` for bottom bar clearance
- Pass avatar/profile/signOut props down to `MobileBottomNav`

### 6. No changes to
- Desktop sidebar or header behavior
- `BunkSidebar.tsx` (stays as-is for desktop)
- Routing

## Technical Details

### Database migration
```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hand_preference TEXT DEFAULT 'right';
```

### Hook API
```typescript
const { handPreference, setHandPreference } = useHandPreference();
// handPreference: 'left' | 'right'
// setHandPreference('left') -- updates DB + cache
```

### Animation approach
- framer-motion `AnimatePresence` + `motion.div` for DM panel slide
- Panel origin flips based on handedness (`originX: 0` vs `originX: 1`)
- Nav items stagger animate inward from the menu button side
- Menu icon uses `motion` rotation for hamburger-to-X transition

### Conditional layout classes (simplified)
```typescript
const isLeft = handPreference === 'left';
// Bottom bar: flex-row (left-hand) vs flex-row-reverse (right-hand)
// DM panel: left-0 (left-hand) vs right-0 (right-hand)
// Nav stagger direction: left-to-right vs right-to-left
```

