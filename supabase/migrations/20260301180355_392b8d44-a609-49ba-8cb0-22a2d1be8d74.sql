
-- Create scheduled_messages table
CREATE TABLE public.scheduled_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  tour_id uuid NOT NULL REFERENCES public.tours(id),
  to_phone text NOT NULL,
  message_text text NOT NULL,
  send_at timestamptz NOT NULL,
  sent boolean NOT NULL DEFAULT false,
  is_self boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view own scheduled messages (must be tour member)
CREATE POLICY "Users can view own scheduled messages"
  ON public.scheduled_messages FOR SELECT
  USING (auth.uid() = user_id AND is_tour_member(tour_id));

-- RLS: TA/MGMT can insert scheduled messages
CREATE POLICY "TA/MGMT can insert scheduled messages"
  ON public.scheduled_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_tour_admin_or_mgmt(tour_id));

-- RLS: Users can update own scheduled messages (cancel/edit before send)
CREATE POLICY "Users can update own scheduled messages"
  ON public.scheduled_messages FOR UPDATE
  USING (auth.uid() = user_id AND is_tour_member(tour_id));

-- RLS: Users can delete own scheduled messages
CREATE POLICY "Users can delete own scheduled messages"
  ON public.scheduled_messages FOR DELETE
  USING (auth.uid() = user_id AND is_tour_member(tour_id));

-- Grant permissions to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_messages TO authenticated;

-- Add constraint for message length
ALTER TABLE public.scheduled_messages ADD CONSTRAINT scheduled_messages_text_length CHECK (char_length(message_text) <= 1500);

-- Add constraint for E.164 phone format
ALTER TABLE public.scheduled_messages ADD CONSTRAINT scheduled_messages_phone_e164 CHECK (to_phone ~ '^\+[1-9]\d{1,14}$');
