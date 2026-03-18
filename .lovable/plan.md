

# Tour Production Rider — AKB-level Tour Requirements

## What This Does
Adds tour-scoped production documents (Production Rider, Rigging Plot, Input List, Patch List) as first-class AKB artifacts. These define what the tour **needs** and are compared against venue tech packs during TELA intelligence generation to produce real fit-gap analysis.

## Architecture

```text
┌─────────────────────┐     ┌──────────────────────────┐
│ tour_production_docs │────▶│ tour_production_extractions │
│ (tour-scoped)        │     │ (structured requirements)   │
└─────────────────────┘     └──────────────────────────┘
         │                              │
         │                              ▼
         │                 ┌──────────────────────────────┐
         │                 │ advance-venue-analyze (step 6)│
         │                 │ Intelligence prompt now       │
         │                 │ includes tour requirements    │
         │                 │ for fit-gap comparison        │
         └─────────────────┴──────────────────────────────┘
```

## Steps

### 1. Database migration — two new tables + RLS

**`tour_production_docs`** — tour-level documents (rider applies to whole tour, not one venue)
- `id`, `tour_id`, `file_name`, `file_path`, `file_type`
- `document_category` (text: `production_rider`, `rigging_plot`, `input_list`, `patch_list`)
- `processing_status` (text: `uploaded`, `processing`, `complete`, `failed`)
- `processing_error`, `uploaded_by`, `uploaded_at`, `processed_at`
- Validation trigger for enums
- RLS: members SELECT, TA/MGMT INSERT/UPDATE/DELETE (using `is_tour_member`/`is_tour_admin_or_mgmt`)

**`tour_production_extractions`** — structured JSON from parsed rider/rigging docs
- `id`, `tour_id`, `document_id` (FK → tour_production_docs), `extracted_data` (jsonb), `extraction_confidence` (jsonb), `processed_at`
- RLS: members SELECT, TA/MGMT INSERT/UPDATE/DELETE

### 2. New edge function: `advance-rider-analyze`

- Same auth/CORS pattern as `advance-venue-analyze`
- Accepts `{ tour_id, document_ids? }`
- Downloads PDF from storage, sends as multimodal base64 to AI
- Extraction tool schema covers tour requirements:
  - `power_requirements`, `rigging_requirements`, `labor_requirements`, `staging_requirements`, `schedule_template`, `trucking_logistics`, `special_effects`, `audio_video`, `equipment_requests`, `production_contacts`
- Stores results in `tour_production_extractions`
- Config: `[functions.advance-rider-analyze]` with `verify_jwt = false`, `wall_clock_limit = 300`

### 3. Update `advance-venue-analyze` intelligence step

In step 6 (line ~596), before generating the intelligence report:
- Query `tour_production_extractions` for the tour
- Inject tour requirements into the intelligence prompt as a `TOUR PRODUCTION REQUIREMENTS` section
- This gives the AI both sides: "tour needs X" vs "venue provides Y" → real fit-gap flags

### 4. Frontend: `TourRiderSection.tsx`

New component (modeled on `VenuePacketSection`) for tour-scoped docs:
- Category selector: Production Rider, Rigging Plot, Input List, Patch List
- Upload → storage path `{tour_id}/production-docs/{timestamp}_{filename}`
- "Run TELA Analysis" button invokes `advance-rider-analyze`
- Shows doc list with processing status
- Polling on `processing` status

### 5. Place `TourRiderSection` on the Advance Show page

Add it above the existing `VenuePacketSection` on `AdvanceShow.tsx`, passing `tourId`. This gives users one place to upload both tour requirements and venue specs. The section header: "TOUR PRODUCTION DOCS".

### 6. Update `advanceStore.ts` types

Add `TourProductionDoc` and `TourProductionExtraction` interfaces, plus the `TourDocCategory` type.

### 7. Storage policy

Add storage policy on `document-files` bucket for the `{tour_id}/production-docs/` path pattern, matching the existing advance-packets pattern.

