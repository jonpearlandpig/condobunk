
-- Fix 1: Revoke SELECT on raw_payload from authenticated to prevent exposure
REVOKE SELECT (raw_payload) ON public.sync_logs FROM authenticated;

-- Fix 2: Update match_contact_tours to only allow checking own email
CREATE OR REPLACE FUNCTION public.match_contact_tours(_email text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT c.tour_id
  FROM public.contacts c
  WHERE lower(c.email) = lower(_email)
    AND c.scope = 'TOUR'
    AND lower(_email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()));
$$;

-- Fix 3: Update handle_new_user to assign CREW instead of MGMT
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url, telauthorium_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    'TID-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 8))
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
    telauthorium_id = CASE WHEN profiles.telauthorium_id IS NULL OR profiles.telauthorium_id = '' 
      THEN 'TID-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 8))
      ELSE profiles.telauthorium_id END;

  -- Auto-add tour membership with CREW role (not MGMT) for safety
  INSERT INTO public.tour_members (tour_id, user_id, role)
  SELECT c.tour_id, NEW.id, 'CREW'::tour_role
  FROM public.contacts c
  WHERE lower(c.email) = lower(NEW.email)
    AND c.scope = 'TOUR'
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
