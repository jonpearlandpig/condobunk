
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
