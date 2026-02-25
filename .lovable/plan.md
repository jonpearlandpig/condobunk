

# Fix: Deduplicate Online User Count Across Tours

## Problem

When Jon Hartman is a member of 4 tours, he appears as a separate contact entry in each tour's team group. The online count (`onlineTeamCount`) does a `flatMap` across all tour groups and counts every contact with a matching `appUserId` in the `onlineUsers` set -- resulting in "4 users online" when it's actually 1 unique person online across 4 tours.

## Solution

Deduplicate by `appUserId` before counting. Instead of counting contacts, collect unique online `appUserId` values into a Set, then use the Set's size.

## Changes

### `src/components/bunk/BunkSidebar.tsx` (lines 113-117)

Replace the current count logic:

```typescript
// Count online team members (excluding self)
const onlineTeamCount = filteredTourTeamGroups
  .flatMap(g => g.contacts)
  .filter(c => c.appUserId && onlineUsers.has(c.appUserId))
  .length;
```

With deduplicated logic:

```typescript
// Count unique online team members (excluding self, deduplicated across tours)
const onlineTeamCount = new Set(
  filteredTourTeamGroups
    .flatMap(g => g.contacts)
    .filter(c => c.appUserId && onlineUsers.has(c.appUserId))
    .map(c => c.appUserId)
).size;
```

### `src/components/bunk/MobileBottomNav.tsx`

Check if the same pattern exists there and apply the same fix if so.

This is a one-line structural change (wrapping in `new Set(...).size` instead of `.length`) that correctly reports unique online people rather than unique online contact rows.

