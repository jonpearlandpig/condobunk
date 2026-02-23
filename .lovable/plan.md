

## Fix: Desktop Bunk Chat Not Opening

### Root Cause

In `SidebarContactList.tsx`, the `handleMessage` function (line 84-117) has a bug in the online-contact branch. When `isContactOnline(c)` is true and there's no `onContactTap` override (i.e. desktop sidebar), it:
1. Clears `expandedId`
2. Marks messages as read

But it **never calls `setChattingWith(c.id)`**, so the inline chat panel (lines 628-670) never opens. The chat UI is gated on `chattingWith === c.id`, which stays `null`.

### Fix

**File: `src/components/bunk/SidebarContactList.tsx`** (1 line addition)

In the `handleMessage` function, inside the `if (isContactOnline(c))` block (after line 91), add:

```
setChattingWith(c.id);
```

This opens the inline bunk chat panel for the clicked contact on desktop. The panel already has the full chat UI -- message history, realtime subscription, and input field -- it just was never being activated.

### Technical Details

- Line 90-101: The `isContactOnline(c)` branch currently only calls `setExpandedId(null)` and marks messages read
- Line 628-670: The inline chat UI already exists and renders when `chattingWith === c.id`
- Lines 119-165: The `useEffect` that loads DM history and subscribes to realtime already triggers on `chattingWith` changes
- No other files need changes -- the chat panel, message loading, sending, and realtime subscription all work correctly once `chattingWith` is set

