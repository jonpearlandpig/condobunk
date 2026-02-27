

## Add Quick-Access Artifacts Under Ask TELA in Sidebar

### What Changes

Add a new collapsible "Artifacts" section directly below the "Ask TELA" threads section in the left sidebar. This gives users quick access to view, create, and navigate to their artifacts without leaving the current page.

### New Component

**New file: `src/components/bunk/SidebarArtifacts.tsx`**

A lightweight sidebar section that:

- Shows a collapsible header with the StickyNote icon, "Artifacts" label, and count badge (matching the style of "Ask TELA" and "Tour Team" sections)
- Lists the user's most recent artifacts (up to 10) with:
  - Title (truncated)
  - Visibility badge icon (TourText/CondoBunk/Bunk Stash)
  - Type icon (note/document/checklist)
  - Relative timestamp ("2h ago")
- Clicking an artifact navigates to `/bunk/artifacts` (the full workspace)
- Includes a "+ New" button at the top of the expanded list that navigates to `/bunk/artifacts` with a query param to trigger creation
- Fetches from the `user_artifacts` table, filtered by the user's tour IDs
- Keeps the same font, spacing, and interaction patterns as `SidebarTelaThreads`

### Sidebar Integration

**File: `src/components/bunk/BunkSidebar.tsx`**

Import and render `<SidebarArtifacts />` immediately after the `<SidebarTelaThreads />` component and before the `<Separator>` and Tour Team section. This places it logically under the TELA/chat area since artifacts are "pre-law" notes that feed into AKBs.

### Data Fetching

The component queries `user_artifacts` directly (no new edge function needed):

```text
SELECT id, title, artifact_type, visibility, updated_at
FROM user_artifacts
WHERE tour_id IN (user's tour IDs) OR user_id = current_user
ORDER BY updated_at DESC
LIMIT 10
```

Existing RLS policies already allow users to read their own artifacts and tour-scoped artifacts.

### No Database or Backend Changes

All data is already available via the existing `user_artifacts` table with current RLS policies. No migrations, no new edge functions.

### Files Changed

| File | Change |
|------|--------|
| `src/components/bunk/SidebarArtifacts.tsx` | New component -- collapsible artifact list for sidebar |
| `src/components/bunk/BunkSidebar.tsx` | Import and render SidebarArtifacts after SidebarTelaThreads |

