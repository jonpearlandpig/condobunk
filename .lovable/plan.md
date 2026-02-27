
## Fix: Sync VAN Production Contacts to Contacts Table

### Problem
The Venue Partners sidebar shows "NO CONTACTS" for most venues despite the VAN (Venue Advance Notes) data containing production contact and house rigger contact information for nearly every venue. 

There are 13 VANs with embedded contact data but only 4 venue contacts in the `contacts` table. The document extraction process created VAN records but didn't always populate the `contacts` table from the embedded `production_contact` and `house_rigger_contact` fields.

### Solution

Create a one-time backfill edge function and also fix the extraction pipeline to always sync VAN contacts going forward.

### Changes

**1. New edge function: `backfill-van-contacts`**
- Reads all `venue_advance_notes` for a given tour
- For each VAN, extracts `production_contact` and `house_rigger_contact` from `van_data`
- Normalizes phone numbers and names (strip annotations like "Cell:", "Direct:", role suffixes)
- Upserts into `contacts` table with `scope = 'VENUE'`, matching on tour_id + venue + name to avoid duplicates
- Maps VAN `venue_name` to the closest `schedule_events.venue` using fuzzy matching so sidebar grouping works
- Returns count of contacts created/updated

**2. Update `extract-document/index.ts`**
- After VAN upsert, add a step that syncs `production_contact` and `house_rigger_contact` into the `contacts` table
- This ensures future extractions automatically populate venue contacts

**3. Admin UI trigger**
- Add a "Sync VAN Contacts" button to the Admin page (or invoke automatically after extraction) that calls the backfill function

### Technical Details

| Item | Detail |
|------|--------|
| New file | `supabase/functions/backfill-van-contacts/index.ts` |
| Modified file | `supabase/functions/extract-document/index.ts` |
| Modified file | `src/pages/bunk/BunkAdmin.tsx` (optional trigger button) |
| Database changes | None -- uses existing `contacts` table |

### Contact Field Mapping

```text
VAN production_contact -> contacts row:
  name    -> contacts.name (strip role suffix like "- Event Production Coordinator")
  phone   -> contacts.phone (extract first phone, strip "Cell:", "Direct:" prefixes)
  email   -> contacts.email
  role    -> "Production Contact"
  venue   -> matched schedule_events.venue (fuzzy)
  scope   -> "VENUE"
  tour_id -> from VAN

VAN house_rigger_contact -> contacts row (if name exists):
  name    -> contacts.name
  phone   -> contacts.phone
  email   -> contacts.email
  role    -> "House Rigger"
  venue   -> matched schedule_events.venue (fuzzy)
  scope   -> "VENUE"
  tour_id -> from VAN
```

### Fuzzy Venue Name Matching
VAN venue names don't always match schedule event venue names exactly (e.g., "Allen War Memorial Coliseum" vs "Allen County War Memorial Coliseum", "Wells Fargo Center / Xfinity Mobile Arena" vs "Xfinity Mobile Arena"). The backfill will use substring matching to find the best schedule venue name so contacts appear correctly in the sidebar grouping.

### Expected Result
After running the backfill, all 13+ venues with VAN data will have their production contacts and house riggers visible in the Venue Partners sidebar. Future extractions will automatically sync contacts.
