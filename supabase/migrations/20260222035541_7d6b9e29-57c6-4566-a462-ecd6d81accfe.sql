CREATE OR REPLACE FUNCTION public.auto_create_tour_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _email text;
  _name text;
  _exists boolean;
BEGIN
  -- Get user's email and name from profiles
  SELECT p.email, COALESCE(p.display_name, p.email)
  INTO _email, _name
  FROM public.profiles p WHERE p.id = NEW.user_id;

  IF _email IS NOT NULL THEN
    -- Check if a contact with this email already exists for this tour
    SELECT EXISTS (
      SELECT 1 FROM public.contacts
      WHERE tour_id = NEW.tour_id AND lower(email) = lower(_email) AND scope = 'TOUR'
    ) INTO _exists;

    IF NOT _exists THEN
      INSERT INTO public.contacts (tour_id, name, email, scope, role)
      VALUES (NEW.tour_id, _name, _email, 'TOUR', NEW.role::text)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';