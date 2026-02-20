
-- User presence tracking
CREATE TABLE public.user_presence (
  user_id uuid NOT NULL PRIMARY KEY,
  is_online boolean NOT NULL DEFAULT false,
  last_active_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can see presence
CREATE POLICY "Authenticated users can view presence"
  ON public.user_presence FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can upsert their own presence
CREATE POLICY "Users can upsert own presence"
  ON public.user_presence FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presence"
  ON public.user_presence FOR UPDATE
  USING (auth.uid() = user_id);

-- Enable realtime for presence
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;

-- Direct messages table
CREATE TABLE public.direct_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  message_text text NOT NULL,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Sender and recipient can view their messages (scoped to tour membership)
CREATE POLICY "Users can view their DMs"
  ON public.direct_messages FOR SELECT
  USING (
    (auth.uid() = sender_id OR auth.uid() = recipient_id)
    AND is_tour_member(tour_id)
  );

CREATE POLICY "Tour members can send DMs"
  ON public.direct_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND is_tour_member(tour_id)
  );

CREATE POLICY "Recipients can update DMs (mark read)"
  ON public.direct_messages FOR UPDATE
  USING (auth.uid() = recipient_id AND is_tour_member(tour_id));

-- Enable realtime for DMs
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;

-- Index for fast lookups
CREATE INDEX idx_dm_participants ON public.direct_messages (tour_id, sender_id, recipient_id);
CREATE INDEX idx_dm_created ON public.direct_messages (created_at DESC);
