

## Demo-to-Full Upgrade Flow

### How It Works Today
- Demo users already have a Google-authenticated account, a profile row, and a Telauthorium ID
- Their `tour_members` role is `DEMO`, which gives read-only access
- Upgrading = changing that role to `CREW` (or `TA`/`MGMT`)

### What We Need to Build

#### 1. "Request Full Access" Button (Demo User Side)
Add a button in the demo banner (and/or BunkOverview) that lets the demo user request an upgrade. This inserts a row into a new `upgrade_requests` table and notifies Jonathan.

```text
upgrade_requests
----------------
id              uuid (PK)
user_id         uuid (NOT NULL)
user_email      text
user_name       text
tour_id         uuid (NOT NULL)
status          text (PENDING / APPROVED / DENIED)
requested_at    timestamptz (default now())
resolved_at     timestamptz (nullable)
resolved_by     uuid (nullable)
```

#### 2. Jonathan's Admin: Pending Requests
Add a "Pending Requests" section to BunkAdmin showing:
- Name, email, requested time
- "Approve" button (sets role to CREW, updates request status)
- "Deny" button (updates request status, optionally removes demo access)

Approving calls a new `approve_upgrade_request` SECURITY DEFINER RPC that:
- Updates `tour_members` role from `DEMO` to `CREW` for all of that user's demo memberships
- Updates the `upgrade_requests` row to `APPROVED`
- Clears the `demo_activations` expiry (so it doesn't auto-expire after approval)

#### 3. Notification to Jonathan
When a demo user clicks "Request Full Access":
- The `notify-demo-activation` edge function is reused (or extended) to send Jonathan an in-app DM: "Upgrade request from [name] ([email])"
- Email notification can follow once an email service is connected

#### 4. User Experience After Approval
- Next time the user loads the app (or on realtime update), their role is `CREW`
- `isDemoMode` flips to `false` automatically (since not all roles are DEMO anymore)
- Demo banner disappears
- All write controls (new tour, upload, chat input, admin) become available
- Their existing profile, Telauthorium ID, avatar -- all stay the same
- They can immediately start creating tours, uploading documents, and managing their workspace

#### 5. No Action Required by User
The user does nothing except click "Request Full Access." Once approved:
- No re-login needed
- No re-registration
- No data migration
- Everything just unlocks

### Technical Details

**New migration:**
- Create `upgrade_requests` table with RLS (users can INSERT/SELECT own, Jonathan can SELECT/UPDATE all)
- Create `approve_upgrade_request(_request_id uuid)` SECURITY DEFINER RPC
- Create `deny_upgrade_request(_request_id uuid)` SECURITY DEFINER RPC

**Frontend changes:**

| File | Change |
|------|--------|
| `src/pages/bunk/BunkLayout.tsx` | Add "REQUEST FULL ACCESS" button next to "EXIT DEMO" in the banner |
| `src/hooks/useTour.tsx` | Add `requestUpgrade()` function to context, track `upgradeRequested` state |
| `src/pages/bunk/BunkAdmin.tsx` | Add "Pending Upgrade Requests" section with approve/deny actions |
| `supabase/functions/notify-demo-activation/index.ts` | Extend to handle upgrade request notifications |

**Seamless transition logic:**
- When `tour_members` role changes from DEMO to CREW, the existing `checkDemoMode()` in `useTour.tsx` will automatically detect that not all roles are DEMO and set `isDemoMode = false`
- All UI guards (`isDemoMode && ...`) will instantly unlock
- The 24-hour expiry becomes irrelevant once the role is no longer DEMO

