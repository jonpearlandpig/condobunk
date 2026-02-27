

## Make TELA Aware of User Artifacts

### Problem
TELA's backend (`akb-chat` edge function) fetches data from 8 tables (schedule_events, contacts, knowledge_gaps, calendar_conflicts, documents, venue_advance_notes, tour_routing, tour_policies) but does NOT query `user_artifacts`. Artifacts are invisible to TELA.

### Solution
Add a `user_artifacts` query to the `akb-chat` edge function so artifact content is included in TELA's context window.

### Changes

**File: `supabase/functions/akb-chat/index.ts`**

1. In the parallel data fetch block (~line 115), add a 9th query for `user_artifacts`:
   ```
   admin.from("user_artifacts")
     .select("id, title, artifact_type, visibility, content, updated_at")
     .eq("tour_id", tid)
     .order("updated_at", { ascending: false })
     .limit(20)
   ```
   Also include user-owned artifacts without a tour_id by running a second query filtered by `user_id` (for "bunk_stash" visibility artifacts).

2. Add the artifacts data to the tour data object returned from the parallel map (~line 147):
   ```
   artifacts: artifactsRes.data || []
   ```

3. Add an "Artifacts" section to both the global and single-tour AKB data sections (~lines 167-231):
   ```
   ### User Artifacts (Pre-law notes, checklists, documents):
   ${td.artifacts.map(a => `[${a.artifact_type}] "${a.title}" (visibility: ${a.visibility}, updated: ${a.updated_at}):\n${a.content?.substring(0, 1500) || "(empty)"}`).join("\n---\n")}
   ```

4. Add a note in the system prompt's source citation examples:
   ```
   - "Post-show food details noted in artifact [Source: Artifact — post show food]"
   ```

### Technical Details

| File | Change |
|------|--------|
| `supabase/functions/akb-chat/index.ts` | Add user_artifacts query to parallel fetch, include in AKB data section for both global and scoped modes, add source citation example |

### Content truncation
Artifact content is capped at 1,500 characters per artifact (20 artifacts max) to avoid blowing up the context window. This keeps token usage reasonable while giving TELA enough content to answer questions about artifact notes.

### No database changes needed
The `user_artifacts` table already exists with appropriate RLS policies. The edge function uses the service role key, so it can read all artifacts scoped to the tour.

