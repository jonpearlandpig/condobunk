
-- Fix RESTRICTIVE RLS policies on all key tables to PERMISSIVE

-- schedule_events
DROP POLICY IF EXISTS "Members can view schedule" ON public.schedule_events;
DROP POLICY IF EXISTS "TA/MGMT can insert schedule" ON public.schedule_events;
DROP POLICY IF EXISTS "TA/MGMT can update schedule" ON public.schedule_events;
DROP POLICY IF EXISTS "TA/MGMT can delete schedule" ON public.schedule_events;

CREATE POLICY "Members can view schedule" ON public.schedule_events FOR SELECT TO authenticated USING (is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert schedule" ON public.schedule_events FOR INSERT TO authenticated WITH CHECK (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update schedule" ON public.schedule_events FOR UPDATE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete schedule" ON public.schedule_events FOR DELETE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));

-- knowledge_gaps
DROP POLICY IF EXISTS "TA/MGMT can view gaps" ON public.knowledge_gaps;
DROP POLICY IF EXISTS "TA/MGMT can insert gaps" ON public.knowledge_gaps;
DROP POLICY IF EXISTS "TA/MGMT can update gaps" ON public.knowledge_gaps;

CREATE POLICY "TA/MGMT can view gaps" ON public.knowledge_gaps FOR SELECT TO authenticated USING (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can insert gaps" ON public.knowledge_gaps FOR INSERT TO authenticated WITH CHECK (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update gaps" ON public.knowledge_gaps FOR UPDATE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));

-- contacts
DROP POLICY IF EXISTS "Members can view contacts" ON public.contacts;
DROP POLICY IF EXISTS "TA/MGMT can insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "TA/MGMT can update contacts" ON public.contacts;
DROP POLICY IF EXISTS "TA/MGMT can delete contacts" ON public.contacts;

CREATE POLICY "Members can view contacts" ON public.contacts FOR SELECT TO authenticated USING (is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update contacts" ON public.contacts FOR UPDATE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete contacts" ON public.contacts FOR DELETE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));

-- documents
DROP POLICY IF EXISTS "Members can view documents" ON public.documents;
DROP POLICY IF EXISTS "TA/MGMT can insert documents" ON public.documents;
DROP POLICY IF EXISTS "TA/MGMT can update documents" ON public.documents;
DROP POLICY IF EXISTS "TA/MGMT can delete documents" ON public.documents;

CREATE POLICY "Members can view documents" ON public.documents FOR SELECT TO authenticated USING (is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert documents" ON public.documents FOR INSERT TO authenticated WITH CHECK (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update documents" ON public.documents FOR UPDATE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete documents" ON public.documents FOR DELETE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));

-- finance_lines
DROP POLICY IF EXISTS "TA/MGMT can view finance" ON public.finance_lines;
DROP POLICY IF EXISTS "TA/MGMT can insert finance" ON public.finance_lines;
DROP POLICY IF EXISTS "TA/MGMT can update finance" ON public.finance_lines;
DROP POLICY IF EXISTS "TA/MGMT can delete finance" ON public.finance_lines;

CREATE POLICY "TA/MGMT can view finance" ON public.finance_lines FOR SELECT TO authenticated USING (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can insert finance" ON public.finance_lines FOR INSERT TO authenticated WITH CHECK (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update finance" ON public.finance_lines FOR UPDATE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete finance" ON public.finance_lines FOR DELETE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));

-- calendar_conflicts
DROP POLICY IF EXISTS "TA/MGMT can view conflicts" ON public.calendar_conflicts;
DROP POLICY IF EXISTS "TA/MGMT can insert conflicts" ON public.calendar_conflicts;
DROP POLICY IF EXISTS "TA/MGMT can update conflicts" ON public.calendar_conflicts;

CREATE POLICY "TA/MGMT can view conflicts" ON public.calendar_conflicts FOR SELECT TO authenticated USING (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can insert conflicts" ON public.calendar_conflicts FOR INSERT TO authenticated WITH CHECK (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update conflicts" ON public.calendar_conflicts FOR UPDATE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));

-- tour_members
DROP POLICY IF EXISTS "Members can view tour members" ON public.tour_members;
DROP POLICY IF EXISTS "TA/MGMT can add members" ON public.tour_members;
DROP POLICY IF EXISTS "TA/MGMT can update members" ON public.tour_members;
DROP POLICY IF EXISTS "TA/MGMT can remove members" ON public.tour_members;

CREATE POLICY "Members can view tour members" ON public.tour_members FOR SELECT TO authenticated USING (is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can add members" ON public.tour_members FOR INSERT TO authenticated WITH CHECK (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update members" ON public.tour_members FOR UPDATE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can remove members" ON public.tour_members FOR DELETE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- travel_windows
DROP POLICY IF EXISTS "Members can view travel" ON public.travel_windows;
DROP POLICY IF EXISTS "TA/MGMT can insert travel" ON public.travel_windows;
DROP POLICY IF EXISTS "TA/MGMT can update travel" ON public.travel_windows;
DROP POLICY IF EXISTS "TA/MGMT can delete travel" ON public.travel_windows;

CREATE POLICY "Members can view travel" ON public.travel_windows FOR SELECT TO authenticated USING (is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert travel" ON public.travel_windows FOR INSERT TO authenticated WITH CHECK (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update travel" ON public.travel_windows FOR UPDATE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete travel" ON public.travel_windows FOR DELETE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));

-- sms tables
DROP POLICY IF EXISTS "TA/MGMT can view sms_inbound" ON public.sms_inbound;
CREATE POLICY "TA/MGMT can view sms_inbound" ON public.sms_inbound FOR SELECT TO authenticated USING (is_tour_admin_or_mgmt(tour_id));

DROP POLICY IF EXISTS "TA/MGMT can view sms_outbound" ON public.sms_outbound;
CREATE POLICY "TA/MGMT can view sms_outbound" ON public.sms_outbound FOR SELECT TO authenticated USING (is_tour_admin_or_mgmt(tour_id));

-- Reload PostgREST cache
NOTIFY pgrst, 'reload schema';
