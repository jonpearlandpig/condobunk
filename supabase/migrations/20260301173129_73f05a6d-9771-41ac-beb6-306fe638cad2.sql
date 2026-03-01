
-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- event_reminders: per-event reminder subscriptions
CREATE TABLE public.event_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.schedule_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  phone text NOT NULL,
  remind_before_minutes integer NOT NULL DEFAULT 120,
  remind_type text NOT NULL DEFAULT 'load_in',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id, remind_type)
);

ALTER TABLE public.event_reminders ENABLE ROW LEVEL SECURITY;

-- Users can view their own reminders
CREATE POLICY "Users can view own reminders"
  ON public.event_reminders FOR SELECT
  USING (auth.uid() = user_id AND is_tour_member(tour_id));

-- TA/MGMT can view all reminders for their tour
CREATE POLICY "TA/MGMT can view all reminders"
  ON public.event_reminders FOR SELECT
  USING (is_tour_admin_or_mgmt(tour_id));

-- Users can insert their own reminders (must be tour member)
CREATE POLICY "Users can insert own reminders"
  ON public.event_reminders FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_tour_member(tour_id));

-- Users can update their own reminders
CREATE POLICY "Users can update own reminders"
  ON public.event_reminders FOR UPDATE
  USING (auth.uid() = user_id AND is_tour_member(tour_id));

-- Users can delete their own reminders
CREATE POLICY "Users can delete own reminders"
  ON public.event_reminders FOR DELETE
  USING (auth.uid() = user_id AND is_tour_member(tour_id));

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_reminders TO authenticated;

-- sent_reminders: deduplication log (service role only, no RLS)
CREATE TABLE public.sent_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id uuid REFERENCES public.event_reminders(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.schedule_events(id) ON DELETE CASCADE,
  phone text NOT NULL,
  remind_type text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, phone, remind_type)
);

-- No RLS on sent_reminders - only accessed by service role from cron function

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
