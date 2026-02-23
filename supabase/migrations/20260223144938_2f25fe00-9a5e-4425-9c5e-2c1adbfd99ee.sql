
-- Drop overly permissive storage policies
DROP POLICY IF EXISTS "Tour members can view document files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload document files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete document files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view document files" ON storage.objects;

-- Tour-member-scoped SELECT policy
CREATE POLICY "Tour members can view document files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'document-files' AND 
  EXISTS (
    SELECT 1 FROM public.tour_members tm
    WHERE tm.user_id = auth.uid()
    AND tm.tour_id::text = (storage.foldername(name))[1]
  )
);

-- TA/MGMT-scoped INSERT policy
CREATE POLICY "TA/MGMT can upload document files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'document-files' AND
  EXISTS (
    SELECT 1 FROM public.tour_members tm
    WHERE tm.user_id = auth.uid()
    AND tm.tour_id::text = (storage.foldername(name))[1]
    AND tm.role IN ('TA', 'MGMT')
  )
);

-- TA/MGMT-scoped DELETE policy
CREATE POLICY "TA/MGMT can delete document files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'document-files' AND
  EXISTS (
    SELECT 1 FROM public.tour_members tm
    WHERE tm.user_id = auth.uid()
    AND tm.tour_id::text = (storage.foldername(name))[1]
    AND tm.role IN ('TA', 'MGMT')
  )
);
