
-- ═══════════════════════════════════════════════════════════
-- Venue Tech Specs: structured tech pack data per venue
-- ═══════════════════════════════════════════════════════════

CREATE TABLE public.venue_tech_specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  source_doc_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  venue_name text NOT NULL,
  normalized_venue_name text NOT NULL,

  -- Structured sections as JSONB (10 categories)
  venue_identity jsonb DEFAULT '{}'::jsonb,
  stage_specs jsonb DEFAULT '{}'::jsonb,
  rigging_system jsonb DEFAULT '{}'::jsonb,
  dock_load_in jsonb DEFAULT '{}'::jsonb,
  power jsonb DEFAULT '{}'::jsonb,
  lighting_audio jsonb DEFAULT '{}'::jsonb,
  wardrobe_laundry jsonb DEFAULT '{}'::jsonb,
  labor_union jsonb DEFAULT '{}'::jsonb,
  permanent_installations jsonb DEFAULT '{}'::jsonb,
  production_compatibility jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.venue_tech_specs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view tech specs"
  ON public.venue_tech_specs FOR SELECT
  USING (public.is_tour_member(tour_id));

CREATE POLICY "TA/MGMT can insert tech specs"
  ON public.venue_tech_specs FOR INSERT
  WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can update tech specs"
  ON public.venue_tech_specs FOR UPDATE
  USING (public.is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can delete tech specs"
  ON public.venue_tech_specs FOR DELETE
  USING (public.is_tour_admin_or_mgmt(tour_id));

CREATE TRIGGER update_venue_tech_specs_updated_at
  BEFORE UPDATE ON public.venue_tech_specs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════
-- Venue Risk Flags: operational risks identified from tech packs
-- ═══════════════════════════════════════════════════════════

CREATE TYPE public.risk_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE public.venue_risk_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  tech_spec_id uuid NOT NULL REFERENCES public.venue_tech_specs(id) ON DELETE CASCADE,
  venue_name text NOT NULL,
  category text NOT NULL,
  risk_title text NOT NULL,
  risk_detail text,
  severity public.risk_severity NOT NULL DEFAULT 'MEDIUM',
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_risk_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view risk flags"
  ON public.venue_risk_flags FOR SELECT
  USING (public.is_tour_member(tour_id));

CREATE POLICY "TA/MGMT can insert risk flags"
  ON public.venue_risk_flags FOR INSERT
  WITH CHECK (public.is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can update risk flags"
  ON public.venue_risk_flags FOR UPDATE
  USING (public.is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can delete risk flags"
  ON public.venue_risk_flags FOR DELETE
  USING (public.is_tour_admin_or_mgmt(tour_id));
