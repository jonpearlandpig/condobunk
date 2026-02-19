
-- Drop the restrictive policy and recreate as permissive
DROP POLICY IF EXISTS "TA/MGMT can insert tours" ON public.tours;

CREATE POLICY "Users can create tours"
ON public.tours
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);
