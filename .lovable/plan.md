

## Surface Online Status + Direct-Click Actions

### Problem 1: Online users buried in tour sub-groups
The Tour Team header shows a green count badge (e.g., "2"), but you can't see which specific people are online without expanding each tour sub-group. This defeats the purpose of presence tracking.

**Fix:** Add a "Now Online" section at the top of the Tour Team group that automatically surfaces all online contacts, regardless of which tour they belong to. This section appears only when someone is online and is always visible when Tour Team is expanded -- no extra clicks needed.

### Problem 2: Clicking a contact name does nothing on desktop
Currently on desktop, `onClick` only fires on mobile (`isMobile && toggleExpand`). To message someone you have to hover, find the three-dot icon, click it, then select an action. Too many steps.

**Fix:** Make clicking a contact name on desktop trigger the primary action directly:
- If the contact is online (has app account + green dot): open Bunk Chat
- If the contact is offline but has a phone: fall back to SMS
- If the contact has no app account but has a phone: SMS
- Keep the three-dot menu available on hover for secondary actions (edit, invite, call, email, ask TELA, remove)

### Technical Changes

**File: `src/components/bunk/SidebarContactList.tsx`**

1. Line ~335: Change `onClick={() => isMobile && toggleExpand(c.id)}` to fire on both desktop and mobile:
   - Desktop: `handleMessage(c)` (primary action -- message/SMS)
   - Mobile: keep existing `toggleExpand(c.id)` behavior (shows action bar)

2. Add cursor feedback: the row already has `cursor-pointer` but desktop users get no visual hint that clicking does something. Keep as-is since the hover highlight already signals interactivity.

**File: `src/components/bunk/BunkSidebar.tsx`**

3. After the Tour Team header opens, render a compact "Online Now" sub-section before the tour sub-groups:
   - Filter all `filteredTourTeamGroups` contacts where `appUserId` is in `onlineUsers`
   - Render them as a flat list with green dots, name, and role -- no tour grouping
   - Clicking a name in this list triggers `handleMessage` (same as above)
   - Only shown when `tourTeamOpen` is true and at least one person is online
   - Styled with a subtle green-tinted background to distinguish from the regular grouped list

### What stays the same
- Mobile tap-to-expand behavior is unchanged
- Three-dot overflow menu stays on desktop hover for secondary actions (edit, invite, remove, etc.)
- Venue Partners section is unchanged
- The existing online count badge in the Tour Team header stays

### Visual result

```text
Tour Team [green dot] 2          5
  -- ONLINE NOW --
  [green] Caleb Cook   Tour Manager
  [green] Trey Mills   Tour Assist
  -- KOH2026 --  (collapsed)
  -- PW2026 --   (collapsed)
```

Clicking "Caleb Cook" anywhere (in the Online Now section or inside a tour group) immediately opens Bunk Chat with him.
