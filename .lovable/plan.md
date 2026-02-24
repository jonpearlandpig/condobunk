

## Save Crew and Cast Contacts from Document Extraction

### Problem

When a CONTACTS-type document is uploaded, the extraction logic explicitly **filters out** any contact categorized as `TOUR_CREW` (stagehands, riggers, lighting techs, audio techs, etc.). Only `TOUR_TEAM` (management) contacts are saved. This means crew and cast members extracted from the Advance Master are silently dropped.

The filtering happens in `supabase/functions/extract-document/index.ts` at lines 1868-1874:

```text
const filteredContacts = isContactsDoc
  ? contacts.filter(c => {
      const cat = (c as any).category?.toUpperCase?.() || "";
      return cat === "TOUR_TEAM" || cat === "";
    })
  : contacts;
```

### Fix

Remove the `TOUR_CREW` exclusion filter so all extracted contacts (TOUR_TEAM, TOUR_CREW, VENUE_STAFF) are saved. To keep them organized and distinguishable in the sidebar, preserve the extracted `category` in the contact's `role` field (e.g., prepend "Crew - " or "Cast - " to the role).

### Changes

**File: `supabase/functions/extract-document/index.ts`**

1. Remove the `isContactsDoc` filter that drops TOUR_CREW contacts (lines 1868-1880)
2. Instead, insert ALL extracted contacts
3. Map the `category` into the `role` field so crew/cast contacts are visually distinct in the sidebar (e.g., if category is `TOUR_CREW` and role is `Lighting Designer`, store role as `Crew | Lighting Designer`)
4. Keep `VENUE_STAFF` contacts scoped as `VENUE` instead of `TOUR` so they appear in the venue partners section

**No database migration needed.** The existing `contacts` table already supports all contact types -- the only barrier was the application-level filter dropping them before insertion.

**No sidebar changes needed.** The `SidebarContactList` already renders all `TOUR`-scoped contacts in the Tour Team tab. Crew/cast contacts will appear there with their category-prefixed role for easy identification.

### Result

After this change, re-uploading or re-extracting a document will save all crew, cast, and management contacts. They will be editable, searchable, and visible in the sidebar like any other contact.
