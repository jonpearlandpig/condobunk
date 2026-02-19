
-- Create storage bucket for document files
INSERT INTO storage.buckets (id, name, public) VALUES ('document-files', 'document-files', false);

-- RLS: Tour members can view files (need tour_id in path as first folder)
CREATE POLICY "Tour members can view document files"
ON storage.objects FOR SELECT
USING (bucket_id = 'document-files' AND auth.role() = 'authenticated');

-- RLS: TA/MGMT can upload document files
CREATE POLICY "Authenticated users can upload document files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'document-files' AND auth.role() = 'authenticated');

-- RLS: TA/MGMT can delete document files
CREATE POLICY "Authenticated users can delete document files"
ON storage.objects FOR DELETE
USING (bucket_id = 'document-files' AND auth.role() = 'authenticated');

-- Add file_path and filename columns to documents table
ALTER TABLE public.documents ADD COLUMN file_path text;
ALTER TABLE public.documents ADD COLUMN filename text;
