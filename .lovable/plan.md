

# Fix: Venue Analysis Not Updating Fields or Statuses

## Problem

Two issues:

1. **Fields never update**: The edge function extracts venue data into `advance_venue_extractions` but never maps it back to the `advance_fields` table. Extracted values like `stage_width`, `curfew`, etc. sit in a JSON blob and never populate the actual advance field rows.

2. **Statuses don't refresh in UI**: The function updates `processing_status` on `advance_venue_docs` mid-flight (uploaded → processing → complete), but the frontend only refetches on mutation completion (`onSuccess`). Since the function can take 30-60+ seconds, the user sees no progress until the entire pipeline finishes — or times out.

## Fix

### 1. Edge Function: Map Extractions → Advance Fields

After saving extractions (step 5, ~line 448), add a mapping step that:
- Loads the show advance's `advance_fields`
- For each extracted field key, finds a matching `field_key` in advance_fields
- Updates `current_value`, `status` → `needs_confirmation`, `confidence_score`, and `flag_level` based on extraction confidence
- Only updates fields that are NOT already `confirmed` + `locked` (preserves human decisions)

This bridges the gap between raw extraction and the governed field system.

### 2. Frontend: Poll for Status Updates

In `VenuePacketSection`, add a polling interval (3-5 seconds) that refetches `advance-venue-docs` while any doc has `processing_status === "processing"` or the mutation is pending. Use `refetchInterval` on the query, enabled conditionally.

### 3. Frontend: Invalidate Field Queries on Completion

In `VenuePacketSection.onSuccess` and `AdvanceShow.onAnalysisComplete`, also invalidate `advance-fields` and `advance-readiness-single` queries so the readiness card and section progress bars update.

## Files Changed

- **`supabase/functions/advance-venue-analyze/index.ts`**: Add field mapping step after extraction (~15 lines)
- **`src/components/bunk/VenuePacketSection.tsx`**: Add `refetchInterval` for polling; add field/readiness query invalidation to `onSuccess`
- **`src/pages/bunk/AdvanceShow.tsx`**: Invalidate `advance-fields` and `advance-readiness-single` in `onAnalysisComplete`

