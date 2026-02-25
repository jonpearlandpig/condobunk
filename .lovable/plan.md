

# TELA Intelligence Upgrade — Build Phase 1A + 1B + 3

Starting with the three parallelizable low-effort phases that establish the behavioral baseline for everything that follows.

---

## Phase 1A: Contextual Pre-fill Buttons

Add "Ask TELA" Radio icon buttons to open rows on Gaps, Conflicts, and Coverage pages. Each navigates to `/bunk/chat?scope=tour&q={encodedPrompt}`.

**Files changed:**
- `src/pages/bunk/BunkGaps.tsx` — Add Radio icon button per open gap row. Prompt template: `Help me resolve this gap: "{question}" in the {domain} domain`
- `src/pages/bunk/BunkConflicts.tsx` — Add Radio icon button per conflict row. Prompt template: `Diagnose this conflict: {type} (severity: {severity}). What should I do?`
- `src/pages/bunk/BunkCoverage.tsx` — Review existing "ASK TELA" links and update `domainQuestions` prompts to be more actionable where needed

---

## Phase 1B: Action Outcome Logging

**Database migration:** Create `tela_action_log` table with RLS (INSERT/SELECT scoped to `auth.uid() = user_id`). Includes explicit comment noting Phase 6 service-role aggregation.

```sql
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
ALTER TABLE tela_action_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own logs" ON tela_action_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own logs" ON tela_action_log
  FOR SELECT USING (auth.uid() = user_id);
```

**Files changed:**
- `src/components/bunk/TelaActionCard.tsx` — On approve (`handleCommit` success), insert `{outcome: 'approved'}`; on dismiss (signoff dialog close without commit), insert `{outcome: 'dismissed'}`. Requires passing `tour_id` from `useTour()` context and `user_id` from `useAuth()`.

---

## Phase 3: Smart Thread Titles

**New edge function:** `supabase/functions/generate-thread-title/index.ts`
- Accepts `thread_id`, fetches first 3-4 messages from `tela_messages`
- Calls AI to generate a concise 5-8 word title
- Updates `tela_threads.title`

**Files changed:**
- `src/pages/bunk/BunkChat.tsx` — On component unmount or thread switch, if thread has 2+ assistant messages AND title is still the truncated default (first ~60 chars of first message), fire-and-forget call to `generate-thread-title`

---

## Build Notes

- **Prompt template monitoring (1A):** The pre-fill prompts are the first user-facing signal of TELA's contextual awareness. Watch the first week — if users reword pre-filled queries before sending, the templates need tuning.
- **Learning loop telemetry (1B):** Console.log observability is sufficient for launch. Flag for later: when audit-grade decision tracking becomes a positioning conversation, surface this data somewhere more durable than edge function logs.
- **Thread title trigger (3):** On-blur/unmount only, never mid-conversation. Guard conditions prevent unnecessary calls.

