

## Add Metadata JSONB Column and Update Extraction for Extended Crew/Cast Fields

### Overview

Add a `metadata` JSONB column to the `contacts` table and update the extraction prompt + insertion logic to capture all 20+ crew/cast fields (bus number, clothing sizes, DOB, contract/compliance status, address, dietary notes, etc.).

### Changes

#### 1. Database Migration

Add `metadata jsonb DEFAULT '{}'` column to `contacts` table. No existing data is affected -- all current contacts get an empty `{}` metadata object.

#### 2. Update Extraction Prompt (`supabase/functions/extract-document/index.ts`, ~line 139)

Expand the contacts schema from 5 fields to 27 fields:

```text
"contacts": [
  {
    "name", "first_name", "last_name", "preferred_name",
    "role", "phone", "email", "category",
    "bus_number", "dob", "age",
    "jacket_size", "pants_size", "sweatshirt_size", "tshirt_size",
    "contract", "caps", "mvr", "drivers_release", "confirmed_wc",
    "address", "city", "state", "zip",
    "arrival_date", "special_notes"
  }
]
```

The AI will extract whatever fields are present in the document and return null for fields not found.

#### 3. Update Contact Insertion Logic (~line 1887)

After building name/role/scope, collect the 21 extended fields into a `metadata` object and include it in the insert row:

```typescript
const metaFields = [
  'bus_number','first_name','last_name','preferred_name',
  'dob','age','jacket_size','pants_size','sweatshirt_size',
  'tshirt_size','contract','caps','mvr','drivers_release',
  'confirmed_wc','address','city','state','zip',
  'arrival_date','special_notes'
];
const metadata = {};
for (const f of metaFields) {
  if (c[f] != null && c[f] !== "") metadata[f] = c[f];
}

// Insert includes: ...existingFields, metadata
```

### Files Changed

| File | Change |
|------|--------|
| New migration SQL | `ALTER TABLE contacts ADD COLUMN metadata jsonb DEFAULT '{}'` |
| `supabase/functions/extract-document/index.ts` | Expand prompt schema + build metadata in insertion |

### Result

Re-extracting a crew roster will populate all extended fields into `metadata`. The sidebar and existing queries are unaffected (they don't read `metadata`). The Admin AKB Contacts hub (future task) will display and edit these fields.

