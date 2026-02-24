

## Fix Venue Partners Count Mismatch

### Problem
The "Venue Partners" header badge in BunkSidebar shows **41** — the number of upcoming *venues* — but the expanded list shows contacts grouped by venue, and PW2026 has **zero** venue-scoped contacts. The user reasonably reads "41" as "41 contacts" and sees nothing.

### Root Cause
- **BunkSidebar.tsx line 317**: `tourVenueGroups.reduce((sum, g) => sum + g.venueGroups.length, 0)` counts venue *groups*, not contacts.
- **MobileBottomNav.tsx line 146**: Already uses the correct metric: `tourVenueGroups.reduce((sum, g) => sum + g.totalContacts, 0)` — so mobile is fine, desktop is wrong.

### Solution
Two changes to make the count honest and the empty state useful:

**1. Fix the count badge (BunkSidebar.tsx line 317)**

Change from venue count to contact count, matching what MobileBottomNav already does:

```text
Before:  tourVenueGroups.reduce((sum, g) => sum + g.venueGroups.length, 0)
After:   tourVenueGroups.reduce((sum, g) => sum + g.totalContacts, 0)
```

This way, if there are 0 venue contacts, the badge shows "0" (or we hide it when zero). When contacts are added, the count will be accurate.

**2. Show venue count as secondary context (optional but recommended)**

Add a subtle sub-label like "41 venues" below the contact count so the user knows there *are* venues on the schedule — they just don't have contacts yet. This encourages them to populate contacts via TELA or manual entry.

### Technical Changes

**File: `src/components/bunk/BunkSidebar.tsx`**
- Line 317: Replace `g.venueGroups.length` with `g.totalContacts`
- Optionally add a secondary "(41 venues)" indicator when contact count is 0

This is a one-line fix that aligns desktop behavior with what mobile already does correctly.
