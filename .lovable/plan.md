

# Sidebar "Invite to Condo Bunk" for Non-User Contacts

## What Changes

Tour team contacts in the sidebar who have an email but are NOT yet signed up for Condo Bunk (no `appUserId`) get an **Invite** button directly on their contact row. No need to go to Admin. One click creates the invite, copies the link, and opens the email composer -- same flow as Admin but triggered right from the sidebar.

## How It Works

1. **Single invite**: Hover over a non-user contact in the sidebar Tour Team section. An "Invite to Condo Bunk" icon (UserPlus) appears. Click it -- an invite is created in `tour_invites`, the link is copied to clipboard, and a `mailto:` composer opens with the invite URL pre-filled.

2. **Bulk invite**: A small "Invite All" button appears at the top of the Tour Team section (only visible when there are uninvited contacts with emails). Clicking it creates invites for all eligible contacts in one pass, copies all links, and shows a summary toast.

3. **Visual indicator**: Contacts who have a pending (unexpired, unused) invite show a small "invited" badge so you know they already got one. No duplicate invites.

4. **Existing invites check**: Before creating an invite, the system checks `tour_invites` for an active (unexpired, unused) invite for that email. If one exists, it just copies the existing link instead of creating a duplicate.

## Technical Details

### Files Modified

**`src/components/bunk/SidebarContactList.tsx`**
- Accept new props: `tourId` (already available via `useTour`), `invites` (active invite list to check for existing ones)
- Add `UserPlus` icon import from lucide-react
- For contacts where `!c.appUserId && c.email`:
  - Show a `UserPlus` invite button in the hover actions
  - On click: call a new `handleInviteContact` function that:
    1. Checks if an active invite already exists for this email (from the passed-in invites list)
    2. If not, inserts into `tour_invites` with the contact's email, role mapped to tour role, tour name
    3. Copies invite URL to clipboard
    4. Opens `mailto:` with pre-filled subject and body containing the invite link
    5. Dispatches a `contacts-changed` event so the sidebar refreshes
  - If an active invite already exists, show a badge/tooltip "Invited" and on click just re-copy the link

**`src/components/bunk/BunkSidebar.tsx`**
- Fetch active (unexpired, unused) `tour_invites` for the selected tour
- Pass the invites list down to `SidebarContactList`
- Add a "Invite All" button in the Tour Team header when uninvited contacts with emails exist
- The bulk invite function iterates eligible contacts, creates invites, and shows a summary toast

**`src/hooks/useSidebarContacts.ts`**
- No changes needed -- contacts already have `email` and `appUserId` fields

### No Database Changes
- Uses the existing `tour_invites` table and existing RLS policies (TA/MGMT can insert invites)
- No new migrations needed

### Invite Flow (same as existing Admin flow)
```text
1. Insert into tour_invites (tour_id, email, role, created_by, tour_name)
2. Get back the token
3. Build URL: {origin}/invite/{token}
4. Copy to clipboard
5. Open mailto:{email}?subject=...&body=...{inviteUrl}...
6. Toast: "Invite sent -- link copied!"
```

### Edge Cases
- Contact has no email: no invite button shown (falls back to existing "Ask TELA for details")
- Contact already has appUserId: no invite button (they're already on the app)
- Active invite already exists: show "Invited" badge, click re-copies link
- User is not TA/MGMT: RLS will block the insert -- show appropriate error toast

