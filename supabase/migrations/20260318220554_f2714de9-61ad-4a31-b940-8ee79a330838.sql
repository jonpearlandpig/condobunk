-- Tour production documents (rider, rigging plot, etc.) — tour-scoped
CREATE TABLE public.tour_production_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  file_type text,
  document_category text NOT NULL DEFAULT 'production_rider',
  processing_status text NOT NULL DEFAULT 'uploaded',
  processing_error text,
  file_name text NOT NULL,
  file_path text NOT NULL
);

ALTER TABLE public.tour_production_docs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tour_production_docs TO authenticated;

CREATE POLICY "Members can view tour production docs" ON public.tour_production_docs
  FOR SELECT TO authenticated USING (is_tour_member(tour_id));

CREATE POLICY "TA/MGMT can insert tour production docs" ON public.tour_production_docs
  FOR INSERT TO authenticated WITH CHECK (is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can update tour production docs" ON public.tour_production_docs
  FOR UPDATE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can delete tour production docs" ON public.tour_production_docs
  FOR DELETE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));

-- Validation trigger
CREATE OR REPLACE FUNCTION public.validate_tour_production_doc_enums()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.document_category NOT IN ('production_rider','rigging_plot','input_list','patch_list') THEN
    RAISE EXCEPTION 'Invalid document_category: %', NEW.document_category;
  END IF;
  IF NEW.processing_status NOT IN ('uploaded','processing','complete','failed') THEN
    RAISE EXCEPTION 'Invalid processing_status: %', NEW.processing_status;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_tour_production_doc
  BEFORE INSERT OR UPDATE ON public.tour_production_docs
  FOR EACH ROW EXECUTE FUNCTION public.validate_tour_production_doc_enums();

-- Tour production extractions — structured JSON from parsed rider/rigging docs
CREATE TABLE public.tour_production_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.tour_production_docs(id) ON DELETE CASCADE,
  extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  extraction_confidence jsonb DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tour_production_extractions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tour_production_extractions TO authenticated;

CREATE POLICY "Members can view tour production extractions" ON public.tour_production_extractions
  FOR SELECT TO authenticated USING (is_tour_member(tour_id));

CREATE POLICY "TA/MGMT can insert tour production extractions" ON public.tour_production_extractions
  FOR INSERT TO authenticated WITH CHECK (is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can update tour production extractions" ON public.tour_production_extractions
  FOR UPDATE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can delete tour production extractions" ON public.tour_production_extractions
  FOR DELETE TO authenticated USING (is_tour_admin_or_mgmt(tour_id));

-- Storage policy for production-docs path
CREATE POLICY "Tour members can access production docs" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'document-files'
    AND (storage.foldername(name))[2] = 'production-docs'
    AND is_tour_member((storage.foldername(name))[1]::uuid)
  )
  WITH CHECK (
    bucket_id = 'document-files'
    AND (storage.foldername(name))[2] = 'production-docs'
    AND is_tour_admin_or_mgmt((storage.foldername(name))[1]::uuid)
  );

NOTIFY pgrst, 'reload schema';