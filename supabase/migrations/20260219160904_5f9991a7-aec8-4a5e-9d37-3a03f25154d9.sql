
-- Grant necessary privileges on all tables to authenticated and anon roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tours TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tour_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_gaps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_conflicts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.travel_windows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_inbound TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_outbound TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

-- Also grant anon role basic access (RLS will control actual access)
GRANT SELECT ON public.tours TO anon;
GRANT SELECT ON public.profiles TO anon;
