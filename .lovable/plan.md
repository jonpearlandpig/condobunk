
Goal: make sure Sidney (and any existing user whose email is already on a tour contact) is automatically added to the tour at login, instead of landing in “No active tours”.

What I found
1. Sidney’s account exists and she can authenticate successfully.
2. Her email exists in TOUR contacts for “Brandon Lake — King of Hearts Tour”.
3. She has no row in `tour_members`, so RLS hides the tour from her.
4. Root cause in code path:
   - `useTour.autoMatchContacts()` currently does:
     - `rpc("match_contact_tours")` (works for discovery)
     - then client-side `insert` into `tour_members`
   - But `tour_members` INSERT policy allows only TA/MGMT (`is_tour_admin_or_mgmt`), so Sidney (not yet a member) cannot self-insert.
   - The insert error is swallowed (no handling), so the UI silently continues with zero tours.

Implementation plan
1. Move “auto-join by contact email” into a backend RPC (security-definer)
   - Add a new database function (migration): `claim_contact_tours()`.
   - Function behavior:
     - Read `auth.uid()` + canonical auth email.
     - Find all TOUR-scoped contact matches by email.
     - Insert missing `tour_members` rows as `CREW` with `ON CONFLICT DO NOTHING`.
     - Return a small summary (`matched`, `inserted`) for observability.
   - Why: this bypasses client-side RLS limitations safely and keeps role assignment constrained to CREW for this auto-join path.

2. Update login/tour bootstrapping logic in `src/hooks/useTour.tsx`
   - Replace client-side insert logic in `autoMatchContacts()` with:
     - `await supabase.rpc("claim_contact_tours")`
   - Keep `loadTours()` sequence the same (claim first, then query active tours).
   - Add explicit error handling/logging so failures are visible and not silent.

3. Keep invite flow unchanged
   - `accept_tour_invite` remains the source of truth for invited role assignment (TA/MGMT/CREW).
   - Auto-join via contact remains CREW-by-default, preserving existing safety behavior.

4. Verification steps after deploy
   - Sign out Sidney, then sign back in.
   - Confirm `/bunk` now shows her tour (not empty state).
   - Confirm a `tour_members` row now exists for Sidney + KOH tour.
   - Confirm no duplicate membership rows and no role escalation via auto-join.

5. Optional hardening (recommended follow-up)
   - Add a small toast or non-blocking warning when membership claiming fails.
   - Add a backend audit/log entry for `claim_contact_tours` runs to speed future debugging.

Technical change set
- Database migration:
  - Add function `public.claim_contact_tours()` (SECURITY DEFINER, `search_path=public`).
  - Grant execute to authenticated users if needed.
  - `NOTIFY pgrst, 'reload schema';`
- Frontend:
  - Edit `src/hooks/useTour.tsx`
    - Simplify `autoMatchContacts()` to call the new RPC.
    - Add error handling and keep existing load flow.

Expected outcome
- “Email attached to a tour” will reliably result in tour access on login.
- Sidney will appear as part of the tour after next login.
- The silent failure path (RLS-blocked client insert) is removed.
