

## Demo Mode: 24-Hour Expiry, Tracking, and Notifications

### Overview
Enhance demo mode with a 24-hour automatic expiry, a `demo_activations` audit log, an in-app alert for jonathan, and an email notification via a new edge function.

### 1. Database: `demo_activations` Tracking Table

Create a new table to log every demo activation:

```text
demo_activations
-----------------
id              uuid (PK, default gen_random_uuid())
user_id         uuid (NOT NULL)
user_email      text
user_name       text
activated_at    timestamptz (default now())
expires_at      timestamptz (default now() + interval '24 hours')
deactivated_at  timestamptz (nullable -- set when they exit early)
```

RLS: jonathan (the demo owner) can SELECT all rows. Users can SELECT their own rows. No public INSERT/UPDATE -- only the RPC functions write to this table.

### 2. Database: Update `activate_demo_mode()` RPC

Modify the existing function to:
- Check if an active (non-expired) demo session already exists for the caller -- if so, just return it without creating duplicates
- Insert a row into `demo_activations` with the caller's email/name (pulled from `profiles`)
- Set `expires_at` to `now() + interval '24 hours'`

### 3. Database: Update `deactivate_demo_mode()` RPC

Modify to also update `demo_activations` setting `deactivated_at = now()`.

### 4. Database: Auto-Expire Cron Job

Use `pg_cron` + `pg_net` to run every hour:
- Find `tour_members` with `role = 'DEMO'` whose `demo_activations.expires_at < now()`
- Delete those memberships
- Update the `demo_activations` row with `deactivated_at = now()`

This ensures demo access is automatically revoked after 24 hours even if the user never clicks "Exit Demo."

### 5. Edge Function: `notify-demo-activation`

A new edge function that:
- Receives `{ user_email, user_name, activated_at, expires_at }` from the `activate_demo_mode` RPC (called from the frontend after activation succeeds)
- Sends an email to `jonathan@pearlandpig.com` using the Lovable AI integration (or a simple HTTP call to a transactional email service)

Since there's no email service configured yet, we have two options:
- **Option A**: Use the built-in Supabase Auth email hook (limited)
- **Option B**: Add a Resend API key and send a formatted email

For now, the edge function will insert a `direct_message` to jonathan as an in-app notification (guaranteed to work), and we can add email later once an email service is connected.

### 6. Frontend: In-App Notification to Jonathan

When `activate_demo_mode()` succeeds, the frontend calls the `notify-demo-activation` edge function which:
- Inserts a DM to jonathan: "New demo activation: [name] ([email]) -- expires in 24h"
- This shows up in jonathan's DM inbox immediately

### 7. Frontend: Show Expiry in Demo Banner

Update `BunkLayout.tsx` demo banner to show remaining time:
```text
DEMO MODE -- Expires in 23h 14m (read-only)  [EXIT DEMO]
```

Query `demo_activations` for the user's active session to get `expires_at`, then calculate and display countdown.

### 8. Frontend: BunkOverview Empty State After Expiry

When demo expires and tours become empty again, the user sees the same "TRY DEMO" button and can reactivate for another 24 hours.

### 9. Jonathan's Admin: Demo Users List

Add a "Demo Users" section to `BunkAdmin.tsx` that queries `demo_activations` and shows:
- Name, email, activated time, expires/expired, status (active/expired/exited)
- Only visible to jonathan (tour owner)

### Files Summary

| File | Change |
|------|--------|
| New migration SQL | Create `demo_activations` table, update RPCs, enable pg_cron + pg_net |
| Cron job (insert tool) | Hourly cleanup of expired demo memberships |
| New `supabase/functions/notify-demo-activation/index.ts` | Send DM to jonathan on activation |
| `src/hooks/useTour.tsx` | Pass activation info to notification edge function |
| `src/pages/bunk/BunkLayout.tsx` | Show countdown timer in demo banner |
| `src/pages/bunk/BunkAdmin.tsx` | Add "Demo Users" section for jonathan |

### Email Notification

To send actual emails (not just in-app DMs), we'll need an email service API key (like Resend). I can set that up as a follow-up step once you provide one, or we can start with in-app DMs only and add email later. The in-app DM will be delivered immediately and is reliable.

