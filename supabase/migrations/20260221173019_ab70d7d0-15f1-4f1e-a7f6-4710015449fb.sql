
-- 1. Add user-tracking columns to schedule_events
ALTER TABLE public.schedule_events
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Create change log for AKB audit trail
CREATE TABLE public.akb_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  entity_type text NOT NULL,           -- 'schedule_event', 'venue_tech_spec', 'venue_advance_note', 'contact', etc.
  entity_id uuid NOT NULL,
  action text NOT NULL,                -- 'CREATE', 'UPDATE', 'DELETE'
  change_summary text,                 -- human-readable summary
  change_detail jsonb DEFAULT '{}'::jsonb, -- field-level diff
  severity text NOT NULL DEFAULT 'INFO', -- 'INFO', 'IMPORTANT', 'CRITICAL'
  affects_safety boolean NOT NULL DEFAULT false,
  affects_time boolean NOT NULL DEFAULT false,
  affects_money boolean NOT NULL DEFAULT false,
  event_date date,                     -- the show date affected, for 0-3 day window check
  notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.akb_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view change log"
  ON public.akb_change_log FOR SELECT
  USING (is_tour_member(tour_id));

CREATE POLICY "TA/MGMT can insert change log"
  ON public.akb_change_log FOR INSERT
  WITH CHECK (is_tour_admin_or_mgmt(tour_id));

-- 3. Notification preferences per user per tour
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  notify_schedule_changes boolean NOT NULL DEFAULT true,
  notify_contact_changes boolean NOT NULL DEFAULT false,
  notify_venue_changes boolean NOT NULL DEFAULT true,
  notify_finance_changes boolean NOT NULL DEFAULT false,
  day_window integer NOT NULL DEFAULT 3,           -- 0-N days out to trigger notifications
  min_severity text NOT NULL DEFAULT 'IMPORTANT',  -- 'INFO', 'IMPORTANT', 'CRITICAL'
  safety_always boolean NOT NULL DEFAULT true,     -- always notify for safety regardless
  time_always boolean NOT NULL DEFAULT true,       -- always notify for time-impact
  money_always boolean NOT NULL DEFAULT true,      -- always notify for money-impact
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tour_id)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification prefs"
  ON public.notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification prefs"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification prefs"
  ON public.notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notification prefs"
  ON public.notification_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- TA/MGMT can also view all prefs for their tour (to set defaults)
CREATE POLICY "TA/MGMT can view tour notification prefs"
  ON public.notification_preferences FOR SELECT
  USING (is_tour_admin_or_mgmt(tour_id));

-- 4. Tour-level default notification settings
CREATE TABLE public.tour_notification_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid NOT NULL UNIQUE REFERENCES public.tours(id) ON DELETE CASCADE,
  notify_schedule_changes boolean NOT NULL DEFAULT true,
  notify_contact_changes boolean NOT NULL DEFAULT false,
  notify_venue_changes boolean NOT NULL DEFAULT true,
  notify_finance_changes boolean NOT NULL DEFAULT false,
  day_window integer NOT NULL DEFAULT 3,
  min_severity text NOT NULL DEFAULT 'IMPORTANT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tour_notification_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view tour notification defaults"
  ON public.tour_notification_defaults FOR SELECT
  USING (is_tour_member(tour_id));

CREATE POLICY "TA/MGMT can insert tour notification defaults"
  ON public.tour_notification_defaults FOR INSERT
  WITH CHECK (is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can update tour notification defaults"
  ON public.tour_notification_defaults FOR UPDATE
  USING (is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can delete tour notification defaults"
  ON public.tour_notification_defaults FOR DELETE
  USING (is_tour_admin_or_mgmt(tour_id));

-- 5. Trigger to auto-update updated_at on schedule_events
CREATE TRIGGER update_schedule_events_updated_at
  BEFORE UPDATE ON public.schedule_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Triggers for notification pref updated_at
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tour_notification_defaults_updated_at
  BEFORE UPDATE ON public.tour_notification_defaults
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Grant permissions
GRANT ALL ON public.akb_change_log TO authenticated;
GRANT ALL ON public.notification_preferences TO authenticated;
GRANT ALL ON public.tour_notification_defaults TO authenticated;

NOTIFY pgrst, 'reload schema';
