
-- Add tour_name to tour_invites so the invite page can display it without joining tours table
ALTER TABLE public.tour_invites ADD COLUMN tour_name text;

-- Backfill existing invites
UPDATE public.tour_invites ti
SET tour_name = t.name
FROM public.tours t
WHERE ti.tour_id = t.id AND ti.tour_name IS NULL;
