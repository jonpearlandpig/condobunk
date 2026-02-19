-- Allow TA/MGMT to delete tours
CREATE POLICY "TA/MGMT can delete tours"
ON public.tours
FOR DELETE
USING (is_tour_admin_or_mgmt(id));
