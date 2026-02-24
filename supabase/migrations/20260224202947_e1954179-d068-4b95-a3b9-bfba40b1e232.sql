
-- Create upgrade_requests table
CREATE TABLE public.upgrade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text,
  user_name text,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING',
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);

-- Enable RLS
ALTER TABLE public.upgrade_requests ENABLE ROW LEVEL SECURITY;

-- Users can insert their own requests
CREATE POLICY "Users can insert own upgrade requests"
ON public.upgrade_requests FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can view their own requests
CREATE POLICY "Users can view own upgrade requests"
ON public.upgrade_requests FOR SELECT
USING (auth.uid() = user_id);

-- Demo owner (jonathan) can view all requests
CREATE POLICY "Demo owner can view all upgrade requests"
ON public.upgrade_requests FOR SELECT
USING (auth.uid() = '1385f11a-1337-4ef7-83ac-1bbd62af4781'::uuid);

-- Demo owner can update requests (approve/deny)
CREATE POLICY "Demo owner can update upgrade requests"
ON public.upgrade_requests FOR UPDATE
USING (auth.uid() = '1385f11a-1337-4ef7-83ac-1bbd62af4781'::uuid);

-- Grant access
GRANT SELECT, INSERT ON public.upgrade_requests TO authenticated;
GRANT UPDATE ON public.upgrade_requests TO authenticated;

-- Approve upgrade request RPC
CREATE OR REPLACE FUNCTION public.approve_upgrade_request(_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller_id uuid := auth.uid();
  _demo_owner_id uuid := '1385f11a-1337-4ef7-83ac-1bbd62af4781';
  _req record;
BEGIN
  IF _caller_id IS NULL OR _caller_id != _demo_owner_id THEN
    RAISE EXCEPTION 'Only the tour owner can approve requests';
  END IF;

  SELECT * INTO _req FROM public.upgrade_requests
  WHERE id = _request_id AND status = 'PENDING';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already resolved';
  END IF;

  -- Upgrade all DEMO memberships for this user to CREW
  UPDATE public.tour_members
  SET role = 'CREW'::tour_role
  WHERE user_id = _req.user_id AND role = 'DEMO'::tour_role;

  -- Mark request as approved
  UPDATE public.upgrade_requests
  SET status = 'APPROVED', resolved_at = now(), resolved_by = _caller_id
  WHERE id = _request_id;

  -- Clear demo activation expiry so it doesn't auto-expire
  UPDATE public.demo_activations
  SET deactivated_at = now()
  WHERE user_id = _req.user_id AND deactivated_at IS NULL;

  RETURN true;
END;
$$;

-- Deny upgrade request RPC
CREATE OR REPLACE FUNCTION public.deny_upgrade_request(_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller_id uuid := auth.uid();
  _demo_owner_id uuid := '1385f11a-1337-4ef7-83ac-1bbd62af4781';
  _req record;
BEGIN
  IF _caller_id IS NULL OR _caller_id != _demo_owner_id THEN
    RAISE EXCEPTION 'Only the tour owner can deny requests';
  END IF;

  SELECT * INTO _req FROM public.upgrade_requests
  WHERE id = _request_id AND status = 'PENDING';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already resolved';
  END IF;

  -- Mark request as denied
  UPDATE public.upgrade_requests
  SET status = 'DENIED', resolved_at = now(), resolved_by = _caller_id
  WHERE id = _request_id;

  RETURN true;
END;
$$;

-- Notify schema change
NOTIFY pgrst, 'reload schema';
