

# Share Venue Tech Pack Analysis Across Same-Venue Shows

## Problem
When a tour has multiple performances at the same venue (e.g., 3 nights at Hippodrome Theatre), you currently need to upload and analyze the tech pack separately for each show advance. The venue's physical specs don't change between performances.

## Approach
After the edge function finishes analyzing docs for one show advance, propagate the extracted field values and intelligence report to all other show advances at the same venue within the same tour.

### Changes

**`supabase/functions/advance-venue-analyze/index.ts`** (single file change):

After the field mapping step (line ~571) and after the intelligence report upsert (line ~694), add a propagation step:

1. **Find sibling show advances** at the same venue within the same tour:
   ```sql
   SELECT id FROM show_advances
   WHERE tour_id = $tour_id
     AND venue_name = $venue_name
     AND id != $current_show_advance_id
   ```

2. **Copy field values** to sibling advances: For each sibling, load its `advance_fields`, and for any field that is still `not_provided` (never touched), copy over `current_value`, `status`, `confidence_score`, and `flag_level` from the source show's fields. Skip any field that is already populated, confirmed, or locked — preserving per-show human overrides.

3. **Copy venue docs references**: Insert matching `advance_venue_docs` rows for siblings (pointing to same `file_path` in storage) so the docs appear in their UI without re-upload. Use `ON CONFLICT DO NOTHING` logic by checking existing file paths.

4. **Copy extractions**: Insert `advance_venue_extractions` rows for siblings referencing the same document data.

5. **Copy intelligence report**: Upsert the same intelligence report to sibling advances, preserving any existing `edited_questions`/`edited_internal_notes` on siblings.

6. **Log propagation**: Add a decision log entry on each sibling noting "Venue data propagated from [source show date]".

### Key rules
- Only propagate to shows with the **same `venue_name`** in the **same `tour_id`**
- Never overwrite fields that already have values (`current_value IS NOT NULL`) or are confirmed/locked
- Venue-specific fields only (all 8 sections are venue-scoped, so this is safe)
- Show-specific fields like `day_and_date` are excluded by the "don't overwrite populated" rule since they're seeded per-show

### No frontend changes needed
The existing UI will automatically reflect the propagated data — fields will show as "captured" via the progress bars we just built, and the venue packet section will show the shared docs.

