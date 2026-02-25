

# Smart Document Re-Upload: Version-Aware AKB Updates

## The Problem

Today, uploading an updated version of "PW2026 MASTER AKB TOUR INTEL.PDF" creates a completely separate document entry. The old data stays in the AKB alongside the new data, causing duplicates or stale info. The user has to manually archive the old version, re-extract, and re-approve -- a fragile, error-prone workflow that erodes trust.

## The Solution: Intelligent Version Detection + Delta Sync

When a user uploads a document, the system checks if a document with a matching (or very similar) filename already exists for that tour. If it does, the system treats it as a **version update** rather than a brand new document -- automatically handling the old-to-new transition with a clear change summary.

## User Experience

### Upload Flow (What the user sees)

1. User uploads "PW2026 MASTER AKB TOUR INTEL.PDF" (same name as existing doc)
2. Instead of silently creating a new entry, a dialog appears:

```text
+--------------------------------------------------+
|  Update Detected                                  |
|                                                   |
|  "PW2026 MASTER AKB TOUR INTEL.PDF" already       |
|  exists (uploaded Tue, Mar 4).                     |
|                                                   |
|  [ Upload as New Version ]  [ Upload as Separate ] |
+--------------------------------------------------+
```

3. If "Upload as New Version":
   - Old document is auto-archived (data cleaned up)
   - New document is uploaded with `version` incremented
   - Extraction runs automatically
   - After extraction, a **Change Summary** is shown:
     - "3 venues updated, 1 new venue added, 2 contacts changed"
   - All changes are logged in the AKB Change Log

4. If "Upload as Separate":
   - Behaves exactly like today (new independent document)

### Post-Extraction Delta Report

After re-extraction, TELA generates a human-readable diff:

```text
Changes since v1 (uploaded Mar 4):
  + Added: Venue "Smoothie King Center" (New Orleans, LA)
  ~ Updated: "Bridgestone Arena" - show_time changed 7:30 PM -> 8:00 PM
  ~ Updated: Contact "Sarah Chen" - phone changed
  - Removed: Venue "Ryman Auditorium" (no longer in document)
```

This gets logged to `akb_change_log` and is visible in the Change Log page.

## Technical Implementation

### 1. Frontend: Version Detection Dialog (`BunkDocuments.tsx`)

Before uploading, query existing active documents for filename similarity:

```typescript
// Normalize filename for comparison
const normalize = (f: string) => f.toLowerCase().replace(/[^a-z0-9]/g, "");

const existingMatch = activeDocuments.find(d => 
  d.filename && normalize(d.filename) === normalize(file.name)
);
```

If a match is found, show a dialog asking "Upload as New Version" vs "Upload as Separate". 

When "Upload as New Version" is chosen:
- Set `replaces_doc_id` on the upload flow
- Archive the old document (reuse existing `handleArchive` logic)
- Upload + extract the new one
- Increment version number from the old doc's version

### 2. New Component: `VersionUpdateDialog.tsx`

A simple dialog component with:
- The matched filename and its upload date
- Two buttons: "Upload as New Version" and "Upload as Separate"
- Brief explanation of what each option does

### 3. Backend: Delta Detection in `extract-document/index.ts`

Before the extraction cleans up old data, snapshot the current state:

```typescript
// If replaces_doc_id is provided, snapshot old data for diff
let oldSnapshot = null;
if (replaces_doc_id) {
  const [oldEvents, oldContacts, oldVans] = await Promise.all([
    adminClient.from("schedule_events").select("*").eq("source_doc_id", replaces_doc_id),
    adminClient.from("contacts").select("*").eq("source_doc_id", replaces_doc_id),
    adminClient.from("venue_advance_notes").select("*").eq("source_doc_id", replaces_doc_id),
  ]);
  oldSnapshot = { events: oldEvents.data, contacts: oldContacts.data, vans: oldVans.data };
}
```

After extraction completes, compare old vs new:
- Events: compare by `event_date + venue` -- detect added/removed/changed
- Contacts: compare by `name` -- detect added/removed/changed fields
- VANs: compare by `venue_name` -- detect added/removed venues

Return a `changes` array in the response:

```json
{
  "changes": [
    { "type": "added", "entity": "venue", "detail": "Smoothie King Center, New Orleans, LA" },
    { "type": "updated", "entity": "event", "detail": "Bridgestone Arena: show_time 19:30 -> 20:00" },
    { "type": "removed", "entity": "venue", "detail": "Ryman Auditorium" }
  ]
}
```

### 4. Frontend: Change Summary Display

After extraction of a version update, show the changes in:
- The extraction review dialog (immediate feedback)
- A toast summary ("3 changes detected")
- The AKB Change Log (permanent record)

### 5. Auto-Log to `akb_change_log`

Each detected change gets a change log entry with:
- `action`: "VERSION_UPDATE"
- `change_summary`: Human-readable description
- `change_reason`: "Document re-upload: [filename] v[N] -> v[N+1]"
- `entity_type`: "schedule_event" / "contact" / "venue_advance_note"

### 6. Database: Add `replaces_doc_id` column to `documents`

A single migration to add lineage tracking:

```sql
ALTER TABLE documents ADD COLUMN replaces_doc_id uuid REFERENCES documents(id);
```

This creates a version chain: v3 -> v2 -> v1.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/components/bunk/VersionUpdateDialog.tsx` | Create | Dialog asking user how to handle duplicate filename |
| `src/pages/bunk/BunkDocuments.tsx` | Modify | Add version detection logic before upload, show dialog, pass `replaces_doc_id` |
| `supabase/functions/extract-document/index.ts` | Modify | Accept `replaces_doc_id`, snapshot old data, compute diff, return changes |
| `documents` table | Migration | Add `replaces_doc_id` column |

## What This Does NOT Change

- The existing "Upload as Separate" flow remains identical to today
- Archiving, renaming, and manual extraction all work the same
- No changes to RLS policies (the new column is just a self-referential FK)
- The extraction AI prompts stay the same -- only the surrounding orchestration changes

## The Trust Factor

This design ensures:
- **No silent overwrites** -- the user always sees what changed
- **Full audit trail** -- every version update is logged with before/after
- **Easy rollback** -- old versions are archived, not deleted; they can be restored
- **Async propagation** -- once the new extraction is approved, all AKB views (calendar, contacts, coverage, TELA) automatically reflect the updated data via the existing `akb-changed` event system

