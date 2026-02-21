
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  -- Auto-add tour membership if email matches a TOUR-scoped contact
  INSERT INTO public.tour_members (tour_id, user_id, role)
  SELECT c.tour_id, NEW.id, 'MGMT'::tour_role
  FROM public.contacts c
  WHERE lower(c.email) = lower(NEW.email)
    AND c.scope = 'TOUR'
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
