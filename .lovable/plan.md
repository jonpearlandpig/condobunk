

# Bottom-Up Mobile Messaging Panel

## Layout Change

Anchor all messaging content to the bottom of the sheet so sections grow upward toward the header. Reorder sections so **Ask TELA** is closest to the thumb (bottom), **Venue Partners** in the middle, and **Tour Team** furthest from thumb (top).

```text
+------------------+
| Messages    (99) |  <- header pinned top
|                  |
|  (empty space)   |  <- flex grow pushes content down
|                  |
| Tour Team ▸      |  <- furthest from thumb
| Venue Partners ▸ |
| Ask TELA  ▸      |  <- closest to thumb
+------------------+
| Avatar  Name     |  <- profile footer pinned bottom
+------------------+
```

## SidebarProvider Problem

`SidebarTelaThreads` calls `useSidebar()` internally (for `setOpenMobile` / `setOpen`), so removing the `SidebarProvider` wrapper would crash it. The fix: wrap **only** `SidebarTelaThreads` in its own minimal `SidebarProvider` instead of wrapping the entire section. This isolates the sidebar context to where it's actually needed and stops the desktop-grid CSS from affecting the whole panel.

## Technical Changes

### File: `src/components/bunk/MobileBottomNav.tsx`

1. **Scrollable content div** (line 163): Change from `overflow-y-auto flex-1 px-3 pb-2 space-y-0` to `overflow-y-auto flex-1 px-3 pb-2 flex flex-col justify-end` so collapsed sections cluster at the bottom of available space.

2. **Remove outer SidebarProvider** (lines 164 and 203): Delete the `<SidebarProvider defaultOpen={false}>` wrapper.

3. **Wrap only SidebarTelaThreads** in its own `<SidebarProvider defaultOpen={false}>` so `useSidebar()` inside it doesn't crash. Keep the import.

4. **Reorder sections** so they render in this order (top to bottom):
   - Tour Team (furthest from thumb)
   - Venue Partners (middle)
   - Ask TELA (closest to thumb / bottom)

### No other files modified

The contact list components and thread list work as-is -- only the container layout and order changes.

## UX Improvement Ideas (for future consideration)

The current collapsible-section pattern works well for a messaging drawer. A few ideas to consider later:
- **Unread badges on section headers**: Show per-group unread counts (e.g., "Tour Team 3") so users can see at a glance which group has new messages without expanding
- **Auto-expand the section with unread messages**: When the drawer opens, automatically expand whichever group has unreads
- **Online-first sorting within groups**: Already implemented -- online contacts sort to the top
- **Quick-compose FAB**: A floating "new message" button pinned above the profile footer for fast access

