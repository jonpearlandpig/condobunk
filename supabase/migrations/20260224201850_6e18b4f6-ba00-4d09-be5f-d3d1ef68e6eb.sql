
-- Create demo_activations tracking table
CREATE TABLE public.demo_activations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  user_email text,
  user_name text,
  activated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  deactivated_at timestamptz
);

-- Enable RLS
ALTER TABLE public.demo_activations ENABLE ROW LEVEL SECURITY;

-- Jonathan (demo owner) can see all activations
CREATE POLICY "Demo owner can view all activations"
ON public.demo_activations
FOR SELECT
USING (
  auth.uid() = '1385f11a-1337-4ef7-83ac-1bbd62af4781'::uuid
);

-- Users can see their own activations
CREATE POLICY "Users can view own activations"
ON public.demo_activations
FOR SELECT
USING (auth.uid() = user_id);

-- No direct INSERT/UPDATE/DELETE for authenticated role — only RPCs write

-- Grant SELECT to authenticated
GRANT SELECT ON public.demo_activations TO authenticated;

-- Update activate_demo_mode() to track activations
CREATE OR REPLACE FUNCTION public.activate_demo_mode()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _demo_owner_id uuid := '1385f11a-1337-4ef7-83ac-1bbd62af4781';
  _caller_id uuid := auth.uid();
  _tour_ids uuid[];
  _existing_activation record;
  _caller_email text;
  _caller_name text;
  _expires timestamptz;
BEGIN
  IF _caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _caller_id = _demo_owner_id THEN
    RAISE EXCEPTION 'Demo mode is not available for this account';
  END IF;

  -- Check for existing active (non-expired) demo session
  SELECT * INTO _existing_activation
  FROM public.demo_activations
  WHERE user_id = _caller_id
    AND deactivated_at IS NULL
    AND expires_at > now()
  LIMIT 1;

  IF FOUND THEN
    -- Return existing session info
    RETURN jsonb_build_object(
      'tour_count', (SELECT count(*) FROM public.tour_members WHERE user_id = _caller_id AND role = 'DEMO'),
      'expires_at', _existing_activation.expires_at,
      'already_active', true
    );
  END IF;

  -- Get caller's profile info
  SELECT email, display_name INTO _caller_email, _caller_name
  FROM public.profiles WHERE id = _caller_id;

  -- Get all active tours owned by jonathan
  SELECT array_agg(id) INTO _tour_ids
  FROM public.tours
  WHERE owner_id = _demo_owner_id AND status = 'ACTIVE';

  IF _tour_ids IS NULL OR array_length(_tour_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No demo tours available';
  END IF;

  _expires := now() + interval '24 hours';

  -- Add DEMO membership for each tour
  INSERT INTO public.tour_members (tour_id, user_id, role)
  SELECT unnest(_tour_ids), _caller_id, 'DEMO'::tour_role
  ON CONFLICT DO NOTHING;

  -- Log the activation
  INSERT INTO public.demo_activations (user_id, user_email, user_name, expires_at)
  VALUES (_caller_id, _caller_email, _caller_name, _expires);

  RETURN jsonb_build_object(
    'tour_count', array_length(_tour_ids, 1),
    'expires_at', _expires,
    'user_email', _caller_email,
    'user_name', _caller_name,
    'already_active', false
  );
END;
$function$;

-- Update deactivate_demo_mode() to mark activations
CREATE OR REPLACE FUNCTION public.deactivate_demo_mode()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller_id uuid := auth.uid();
BEGIN
  IF _caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Remove DEMO memberships
  DELETE FROM public.tour_members
  WHERE user_id = _caller_id AND role = 'DEMO'::tour_role;

  -- Mark all active demo_activations as deactivated
  UPDATE public.demo_activations
  SET deactivated_at = now()
  WHERE user_id = _caller_id
    AND deactivated_at IS NULL;

  RETURN true;
END;
$function$;

-- Create cleanup function for expired demos
CREATE OR REPLACE FUNCTION public.cleanup_expired_demos()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Delete DEMO memberships for expired activations
  DELETE FROM public.tour_members
  WHERE role = 'DEMO'::tour_role
    AND user_id IN (
      SELECT user_id FROM public.demo_activations
      WHERE deactivated_at IS NULL AND expires_at < now()
    );

  -- Mark those activations as deactivated
  UPDATE public.demo_activations
  SET deactivated_at = now()
  WHERE deactivated_at IS NULL AND expires_at < now();
END;
$function$;

-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
