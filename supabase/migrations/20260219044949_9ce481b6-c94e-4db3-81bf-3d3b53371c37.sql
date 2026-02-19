
-- Tour member role enum
CREATE TYPE public.tour_role AS ENUM ('TA', 'MGMT', 'CREW');

-- AKB state enum
CREATE TYPE public.akb_state AS ENUM ('BUILDING', 'SOVEREIGN', 'CONFLICT');

-- Tour status enum
CREATE TYPE public.tour_status AS ENUM ('ACTIVE', 'ARCHIVED');

-- Doc type enum
CREATE TYPE public.doc_type AS ENUM ('SCHEDULE', 'CONTACTS', 'RUN_OF_SHOW', 'TECH', 'FINANCE', 'TRAVEL', 'LOGISTICS', 'HOSPITALITY', 'CAST', 'VENUE', 'UNKNOWN');

-- Conflict type enum
CREATE TYPE public.conflict_type AS ENUM ('OVERLAP_SHOW_TIMES', 'MISSING_LOAD_IN', 'TRAVEL_OVERLAP_EVENT', 'DUPLICATE_VENUE_SAME_DATE', 'DATE_PARSE_AMBIGUITY', 'DUPLICATE_CONTACT_DIFFERENT_ROLE', 'MISSING_REQUIRED_FIELDS');

-- Conflict severity enum
CREATE TYPE public.conflict_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- SMS status enum
CREATE TYPE public.sms_status AS ENUM ('queued', 'sent', 'failed');

-- ===== PROFILES TABLE =====
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== TOURS TABLE =====
CREATE TABLE public.tours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL,
  status public.tour_status NOT NULL DEFAULT 'ACTIVE',
  akb_state public.akb_state NOT NULL DEFAULT 'BUILDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tours ENABLE ROW LEVEL SECURITY;

-- ===== TOUR MEMBERS TABLE =====
CREATE TABLE public.tour_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.tour_role NOT NULL DEFAULT 'CREW',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tour_id, user_id)
);
ALTER TABLE public.tour_members ENABLE ROW LEVEL SECURITY;

-- ===== HELPER FUNCTIONS =====
CREATE OR REPLACE FUNCTION public.is_tour_member(_tour_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tour_members
    WHERE tour_id = _tour_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tour_admin_or_mgmt(_tour_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tour_members
    WHERE tour_id = _tour_id AND user_id = auth.uid() AND role IN ('TA', 'MGMT')
  );
$$;

-- ===== RLS: TOURS =====
CREATE POLICY "Members can view their tours" ON public.tours FOR SELECT USING (public.is_tour_member(id));
CREATE POLICY "TA/MGMT can insert tours" ON public.tours FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "TA/MGMT can update tours" ON public.tours FOR UPDATE USING (public.is_tour_admin_or_mgmt(id));

-- ===== RLS: TOUR MEMBERS =====
CREATE POLICY "Members can view tour members" ON public.tour_members FOR SELECT USING (public.is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can add members" ON public.tour_members FOR INSERT WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update members" ON public.tour_members FOR UPDATE USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can remove members" ON public.tour_members FOR DELETE USING (public.is_tour_admin_or_mgmt(tour_id));

-- ===== DOCUMENTS TABLE =====
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  doc_type public.doc_type NOT NULL DEFAULT 'UNKNOWN',
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT false,
  raw_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view documents" ON public.documents FOR SELECT USING (public.is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert documents" ON public.documents FOR INSERT WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update documents" ON public.documents FOR UPDATE USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete documents" ON public.documents FOR DELETE USING (public.is_tour_admin_or_mgmt(tour_id));

-- ===== SCHEDULE EVENTS =====
CREATE TABLE public.schedule_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  city TEXT,
  venue TEXT,
  event_date DATE,
  load_in TIMESTAMPTZ,
  show_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  source_doc_id UUID REFERENCES public.documents(id),
  confidence_score NUMERIC(3,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.schedule_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view schedule" ON public.schedule_events FOR SELECT USING (public.is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert schedule" ON public.schedule_events FOR INSERT WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update schedule" ON public.schedule_events FOR UPDATE USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete schedule" ON public.schedule_events FOR DELETE USING (public.is_tour_admin_or_mgmt(tour_id));

-- ===== CONTACTS =====
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  email TEXT,
  source_doc_id UUID REFERENCES public.documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view contacts" ON public.contacts FOR SELECT USING (public.is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert contacts" ON public.contacts FOR INSERT WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update contacts" ON public.contacts FOR UPDATE USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete contacts" ON public.contacts FOR DELETE USING (public.is_tour_admin_or_mgmt(tour_id));

-- ===== FINANCE LINES =====
CREATE TABLE public.finance_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  category TEXT,
  amount NUMERIC(12,2),
  venue TEXT,
  line_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "TA/MGMT can view finance" ON public.finance_lines FOR SELECT USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can insert finance" ON public.finance_lines FOR INSERT WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update finance" ON public.finance_lines FOR UPDATE USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete finance" ON public.finance_lines FOR DELETE USING (public.is_tour_admin_or_mgmt(tour_id));

-- ===== TRAVEL WINDOWS =====
CREATE TABLE public.travel_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  user_id UUID,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.travel_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view travel" ON public.travel_windows FOR SELECT USING (public.is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert travel" ON public.travel_windows FOR INSERT WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update travel" ON public.travel_windows FOR UPDATE USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete travel" ON public.travel_windows FOR DELETE USING (public.is_tour_admin_or_mgmt(tour_id));

-- ===== SMS INBOUND =====
CREATE TABLE public.sms_inbound (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID REFERENCES public.tours(id) ON DELETE CASCADE,
  from_phone TEXT NOT NULL,
  user_id UUID,
  message_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_inbound ENABLE ROW LEVEL SECURITY;
CREATE POLICY "TA/MGMT can view sms_inbound" ON public.sms_inbound FOR SELECT USING (public.is_tour_admin_or_mgmt(tour_id));

-- ===== SMS OUTBOUND =====
CREATE TABLE public.sms_outbound (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID REFERENCES public.tours(id) ON DELETE CASCADE,
  to_phone TEXT NOT NULL,
  message_text TEXT NOT NULL,
  status public.sms_status NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_outbound ENABLE ROW LEVEL SECURITY;
CREATE POLICY "TA/MGMT can view sms_outbound" ON public.sms_outbound FOR SELECT USING (public.is_tour_admin_or_mgmt(tour_id));

-- ===== KNOWLEDGE GAPS =====
CREATE TABLE public.knowledge_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  domain TEXT,
  user_id UUID,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_gaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "TA/MGMT can view gaps" ON public.knowledge_gaps FOR SELECT USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can insert gaps" ON public.knowledge_gaps FOR INSERT WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update gaps" ON public.knowledge_gaps FOR UPDATE USING (public.is_tour_admin_or_mgmt(tour_id));

-- ===== CALENDAR CONFLICTS =====
CREATE TABLE public.calendar_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.schedule_events(id),
  conflict_type public.conflict_type NOT NULL,
  severity public.conflict_severity NOT NULL DEFAULT 'MEDIUM',
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.calendar_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "TA/MGMT can view conflicts" ON public.calendar_conflicts FOR SELECT USING (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can insert conflicts" ON public.calendar_conflicts FOR INSERT WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update conflicts" ON public.calendar_conflicts FOR UPDATE USING (public.is_tour_admin_or_mgmt(tour_id));

-- ===== AUTO-ADD OWNER AS TA =====
CREATE OR REPLACE FUNCTION public.auto_add_tour_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tour_members (tour_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'TA');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_tour_created
  AFTER INSERT ON public.tours
  FOR EACH ROW EXECUTE FUNCTION public.auto_add_tour_owner();
