-- Fix: Change the invite claim UPDATE policy from RESTRICTIVE to PERMISSIVE
-- so it doesn't conflict with other RESTRICTIVE policies
DROP POLICY IF EXISTS "Authenticated users can claim invite" ON public.tour_invites;

CREATE POLICY "Authenticated users can claim invite"
ON public.tour_invites
FOR UPDATE
USING (
  (auth.uid() IS NOT NULL)
  AND (used_by IS NULL)
  AND (expires_at > now())
)
WITH CHECK (
  (auth.uid() IS NOT NULL)
  AND (used_by = auth.uid())
);