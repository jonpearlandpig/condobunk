

## Problem

Jon's Google profile picture isn't showing when signed in as jonathan@pearlandpig.com. Two root causes:

1. The `profiles` table has no `avatar_url` column to store the Google profile picture
2. The `handle_new_user` database trigger only saves `id` and `email` -- it ignores Google OAuth metadata like avatar and display name

The app header reads avatar from `user.user_metadata.avatar_url` or `user.user_metadata.picture`, which depends on the auth session metadata being populated. If the metadata wasn't captured properly during sign-up, the avatar won't show.

## Fix Plan

### Step 1: Add `avatar_url` column to `profiles` table

Add an `avatar_url` text column to the profiles table so the Google profile picture URL is persisted.

### Step 2: Update `handle_new_user` trigger

Modify the trigger to also capture `avatar_url` and `display_name` from `raw_user_meta_data` when a new user signs up (including via Google OAuth). Use `ON CONFLICT ... DO UPDATE` so existing profiles also get updated on subsequent logins.

### Step 3: Backfill Jon's profile now

Run a data update to set Jon's `display_name` and `avatar_url` from his current auth metadata so it takes effect immediately without waiting for a new sign-in.

### Step 4: Update the header avatar logic

Update `BunkLayout.tsx` to also check the `profiles` table as a fallback source for avatar URL, so it works even if `user_metadata` is incomplete.

### Technical Details

**Migration SQL:**
```text
-- Add avatar_url column
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
```

**Data backfill for Jon** (using insert tool):
```text
UPDATE profiles
SET display_name = 'Jon Hartman',
    avatar_url = (SELECT raw_user_meta_data->>'picture' FROM auth.users WHERE id = '1385f11a-1337-4ef7-83ac-1bbd62af4781')
WHERE id = '1385f11a-1337-4ef7-83ac-1bbd62af4781';
```

**Code change in BunkLayout.tsx:**
- The existing avatar logic (`user?.user_metadata?.avatar_url || user?.user_metadata?.picture`) will continue to work as-is since Google OAuth populates these fields
- Add a React Query hook or inline fetch to load the profile's `avatar_url` as a fallback if `user_metadata` doesn't have one
