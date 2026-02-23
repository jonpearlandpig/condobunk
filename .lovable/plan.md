

## Fix: Unread Badge Not Clearing After Reading Messages

### Root Cause

When you open the inline bunk chat, the code marks messages as read (sets `read_at`) in the database (line 94-101 of SidebarContactList). The `useUnreadDMs` hook listens for realtime changes to `direct_messages` to trigger a refetch of unread counts. However, it checks `payload.new.recipient_id === user.id` to decide whether to refetch.

The problem: the `direct_messages` table uses the default replica identity, which means UPDATE events only include the **changed columns** (`read_at`) and the primary key (`id`) in `payload.new` -- **not** `recipient_id` or `sender_id`. So the condition always fails, and `fetchUnread()` never fires after a mark-as-read update.

### Fix (two changes)

**1. Database migration: Set REPLICA IDENTITY FULL on `direct_messages`**

This ensures all columns are included in realtime UPDATE payloads, so the existing `useUnreadDMs` subscription can properly detect mark-as-read changes.

```sql
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;
```

**2. Code safety net: Explicitly refetch unread counts when closing the chat**

Even with the realtime fix, add a direct `refetch` call as a belt-and-suspenders measure. This guarantees the badge clears immediately when the user closes the chat panel, without waiting for a realtime event.

Changes to `SidebarContactList.tsx`:
- Add a new prop: `onUnreadRefetch?: () => void`
- When `setChattingWith(null)` is called (closing the chat), also call `onUnreadRefetch?.()`
- After the mark-as-read query in `handleMessage` (line 101), chain `.then(() => onUnreadRefetch?.())`

Changes to `BunkSidebar.tsx`:
- Pass the `refetch` function from `useUnreadDMs` as the `onUnreadRefetch` prop to `SidebarContactList`

### Files to Edit
- Database migration (1 SQL statement)
- `src/components/bunk/SidebarContactList.tsx` -- add `onUnreadRefetch` prop, call it on mark-as-read and chat close
- `src/components/bunk/BunkSidebar.tsx` -- pass `refetch` from `useUnreadDMs` as the new prop

