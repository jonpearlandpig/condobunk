

# Three-Tier Artifact System: TourText / CondoBunk / Bunk Stash

## The Three Levels

| Tier | Who Sees It | Use Case |
|------|------------|----------|
| **TourText** | All tour members + public-facing | Catering, parking, load-in times, ticket counts, wifi passwords, daily logistics |
| **CondoBunk** | All tour team members only | Internal team info, schedules, operational notes -- shared but not public |
| **Bunk Stash** | Only you (or people you explicitly share with) | Financials, HR, settlements, contracts, NDAs, artist-sensitive info |

## How It Works for the User

- The "My Artifacts" page becomes a three-tab view: **TourText** / **CondoBunk** / **Bunk Stash**
- When creating a new artifact, a simple selector lets you pick the tier (defaults to CondoBunk for general items)
- **Smart detection**: If the title or content contains sensitive keywords (settlement, HR, finance, salary, NDA, per diem, guarantee, contract, insurance, rider, W-9, payroll, tax, severance, confidential), the system auto-switches to Bunk Stash with a subtle toast: "This looks sensitive -- saving to Bunk Stash"
- The user can always override the suggestion with one click
- Bunk Stash items show a lock icon; TourText items show a globe icon; CondoBunk items show a users icon
- TourText and CondoBunk tabs show the creator's name on each item (pulled from profiles)

## Database Changes

### 1. Add `visibility` column to `user_artifacts`

```text
ALTER TABLE user_artifacts
ADD COLUMN visibility text NOT NULL DEFAULT 'condobunk'
CHECK (visibility IN ('tourtext', 'condobunk', 'bunk_stash'));
```

### 2. New RLS policy -- Tour members can READ tourtext and condobunk items

```text
CREATE POLICY "Tour members can view shared artifacts"
ON user_artifacts FOR SELECT
USING (
  visibility IN ('tourtext', 'condobunk')
  AND tour_id IS NOT NULL
  AND is_tour_member(tour_id)
);
```

This sits alongside the existing "Users can view own artifacts" policy (which covers bunk_stash since only the owner can see those). INSERT/UPDATE/DELETE remain owner-only via existing policies -- nobody else can edit your stuff regardless of visibility.

### 3. PostgREST cache reload

```text
NOTIFY pgrst, 'reload schema';
```

## UI Changes (BunkArtifacts.tsx)

- Import `Tabs, TabsList, TabsTrigger, TabsContent` from the existing tabs component
- Three tabs with distinct styling:
  - **TourText** (globe icon) -- shows all tour-scoped artifacts with `visibility = 'tourtext'` for the selected tour
  - **CondoBunk** (users icon) -- shows all tour-scoped artifacts with `visibility = 'condobunk'` for the selected tour
  - **Bunk Stash** (lock icon) -- shows only your own artifacts with `visibility = 'bunk_stash'`
- The create form adds a visibility selector (three chips/buttons instead of a dropdown)
- Keyword detection runs on the title field with a debounce -- if a sensitive keyword is detected and visibility is not already bunk_stash, auto-switch and show a toast
- Shared items (tourtext/condobunk) display the creator's display name fetched via a join or separate profiles query
- The Artifact type now includes `visibility` in the type definition

## What Does NOT Change

- Sidebar nav item stays "My Artifacts" at `/bunk/artifacts`
- Routing, layout, auth, edge functions -- all untouched
- Existing artifacts default to `condobunk` via the migration default
- No new tables, no new pages, no new routes

## Technical Detail

### Files Modified
- `supabase/migrations/` -- new migration for visibility column + RLS policy
- `src/pages/bunk/BunkArtifacts.tsx` -- three-tab UI, visibility selector, keyword detection, shared item display with creator names
- `src/integrations/supabase/types.ts` -- auto-updated after migration

### Sensitive Keyword List (client-side detection)
```text
settlement, finance, salary, hr, nda, per diem, guarantee,
gross, net, contract, insurance, confidential, internal,
legal, compensation, payroll, tax, w-9, w9, severance,
termination, rider, commission, bonus, deduction
```

### Query Strategy
- TourText tab: `SELECT * FROM user_artifacts WHERE tour_id = X AND visibility = 'tourtext'` (RLS handles membership check)
- CondoBunk tab: `SELECT * FROM user_artifacts WHERE tour_id = X AND visibility = 'condobunk'` (RLS handles membership check)
- Bunk Stash tab: `SELECT * FROM user_artifacts WHERE user_id = me AND visibility = 'bunk_stash'` (existing owner-only policy)
- For shared tabs, fetch creator profiles separately to show display names

