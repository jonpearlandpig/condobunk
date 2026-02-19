
-- Recreate all tours policies from scratch
DROP POLICY IF EXISTS "Users can create tours" ON public.tours;
DROP POLICY IF EXISTS "Members can view their tours" ON public.tours;
DROP POLICY IF EXISTS "TA/MGMT can update tours" ON public.tours;
DROP POLICY IF EXISTS "TA/MGMT can delete tours" ON public.tours;

-- Permissive INSERT policy
CREATE POLICY "Users can create tours"
ON public.tours
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- Permissive SELECT policy
CREATE POLICY "Members can view their tours"
ON public.tours
FOR SELECT
TO authenticated
USING (is_tour_member(id));

-- Permissive UPDATE policy
CREATE POLICY "TA/MGMT can update tours"
ON public.tours
FOR UPDATE
TO authenticated
USING (is_tour_admin_or_mgmt(id));

-- Permissive DELETE policy
CREATE POLICY "TA/MGMT can delete tours"
ON public.tours
FOR DELETE
TO authenticated
USING (is_tour_admin_or_mgmt(id));
