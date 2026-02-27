
ALTER TABLE public.sms_inbound
  ADD COLUMN category text NOT NULL DEFAULT 'general';

ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_inbound;
