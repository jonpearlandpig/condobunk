

## Add Blinking Notification for Bunk Chat Messages

### What Changes

Add a pulsing/blinking animation to the unread message indicators so they catch the user's eye when new messages come in.

### Locations to Update

1. **Mobile Bottom Nav** (`src/components/bunk/MobileBottomNav.tsx`)
   - The small dot on the MessageCircle icon (line 318) -- add `animate-pulse` class to make it blink

2. **Desktop Sidebar** (`src/components/bunk/BunkSidebar.tsx`)
   - The unread count badge next to "Tour Team" (line 245) -- add `animate-pulse` class to the badge

3. **Desktop Header** (`src/pages/bunk/BunkLayout.tsx`)
   - Add a small blinking dot on the sidebar logo trigger when there are unread DMs, so users notice even when the sidebar is collapsed

### Implementation Details

- Use the existing `animate-pulse` Tailwind utility (already available) for the blinking effect
- The mobile dot gets `animate-pulse` so it pulses orange
- The desktop sidebar badge gets `animate-pulse` so the count badge pulses
- Add an unread indicator dot to the desktop header logo area (BunkLayout) that pulses when `totalUnread > 0`, since the sidebar is usually collapsed

### Files Modified
- `src/components/bunk/MobileBottomNav.tsx` -- add animate-pulse to unread dot
- `src/components/bunk/BunkSidebar.tsx` -- add animate-pulse to unread badge
- `src/pages/bunk/BunkLayout.tsx` -- import `useUnreadDMs`, add blinking dot near the logo trigger when unread > 0

