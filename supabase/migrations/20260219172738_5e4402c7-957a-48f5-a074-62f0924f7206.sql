
-- Drop all existing RESTRICTIVE policies on tours
DROP POLICY IF EXISTS "Users can create tours" ON public.tours;
DROP POLICY IF EXISTS "Members can view their tours" ON public.tours;
DROP POLICY IF EXISTS "TA/MGMT can update tours" ON public.tours;
DROP POLICY IF EXISTS "TA/MGMT can delete tours" ON public.tours;

-- Recreate as PERMISSIVE (which is the default)
CREATE POLICY "Users can create tours" ON public.tours
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Members can view their tours" ON public.tours
  FOR SELECT TO authenticated
  USING (is_tour_member(id));

-- Owner can also view tours they just created (before tour_members trigger runs in same transaction)
CREATE POLICY "Owner can view own tours" ON public.tours
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "TA/MGMT can update tours" ON public.tours
  FOR UPDATE TO authenticated
  USING (is_tour_admin_or_mgmt(id));

CREATE POLICY "TA/MGMT can delete tours" ON public.tours
  FOR DELETE TO authenticated
  USING (is_tour_admin_or_mgmt(id));

-- Ensure the auto_add_tour_owner trigger exists
DROP TRIGGER IF EXISTS auto_add_tour_owner ON public.tours;
CREATE TRIGGER auto_add_tour_owner
  AFTER INSERT ON public.tours
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_add_tour_owner();

-- Reload PostgREST cache
NOTIFY pgrst, 'reload schema';
