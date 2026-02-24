
-- Add DEMO to tour_role enum
ALTER TYPE public.tour_role ADD VALUE IF NOT EXISTS 'DEMO';

-- RPC: activate demo mode — adds caller as DEMO member to jonathan's active tours
CREATE OR REPLACE FUNCTION public.activate_demo_mode()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _demo_owner_id uuid := '1385f11a-1337-4ef7-83ac-1bbd62af4781';
  _caller_id uuid := auth.uid();
  _tour_ids uuid[];
BEGIN
  IF _caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Don't let the demo owner activate demo on themselves
  IF _caller_id = _demo_owner_id THEN
    RAISE EXCEPTION 'Demo mode is not available for this account';
  END IF;

  -- Get all active tours owned by jonathan
  SELECT array_agg(id) INTO _tour_ids
  FROM public.tours
  WHERE owner_id = _demo_owner_id AND status = 'ACTIVE';

  IF _tour_ids IS NULL OR array_length(_tour_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No demo tours available';
  END IF;

  -- Add DEMO membership for each tour (skip if already exists)
  INSERT INTO public.tour_members (tour_id, user_id, role)
  SELECT unnest(_tour_ids), _caller_id, 'DEMO'::tour_role
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('tour_count', array_length(_tour_ids, 1));
END;
$$;

-- RPC: deactivate demo mode — removes all DEMO memberships for caller
CREATE OR REPLACE FUNCTION public.deactivate_demo_mode()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller_id uuid := auth.uid();
BEGIN
  IF _caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.tour_members
  WHERE user_id = _caller_id AND role = 'DEMO'::tour_role;

  RETURN true;
END;
$$;
