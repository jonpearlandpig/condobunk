CREATE TABLE public.tldr_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tour_ids text NOT NULL,
  lines jsonb NOT NULL DEFAULT '[]',
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_tldr_cache_user_tours ON public.tldr_cache (user_id, tour_ids);

ALTER TABLE public.tldr_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own cache" ON public.tldr_cache FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own cache" ON public.tldr_cache FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own cache" ON public.tldr_cache FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own cache" ON public.tldr_cache FOR DELETE USING (auth.uid() = user_id);

GRANT ALL ON public.tldr_cache TO authenticated;