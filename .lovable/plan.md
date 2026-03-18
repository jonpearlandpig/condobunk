

# Fix: Venue Packet Upload RLS Failure

## Root Cause

The storage policy on `document-files` expects the **first folder** in the file path to be a `tour_id` (line 28: `tm.tour_id::text = (storage.foldername(name))[1]`). But the upload path is `advance-packets/{show_advance_id}/...` — a show_advance_id, not a tour_id. The policy match fails, blocking the upload.

There may also be a secondary issue: the `advance_venue_docs` table INSERT doesn't set `uploaded_by`, which is nullable so it won't fail, but should be set for provenance.

## Fix

### 1. Change the upload path to use `{tour_id}` as the first folder

In `VenuePacketSection.tsx`, the component needs access to the `tour_id` for the show advance. It can either:
- Accept `tourId` as a prop (preferred — the parent `AdvanceShow.tsx` already fetches the show which has `tour_id`)
- Or look it up from the show advance record

Then change the file path from:
```
advance-packets/{showAdvanceId}/{timestamp}_{filename}
```
to:
```
{tourId}/advance-packets/{showAdvanceId}/{timestamp}_{filename}
```

This satisfies the existing storage policy without any migration.

### 2. Pass `tourId` from `AdvanceShow.tsx` to `VenuePacketSection`

The parent already has `show.tour_id`. Add it as a prop.

### 3. Set `uploaded_by` on insert

Add the current user's ID to the `advance_venue_docs` insert for provenance tracking.

## Files Changed

- **`src/components/bunk/VenuePacketSection.tsx`**: Accept `tourId` prop, update file path to `{tourId}/advance-packets/...`, set `uploaded_by` on insert
- **`src/pages/bunk/AdvanceShow.tsx`**: Pass `tourId={show.tour_id}` to `VenuePacketSection`

No migrations needed.

