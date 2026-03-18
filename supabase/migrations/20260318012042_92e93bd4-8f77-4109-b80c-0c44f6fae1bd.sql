
-- Table 1: advance_venue_docs
CREATE TABLE public.advance_venue_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_advance_id UUID NOT NULL REFERENCES public.show_advances(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  document_category TEXT NOT NULL DEFAULT 'tech_packet',
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_status TEXT NOT NULL DEFAULT 'uploaded',
  processing_error TEXT,
  processed_at TIMESTAMPTZ
);

-- Table 2: advance_venue_extractions
CREATE TABLE public.advance_venue_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_advance_id UUID NOT NULL REFERENCES public.show_advances(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.advance_venue_docs(id) ON DELETE CASCADE,
  extracted_data JSONB NOT NULL DEFAULT '{}',
  extraction_confidence JSONB DEFAULT '{}',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table 3: advance_intelligence_reports
CREATE TABLE public.advance_intelligence_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_advance_id UUID NOT NULL REFERENCES public.show_advances(id) ON DELETE CASCADE,
  venue_capability_summary TEXT,
  comparison_results JSONB DEFAULT '[]',
  green_lights JSONB DEFAULT '[]',
  yellow_flags JSONB DEFAULT '[]',
  red_flags JSONB DEFAULT '[]',
  missing_unknown JSONB DEFAULT '[]',
  draft_advance_questions JSONB DEFAULT '[]',
  draft_internal_notes JSONB DEFAULT '[]',
  edited_questions JSONB,
  edited_internal_notes JSONB,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID REFERENCES auth.users(id)
);

-- Validation triggers
CREATE OR REPLACE FUNCTION public.validate_venue_doc_enums()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.document_category NOT IN ('tech_packet','production_book','rigging_guide','venue_map','power_sheet','equipment_list') THEN
    RAISE EXCEPTION 'Invalid document_category: %', NEW.document_category;
  END IF;
  IF NEW.processing_status NOT IN ('uploaded','processing','complete','failed') THEN
    RAISE EXCEPTION 'Invalid processing_status: %', NEW.processing_status;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_venue_doc
  BEFORE INSERT OR UPDATE ON public.advance_venue_docs
  FOR EACH ROW EXECUTE FUNCTION public.validate_venue_doc_enums();

-- RLS
ALTER TABLE public.advance_venue_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_venue_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_intelligence_reports ENABLE ROW LEVEL SECURITY;

-- advance_venue_docs policies
CREATE POLICY "Members can view venue docs" ON public.advance_venue_docs
  FOR SELECT TO authenticated USING (public.is_advance_member(show_advance_id));
CREATE POLICY "Admins can insert venue docs" ON public.advance_venue_docs
  FOR INSERT TO authenticated WITH CHECK (public.is_advance_admin(show_advance_id));
CREATE POLICY "Admins can update venue docs" ON public.advance_venue_docs
  FOR UPDATE TO authenticated USING (public.is_advance_admin(show_advance_id));
CREATE POLICY "Admins can delete venue docs" ON public.advance_venue_docs
  FOR DELETE TO authenticated USING (public.is_advance_admin(show_advance_id));

-- advance_venue_extractions policies
CREATE POLICY "Members can view extractions" ON public.advance_venue_extractions
  FOR SELECT TO authenticated USING (public.is_advance_member(show_advance_id));
CREATE POLICY "Admins can insert extractions" ON public.advance_venue_extractions
  FOR INSERT TO authenticated WITH CHECK (public.is_advance_admin(show_advance_id));
CREATE POLICY "Admins can update extractions" ON public.advance_venue_extractions
  FOR UPDATE TO authenticated USING (public.is_advance_admin(show_advance_id));
CREATE POLICY "Admins can delete extractions" ON public.advance_venue_extractions
  FOR DELETE TO authenticated USING (public.is_advance_admin(show_advance_id));

-- advance_intelligence_reports policies
CREATE POLICY "Members can view reports" ON public.advance_intelligence_reports
  FOR SELECT TO authenticated USING (public.is_advance_member(show_advance_id));
CREATE POLICY "Admins can insert reports" ON public.advance_intelligence_reports
  FOR INSERT TO authenticated WITH CHECK (public.is_advance_admin(show_advance_id));
CREATE POLICY "Admins can update reports" ON public.advance_intelligence_reports
  FOR UPDATE TO authenticated USING (public.is_advance_admin(show_advance_id));
CREATE POLICY "Admins can delete reports" ON public.advance_intelligence_reports
  FOR DELETE TO authenticated USING (public.is_advance_admin(show_advance_id));

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advance_venue_docs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advance_venue_extractions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advance_intelligence_reports TO authenticated;

-- Updated_at trigger for intelligence reports
CREATE TRIGGER trg_intelligence_reports_updated_at
  BEFORE UPDATE ON public.advance_intelligence_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notify PostgREST
NOTIFY pgrst, 'reload schema';
