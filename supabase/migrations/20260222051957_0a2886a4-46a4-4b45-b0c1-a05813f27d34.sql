
-- Create tela_threads table
CREATE TABLE public.tela_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create tela_messages table
CREATE TABLE public.tela_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES public.tela_threads(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_tela_threads_user_tour ON public.tela_threads(user_id, tour_id, updated_at DESC);
CREATE INDEX idx_tela_messages_thread ON public.tela_messages(thread_id, created_at);

-- Enable RLS
ALTER TABLE public.tela_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tela_messages ENABLE ROW LEVEL SECURITY;

-- RLS for tela_threads: users can CRUD their own threads if tour member
CREATE POLICY "Users can view own threads"
  ON public.tela_threads FOR SELECT
  USING (auth.uid() = user_id AND is_tour_member(tour_id));

CREATE POLICY "Users can create own threads"
  ON public.tela_threads FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_tour_member(tour_id));

CREATE POLICY "Users can update own threads"
  ON public.tela_threads FOR UPDATE
  USING (auth.uid() = user_id AND is_tour_member(tour_id));

CREATE POLICY "Users can delete own threads"
  ON public.tela_threads FOR DELETE
  USING (auth.uid() = user_id AND is_tour_member(tour_id));

-- RLS for tela_messages: users can CRUD messages on threads they own
CREATE POLICY "Users can view messages on own threads"
  ON public.tela_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.tela_threads t
    WHERE t.id = thread_id AND t.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert messages on own threads"
  ON public.tela_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tela_threads t
    WHERE t.id = thread_id AND t.user_id = auth.uid()
  ));

CREATE POLICY "Users can update messages on own threads"
  ON public.tela_messages FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.tela_threads t
    WHERE t.id = thread_id AND t.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete messages on own threads"
  ON public.tela_messages FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.tela_threads t
    WHERE t.id = thread_id AND t.user_id = auth.uid()
  ));

-- Trigger for updated_at on threads
CREATE TRIGGER update_tela_threads_updated_at
  BEFORE UPDATE ON public.tela_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on messages
CREATE TRIGGER update_tela_messages_updated_at
  BEFORE UPDATE ON public.tela_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for threads (sidebar updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.tela_threads;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
