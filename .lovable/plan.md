

# Advance Ledger V1 — Implementation Plan (with Mandatory Updates Applied)

Nothing has been built yet for Advance Ledger. This plan covers the full build from scratch with all 10 required updates baked in.

---

## Step 1: Database Migration

A single large migration creating all 7 tables, RLS policies, seed data, auto-seed trigger, readiness view, and grants.

**Tables:**
- `show_advances` — master record per show (status: draft/in_review/locked/ready)
- `advance_sources` — transcript/note/upload payloads
- `advance_fields` — canonical field values with criticality + money_sensitive metadata
- `advance_field_evidence` — source-linked extracted values
- `advance_flags` — red/yellow/green operational flags
- `advance_decision_log` — **append-only** (INSERT-only RLS, no UPDATE/DELETE policies)
- `advance_field_templates` — canonical field registry seeded with all 37 fields + criticality + money_sensitive metadata

**RLS Pattern:**
- All tables: SELECT via `is_tour_member(tour_id)` (joined through `show_advances`)
- INSERT/UPDATE/DELETE: `is_tour_admin_or_mgmt(tour_id)` — except `advance_decision_log` which is INSERT-only (no UPDATE, no DELETE policies)

**Auto-Seed Trigger (Update #3):**
- A `SECURITY DEFINER` trigger function `seed_advance_fields_on_create()` fires `AFTER INSERT` on `show_advances`
- Copies all rows from `advance_field_templates` into `advance_fields` for the new show, including `section_criticality`, `field_criticality`, `money_sensitive_boolean`

**Readiness View (Update #4):**
- A database view `v_show_advance_readiness` that computes:
  - `critical_unresolved_count`: critical fields not confirmed+locked
  - `red_flag_open_count`: open red flags
  - `readiness_status`: 'ready' / 'needs_review' / 'not_ready'

**Seed Data:** All 37 canonical fields from the spec with correct criticality and money_sensitive flags.

---

## Step 2: Zustand Store + Routes + Home Screen

**New files:**
- `src/stores/advanceStore.ts` — Zustand store (selected show advance, field list, flags, sources)
- `src/pages/bunk/AdvanceLedger.tsx` — list of show advances for selected tour
- `src/pages/bunk/AdvanceShow.tsx` — single show dashboard

**Route additions** in `App.tsx` (nested under `/bunk`):
- `/bunk/advance` → list
- `/bunk/advance/:id` → show dashboard
- `/bunk/advance/:id/fields` → parsed detail
- `/bunk/advance/:id/sources` → source timeline
- `/bunk/advance/:id/conflicts` → conflict review
- `/bunk/advance/:id/export` → export

**Sidebar:** Add "Advance Ledger" nav link to `BunkSidebar.tsx`.

**Show Dashboard includes (Update #4 + #8):**
- Readiness status card (Not Ready / Needs Review / Ready) computed from the readiness view
- KPI row: % confirmed, red/yellow/green counts, sources count
- Operational metrics where practical: `critical_missing_count`, `unresolved_conflicts_count`, `locked_critical_fields_count`, `red_flag_count`
- CTAs: Add Source, Run Parse, Review Conflicts, Export Summary

---

## Step 3: Parsed Advance Detail View + Shared Components

**New files:**
- `src/pages/bunk/AdvanceFields.tsx` — sectioned accordion form (8 sections)
- `src/components/bunk/AdvanceEvidenceDrawer.tsx` — evidence detail drawer
- `src/components/bunk/AdvanceAddSourceDialog.tsx` — upload/paste source dialog

Each field row shows: label, value, status chip, confidence, flag dot, lock toggle, evidence count, edit button. Lock toggle writes to `advance_fields` + inserts `advance_decision_log`. Critical fields visually distinct. Missing required fields highlighted.

---

## Step 4: Parser Edge Function + Source Timeline

**New file:** `supabase/functions/advance-parse/index.ts`

**Auth (Update #1):** JWT verification stays ON in config.toml (`verify_jwt` NOT set to false). The function validates the user via `getClaims()`, then confirms tour membership by joining through `show_advances.tour_id` to `tour_members`. Only members can trigger parse.

**Parser Write Safety (Update #5 + #6 + #7 + #8):**
1. Load source text from `advance_sources`
2. Call Lovable AI (`google/gemini-2.5-pro`) with field templates as schema
3. For each candidate:
   - Write evidence to `advance_field_evidence` first
   - Compute precedence of current field value vs candidate
   - If candidate is lower precedence: write evidence only, do not update field
   - If candidate materially differs from higher-precedence current value: create conflict (set field status to 'conflict', create yellow/red flag)
   - If candidate is higher precedence and field is not locked: promote value
   - **Never auto-lock critical fields**
   - **Never auto-resolve money-sensitive conflicts**
4. Detect missing required fields, generate flags
5. Insert `advance_decision_log` entries for all field updates (source_added, field_updated)
6. Return summary: `{ candidates_found, fields_updated, conflicts_detected, flags_generated, missing_required }`

**Config:** `supabase/config.toml` — add `[functions.advance-parse]` with NO `verify_jwt = false` (keeping default JWT auth).

**Source Timeline page:** `src/pages/bunk/AdvanceSources.tsx` — vertical timeline, filter by type/speaker, expand raw text, link to evidence.

---

## Step 5: Conflict Review + Export Summary

**New files:**
- `src/pages/bunk/AdvanceConflicts.tsx`
- `src/components/bunk/AdvanceDecisionModal.tsx`
- `src/pages/bunk/AdvanceExport.tsx`

**Conflict Resolution (Update #6):**
- Money-sensitive fields: rationale textarea required before Keep A / Keep B buttons activate
- Every resolution inserts `advance_decision_log` record with TAI-D
- Critical fields become locked only through explicit user resolve action
- Resolution updates field, resolves flag, sets `updated_by = 'conflict_resolver'`

**Export (Update #7 + #9):**
- Four tabs: Internal Advance Summary, Production Call Recap, Tour Call Recap, Accountability Report
- All export views read from `advance_fields`, `advance_flags`, `advance_decision_log` — never from raw transcript text
- Printable layout with print CSS

---

## Files Summary

**New (~13):**
- 1 migration SQL
- `src/stores/advanceStore.ts`
- `src/pages/bunk/AdvanceLedger.tsx`
- `src/pages/bunk/AdvanceShow.tsx`
- `src/pages/bunk/AdvanceFields.tsx`
- `src/pages/bunk/AdvanceSources.tsx`
- `src/pages/bunk/AdvanceConflicts.tsx`
- `src/pages/bunk/AdvanceExport.tsx`
- `src/components/bunk/AdvanceAddSourceDialog.tsx`
- `src/components/bunk/AdvanceEvidenceDrawer.tsx`
- `src/components/bunk/AdvanceDecisionModal.tsx`
- `supabase/functions/advance-parse/index.ts`

**Modified (~3):**
- `src/App.tsx` — add advance routes
- `src/components/bunk/BunkSidebar.tsx` — add nav link
- `supabase/config.toml` — add `[functions.advance-parse]` (no verify_jwt override)

---

## Implementation Order

Due to size, this will be built across multiple messages:

1. **Migration** — tables, RLS, auto-seed trigger, readiness view, field template seeds
2. **Store + Routes + Home** — Zustand, routing, list page, show dashboard with readiness gate
3. **Fields + Components** — parsed detail view, evidence drawer, add source dialog
4. **Parser** — authenticated edge function with precedence-safe write logic
5. **Conflicts + Export** — conflict resolution UI with decision modal, export views

