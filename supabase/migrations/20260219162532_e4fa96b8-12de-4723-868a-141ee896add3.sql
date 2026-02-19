
-- Fix 1: Drop the duplicate trigger
DROP TRIGGER IF EXISTS on_tour_created ON public.tours;

-- Fix 2: Recreate the INSERT policy explicitly targeting authenticated role
DROP POLICY IF EXISTS "Users can create tours" ON public.tours;
CREATE POLICY "Users can create tours" ON public.tours 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = owner_id);

-- Also fix SELECT policy to target authenticated
DROP POLICY IF EXISTS "Members can view their tours" ON public.tours;
CREATE POLICY "Members can view their tours" ON public.tours 
  FOR SELECT 
  TO authenticated 
  USING (is_tour_member(id));

-- Fix UPDATE policy
DROP POLICY IF EXISTS "TA/MGMT can update tours" ON public.tours;
CREATE POLICY "TA/MGMT can update tours" ON public.tours 
  FOR UPDATE 
  TO authenticated 
  USING (is_tour_admin_or_mgmt(id));

-- Fix DELETE policy  
DROP POLICY IF EXISTS "TA/MGMT can delete tours" ON public.tours;
CREATE POLICY "TA/MGMT can delete tours" ON public.tours 
  FOR DELETE 
  TO authenticated 
  USING (is_tour_admin_or_mgmt(id));

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
