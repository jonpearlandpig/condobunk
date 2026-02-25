-- Phase 6: akb-chat aggregates this table across all tour users
-- via service role key (bypasses RLS). This is intentional for
-- behavioral hint generation. No user-facing SELECT crosses boundaries.
CREATE TABLE public.tela_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid REFERENCES tours(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('approved','dismissed')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.tela_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own logs" ON public.tela_action_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own logs" ON public.tela_action_log
  FOR SELECT USING (auth.uid() = user_id);

-- Grant access to authenticated role
GRANT SELECT, INSERT ON public.tela_action_log TO authenticated;