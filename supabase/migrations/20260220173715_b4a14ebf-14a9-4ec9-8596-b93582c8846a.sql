
-- Add 15 new JSONB columns to venue_tech_specs for categories 11-25
ALTER TABLE public.venue_tech_specs
  ADD COLUMN IF NOT EXISTS contact_chain_of_command jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS insurance_liability jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS safety_compliance jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS security_crowd_control jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS hospitality_catering jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS comms_infrastructure jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS it_network jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS environmental_conditions jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS local_ordinances jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS financial_settlement jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS venue_history jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS transportation_logistics jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ada_accessibility jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_media_policy jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS load_out_constraints jsonb DEFAULT '{}'::jsonb;

-- Create venue_scores table for computed scores (A-D)
CREATE TABLE public.venue_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tech_spec_id uuid NOT NULL REFERENCES public.venue_tech_specs(id) ON DELETE CASCADE,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  venue_name text NOT NULL,
  risk_score numeric DEFAULT 0,
  risk_factors jsonb DEFAULT '[]'::jsonb,
  compatibility_score numeric DEFAULT 0,
  compatibility_factors jsonb DEFAULT '[]'::jsonb,
  financial_sensitivity_score numeric DEFAULT 0,
  financial_factors jsonb DEFAULT '[]'::jsonb,
  crew_stress_score numeric DEFAULT 0,
  crew_stress_factors jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tech_spec_id)
);

-- Enable RLS
ALTER TABLE public.venue_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view venue scores"
  ON public.venue_scores FOR SELECT
  USING (is_tour_member(tour_id));

CREATE POLICY "TA/MGMT can insert venue scores"
  ON public.venue_scores FOR INSERT
  WITH CHECK (is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can update venue scores"
  ON public.venue_scores FOR UPDATE
  USING (is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can delete venue scores"
  ON public.venue_scores FOR DELETE
  USING (is_tour_admin_or_mgmt(tour_id));

-- Auto-update timestamp trigger
CREATE TRIGGER update_venue_scores_updated_at
  BEFORE UPDATE ON public.venue_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
