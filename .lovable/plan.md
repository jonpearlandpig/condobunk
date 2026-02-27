

## Critical Security Fix: Bunk Stash Privacy Leak in TELA

### Problem
The TELA chat backend (`akb-chat` edge function) uses the **service-role admin client** to fetch `user_artifacts`, which **bypasses all Row-Level Security**. This means when any user asks TELA a question, ALL artifacts from the tour are loaded into the AI context — including other users' private Bunk Stash items (financial data, HR notes, NDAs, etc.).

Line 124 of `supabase/functions/akb-chat/index.ts`:
```text
admin.from("user_artifacts").select("...").eq("tour_id", tid).limit(20)
```
No visibility or user_id filter is applied.

### Fix

**File: `supabase/functions/akb-chat/index.ts`**

1. **Filter out `bunk_stash` artifacts that don't belong to the requesting user**
   - The function already has access to the authenticated user's ID (from JWT validation)
   - Modify the artifacts query to only include:
     - Artifacts with visibility `tourtext` or `condobunk` (shared with the team)
     - Artifacts with visibility `bunk_stash` **only if** `user_id` matches the requesting user
   - Implementation: Use an `.or()` filter:
     ```text
     .or(`visibility.in.(tourtext,condobunk),and(visibility.eq.bunk_stash,user_id.eq.${userId})`)
     ```

2. **Label Bunk Stash artifacts in the prompt context** so TELA knows not to share private content in responses visible to others (defense-in-depth).

### What This Changes
- Only 1 line in the artifacts query + minor prompt adjustment
- No database changes needed — RLS policies are already correct for direct client access
- The leak only exists because the admin client bypasses RLS

### Single file edit + redeploy. No database migration needed.
