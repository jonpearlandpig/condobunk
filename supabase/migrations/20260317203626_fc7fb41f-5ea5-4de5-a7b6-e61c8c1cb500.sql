
-- ============================================================
-- ADVANCE LEDGER V1 — FULL SCHEMA (tables first, then functions)
-- ============================================================

-- 1) TABLES
-- ============================================================

CREATE TABLE public.advance_field_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL,
  field_key text NOT NULL UNIQUE,
  canonical_label text NOT NULL,
  required_boolean boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  value_type text NOT NULL DEFAULT 'text',
  help_text text,
  section_criticality text NOT NULL DEFAULT 'standard',
  field_criticality text NOT NULL DEFAULT 'standard',
  money_sensitive_boolean boolean NOT NULL DEFAULT false
);

CREATE TABLE public.show_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tid text NOT NULL,
  taid text NOT NULL,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  show_id text,
  event_date date,
  venue_name text,
  venue_city text,
  venue_state text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  last_reviewed_by uuid
);
CREATE INDEX idx_show_advances_tour_id ON public.show_advances(tour_id);
CREATE INDEX idx_show_advances_event_date ON public.show_advances(event_date);

CREATE TABLE public.advance_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_advance_id uuid NOT NULL REFERENCES public.show_advances(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_title text,
  source_datetime timestamptz,
  source_owner text,
  raw_text text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_advance_sources_show_advance_id ON public.advance_sources(show_advance_id);

CREATE TABLE public.advance_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_advance_id uuid NOT NULL REFERENCES public.show_advances(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  field_key text NOT NULL,
  canonical_label text NOT NULL,
  current_value text,
  value_unit text,
  status text NOT NULL DEFAULT 'not_provided',
  flag_level text NOT NULL DEFAULT 'none',
  confidence_score numeric(5,4),
  locked_boolean boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  section_criticality text NOT NULL DEFAULT 'standard',
  field_criticality text NOT NULL DEFAULT 'standard',
  money_sensitive_boolean boolean NOT NULL DEFAULT false,
  UNIQUE(show_advance_id, field_key)
);
CREATE INDEX idx_advance_fields_show_advance_id ON public.advance_fields(show_advance_id);
CREATE INDEX idx_advance_fields_status ON public.advance_fields(status);
CREATE INDEX idx_advance_fields_flag_level ON public.advance_fields(flag_level);
CREATE INDEX idx_advance_fields_field_criticality ON public.advance_fields(field_criticality);

CREATE TABLE public.advance_field_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_field_id uuid NOT NULL REFERENCES public.advance_fields(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.advance_sources(id) ON DELETE CASCADE,
  extracted_value text,
  source_snippet text,
  speaker_name text,
  speaker_role text,
  timestamp_in_source text,
  confidence_score numeric(5,4),
  parser_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_advance_field_evidence_field_id ON public.advance_field_evidence(advance_field_id);
CREATE INDEX idx_advance_field_evidence_source_id ON public.advance_field_evidence(source_id);

CREATE TABLE public.advance_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_advance_id uuid NOT NULL REFERENCES public.show_advances(id) ON DELETE CASCADE,
  severity text NOT NULL,
  category text,
  title text NOT NULL,
  description text,
  linked_field_key text,
  source_ids jsonb,
  status text NOT NULL DEFAULT 'open',
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);
CREATE INDEX idx_advance_flags_show_advance_id ON public.advance_flags(show_advance_id);
CREATE INDEX idx_advance_flags_severity ON public.advance_flags(severity);
CREATE INDEX idx_advance_flags_status ON public.advance_flags(status);

CREATE TABLE public.advance_decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_advance_id uuid NOT NULL REFERENCES public.show_advances(id) ON DELETE CASCADE,
  tai_d text NOT NULL,
  action_type text NOT NULL,
  field_key text,
  prior_value text,
  new_value text,
  rationale text,
  owner_operator text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_advance_decision_log_show_advance_id ON public.advance_decision_log(show_advance_id);

-- ============================================================
-- 2) HELPER FUNCTIONS (tables exist now)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_advance_member(_show_advance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tour_members tm
    JOIN public.show_advances sa ON sa.tour_id = tm.tour_id
    WHERE sa.id = _show_advance_id AND tm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_advance_admin(_show_advance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tour_members tm
    JOIN public.show_advances sa ON sa.tour_id = tm.tour_id
    WHERE sa.id = _show_advance_id AND tm.user_id = auth.uid() AND tm.role IN ('TA', 'MGMT')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_advance_field_member(_advance_field_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tour_members tm
    JOIN public.show_advances sa ON sa.tour_id = tm.tour_id
    JOIN public.advance_fields af ON af.show_advance_id = sa.id
    WHERE af.id = _advance_field_id AND tm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_advance_field_admin(_advance_field_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tour_members tm
    JOIN public.show_advances sa ON sa.tour_id = tm.tour_id
    JOIN public.advance_fields af ON af.show_advance_id = sa.id
    WHERE af.id = _advance_field_id AND tm.user_id = auth.uid() AND tm.role IN ('TA', 'MGMT')
  );
$$;

-- ============================================================
-- 3) VALIDATION TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_show_advance_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'in_review', 'locked', 'ready') THEN
    RAISE EXCEPTION 'Invalid show_advances.status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_show_advance_status BEFORE INSERT OR UPDATE ON public.show_advances FOR EACH ROW EXECUTE FUNCTION public.validate_show_advance_status();

CREATE OR REPLACE FUNCTION public.validate_advance_source_type()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.source_type NOT IN ('transcript', 'manual_note', 'doc_upload', 'email_note') THEN
    RAISE EXCEPTION 'Invalid advance_sources.source_type: %', NEW.source_type;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_advance_source_type BEFORE INSERT OR UPDATE ON public.advance_sources FOR EACH ROW EXECUTE FUNCTION public.validate_advance_source_type();

CREATE OR REPLACE FUNCTION public.validate_advance_field_enums()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('confirmed', 'needs_confirmation', 'conflict', 'not_provided', 'not_applicable') THEN
    RAISE EXCEPTION 'Invalid advance_fields.status: %', NEW.status;
  END IF;
  IF NEW.flag_level NOT IN ('red', 'yellow', 'green', 'none') THEN
    RAISE EXCEPTION 'Invalid advance_fields.flag_level: %', NEW.flag_level;
  END IF;
  IF NEW.section_criticality NOT IN ('critical', 'important', 'standard') THEN
    RAISE EXCEPTION 'Invalid advance_fields.section_criticality: %', NEW.section_criticality;
  END IF;
  IF NEW.field_criticality NOT IN ('critical', 'important', 'standard') THEN
    RAISE EXCEPTION 'Invalid advance_fields.field_criticality: %', NEW.field_criticality;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_advance_field_enums BEFORE INSERT OR UPDATE ON public.advance_fields FOR EACH ROW EXECUTE FUNCTION public.validate_advance_field_enums();

CREATE OR REPLACE FUNCTION public.validate_advance_flag_enums()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.severity NOT IN ('red', 'yellow', 'green') THEN
    RAISE EXCEPTION 'Invalid advance_flags.severity: %', NEW.severity;
  END IF;
  IF NEW.status NOT IN ('open', 'resolved', 'ignored') THEN
    RAISE EXCEPTION 'Invalid advance_flags.status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_advance_flag_enums BEFORE INSERT OR UPDATE ON public.advance_flags FOR EACH ROW EXECUTE FUNCTION public.validate_advance_flag_enums();

CREATE OR REPLACE FUNCTION public.validate_advance_decision_log_type()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.action_type NOT IN ('field_updated', 'field_locked', 'flag_changed', 'source_added', 'conflict_resolved') THEN
    RAISE EXCEPTION 'Invalid advance_decision_log.action_type: %', NEW.action_type;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_advance_decision_log_type BEFORE INSERT OR UPDATE ON public.advance_decision_log FOR EACH ROW EXECUTE FUNCTION public.validate_advance_decision_log_type();

CREATE OR REPLACE FUNCTION public.validate_advance_template_enums()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.section_criticality NOT IN ('critical', 'important', 'standard') THEN
    RAISE EXCEPTION 'Invalid section_criticality: %', NEW.section_criticality;
  END IF;
  IF NEW.field_criticality NOT IN ('critical', 'important', 'standard') THEN
    RAISE EXCEPTION 'Invalid field_criticality: %', NEW.field_criticality;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_advance_template_enums BEFORE INSERT OR UPDATE ON public.advance_field_templates FOR EACH ROW EXECUTE FUNCTION public.validate_advance_template_enums();

-- ============================================================
-- 4) AUTO-SEED TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.seed_advance_fields_on_create()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.advance_fields (
    show_advance_id, section_key, field_key, canonical_label,
    status, flag_level, section_criticality, field_criticality, money_sensitive_boolean
  )
  SELECT NEW.id, t.section_key, t.field_key, t.canonical_label,
    'not_provided', 'none', t.section_criticality, t.field_criticality, t.money_sensitive_boolean
  FROM public.advance_field_templates t;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_seed_advance_fields AFTER INSERT ON public.show_advances FOR EACH ROW EXECUTE FUNCTION public.seed_advance_fields_on_create();

CREATE TRIGGER trg_show_advances_updated_at BEFORE UPDATE ON public.show_advances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_advance_fields_updated_at BEFORE UPDATE ON public.advance_fields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5) RLS
-- ============================================================

ALTER TABLE public.show_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_field_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_decision_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_field_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view show advances" ON public.show_advances FOR SELECT USING (is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert show advances" ON public.show_advances FOR INSERT WITH CHECK (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update show advances" ON public.show_advances FOR UPDATE USING (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete show advances" ON public.show_advances FOR DELETE USING (is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "Members can view advance sources" ON public.advance_sources FOR SELECT USING (is_advance_member(show_advance_id));
CREATE POLICY "TA/MGMT can insert advance sources" ON public.advance_sources FOR INSERT WITH CHECK (is_advance_admin(show_advance_id));
CREATE POLICY "TA/MGMT can update advance sources" ON public.advance_sources FOR UPDATE USING (is_advance_admin(show_advance_id));
CREATE POLICY "TA/MGMT can delete advance sources" ON public.advance_sources FOR DELETE USING (is_advance_admin(show_advance_id));

CREATE POLICY "Members can view advance fields" ON public.advance_fields FOR SELECT USING (is_advance_member(show_advance_id));
CREATE POLICY "TA/MGMT can insert advance fields" ON public.advance_fields FOR INSERT WITH CHECK (is_advance_admin(show_advance_id));
CREATE POLICY "TA/MGMT can update advance fields" ON public.advance_fields FOR UPDATE USING (is_advance_admin(show_advance_id));
CREATE POLICY "TA/MGMT can delete advance fields" ON public.advance_fields FOR DELETE USING (is_advance_admin(show_advance_id));

CREATE POLICY "Members can view advance evidence" ON public.advance_field_evidence FOR SELECT USING (is_advance_field_member(advance_field_id));
CREATE POLICY "TA/MGMT can insert advance evidence" ON public.advance_field_evidence FOR INSERT WITH CHECK (is_advance_field_admin(advance_field_id));
CREATE POLICY "TA/MGMT can update advance evidence" ON public.advance_field_evidence FOR UPDATE USING (is_advance_field_admin(advance_field_id));
CREATE POLICY "TA/MGMT can delete advance evidence" ON public.advance_field_evidence FOR DELETE USING (is_advance_field_admin(advance_field_id));

CREATE POLICY "Members can view advance flags" ON public.advance_flags FOR SELECT USING (is_advance_member(show_advance_id));
CREATE POLICY "TA/MGMT can insert advance flags" ON public.advance_flags FOR INSERT WITH CHECK (is_advance_admin(show_advance_id));
CREATE POLICY "TA/MGMT can update advance flags" ON public.advance_flags FOR UPDATE USING (is_advance_admin(show_advance_id));
CREATE POLICY "TA/MGMT can delete advance flags" ON public.advance_flags FOR DELETE USING (is_advance_admin(show_advance_id));

-- APPEND-ONLY: INSERT only for decision_log
CREATE POLICY "Members can view decision log" ON public.advance_decision_log FOR SELECT USING (is_advance_member(show_advance_id));
CREATE POLICY "TA/MGMT can insert decision log" ON public.advance_decision_log FOR INSERT WITH CHECK (is_advance_admin(show_advance_id));

CREATE POLICY "Authenticated can view templates" ON public.advance_field_templates FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 6) GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.show_advances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advance_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advance_fields TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advance_field_evidence TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advance_flags TO authenticated;
GRANT SELECT, INSERT ON public.advance_decision_log TO authenticated;
GRANT SELECT ON public.advance_field_templates TO authenticated;

-- ============================================================
-- 7) READINESS VIEW
-- ============================================================

CREATE OR REPLACE VIEW public.v_show_advance_readiness AS
SELECT
  sa.id AS show_advance_id,
  sa.tour_id,
  sa.status,
  (SELECT count(*) FROM public.advance_fields af
   WHERE af.show_advance_id = sa.id
     AND af.field_criticality = 'critical'
     AND NOT (af.status = 'confirmed' AND af.locked_boolean = true)
  ) AS critical_unresolved_count,
  (SELECT count(*) FROM public.advance_flags fl
   WHERE fl.show_advance_id = sa.id AND fl.severity = 'red' AND fl.status = 'open'
  ) AS red_flag_open_count,
  CASE
    WHEN (SELECT count(*) FROM public.advance_fields af
          WHERE af.show_advance_id = sa.id AND af.field_criticality = 'critical'
            AND NOT (af.status = 'confirmed' AND af.locked_boolean = true)) > 0
      THEN 'not_ready'
    WHEN (SELECT count(*) FROM public.advance_flags fl
          WHERE fl.show_advance_id = sa.id AND fl.severity = 'red' AND fl.status = 'open') > 0
      THEN 'not_ready'
    WHEN (SELECT count(*) FROM public.advance_flags fl
          WHERE fl.show_advance_id = sa.id AND fl.severity = 'yellow' AND fl.status = 'open') > 0
      THEN 'needs_review'
    ELSE 'ready'
  END AS readiness_status
FROM public.show_advances sa;

GRANT SELECT ON public.v_show_advance_readiness TO authenticated;

-- ============================================================
-- 8) SEED TEMPLATES
-- ============================================================

INSERT INTO public.advance_field_templates (section_key, field_key, canonical_label, required_boolean, display_order, value_type, section_criticality, field_criticality, money_sensitive_boolean) VALUES
('EVENT_DETAILS', 'day_and_date', 'Day and Date', true, 1, 'date', 'important', 'important', false),
('EVENT_DETAILS', 'venue_name', 'Venue', true, 2, 'text', 'important', 'important', false),
('EVENT_DETAILS', 'venue_mode', 'Venue Mode', false, 3, 'text', 'important', 'standard', false),
('EVENT_DETAILS', 'onsale_capacity', 'Onsale Capacity', false, 4, 'number', 'important', 'standard', false),
('EVENT_DETAILS', 'rider_version_sent', 'Sent Production Rider - Version 1', false, 5, 'text', 'important', 'standard', false),
('EVENT_DETAILS', 'bus_arrival_time', 'Bus Arrival Time to Venue', false, 6, 'time', 'important', 'important', false),
('PRODUCTION_CONTACT', 'production_contact_name', 'Name', true, 1, 'text', 'critical', 'critical', false),
('PRODUCTION_CONTACT', 'production_contact_phone', 'Phone', true, 2, 'phone', 'critical', 'critical', false),
('PRODUCTION_CONTACT', 'production_contact_email', 'Email', false, 3, 'email', 'critical', 'important', false),
('PRODUCTION_CONTACT', 'production_contact_notes', 'Notes', false, 4, 'textarea', 'critical', 'standard', false),
('HOUSE_RIGGER_CONTACT', 'house_rigger_name', 'Name', false, 1, 'text', 'important', 'important', false),
('HOUSE_RIGGER_CONTACT', 'house_rigger_phone', 'Phone', false, 2, 'phone', 'important', 'important', false),
('HOUSE_RIGGER_CONTACT', 'house_rigger_email', 'Email', false, 3, 'email', 'important', 'standard', false),
('HOUSE_RIGGER_CONTACT', 'house_rigger_notes', 'Notes', false, 4, 'textarea', 'important', 'standard', false),
('SUMMARY', 'venue_cad_received', 'Have we received the venue CAD with seating', true, 1, 'boolean', 'critical', 'critical', false),
('SUMMARY', 'rigging_overlay_submitted', 'Rigging Overlay done and submitted', true, 2, 'boolean', 'critical', 'critical', false),
('SUMMARY', 'distance_to_low_steel', 'Distance to low steel', false, 3, 'text', 'critical', 'standard', false),
('SCHEDULE', 'load_in_call_time', 'Load in call time', true, 1, 'time', 'critical', 'critical', false),
('SCHEDULE', 'show_call', 'Show Call', false, 2, 'time', 'critical', 'standard', false),
('SCHEDULE', 'chair_set', 'Chair Set', false, 3, 'text', 'critical', 'standard', false),
('SCHEDULE', 'show_times', 'Show times', true, 4, 'text', 'critical', 'critical', false),
('SCHEDULE', 'labor_call_back', 'Labour call back', false, 5, 'time', 'critical', 'standard', false),
('PLANT_EQUIPMENT', 'forklift_5k_confirmed', '1 x 5K Forklift with 6'' tines', true, 1, 'boolean_or_text', 'critical', 'critical', false),
('PLANT_EQUIPMENT', 'forklift_3k_confirmed', '1 x 3K Forklift', true, 2, 'boolean_or_text', 'critical', 'critical', false),
('PLANT_EQUIPMENT', 'co2_confirmed', 'CO2 Confirmed?', false, 3, 'boolean', 'critical', 'important', false),
('PLANT_EQUIPMENT', 'shore_power_notes', 'Shore Power / Plant Notes', false, 4, 'textarea', 'critical', 'standard', false),
('LABOR', 'union_venue', 'Is it a Union venue', true, 1, 'boolean', 'important', 'critical', false),
('LABOR', 'labor_notes', 'Labor Notes', false, 2, 'textarea', 'important', 'standard', false),
('LABOR', 'labor_estimate_received', 'Do I have a copy of the labor estimate?', true, 3, 'boolean', 'important', 'critical', true),
('LABOR', 'labor_call', 'Labor Call', false, 4, 'text', 'important', 'important', false),
('LABOR', 'lunch_headcount', 'Number to Feed for Lunch', false, 5, 'number', 'important', 'standard', false),
('LABOR', 'dinner_headcount', 'Number to Feed for Dinner', false, 6, 'number', 'important', 'standard', false),
('LABOR', 'house_electrician_catering_truck', 'House Electrician for Catering Truck - 4:30am', false, 7, 'text', 'important', 'standard', false),
('LABOR', 'followspot_notes', '5 Follow Robospots. Use Riggers as ops', false, 8, 'textarea', 'important', 'standard', false),
('SETTLEMENT_AND_COST', 'estimated_labor_cost', 'Estimated Labor Cost', false, 1, 'currency', 'important', 'standard', true),
('SETTLEMENT_AND_COST', 'estimated_rigging_cost', 'Estimated Rigging Cost', false, 2, 'currency', 'important', 'standard', true),
('SETTLEMENT_AND_COST', 'estimated_forklift_cost', 'Estimated Forklift Cost', false, 3, 'currency', 'important', 'standard', true),
('SETTLEMENT_AND_COST', 'estimated_power_cost', 'Estimated Power Cost', false, 4, 'currency', 'important', 'standard', true),
('SETTLEMENT_AND_COST', 'settlement_notes', 'Settlement Notes', false, 5, 'textarea', 'important', 'standard', true),
('SETTLEMENT_AND_COST', 'cost_risk_notes', 'Cost Risk Notes', false, 6, 'textarea', 'important', 'standard', true);

NOTIFY pgrst, 'reload schema';
