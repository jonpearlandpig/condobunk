

# Empty AKB State + Smart Contact Routing from Documents

## Problem
1. When all tour AKBs are empty, the UI still shows stale data or confusing states. Users should see a clean slate: no tour team, no venue partners, blank calendar, empty archives -- only My Artifacts persist.
2. When a Contacts PDF is uploaded and extracted, the system creates TOUR-scoped contacts but doesn't distinguish "Tour Team" (management/production) from "Tour Crew" or "Venue Staff". All contacts from a Contacts PDF get dumped into Tour Team.
3. Venue partner contacts should only come from Advance Master documents, which already works correctly (scope: VENUE).
4. There's no auto-creation of Bunk Chat availability -- contacts extracted from a Contacts PDF should automatically be flagged as available for bunk/text/email/phone based on what info was extracted.

## What Changes

### 1. Empty AKB State (UI Polish)
Update the following screens to show proper empty states when the AKB has no data:

**Calendar (BunkCalendar.tsx):**
- When no events exist, show a centered empty state: "No events yet. Upload documents to build your tour schedule."

**Sidebar (useSidebarContacts.ts):**
- Already shows "None available" when contacts are empty -- no change needed.

**Overview (BunkOverview.tsx):**
- Already shows "Begin Tour Build" when AKB is empty -- just tighten the messaging to be clearer: "Ready to build a new tour. Upload your contacts and Advance Master documents to get started."

### 2. Smart Contact Scope Routing in Extraction Engine
Update `supabase/functions/extract-document/index.ts` to filter contacts from CONTACTS-type documents:

**Current behavior:** All contacts from a Contacts PDF go into `scope: "TOUR"`.

**New behavior:** During general extraction, when `doc_type === "CONTACTS"`, apply role-based filtering:
- **Tour Team (scope: TOUR):** Contacts with management/production roles -- Tour Manager, Production Manager, Tour Accountant, Business Manager, Agent, Promoter Rep, Management, etc. These are the people who manage the tour.
- **Skip (do not insert):** Contacts identified as "Tour Crew" (stagehands, riggers, drivers, techs) or "Venue Staff" (house manager, box office, security) -- these come from other document types or are added manually.

Add a role classification step in the AI extraction prompt to tag each contact with a `category` field: `"TOUR_TEAM"`, `"TOUR_CREW"`, or `"VENUE_STAFF"`. Only insert contacts where `category === "TOUR_TEAM"` from CONTACTS documents.

### 3. Advance Master Venue Contacts (Already Working)
The current extraction already inserts contacts from Advance Masters with `scope: "VENUE"` and associates them with the venue name. No changes needed here -- just confirming the existing behavior matches the requirement.

### 4. Contact Communication Availability
Contacts extracted from documents already have phone/email stored. The sidebar already renders:
- Bunk Chat button (if contact matches an app user who is online)
- TEXT/SMS button (if phone number exists)
- EMAIL button (if email exists)
- CALL button (if phone exists)

No additional changes needed -- the communication channels are already driven by what data exists on the contact record.

---

## Technical Details

### Files Modified

| File | Change |
|---|---|
| `supabase/functions/extract-document/index.ts` | Update EXTRACTION_PROMPT to add `category` field to contacts. Filter contacts from CONTACTS docs to only insert TOUR_TEAM. |
| `src/pages/bunk/BunkOverview.tsx` | Improve empty AKB state messaging to guide users toward uploading contacts + advance masters. |
| `src/pages/bunk/BunkCalendar.tsx` | Improve empty calendar state with clearer guidance. |

### Extraction Prompt Change
Add to the contacts section of EXTRACTION_PROMPT:
```
"contacts": [
  {
    "name": "Full Name",
    "role": "ROLE TITLE",
    "phone": "phone number",
    "email": "email@domain.com",
    "category": "TOUR_TEAM" | "TOUR_CREW" | "VENUE_STAFF"
  }
]
```

With guidance:
- TOUR_TEAM = management, agents, accountants, business managers, production managers, tour managers, promoter reps -- people who run the business side of the tour
- TOUR_CREW = stagehands, riggers, lighting techs, audio techs, carpenters, drivers, wardrobe, catering staff -- people who execute the production
- VENUE_STAFF = house manager, box office, venue security, venue production, local crew chief -- people employed by the venue

### Insertion Filter (extract-document/index.ts, ~line 1834)
When `finalDocType === "CONTACTS"`, filter to only insert contacts where `category === "TOUR_TEAM"` with `scope: "TOUR"`. Skip TOUR_CREW and VENUE_STAFF from contacts documents since those come from Advance Masters and Tech Packs respectively.

### No database changes required.
### No new dependencies.

