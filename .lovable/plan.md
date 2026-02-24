

## Fix TELA Tour-Scoping + Repair Caleb/Trey Data

### What happened
TELA's `create_contact` action uses `supabase.from("tour_members").select("tour_id").limit(1)` to find a tour. This returns KOH2026 (oldest tour) regardless of which tour the user is actively working in. Caleb Cook and Trey Mills were written to KOH2026 four times total instead of PW2026.

### Phase 1: Data Repair (immediate)

Move the miswritten contact records to PW2026 and deduplicate:

1. Delete the 4 duplicate Caleb/Trey records from KOH2026 (tour_id `202b5bb5-...`)
2. Insert correct records into PW2026 (tour_id `1810fd1e-7278-44ba-a46c-fb272d004a03`):
   - Caleb Cook | Tour Manager | caleb@breitgroup.com | 612-202-6429
   - Trey Mills | Tour Assist | imjonhartman@gmail.com | (no phone)
3. Update Jon Hartman's role from "Tour Assist" to "Tour Assist" (already correct) -- verify only

### Phase 2: Fix tour-scoping in useTelaActions

**File: `src/hooks/useTelaActions.ts`**

1. Add optional `tour_id` field to the `TelaAction` interface
2. Accept `tourId` parameter in `executeAction`
3. Replace all `supabase.from("tour_members").select("tour_id").limit(1)` fallbacks with explicit tour resolution:
   - If `action.tour_id` is a valid UUID, use it directly
   - If it's a tour name string, resolve it against the user's accessible tours
   - If neither is provided, require the caller to pass `tourId` explicitly
   - Never fall back to "first membership row"
4. Apply resolved tour_id to:
   - `create_contact` inserts
   - `update_van` fallback lookups and new VAN creation

**File: `src/components/bunk/TelaActionCard.tsx`**

5. Pass the active `tourId` from context (via `useTour` hook) into `executeAction`

**File: `src/components/bunk/BunkChat.tsx`** (or wherever TELA thread context lives)

6. Ensure the TELA thread's `tour_id` is passed through to action cards so each action knows which tour it belongs to

### Phase 3: Post-action verification toast

After each successful action, include the tour name in the success toast:
- Before: "Contact added"
- After: "Caleb Cook added to PW2026"

This gives immediate visual confirmation of where the write landed.

### Technical details

The core bug is two lines in `useTelaActions.ts`:

```text
// Line ~139 (create_contact)
const { data: memberships } = await supabase
  .from("tour_members").select("tour_id").limit(1);

// Line ~175 (update_van fallback)  
const { data: memberships } = await supabase
  .from("tour_members").select("tour_id").limit(1);
```

Both will be replaced with deterministic tour resolution. The `TelaAction` type gains:

```text
tour_id?: string;   // UUID of the target tour
tour_name?: string; // Fallback: resolve by name
```

The `parseTelaActions` function will extract these from the AI response's ACTION blocks. The edge function (`akb-chat`) already knows the thread's `tour_id` and can include it in generated actions.

No database schema changes are required.
