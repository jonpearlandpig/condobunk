-- Add DELETE policy for knowledge_gaps so archived doc cleanup works
CREATE POLICY "TA/MGMT can delete gaps"
ON public.knowledge_gaps
FOR DELETE
USING (is_tour_admin_or_mgmt(tour_id));

-- Add DELETE policy for calendar_conflicts
CREATE POLICY "TA/MGMT can delete conflicts"
ON public.calendar_conflicts
FOR DELETE
USING (is_tour_admin_or_mgmt(tour_id));