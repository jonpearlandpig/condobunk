

## Demo Mode: Hide Contact Info and Block Outbound Actions

### Problem
Demo users can currently see phone numbers, email addresses, and access messaging/editing actions on contacts. They should only see names and roles -- no PII, no outbound communication.

### Changes

#### 1. SidebarContactList.tsx -- Hide contact details and block actions for demo users

- Accept `isDemoMode` as a new prop (passed from parent components)
- When `isDemoMode` is true:
  - Hide phone numbers and email addresses everywhere (tooltips, action labels, expanded mobile bars)
  - Hide all action buttons: SMS, Call, Email, Bunk Chat, Edit, Delete, Invite, Remove
  - Remove the "ASK TELA FOR DETAILS" button (which prompts finding contact info)
  - Keep visible: name, role, online status indicator, unread badge
  - On desktop hover row: show nothing (no overflow menu, no quick-action icons)
  - On mobile expand: show only "TELA" button (Ask TELA about this person, but not for contact details)
  - Disable the `handleMessage` click handler so tapping a contact does not open SMS or DM

#### 2. DMChatScreen.tsx -- Block message sending for demo users

- Accept `isDemoMode` prop
- When true: hide the input bar entirely, replace with a read-only notice ("Demo mode -- messaging disabled")
- Existing messages can still be viewed (read-only)

#### 3. BunkSidebar.tsx -- Pass isDemoMode to contact lists

- Thread `isDemoMode` from `useTour()` down to all `SidebarContactList` instances rendered in the sidebar

#### 4. Any other messaging drawer or contact display components

- Audit `BunkChat.tsx` and the messaging drawer to ensure demo users cannot compose or send DMs
- The sidebar's `onContactTap` handler should be blocked for demo users

#### 5. BunkAdmin.tsx -- Already handled

- The admin page already shows a "Demo Mode" read-only notice and blocks all admin actions. No changes needed.

### What Demo Users Will See

```text
Contacts Sidebar:
  John Smith
  Tour Manager

  Sarah Jones  [green dot]
  Lighting Designer

  (no phone, email, edit, call, text, or invite actions visible)
```

### Files to Modify

| File | Change |
|------|--------|
| `src/components/bunk/SidebarContactList.tsx` | Add `isDemoMode` prop; conditionally hide PII and all outbound action buttons |
| `src/components/bunk/DMChatScreen.tsx` | Add `isDemoMode` prop; hide send input when true |
| `src/components/bunk/BunkSidebar.tsx` | Pass `isDemoMode` to SidebarContactList instances |
| Any parent rendering SidebarContactList or DMChatScreen | Pass the `isDemoMode` prop through |

### Security Note

This is a UI-level enforcement. The database already blocks demo users from INSERT/UPDATE via RLS (DEMO role is excluded from `is_tour_admin_or_mgmt`). Demo users can SELECT contacts (names, roles) through `is_tour_member`, which is correct -- they need to see who is on the tour. The phone/email data is visible at the DB level but hidden in the UI. For stricter protection, a database view excluding phone/email for DEMO users could be added as a follow-up, but the UI gate combined with existing write-blocking RLS provides practical protection.

