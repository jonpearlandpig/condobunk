

## Make TELA;QR Show Team-Wide Attribution

### What's Happening Now
The TLDR queries already pull data across the whole tour (not filtered by user), but they **don't include who made each change**. The `akb_change_log` query selects only `change_summary, entity_type, severity, created_at` -- no user info. Same for `user_artifacts` -- no `user_id` or name. So the AI can't say "Sidney updated the post-show food" -- it just says "post-show food was updated."

### What Changes

**1. Add user attribution to context queries**

File: `src/pages/bunk/BunkOverview.tsx` -- in the `generateTldr()` Promise.all block

- `akb_change_log` query: add `user_id` to the select
- `user_artifacts` query: add `user_id` to the select  
- After the Promise.all, do a single profiles lookup for all unique `user_id` values across both result sets (same pattern used in `BunkChangeLog.tsx`)
- Map display names into the context objects:
  - `recent_akb_changes` gets a `changed_by` field (e.g., "Sidney B.")
  - `recent_artifact_updates` gets an `updated_by` field

**2. Update the `generate-tldr` prompt to use attribution**

File: `supabase/functions/generate-tldr/index.ts`

Add to the system prompt:
- "When `changed_by` or `updated_by` fields are present, include the person's name in the briefing item (e.g., 'Sidney updated W2 Post Show Food' instead of 'W2 Post Show Food was updated')."
- "Surface team activity as a feature -- tour managers want to know who is making changes."

### Technical Details

| Item | Detail |
|------|--------|
| Files modified | `src/pages/bunk/BunkOverview.tsx`, `supabase/functions/generate-tldr/index.ts` |
| New queries | None -- just adding `user_id` to existing selects + one profiles lookup |
| Schema changes | None |
| RLS impact | None -- akb_change_log and user_artifacts SELECT policies already allow tour-wide reads |

### Example Output After This Change

```text
> Sidney updated W2 Post Show Food with 4 new stops.  [VIEW]
> Jonathan resolved 2 calendar conflicts for Mar 3-4.  [VIEW]  
> W2 lists Five Guys in 3 of 4 stops -- same as W1. Consider rotating.  [VIEW]
> Next event Feb 28 at Allen County War Memorial, Fort Wayne, IN.
```

