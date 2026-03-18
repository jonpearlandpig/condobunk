-- Drop the UPDATE policy that allows privilege escalation (role column can be changed)
-- Invite claiming is handled securely by the accept_tour_invite() SECURITY DEFINER RPC
DROP POLICY IF EXISTS "Authenticated users can claim invite" ON public.tour_invites;