

## Fix: Venue Partners Not Showing When No Schedule Events Exist

### Root Cause

The Keepers PAC Tour actually **has 60 venue contacts** in the database (Belk Theater, Proctors Theatre, etc.) -- they were successfully extracted. The problem is they're invisible in the sidebar.

The sidebar filtering logic in `useSidebarContacts.ts` works like this:
1. Fetch schedule events with future dates
2. Build a venue map from those events
3. Only show contacts that fuzzy-match a venue from that map

The Keepers tour has **zero schedule events**, so step 2 produces an empty map, and step 3 shows nothing. The "0" count is correct from the sidebar's perspective, but misleading -- the contacts exist, they just can't be displayed.

### Fix

Update `useSidebarContacts.ts` to show venue contacts even when no schedule events exist by falling back to grouping contacts by their `venue` field directly.

**File: `src/hooks/useSidebarContacts.ts`**

After the schedule-event-based venue grouping logic, add a fallback: if the event-based venue map is empty (or doesn't cover all contacts), group remaining VENUE-scoped contacts by their `contact.venue` field. This ensures contacts extracted from advance masters appear in the sidebar regardless of whether schedule events have been created.

For each tour:
1. After building `tourVenues` from schedule events, collect any VENUE contacts for that tour whose `venue` field doesn't fuzzy-match any event venue
2. Group those "orphan" contacts by their own `contact.venue` value
3. Append those groups to `tourVenues` (sorted alphabetically, after the date-sorted event venues)

This way:
- Contacts tied to schedule events still appear in chronological order
- Contacts from advance masters without matching events appear alphabetically after, with their venue name as the group label
- The count badge shows the real total

### Technical Details

**Single file change:** `src/hooks/useSidebarContacts.ts`

In the per-tour venue group building loop (around line 120-140), after filtering contacts by event venues:
- Collect all venue contacts for the tour
- Find contacts not already included in an event-based group
- Group them by `contact.venue`
- Append as additional `VenueGroup` entries with `city: null` and `earliestDate: "9999-12-31"` (sorts to end)
- Recalculate `totalContacts` to include these orphan contacts

No database changes needed. No edge function changes needed.

