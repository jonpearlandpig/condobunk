

## Fix: Invite Link RLS Policy Bug

### Problem
All 6 RLS policies on `tour_invites` are RESTRICTIVE. PostgreSQL requires at least one PERMISSIVE policy to grant initial row access -- restrictive policies can only narrow access further. With zero permissive policies, every query returns zero rows, making all invite links appear "invalid."

### Root Cause
The "Anyone can read invites by token" SELECT policy was created as RESTRICTIVE when it should be PERMISSIVE. This blocks unauthenticated users from reading invite data when they land on `/invite/:token`.

### Fix (Database Migration)

Drop and recreate the relevant SELECT policies on `tour_invites` with correct permissive/restrictive settings:

1. **"Anyone can read invites by token"** -- make PERMISSIVE (was restrictive). This is the gateway policy that lets the invite page load for unauthenticated users.

2. **"TA/MGMT can view invites"** -- make PERMISSIVE (was restrictive). Lets admins see invites they manage.

3. **"Authenticated users can claim invite by token"** -- DROP entirely. This is redundant with policy #1 and was causing the conflict (it required auth.uid() IS NOT NULL, which fails for anon users, blocking all access when combined with the other restrictive policies).

4. Keep the INSERT, UPDATE, and DELETE policies as-is (they correctly restrict to TA/MGMT and authenticated users).

```sql
-- Drop the broken restrictive SELECT policies
DROP POLICY IF EXISTS "Anyone can read invites by token" ON tour_invites;
DROP POLICY IF EXISTS "Authenticated users can claim invite by token" ON tour_invites;
DROP POLICY IF EXISTS "TA/MGMT can view invites" ON tour_invites;

-- Recreate as PERMISSIVE
CREATE POLICY "Anyone can read invites by token"
  ON tour_invites FOR SELECT
  USING (true);

CREATE POLICY "TA/MGMT can view invites"
  ON tour_invites FOR SELECT
  USING (is_tour_admin_or_mgmt(tour_id));

NOTIFY pgrst, 'reload schema';
```

### Immediate Workaround for Sidney
Since her email is already in the contacts table, she can skip the invite entirely: go to `condobunk.lovable.app/login`, sign in with Google, and she'll auto-join the KOH tour via the `handle_new_user` trigger.

### No Code Changes Needed
The `InviteAccept.tsx` page logic is correct -- it's just getting empty results from the database due to the policy misconfiguration.

