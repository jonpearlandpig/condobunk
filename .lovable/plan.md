

# Next Step: Parser Edge Function (`advance-parse`)

## Current State
- All 7 database tables, RLS, auto-seed trigger, and readiness view are deployed
- All 5 UI pages exist (Ledger, Show Dashboard, Fields, Sources, Conflicts, Export) but the Conflicts page is a read-only scaffold with no resolution actions
- No parser edge function exists yet — this is the critical missing piece that makes the module functional

## What This Step Builds

### 1. Edge Function: `supabase/functions/advance-parse/index.ts`

**Auth:** JWT stays ON (no `verify_jwt = false`). Validates user via `getClaims()`, then confirms tour membership by joining `show_advances.tour_id` → `tour_members`.

**Pipeline:**
1. Receive `{ show_advance_id, source_id }`
2. Load source text from `advance_sources` + all current `advance_fields` + `advance_field_templates`
3. Call Lovable AI (`google/gemini-2.5-pro`) with tool calling to extract structured field candidates
4. For each candidate:
   - INSERT evidence into `advance_field_evidence`
   - Compute precedence of current field vs candidate (locked=5, resolved_conflict=4, strong_confirmed≥0.80=3, soft=2, null=1)
   - Lower precedence → evidence only, no field update
   - Material difference against higher precedence → set field to `conflict`, create flag
   - Higher precedence + not locked → promote value
   - **Never auto-lock critical fields**
   - **Never auto-resolve money-sensitive conflicts**
5. Detect missing required fields → generate yellow/red flags
6. INSERT `advance_decision_log` entries for all updates
7. Return `{ candidates_found, fields_updated, conflicts_detected, flags_generated, missing_required }`

**AI prompt** uses tool calling with a `extract_advance_fields` function definition matching the canonical field schema, ensuring structured output.

### 2. "Run Parse" Button on Show Dashboard

Add a "Run Parse" CTA to `AdvanceShow.tsx` that:
- Opens a dialog to select which source to parse (or parse latest)
- Calls `supabase.functions.invoke('advance-parse', { body: { show_advance_id, source_id } })`
- Shows loading state, then toast with results summary
- Invalidates field/flag/readiness queries on success

### 3. Config Update

Add `[functions.advance-parse]` to `supabase/config.toml` with `verify_jwt = false` (per project pattern — auth validated in code via `getClaims()`).

### 4. Conflict Resolution Actions

Upgrade `AdvanceConflicts.tsx` from read-only scaffold to functional:
- For each conflict field, show evidence from both sides (query `advance_field_evidence`)
- "Keep A" / "Keep B" buttons
- Money-sensitive fields: rationale textarea required before resolve buttons activate
- On resolve: update `advance_fields` (set value, status=confirmed, locked=true for critical), resolve related flag, insert `advance_decision_log` with TAI-D
- Decision confirmation modal (`AdvanceDecisionModal.tsx`)

### Files

**New:**
- `supabase/functions/advance-parse/index.ts`
- `src/components/bunk/AdvanceDecisionModal.tsx`

**Modified:**
- `supabase/config.toml` — add `[functions.advance-parse]` entry
- `src/pages/bunk/AdvanceShow.tsx` — add Run Parse CTA + source selection dialog
- `src/pages/bunk/AdvanceConflicts.tsx` — full resolution UI with evidence, rationale, decision log

