
-- Cascading member removal: only the tour owner can call this
CREATE OR REPLACE FUNCTION public.remove_tour_member(
  _tour_id uuid, _target_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _caller_id uuid := auth.uid();
  _owner_id uuid;
  _target_email text;
BEGIN
  -- Only tour owner can remove
  SELECT owner_id INTO _owner_id FROM tours WHERE id = _tour_id;
  IF _owner_id IS NULL OR _owner_id != _caller_id THEN
    RAISE EXCEPTION 'Only the tour owner can remove members';
  END IF;
  -- Can't remove yourself
  IF _target_user_id = _caller_id THEN
    RAISE EXCEPTION 'Cannot remove yourself';
  END IF;
  -- Get target email for contact/invite cleanup
  SELECT email INTO _target_email FROM profiles WHERE id = _target_user_id;
  -- Remove tour membership
  DELETE FROM tour_members WHERE tour_id = _tour_id AND user_id = _target_user_id;
  -- Remove matching contact records
  IF _target_email IS NOT NULL THEN
    DELETE FROM contacts
      WHERE tour_id = _tour_id AND lower(email) = lower(_target_email) AND scope = 'TOUR';
    -- Revoke unused invites
    DELETE FROM tour_invites
      WHERE tour_id = _tour_id AND lower(email) = lower(_target_email) AND used_at IS NULL;
  END IF;
  RETURN true;
END;
$$;
