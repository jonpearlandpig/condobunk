
-- Add FK from tour_members.user_id to profiles.id so PostgREST can resolve the join
ALTER TABLE public.tour_members
ADD CONSTRAINT tour_members_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
