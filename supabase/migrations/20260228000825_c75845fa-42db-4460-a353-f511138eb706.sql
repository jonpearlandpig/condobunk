
CREATE OR REPLACE FUNCTION public.claim_contact_tours()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _matched int := 0;
  _inserted int := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT lower(email) INTO _email FROM auth.users WHERE id = _uid;
  IF _email IS NULL THEN
    RETURN jsonb_build_object('matched', 0, 'inserted', 0);
  END IF;

  WITH matched_tours AS (
    SELECT DISTINCT c.tour_id
    FROM public.contacts c
    WHERE lower(c.email) = _email
      AND c.scope = 'TOUR'
  )
  SELECT count(*) INTO _matched FROM matched_tours;

  INSERT INTO public.tour_members (tour_id, user_id, role)
  SELECT mt.tour_id, _uid, 'CREW'::tour_role
  FROM (
    SELECT DISTINCT c.tour_id
    FROM public.contacts c
    WHERE lower(c.email) = _email
      AND c.scope = 'TOUR'
  ) mt
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tour_members tm
    WHERE tm.tour_id = mt.tour_id AND tm.user_id = _uid
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS _inserted = ROW_COUNT;

  RETURN jsonb_build_object('matched', _matched, 'inserted', _inserted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_contact_tours() TO authenticated;

NOTIFY pgrst, 'reload schema';
