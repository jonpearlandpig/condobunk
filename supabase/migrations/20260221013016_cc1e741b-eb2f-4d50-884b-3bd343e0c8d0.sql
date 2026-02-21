
-- Security definer function to find tour_ids matching an email in contacts
CREATE OR REPLACE FUNCTION public.match_contact_tours(_email text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT c.tour_id
  FROM public.contacts c
  WHERE lower(c.email) = lower(_email)
    AND c.scope = 'TOUR';
$$;
