
-- Guest List Allotments
CREATE TABLE public.guest_list_allotments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.schedule_events(id) ON DELETE SET NULL,
  event_date date NOT NULL,
  venue text NOT NULL,
  city text,
  total_tickets integer NOT NULL DEFAULT 20,
  per_person_max integer NOT NULL DEFAULT 4,
  pickup_instructions text,
  deadline timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_list_allotments ENABLE ROW LEVEL SECURITY;

-- All tour members can view allotments
CREATE POLICY "Members can view allotments"
  ON public.guest_list_allotments FOR SELECT
  USING (public.is_tour_member(tour_id));

CREATE POLICY "TA/MGMT can insert allotments"
  ON public.guest_list_allotments FOR INSERT
  WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can update allotments"
  ON public.guest_list_allotments FOR UPDATE
  USING (public.is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can delete allotments"
  ON public.guest_list_allotments FOR DELETE
  USING (public.is_tour_admin_or_mgmt(tour_id));

GRANT SELECT ON public.guest_list_allotments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.guest_list_allotments TO authenticated;

-- Guest List Requests
CREATE TABLE public.guest_list_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  allotment_id uuid REFERENCES public.guest_list_allotments(id) ON DELETE SET NULL,
  requester_phone text,
  requester_name text,
  requester_user_id uuid,
  guest_names text NOT NULL,
  ticket_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'PENDING',
  status_reason text,
  pickup_info_sent boolean NOT NULL DEFAULT false,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.guest_list_requests ENABLE ROW LEVEL SECURITY;

-- TA/MGMT full CRUD
CREATE POLICY "TA/MGMT can view all requests"
  ON public.guest_list_requests FOR SELECT
  USING (public.is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can insert requests"
  ON public.guest_list_requests FOR INSERT
  WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can update requests"
  ON public.guest_list_requests FOR UPDATE
  USING (public.is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can delete requests"
  ON public.guest_list_requests FOR DELETE
  USING (public.is_tour_admin_or_mgmt(tour_id));

-- Members can view own requests
CREATE POLICY "Members can view own requests"
  ON public.guest_list_requests FOR SELECT
  USING (public.is_tour_member(tour_id) AND requester_user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_list_requests TO authenticated;

-- Index for fast lookups
CREATE INDEX idx_guest_allotments_tour_date ON public.guest_list_allotments(tour_id, event_date);
CREATE INDEX idx_guest_requests_allotment ON public.guest_list_requests(allotment_id, status);
CREATE INDEX idx_guest_requests_tour ON public.guest_list_requests(tour_id, status);

NOTIFY pgrst, 'reload schema';
