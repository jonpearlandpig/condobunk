
-- Tour invites table for TA to invite users by email
CREATE TABLE public.tour_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.tour_role NOT NULL DEFAULT 'CREW',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_by uuid NOT NULL,
  used_by uuid NULL,
  used_at timestamp with time zone NULL,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tour_invites ENABLE ROW LEVEL SECURITY;

-- TA/MGMT can create invites
CREATE POLICY "TA/MGMT can insert invites"
  ON public.tour_invites FOR INSERT
  WITH CHECK (is_tour_admin_or_mgmt(tour_id));

-- TA/MGMT can view invites for their tour
CREATE POLICY "TA/MGMT can view invites"
  ON public.tour_invites FOR SELECT
  USING (is_tour_admin_or_mgmt(tour_id));

-- TA/MGMT can delete invites
CREATE POLICY "TA/MGMT can delete invites"
  ON public.tour_invites FOR DELETE
  USING (is_tour_admin_or_mgmt(tour_id));

-- Allow anyone authenticated to read an invite by token (for the acceptance flow)
CREATE POLICY "Authenticated users can claim invite by token"
  ON public.tour_invites FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Allow authenticated users to update (mark as used) an invite
CREATE POLICY "Authenticated users can claim invite"
  ON public.tour_invites FOR UPDATE
  USING (auth.uid() IS NOT NULL AND used_by IS NULL AND expires_at > now());

-- User artifacts: private per-user documents (not shared with tour)
CREATE TABLE public.user_artifacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  tour_id uuid NULL REFERENCES public.tours(id) ON DELETE SET NULL,
  title text NOT NULL,
  content text NULL,
  artifact_type text NOT NULL DEFAULT 'note',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own artifacts"
  ON public.user_artifacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own artifacts"
  ON public.user_artifacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own artifacts"
  ON public.user_artifacts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own artifacts"
  ON public.user_artifacts FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_user_artifacts_updated_at
  BEFORE UPDATE ON public.user_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
