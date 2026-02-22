

# AKB Sovereignty + Telauthorium ID

## Two changes in one

### 1. Telauthorium ID (TID)

Every user gets a permanent, unique Telauthorium ID at sign-up. It never changes, follows them across all tours, and is displayed in the UI wherever identity matters.

**Format**: `TID-XXXXXXXX` (8 hex characters derived from their user UUID, guaranteed unique)

**Database change**: Add `telauthorium_id` column to `profiles` table, auto-populated by updating the `handle_new_user()` trigger.

**Where it appears**:
- Account dropdown menu (under display name)
- AKB change log entries (who made the change)
- Sign-off dialog (alongside display name)

### 2. AKB Edit Sign-off Gate

Once the AKB is built, every edit must be signed. A new `AkbEditSignoff` dialog component gates all mutations with:

- **What changed** (auto-filled)
- **Why** (required free-text, min 10 chars)
- **Impact flags** (Safety / Time / Money)
- **Signed by**: Display name + Telauthorium ID
- **Timestamp**: Auto-captured

The dialog writes to `akb_change_log` (with new `change_reason` column) then executes the mutation.

### 3. AKB Change Log Page

A new `/bunk/changelog` page showing a filterable audit trail: who changed what, when, why, with Telauthorium ID, impact badges, and severity.

---

## Technical Details

### Database Migration

```sql
-- Add change_reason to akb_change_log
ALTER TABLE akb_change_log ADD COLUMN change_reason text;

-- Add telauthorium_id to profiles
ALTER TABLE profiles ADD COLUMN telauthorium_id text UNIQUE;

-- Backfill existing profiles
UPDATE profiles SET telauthorium_id = 'TID-' || upper(substr(replace(id::text, '-', ''), 1, 8))
WHERE telauthorium_id IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE profiles ALTER COLUMN telauthorium_id SET NOT NULL;
ALTER TABLE profiles ALTER COLUMN telauthorium_id SET DEFAULT '';

-- Update handle_new_user trigger to auto-assign TID
CREATE OR REPLACE FUNCTION public.handle_new_user() ...
  -- adds: telauthorium_id = 'TID-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 8))
```

### New Files

| File | Purpose |
|------|---------|
| `src/components/bunk/AkbEditSignoff.tsx` | Reusable sign-off dialog |
| `src/pages/bunk/BunkChangeLog.tsx` | Audit trail page |

### Modified Files

| File | Change |
|------|--------|
| `src/components/bunk/EventNoteEditor.tsx` | Wrap save with AkbEditSignoff (replaces inline impact checkboxes) |
| `src/components/bunk/AddEventDialog.tsx` | Wrap save with AkbEditSignoff (replaces inline impact checkboxes) |
| `src/hooks/useTelaActions.ts` | Accept `reason` param, log to `akb_change_log` with `change_reason` |
| `src/components/bunk/TelaActionCard.tsx` | Show AkbEditSignoff before executing action |
| `src/components/bunk/ExtractionReviewDialog.tsx` | Show AkbEditSignoff before committing reviewed data |
| `src/pages/bunk/BunkLayout.tsx` | Display Telauthorium ID in account dropdown |
| `src/App.tsx` | Add `/bunk/changelog` route |
| `src/components/bunk/BunkSidebar.tsx` | Add "Change Log" nav link |

### Sign-off Flow

```text
User clicks Save / Apply / Add
         |
         v
+------------------------+
| AKB Edit Sign-off      |
|                        |
| What: [auto-filled]   |
| Why:  [__________]    |
|                        |
| Impact:                |
| [ ] Safety [ ] Time   |
| [ ] Money              |
|                        |
| Signed by:             |
| Jane Doe (TID-4A2F9B1C)|
| 2026-02-22 14:30       |
|                        |
| [Cancel]    [Commit]   |
+------------------------+
         |
         v
Write akb_change_log (with change_reason)
         |
         v
Execute actual mutation
```

