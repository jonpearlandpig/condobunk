
CREATE OR REPLACE FUNCTION public.accept_tour_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _invite record;
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find valid invite
  SELECT * INTO _invite
  FROM public.tour_invites
  WHERE token = _token
    AND used_at IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found, already used, or expired';
  END IF;

  -- Add tour membership (skip if already exists)
  INSERT INTO public.tour_members (tour_id, user_id, role)
  VALUES (_invite.tour_id, _user_id, _invite.role)
  ON CONFLICT DO NOTHING;

  -- Mark invite as used
  UPDATE public.tour_invites
  SET used_by = _user_id, used_at = now()
  WHERE id = _invite.id;

  RETURN jsonb_build_object('tour_id', _invite.tour_id, 'role', _invite.role);
END;
$$;
