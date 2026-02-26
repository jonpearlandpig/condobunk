

# Fix: Advance Master Authority Deduplication

## Problem

The calendar shows every venue duplicated because two source documents both created schedule events:
- **Advance Master** (`KOH26 Advance Master v3.xlsx`, doc_type=SCHEDULE) -- the authority source
- **TourText PDF** (`L2.1_TourText__Layer_2_AKB_(TRUTH).pdf`, doc_type=CONTACTS) -- lower authority

Both insert schedule_events independently with no cross-document venue deduplication, so Allen War Memorial Coliseum, Wolstein Center, TD Garden, etc. each appear twice on the same date.

## Solution

Two changes in `supabase/functions/extract-document/index.ts`:

### 1. Advance Master extraction: purge lower-authority duplicates after insert

After the Advance Master finishes inserting its schedule_events (around line 2131), add a cleanup step that deletes schedule_events from OTHER source documents for the same tour where the venue fuzzy-matches an Advance Master venue on the same date.

This uses the same `normalizeForMatch` / `fuzzyMatch` helpers already present in the reconciliation block. The logic:
- Fetch all schedule_events for this tour that are NOT from this source_doc_id
- For each, check if the Advance Master already has an event with matching venue (fuzzy) and same event_date
- If yes, delete the lower-authority duplicate

### 2. Non-Advance-Master extraction: skip insert if Advance Master already has the venue+date

At the two non-advance-master schedule_events insert points (line ~2363 for multi-venue tech packs, and line ~2742 for single-doc CONTACTS), add a pre-insert check:
- Query schedule_events for the same tour_id + event_date where source_doc_id belongs to a SCHEDULE-type document
- If found, skip the insert (Advance Master is authoritative)

### 3. One-time data cleanup

Delete the duplicate CONTACTS-sourced events that overlap with existing Advance Master events via a targeted query on the current data.

## Technical Details

### File: `supabase/functions/extract-document/index.ts`

**After line ~2131 (post-Advance-Master insert, before reconciliation):**

```typescript
// Authority dedup: remove lower-authority schedule_events that duplicate this Advance Master
const { data: amEvents } = await adminClient.from("schedule_events")
  .select("venue, event_date")
  .eq("tour_id", doc.tour_id)
  .eq("source_doc_id", document_id);

if (amEvents && amEvents.length > 0) {
  const { data: otherEvents } = await adminClient.from("schedule_events")
    .select("id, venue, event_date, source_doc_id")
    .eq("tour_id", doc.tour_id)
    .neq("source_doc_id", document_id);

  if (otherEvents) {
    const toDelete: string[] = [];
    for (const other of otherEvents) {
      const matchesAM = amEvents.some(am =>
        am.event_date === other.event_date &&
        am.venue && other.venue &&
        fuzzyMatch(am.venue, other.venue)
      );
      if (matchesAM) toDelete.push(other.id);
    }
    if (toDelete.length > 0) {
      await adminClient.from("schedule_events").delete().in("id", toDelete);
      console.log(`[extract] Authority dedup: removed ${toDelete.length} lower-authority duplicates`);
    }
  }
}
```

**At line ~2338 and ~2742 (non-AM insert points), add pre-insert guard:**

```typescript
// Check if Advance Master already has this venue+date
const { data: existingAM } = await adminClient.from("schedule_events")
  .select("id")
  .eq("tour_id", doc.tour_id)
  .eq("event_date", eventDate)
  .limit(1);

// Check if any of those are from a SCHEDULE-type doc (Advance Master)
if (existingAM && existingAM.length > 0) {
  const { data: amDoc } = await adminClient.from("documents")
    .select("id")
    .eq("id", existingAM[0].source_doc_id) // need source_doc_id in select
    .eq("doc_type", "SCHEDULE")
    .limit(1);
  if (amDoc && amDoc.length > 0) {
    // Skip — Advance Master is authoritative
    continue; // or skip this insert
  }
}
```

**Data cleanup query (run once):**

Delete CONTACTS-sourced events where the Advance Master already covers the same tour+date+venue.

### Scope of changes
- Single file: `supabase/functions/extract-document/index.ts`
- No schema changes
- No auth/RLS changes
- Redeploy edge function after edit

