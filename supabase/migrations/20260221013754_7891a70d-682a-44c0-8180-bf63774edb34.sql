
-- When a tour_member is inserted, ensure a TOUR contact exists for them
CREATE OR REPLACE FUNCTION public.auto_create_tour_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _email text;
  _name text;
BEGIN
  -- Get user's email and name from profiles
  SELECT p.email, COALESCE(p.display_name, p.email)
  INTO _email, _name
  FROM public.profiles p WHERE p.id = NEW.user_id;

  IF _email IS NOT NULL THEN
    INSERT INTO public.contacts (tour_id, name, email, scope, role)
    VALUES (NEW.tour_id, _name, _email, 'TOUR', NEW.role::text)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_contact_on_member
AFTER INSERT ON public.tour_members
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_tour_contact();
