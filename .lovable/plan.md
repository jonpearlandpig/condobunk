

# Fix Message Drawer: Group Names + Read/Reset Bug

## Problems

1. **Generic group names** -- "TOUR TEAM" and "VENUE PARTNERS" are flat labels. When you expand them, the nested tour names are hard to parse. The top-level headers should be more descriptive and the nested tour sub-groups should show abbreviated, cleaner names.

2. **Unread badge doesn't clear after reading messages** -- When you open a DM conversation (DMChatScreen), it marks messages as read in the database, but the "Waiting" section and unread badges persist. The root cause: DMChatScreen fires a mark-as-read UPDATE, which triggers a realtime event that useUnreadDMs should catch. But when the user closes the DM overlay, there's a race -- the overlay unmounts, the realtime event may arrive slightly after, and the useUnreadDMs hook doesn't get a forced refetch on close. The fix is to explicitly call refetch when the DM screen closes.

## Changes

### File 1: `src/components/bunk/MobileBottomNav.tsx`

**A. Expose `refetch` from `useUnreadDMs`**

Line 86 -- destructure `refetch`:
```tsx
const { totalUnread, unreadFrom, refetch: refetchUnread } = useUnreadDMs();
```

**B. Force refetch when DM screen closes**

Update the `onClose` callback for `DMChatScreen` to call `refetchUnread()` before clearing the active contact:
```tsx
onClose={() => {
  setActiveDMContact(null);
  refetchUnread();
}}
```

**C. Enhance group section names**

Update the section titles to be more descriptive:
- "Tour Team" becomes "Your Crew" (shorter, clearer)
- "Venue Partners" becomes "Venues" (shorter)
- Nested tour sub-groups: keep the tour name but ensure truncation works

### File 2: `src/components/bunk/DMChatScreen.tsx`

**D. Await the mark-as-read call before proceeding**

The current fire-and-forget `.then(() => {})` means the database update might not complete before the realtime event fires. While the realtime path should handle it, we should also ensure the mark-as-read completes properly. Change the initial mark-as-read from fire-and-forget to awaited:
```tsx
// Before
supabase
  .from("direct_messages")
  .update({ read_at: new Date().toISOString() })
  .eq("sender_id", recipientUserId)
  .eq("recipient_id", userId)
  .is("read_at", null)
  .then(() => {});

// After
await supabase
  .from("direct_messages")
  .update({ read_at: new Date().toISOString() })
  .eq("sender_id", recipientUserId)
  .eq("recipient_id", userId)
  .is("read_at", null);
```

Same for the auto-mark-as-read on incoming messages inside the realtime handler (line 61-65).

## Technical Summary

Two files changed:
- `MobileBottomNav.tsx`: destructure `refetch`, call it on DM close, rename section titles
- `DMChatScreen.tsx`: await mark-as-read calls instead of fire-and-forget

No database changes. No new dependencies.
