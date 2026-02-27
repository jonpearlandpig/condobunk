

## Make TELA;QR Predictive and Pattern-Aware

### The Problem Today
TELA;QR currently reads back schedule data, conflicts, and gaps. It has no awareness of:
- Recent artifact updates (e.g., "W2 Post Show Food added")
- AKB changelog activity (e.g., "TELA updated Gainbridge Fieldhouse")
- **Pattern repetition** across weeks (e.g., ordering from the same restaurant chain two weeks in a row)

The user's example: if W2 Post Show Food lists the same restaurants (Five Guys, Chick-fil-A, CAVA) as W1, TELA should proactively flag "You had Five Guys 8 nights ago -- consider rotating" and offer a skip/alternative.

### What Changes

**1. Feed recent updates + artifact content into the TLDR context (client-side)**

File: `src/pages/bunk/BunkOverview.tsx` -- in `generateTldr()`

Add two new queries to the existing `Promise.all` block:
- `user_artifacts` -- fetch the 10 most recently updated artifacts (visibility `tourtext` or `condobunk`) from the last 48 hours, including their content (truncated to 500 chars each for context window)
- `akb_change_log` -- fetch the 10 most recent changelog entries from the last 48 hours

Also fetch **all** artifacts of a repeating type (like post-show food) for cross-week pattern detection:
- Query artifacts where title matches common patterns (e.g., `%Post Show%`, `%Catering%`) across weeks, pulling content for comparison

Serialize into the context JSON:
```text
recent_artifact_updates: [
  { title, artifact_type, visibility, updated_at, content_preview }
],
recent_akb_changes: [
  { change_summary, entity_type, severity, created_at }
],
pattern_artifacts: [
  { title: "W1 Post Show", content: "..." },
  { title: "W2 Post Show Food", content: "..." }
]
```

**2. Update the `generate-tldr` edge function prompt for predictive intelligence**

File: `supabase/functions/generate-tldr/index.ts`

Add new sections to the system prompt:

- **RECENT UPDATES**: "If `recent_artifact_updates` or `recent_akb_changes` contain entries, include 1-2 briefing items summarizing the most notable changes. Set `actionable: true` and include a `route` field pointing to the relevant page."

- **PATTERN DETECTION (CRITICAL)**: "If `pattern_artifacts` contains multiple entries of the same type (e.g., W1 and W2 post-show food), compare their content for repeated vendors/restaurants/suppliers. If the same vendor appears in consecutive weeks, flag it with a specific callout like 'W2 Post Show Food includes Five Guys again (also in W1 Stop 002 and Stop 004) -- consider rotating.' Set `actionable: true`."

- **PREDICTIVE NUDGES**: "Look for patterns that suggest upcoming issues: same hotel chains, same catering, same vendors across multiple stops. Don't just report data -- surface the insight."

Update the response schema to support an optional `route` field:
```text
Return JSON: [{"text":"...","actionable":true,"route":"/bunk/artifacts"}]
The "route" field is optional. Use it for:
- Artifact updates -> "/bunk/artifacts"
- Changelog items -> "/bunk/changelog"  
- Schedule changes -> "/bunk/calendar"
- Conflicts -> "/bunk/conflicts"
- Gaps -> "/bunk/gaps"
```

**3. Make actionable items clickable with smart routing**

File: `src/pages/bunk/BunkOverview.tsx` -- in the TLDR rendering block (~line 565-593)

Update the click handler for actionable items:
- If the item has a `route` field, navigate directly to that route (show "VIEW" label)
- If no `route`, keep the existing "ASK TELA" behavior that navigates to `/bunk/chat?q=...`

Update the TLDR state type to include the optional route:
```text
tldr: Array<{ text: string; actionable: boolean; route?: string }>
```

Render two button variants:
- Items with `route`: show "VIEW" with a direct navigation link
- Items without `route`: show "ASK TELA" (existing behavior)

### Technical Details

| Item | Detail |
|------|--------|
| Files modified | `src/pages/bunk/BunkOverview.tsx`, `supabase/functions/generate-tldr/index.ts` |
| New DB queries | `user_artifacts` (last 48h + pattern matches), `akb_change_log` (last 48h) |
| Schema changes | None |
| Model | Stays on `gemini-2.5-flash-lite` (pattern detection is comparison, not heavy reasoning) |

### Example TELA;QR Output After This Change

```text
> W2 Post Show Food artifact updated with 4 new stops.  [VIEW]
> W2 lists Five Guys in 3 of 4 stops -- same as W1. Consider rotating to avoid crew fatigue.  [VIEW]
> Tour Wi-Fi info updated in TourText.  [VIEW]
> KOH Advance: Next event Feb 28 at Allen County War Memorial, Fort Wayne, IN.
> 2 open knowledge gaps could block advance work.  [ASK TELA]
```

