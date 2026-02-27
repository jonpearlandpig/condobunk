
-- Phase 1: Create 5 new AKB tables
-- Phase 2: Add schedule standard fields

-- A) tour_metadata — Tour Profile + Governance (Section 1)
CREATE TABLE public.tour_metadata (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  artist TEXT,
  region TEXT,
  date_range_start DATE,
  date_range_end DATE,
  showtime_standard TEXT,
  primary_interface TEXT,
  akb_purpose TEXT,
  akb_id TEXT,
  tour_code TEXT,
  season TEXT,
  authority TEXT,
  change_policy TEXT,
  source_doc_id UUID REFERENCES public.documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tour_id)
);

ALTER TABLE public.tour_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view tour metadata" ON public.tour_metadata FOR SELECT USING (is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert tour metadata" ON public.tour_metadata FOR INSERT WITH CHECK (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update tour metadata" ON public.tour_metadata FOR UPDATE USING (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete tour metadata" ON public.tour_metadata FOR DELETE USING (is_tour_admin_or_mgmt(tour_id));

CREATE TRIGGER update_tour_metadata_updated_at BEFORE UPDATE ON public.tour_metadata FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- B) tour_policies — Guest/Comp + Safety + SOPs (Sections 7, 8, 10)
CREATE TYPE public.policy_type AS ENUM (
  'GUEST_COMP', 'SAFETY',
  'SOP_PRODUCTION', 'SOP_AUDIO', 'SOP_LIGHTING_VIDEO', 'SOP_SECURITY',
  'SOP_MERCH', 'SOP_VIP', 'SOP_HOSPITALITY', 'SOP_TRANSPORTATION'
);

CREATE TABLE public.tour_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  policy_type public.policy_type NOT NULL,
  policy_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_doc_id UUID REFERENCES public.documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tour_id, policy_type)
);

ALTER TABLE public.tour_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view tour policies" ON public.tour_policies FOR SELECT USING (is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert tour policies" ON public.tour_policies FOR INSERT WITH CHECK (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update tour policies" ON public.tour_policies FOR UPDATE USING (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete tour policies" ON public.tour_policies FOR DELETE USING (is_tour_admin_or_mgmt(tour_id));

CREATE TRIGGER update_tour_policies_updated_at BEFORE UPDATE ON public.tour_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- C) tour_routing — Routing & Hotels per stop (Section 9)
CREATE TABLE public.tour_routing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  event_date DATE,
  city TEXT,
  hotel_name TEXT,
  hotel_checkin DATE,
  hotel_checkout DATE,
  hotel_confirmation TEXT,
  routing_notes TEXT,
  bus_notes TEXT,
  truck_notes TEXT,
  confirmed BOOLEAN NOT NULL DEFAULT false,
  source_doc_id UUID REFERENCES public.documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tour_routing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view tour routing" ON public.tour_routing FOR SELECT USING (is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert tour routing" ON public.tour_routing FOR INSERT WITH CHECK (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update tour routing" ON public.tour_routing FOR UPDATE USING (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete tour routing" ON public.tour_routing FOR DELETE USING (is_tour_admin_or_mgmt(tour_id));

-- D) tour_travel — Structured travel records (Section 6)
CREATE TYPE public.travel_type AS ENUM ('FLIGHT', 'BUS', 'VAN', 'HOTEL', 'REHEARSAL', 'OTHER');

CREATE TABLE public.tour_travel (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  travel_date DATE,
  travel_type public.travel_type NOT NULL DEFAULT 'OTHER',
  description TEXT,
  departure TEXT,
  arrival TEXT,
  hotel_name TEXT,
  hotel_checkin DATE,
  hotel_checkout DATE,
  confirmation TEXT,
  portal_url TEXT,
  special_notices TEXT,
  source_doc_id UUID REFERENCES public.documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tour_travel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view tour travel" ON public.tour_travel FOR SELECT USING (is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert tour travel" ON public.tour_travel FOR INSERT WITH CHECK (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update tour travel" ON public.tour_travel FOR UPDATE USING (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete tour travel" ON public.tour_travel FOR DELETE USING (is_tour_admin_or_mgmt(tour_id));

-- E) tour_escalation_tags — Escalation router (Section 11)
CREATE TABLE public.tour_escalation_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  trigger_topic TEXT,
  route_to_contact TEXT,
  route_to_role TEXT,
  source_doc_id UUID REFERENCES public.documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tour_escalation_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view escalation tags" ON public.tour_escalation_tags FOR SELECT USING (is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert escalation tags" ON public.tour_escalation_tags FOR INSERT WITH CHECK (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update escalation tags" ON public.tour_escalation_tags FOR UPDATE USING (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete escalation tags" ON public.tour_escalation_tags FOR DELETE USING (is_tour_admin_or_mgmt(tour_id));

-- Phase 2: Add schedule standard fields
ALTER TABLE public.schedule_events ADD COLUMN IF NOT EXISTS doors TIMESTAMPTZ;
ALTER TABLE public.schedule_events ADD COLUMN IF NOT EXISTS soundcheck TIMESTAMPTZ;
ALTER TABLE public.schedule_events ADD COLUMN IF NOT EXISTS curfew TIMESTAMPTZ;
ALTER TABLE public.schedule_events ADD COLUMN IF NOT EXISTS is_stop_override BOOLEAN NOT NULL DEFAULT false;

-- Grant access
GRANT ALL ON public.tour_metadata TO authenticated;
GRANT ALL ON public.tour_policies TO authenticated;
GRANT ALL ON public.tour_routing TO authenticated;
GRANT ALL ON public.tour_travel TO authenticated;
GRANT ALL ON public.tour_escalation_tags TO authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
