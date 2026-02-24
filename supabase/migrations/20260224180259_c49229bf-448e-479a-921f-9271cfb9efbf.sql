ALTER TABLE public.contacts ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
NOTIFY pgrst, 'reload schema';