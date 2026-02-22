
-- Add change_reason to akb_change_log
ALTER TABLE public.akb_change_log ADD COLUMN change_reason text;

-- Add telauthorium_id to profiles
ALTER TABLE public.profiles ADD COLUMN telauthorium_id text UNIQUE;

-- Backfill existing profiles
UPDATE public.profiles SET telauthorium_id = 'TID-' || upper(substr(replace(id::text, '-', ''), 1, 8))
WHERE telauthorium_id IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE public.profiles ALTER COLUMN telauthorium_id SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN telauthorium_id SET DEFAULT '';

-- Update handle_new_user trigger to auto-assign TID
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Auto-add tour membership if email matches a TOUR-scoped contact
  INSERT INTO public.tour_members (tour_id, user_id, role)
  SELECT c.tour_id, NEW.id, 'MGMT'::tour_role
  FROM public.contacts c
  WHERE lower(c.email) = lower(NEW.email)
    AND c.scope = 'TOUR'
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
