

## Changes

### 1. Hide the signed-in user from the Tour Team contact list

Currently all tour team contacts are shown, including the logged-in user. The fix is to filter out contacts whose `appUserId` matches the current `user.id` (or whose email matches the current user's email) before rendering.

This will be done in `SidebarContactList.tsx` by filtering the `contacts` array to exclude the current user, OR in `BunkSidebar.tsx` by filtering before passing contacts down. The cleaner approach is filtering in `BunkSidebar.tsx` at the data level, so the count badge also reflects the correct number.

**File: `src/components/bunk/BunkSidebar.tsx`**
- Filter each `tourTeamGroups` group's contacts to exclude contacts where `appUserId === user.id`
- Update the total count to reflect the filtered list
- Update `getUninvitedContacts()` to also exclude the current user

### 2. Start Tour Team and Venue Partners collapsed by default

Currently both sections default to `useState(true)` (open). Change both to `useState(false)`.

**File: `src/components/bunk/BunkSidebar.tsx`**
- Change `tourTeamOpen` initial state from `true` to `false`
- Change `venuePartnersOpen` initial state from `true` to `false`

Sub-groups (individual tours under Tour Team, and venues under Venue Partners) already start collapsed since `expandedTours` starts as an empty Set and venue groups use `expandedVenues` which also starts empty.

### Technical Details

**BunkSidebar.tsx changes:**

1. Lines 67-68: Change default state:
   - `const [tourTeamOpen, setTourTeamOpen] = useState(false);`
   - `const [venuePartnersOpen, setVenuePartnersOpen] = useState(false);`

2. Create a filtered version of `tourTeamGroups` that excludes the current user:
   ```text
   const filteredTourTeamGroups = tourTeamGroups.map(g => ({
     ...g,
     contacts: g.contacts.filter(c => c.appUserId !== user?.id),
   }));
   ```

3. Use `filteredTourTeamGroups` everywhere instead of `tourTeamGroups` (count badge, rendering, bulk invite)

4. Update `getUninvitedContacts()` to use the filtered groups

