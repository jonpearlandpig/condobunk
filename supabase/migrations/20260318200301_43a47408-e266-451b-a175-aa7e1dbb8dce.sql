
-- Create a secure RPC to fetch invite preview data by token (non-sensitive fields only)
CREATE OR REPLACE FUNCTION public.get_invite_preview(_token text)
RETURNS TABLE(
  id uuid,
  tour_id uuid,
  email text,
  role text,
  used_at timestamptz,
  expires_at timestamptz,
  tour_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ti.id, ti.tour_id, ti.email, ti.role::text, ti.used_at, ti.expires_at, ti.tour_name
  FROM public.tour_invites ti
  WHERE ti.token = _token
  LIMIT 1;
$$;

-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Anyone can read invites by token" ON public.tour_invites;
