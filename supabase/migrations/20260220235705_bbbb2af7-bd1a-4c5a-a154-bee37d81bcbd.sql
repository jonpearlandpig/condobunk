
-- Allow anonymous/unauthenticated users to read invites (needed for invite acceptance page)
CREATE POLICY "Anyone can read invites by token"
ON public.tour_invites
FOR SELECT
TO anon, authenticated
USING (true);
