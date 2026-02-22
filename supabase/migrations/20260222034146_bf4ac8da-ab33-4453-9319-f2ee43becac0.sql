-- Add avatar_url column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Update handle_new_user to capture OAuth metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);

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

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';