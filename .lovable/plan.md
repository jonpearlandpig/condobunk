

# Venue Packet Ingest + Advance Intelligence — Day-One Provenance

## The Shift

The original plan assumed venue packets arrive *after* dates are locked. The user's insight is better: venue info, offers, and packets start arriving *before* anything is confirmed. The advance record should exist from the moment a date/venue is even being considered — capturing who sent what, when, and why. That provenance is the foundation of trust.

This means the `show_advances` table already supports this via its `draft` status. A draft advance is a show that's being explored, not yet locked. Venue packets upload into draft advances. TELA analyzes them. The intelligence informs the decision to confirm or pass. The advance record becomes the accountable history of the entire lifecycle — from first offer to show day.

## What We're Building (V1)

### 1. Database: 3 New Tables

**`advance_venue_docs`** — files attached to a show advance
- `id`, `show_advance_id` (FK), `file_name`, `file_path` (storage), `file_type`, `document_category` (tech_packet / production_book / rigging_guide / venue_map / power_sheet / equipment_list), `uploaded_by` (FK auth.users), `uploaded_at`, `processing_status` (uploaded / processing / complete / failed), `processing_error`, `processed_at`

**`advance_venue_extractions`** — structured extraction per document
- `id`, `show_advance_id` (FK), `document_id` (FK advance_venue_docs), `extracted_data` (JSONB — canonical fields grouped by category), `extraction_confidence` (JSONB — per-field confidence + source refs), `processed_at`

**`advance_intelligence_reports`** — merged intelligence per show advance
- `id`, `show_advance_id` (FK), `venue_capability_summary` (text), `comparison_results` (JSONB), `green_lights` (JSONB), `yellow_flags` (JSONB), `red_flags` (JSONB), `missing_unknown` (JSONB), `draft_advance_questions` (JSONB), `draft_internal_notes` (JSONB), `edited_questions` (JSONB — human override), `edited_internal_notes` (JSONB — human override), `generated_at`, `updated_at`, `generated_by` (FK auth.users)

**RLS**: All three use `is_advance_member` for SELECT, `is_advance_admin` for INSERT/UPDATE/DELETE. Standard GRANT to `authenticated`.

**Storage**: Reuse `document-files` bucket. Path: `advance-packets/{show_advance_id}/{timestamp}_{filename}`.

### 2. Edge Function: `advance-venue-analyze`

Pipeline:
1. Accept `{ show_advance_id, document_ids?: string[] }`
2. For each doc: fetch from storage, extract text (reuse PDF/XLSX text extraction patterns from `extract-document`), call Lovable AI (`google/gemini-2.5-pro`) with structured extraction prompt against the canonical venue schema
3. Save per-doc extraction to `advance_venue_extractions`
4. Merge all extractions for the show advance
5. Generate intelligence report (green/yellow/red flags, draft questions, internal notes)
6. Upsert `advance_intelligence_reports` (preserve `edited_*` columns)

The extraction prompt uses the canonical schema from the spec (venue identity, contacts, access/logistics, schedule/rules, stage/rigging, power/technical, lighting/audio/video, atmospherics, hospitality, emergency). Every field gets a confidence level and source reference. Nulls for missing — never fabricated.

Config: `verify_jwt = true`, `wall_clock_limit = 300`.

### 3. Frontend: `AdvanceShow.tsx` — Two New Sections

**A. Venue Packets Section** (above the CTA bar)
- Upload button (accepts PDF, DOCX, XLSX, images)
- File list: filename, category badge, upload time, processing status
- "Run TELA Analysis" button (disabled if no docs or already processing)
- "Re-run Analysis" button (when report exists)

**B. Advance Intelligence Section** (below CTA bar, visible when report exists)
- Venue Capability Summary (text block at top)
- Color-coded cards: Green Lights, Yellow Flags, Red Flags, Missing/Unknown
- Editable textareas: Draft Advance Questions, Draft Internal Notes
- "Save Edits" button writes to `edited_questions` / `edited_internal_notes`
- "Last analyzed" timestamp

**C. Status Banner** (top of page, contextual)
- "No venue packet uploaded" — if no docs
- "Analysis pending" — if processing
- "Red flags detected" — if red flags exist
- "Missing critical data" — if missing_unknown has items

### 4. Types: `advanceStore.ts`

Add interfaces for `AdvanceVenueDoc`, `AdvanceVenueExtraction`, `AdvanceIntelligenceReport`.

## Human Editing Rules

- Generated content populates editable fields
- User edits saved to `edited_questions` / `edited_internal_notes`
- Re-running analysis overwrites generated columns, preserves `edited_*`
- UI shows edited version if it exists, generated version otherwise

## Provenance

Every uploaded doc records `uploaded_by` + `uploaded_at`. Every extraction records source doc + confidence. Every intelligence report records `generated_by` + `generated_at`. The `advance_decision_log` captures when analysis was run and by whom. This is the accountable record from first offer to show day.

## Files Changed

- **Migration**: 3 new tables + RLS + grants + storage policy
- **New**: `supabase/functions/advance-venue-analyze/index.ts`
- **Modified**: `src/pages/bunk/AdvanceShow.tsx` (venue packet + intelligence sections)
- **Modified**: `src/stores/advanceStore.ts` (new types)

