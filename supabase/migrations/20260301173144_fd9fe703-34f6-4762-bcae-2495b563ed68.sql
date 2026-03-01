
-- Enable RLS on sent_reminders but add no policies (service role bypasses RLS)
ALTER TABLE public.sent_reminders ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
