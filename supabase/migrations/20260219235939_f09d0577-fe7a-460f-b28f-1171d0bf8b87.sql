
-- Drop all existing RESTRICTIVE policies and recreate as PERMISSIVE

-- schedule_events
DROP POLICY IF EXISTS "Members can view schedule" ON public.schedule_events;
DROP POLICY IF EXISTS "TA/MGMT can insert schedule" ON public.schedule_events;
DROP POLICY IF EXISTS "TA/MGMT can update schedule" ON public.schedule_events;
DROP POLICY IF EXISTS "TA/MGMT can delete schedule" ON public.schedule_events;

CREATE POLICY "Members can view schedule" ON public.schedule_events FOR SELECT USING (public.is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert schedule" ON public.schedule_events FOR INSERT WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update schedule" ON public.schedule_events FOR UPDATE USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete schedule" ON public.schedule_events FOR DELETE USING (public.is_tour_admin_or_mgmt(tour_id));

-- tours
DROP POLICY IF EXISTS "Users can create tours" ON public.tours;
DROP POLICY IF EXISTS "Members can view their tours" ON public.tours;
DROP POLICY IF EXISTS "Owner can view own tours" ON public.tours;
DROP POLICY IF EXISTS "TA/MGMT can update tours" ON public.tours;
DROP POLICY IF EXISTS "TA/MGMT can delete tours" ON public.tours;

CREATE POLICY "Users can create tours" ON public.tours FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Members can view their tours" ON public.tours FOR SELECT USING (public.is_tour_member(id));
CREATE POLICY "Owner can view own tours" ON public.tours FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "TA/MGMT can update tours" ON public.tours FOR UPDATE USING (public.is_tour_admin_or_mgmt(id));
CREATE POLICY "TA/MGMT can delete tours" ON public.tours FOR DELETE USING (public.is_tour_admin_or_mgmt(id));

-- contacts
DROP POLICY IF EXISTS "Members can view contacts" ON public.contacts;
DROP POLICY IF EXISTS "TA/MGMT can insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "TA/MGMT can update contacts" ON public.contacts;
DROP POLICY IF EXISTS "TA/MGMT can delete contacts" ON public.contacts;

CREATE POLICY "Members can view contacts" ON public.contacts FOR SELECT USING (public.is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert contacts" ON public.contacts FOR INSERT WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update contacts" ON public.contacts FOR UPDATE USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete contacts" ON public.contacts FOR DELETE USING (public.is_tour_admin_or_mgmt(tour_id));

-- documents
DROP POLICY IF EXISTS "Members can view documents" ON public.documents;
DROP POLICY IF EXISTS "TA/MGMT can insert documents" ON public.documents;
DROP POLICY IF EXISTS "TA/MGMT can update documents" ON public.documents;
DROP POLICY IF EXISTS "TA/MGMT can delete documents" ON public.documents;

CREATE POLICY "Members can view documents" ON public.documents FOR SELECT USING (public.is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert documents" ON public.documents FOR INSERT WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update documents" ON public.documents FOR UPDATE USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete documents" ON public.documents FOR DELETE USING (public.is_tour_admin_or_mgmt(tour_id));

-- knowledge_gaps
DROP POLICY IF EXISTS "TA/MGMT can view gaps" ON public.knowledge_gaps;
DROP POLICY IF EXISTS "TA/MGMT can insert gaps" ON public.knowledge_gaps;
DROP POLICY IF EXISTS "TA/MGMT can update gaps" ON public.knowledge_gaps;

CREATE POLICY "TA/MGMT can view gaps" ON public.knowledge_gaps FOR SELECT USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can insert gaps" ON public.knowledge_gaps FOR INSERT WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update gaps" ON public.knowledge_gaps FOR UPDATE USING (public.is_tour_admin_or_mgmt(tour_id));

-- tour_members
DROP POLICY IF EXISTS "Members can view tour members" ON public.tour_members;
DROP POLICY IF EXISTS "TA/MGMT can add members" ON public.tour_members;
DROP POLICY IF EXISTS "TA/MGMT can update members" ON public.tour_members;
DROP POLICY IF EXISTS "TA/MGMT can remove members" ON public.tour_members;

CREATE POLICY "Members can view tour members" ON public.tour_members FOR SELECT USING (public.is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can add members" ON public.tour_members FOR INSERT WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update members" ON public.tour_members FOR UPDATE USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can remove members" ON public.tour_members FOR DELETE USING (public.is_tour_admin_or_mgmt(tour_id));

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- calendar_conflicts
DROP POLICY IF EXISTS "TA/MGMT can view conflicts" ON public.calendar_conflicts;
DROP POLICY IF EXISTS "TA/MGMT can insert conflicts" ON public.calendar_conflicts;
DROP POLICY IF EXISTS "TA/MGMT can update conflicts" ON public.calendar_conflicts;

CREATE POLICY "TA/MGMT can view conflicts" ON public.calendar_conflicts FOR SELECT USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can insert conflicts" ON public.calendar_conflicts FOR INSERT WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update conflicts" ON public.calendar_conflicts FOR UPDATE USING (public.is_tour_admin_or_mgmt(tour_id));

-- finance_lines
DROP POLICY IF EXISTS "TA/MGMT can view finance" ON public.finance_lines;
DROP POLICY IF EXISTS "TA/MGMT can insert finance" ON public.finance_lines;
DROP POLICY IF EXISTS "TA/MGMT can update finance" ON public.finance_lines;
DROP POLICY IF EXISTS "TA/MGMT can delete finance" ON public.finance_lines;

CREATE POLICY "TA/MGMT can view finance" ON public.finance_lines FOR SELECT USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can insert finance" ON public.finance_lines FOR INSERT WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update finance" ON public.finance_lines FOR UPDATE USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete finance" ON public.finance_lines FOR DELETE USING (public.is_tour_admin_or_mgmt(tour_id));

-- travel_windows
DROP POLICY IF EXISTS "Members can view travel" ON public.travel_windows;
DROP POLICY IF EXISTS "TA/MGMT can insert travel" ON public.travel_windows;
DROP POLICY IF EXISTS "TA/MGMT can update travel" ON public.travel_windows;
DROP POLICY IF EXISTS "TA/MGMT can delete travel" ON public.travel_windows;

CREATE POLICY "Members can view travel" ON public.travel_windows FOR SELECT USING (public.is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert travel" ON public.travel_windows FOR INSERT WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update travel" ON public.travel_windows FOR UPDATE USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete travel" ON public.travel_windows FOR DELETE USING (public.is_tour_admin_or_mgmt(tour_id));

-- sms tables
DROP POLICY IF EXISTS "TA/MGMT can view sms_inbound" ON public.sms_inbound;
DROP POLICY IF EXISTS "TA/MGMT can view sms_outbound" ON public.sms_outbound;

CREATE POLICY "TA/MGMT can view sms_inbound" ON public.sms_inbound FOR SELECT USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can view sms_outbound" ON public.sms_outbound FOR SELECT USING (public.is_tour_admin_or_mgmt(tour_id));

-- Recreate missing triggers
CREATE OR REPLACE TRIGGER auto_add_tour_owner
  AFTER INSERT ON public.tours
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_add_tour_owner();

CREATE OR REPLACE TRIGGER handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Reload PostgREST cache
NOTIFY pgrst, 'reload schema';
