
-- Add visibility column to user_artifacts
ALTER TABLE public.user_artifacts
ADD COLUMN visibility text NOT NULL DEFAULT 'condobunk';

-- Add check constraint
ALTER TABLE public.user_artifacts
ADD CONSTRAINT user_artifacts_visibility_check
CHECK (visibility IN ('tourtext', 'condobunk', 'bunk_stash'));

-- Tour members can READ shared (tourtext + condobunk) artifacts for their tour
CREATE POLICY "Tour members can view shared artifacts"
ON public.user_artifacts FOR SELECT
USING (
  visibility IN ('tourtext', 'condobunk')
  AND tour_id IS NOT NULL
  AND is_tour_member(tour_id)
);

-- Reload PostgREST cache
NOTIFY pgrst, 'reload schema';
