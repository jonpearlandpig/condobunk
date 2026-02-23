

## Cache TL;DR Briefing (30-Minute TTL + Manual Refresh)

### Step 1: Database Migration -- Create `tldr_cache` table

```sql
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
```

### Step 2: Update `generateTldr` in `BunkOverview.tsx`

Add a `forceRefresh` parameter to the function. The logic becomes:

```
1. Build cache key = sorted tour IDs joined by comma
2. If NOT forceRefresh:
   a. Query tldr_cache WHERE user_id = current user AND tour_ids = key
   b. If found AND generated_at is less than 30 minutes old -> use cached lines, return early
3. Call generate-tldr edge function as before
4. Upsert result into tldr_cache (DELETE old row, INSERT new)
```

### Step 3: Wire up cache bypass triggers

- **`akb-changed` event**: calls `generateTldr(true)` to force-refresh
- **Pull-to-refresh**: calls `generateTldr(true)` to force-refresh
- **Normal page load / tour change**: calls `generateTldr()` which checks cache first

### Step 4: Add manual "Refresh" button

Add a small refresh icon button next to the "DAILY BRIEFING" header. Clicking it calls `generateTldr(true)` to bypass cache and get a fresh AI-generated briefing on demand.

---

### What This Saves

With a 30-minute cache, if a user visits the overview 10 times in 30 minutes, only the first visit calls the AI. The other 9 serve instantly from the database at zero AI cost.

