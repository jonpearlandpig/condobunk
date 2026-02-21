
-- Allow tour members to see profiles of other members in the same tour
CREATE POLICY "Tour members can view teammate profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tour_members tm1
    JOIN public.tour_members tm2 ON tm1.tour_id = tm2.tour_id
    WHERE tm1.user_id = auth.uid()
      AND tm2.user_id = profiles.id
  )
);
