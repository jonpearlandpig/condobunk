

# Full AKB Schema Extraction — Complete Implementation

## Gap Analysis

Mapping your 12-section AKB schema against what currently exists:

| # | Section | Status | Issue |
|---|---------|--------|-------|
| 1 | Tour Profile | Partial | Only `tour_name` is extracted. No artist, region, date range, showtime standard, AKB ID, tour code, governance fields |
| 2 | Tour Office Contacts | Working | Contacts extract with categories. Needs to ensure all 6 contact types (PM, TM, ATM, EM, AEM, Tour Security) are captured |
| 3 | Stops Index | Working | Schedule events extract correctly |
| 4 | Stop Schedule Standard | Partial | Showtime in schedule_events. No dedicated fields for default doors, curfew, stop-override flag, escalation rules |
| 5 | Venue Rules & Tech Packets | Working | Tech pack pipeline handles this |
| 6 | Travel & Rehearsals | Lossy | Travel data is dumped as text into `knowledge_gaps`. No structured hotel, flight, ground transport, or rehearsal storage |
| 7 | Guests / Comps | Missing | No extraction, no table, no prompt coverage |
| 8 | Safety Protocols | Missing | Protocols go to `knowledge_gaps` as text. No structured safety-specific storage |
| 9 | Routing & Hotels | Missing | No structured routing/hotel-per-stop storage |
| 10 | Department SOPs | Missing | Not extracted at all |
| 11 | Escalation Tags | Missing | Not extracted at all |
| 12 | Changelog | Working | `akb_change_log` table exists and is populated |

## Implementation Plan

### Phase 1: New Database Tables

Create 5 new tables to store the missing AKB layers:

**A) `tour_metadata`** — Tour Profile + Governance (Section 1)
- `id`, `tour_id` (unique), `artist`, `region`, `date_range_start`, `date_range_end`, `showtime_standard`, `primary_interface`, `akb_purpose`, `akb_id`, `tour_code`, `season`, `authority`, `change_policy`, `source_doc_id`, `created_at`, `updated_at`
- RLS: Members can SELECT, TA/MGMT can INSERT/UPDATE/DELETE

**B) `tour_policies`** — Guest/Comp Rules + Safety + SOPs (Sections 7, 8, 10)
- `id`, `tour_id`, `policy_type` (enum: `GUEST_COMP`, `SAFETY`, `SOP_PRODUCTION`, `SOP_AUDIO`, `SOP_LIGHTING_VIDEO`, `SOP_SECURITY`, `SOP_MERCH`, `SOP_VIP`, `SOP_HOSPITALITY`, `SOP_TRANSPORTATION`), `policy_data` (JSONB — stores the full structured data for that policy type), `source_doc_id`, `created_at`, `updated_at`
- RLS: Members can SELECT, TA/MGMT can INSERT/UPDATE/DELETE
- JSONB approach avoids needing a separate table per policy type while keeping data queryable

**C) `tour_routing`** — Routing & Hotels per stop (Section 9)
- `id`, `tour_id`, `event_date`, `city`, `hotel_name`, `hotel_checkin`, `hotel_checkout`, `hotel_confirmation`, `routing_notes`, `bus_notes`, `truck_notes`, `confirmed` (boolean), `source_doc_id`, `created_at`
- RLS: Members can SELECT, TA/MGMT can INSERT/UPDATE/DELETE

**D) `tour_travel`** — Structured travel records (Section 6, replacing knowledge_gaps dump)
- `id`, `tour_id`, `travel_date`, `travel_type` (FLIGHT/BUS/VAN/HOTEL/REHEARSAL/OTHER), `description`, `departure`, `arrival`, `hotel_name`, `hotel_checkin`, `hotel_checkout`, `confirmation`, `portal_url`, `special_notices`, `source_doc_id`, `created_at`
- RLS: Members can SELECT, TA/MGMT can INSERT/UPDATE/DELETE

**E) `tour_escalation_tags`** — Escalation router (Section 11)
- `id`, `tour_id`, `tag`, `trigger_topic`, `route_to_contact`, `route_to_role`, `source_doc_id`, `created_at`
- RLS: Members can SELECT, TA/MGMT can INSERT/UPDATE/DELETE

### Phase 2: Add Schedule Standard Fields

Add columns to `schedule_events`:
- `doors` (timestamptz) — already in extraction prompt but not persisted
- `soundcheck` (timestamptz) — already in extraction prompt but not persisted
- `curfew` (timestamptz)
- `is_stop_override` (boolean, default false) — flags stop-specific schedule deviations

### Phase 3: Expand Extraction Prompt

Update `EXTRACTION_PROMPT` to add new extraction targets:

```text
"tour_profile": {
  "artist": "Artist name",
  "tour_name": "Tour name",
  "region": "Region/territory",
  "date_range_start": "YYYY-MM-DD",
  "date_range_end": "YYYY-MM-DD",
  "showtime_standard": "Default showtime e.g. 8:00 PM",
  "primary_interface": "Primary contact or system",
  "akb_purpose": "Purpose statement",
  "akb_id": "AKB identifier if present",
  "tour_code": "Tour code",
  "season": "Season/year",
  "status": "ACTIVE/PLANNING/etc",
  "authority": "Authority statement",
  "change_policy": "Change policy text"
},
"guest_comp_policy": {
  "submission_system": "How guests submit",
  "submission_timing_rule": "When to submit",
  "lock_deadline": "Cutoff text",
  "city_specific_rules": [...],
  "special_cutoffs": [...],
  "ticket_approval_authority": "Who approves tickets",
  "credential_approval_authority": "Who approves credentials",
  "credential_types": ["GUEST", "FAMILY", ...],
  "restrictions": {
    "dressing_room_access": "rule text",
    "catering_access": "rule text",
    "side_stage": "rule text",
    "viewing_location": "rule text"
  }
},
"safety_protocols": {
  "tour_safety_manual": "reference or content",
  "medical_lead_contacts": [...],
  "evacuation_authority": "statement",
  "escalation_rule": "hard-stop rule text"
},
"routing_hotels": [
  {
    "event_date": "YYYY-MM-DD",
    "city": "City",
    "hotel_name": "Hotel",
    "hotel_checkin": "YYYY-MM-DD",
    "hotel_checkout": "YYYY-MM-DD",
    "routing_notes": "notes",
    "bus_notes": "notes",
    "truck_notes": "notes"
  }
],
"department_sops": [
  {
    "department": "PRODUCTION|AUDIO|LIGHTING_VIDEO|SECURITY|MERCH|VIP|HOSPITALITY|TRANSPORTATION",
    "content": "Full SOP text",
    "is_reference_only": true/false,
    "advisory_restriction": "restriction text or null"
  }
],
"escalation_tags": [
  {
    "tag": "TAG_NAME",
    "trigger_topic": "What triggers this",
    "route_to_contact": "Contact name",
    "route_to_role": "Role title"
  }
],
"rehearsals": [
  {
    "date": "YYYY-MM-DD",
    "location": "Rehearsal location",
    "hotel": "Hotel for non-local crew",
    "notes": "details"
  }
]
```

Also add `"doors"`, `"soundcheck"`, and `"curfew"` persistence to schedule_events (already in the prompt schema but not saved to DB).

### Phase 4: Persistence Logic

Update `supabase/functions/extract-document/index.ts` to persist all new sections:

1. **Tour Profile** — Upsert into `tour_metadata` (unique on tour_id, replace on re-extract)
2. **Guest/Comp Policy** — Upsert into `tour_policies` with `policy_type = 'GUEST_COMP'`
3. **Safety Protocols** — Upsert into `tour_policies` with `policy_type = 'SAFETY'`
4. **Department SOPs** — Insert into `tour_policies` with appropriate `policy_type` per department
5. **Routing/Hotels** — Insert into `tour_routing` per stop
6. **Travel** — Insert into `tour_travel` instead of `knowledge_gaps` (structured, not text blobs)
7. **Rehearsals** — Insert into `tour_travel` with `travel_type = 'REHEARSAL'`
8. **Escalation Tags** — Insert into `tour_escalation_tags`
9. **Schedule events** — Also persist `doors`, `soundcheck`, `curfew` columns
10. **Protocols** — Insert into `tour_policies` instead of `knowledge_gaps`

### Phase 5: Update Summary Response

Expand the extraction summary to report all new entity counts so the review dialog shows complete coverage:

```json
{
  "summary": {
    "events": 25,
    "contacts": 8,
    "travel": 12,
    "finance": 0,
    "protocols": 5,
    "venues": 0,
    "tour_profile": 1,
    "guest_policy": 1,
    "safety": 1,
    "routing": 20,
    "sops": 4,
    "escalation_tags": 6,
    "rehearsals": 2
  }
}
```

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/extract-document/index.ts` | Expand prompt, add persistence for all 12 sections, update summary |
| Migration SQL | Create 5 new tables + add 4 columns to schedule_events |

## What Does NOT Change

- Existing schedule_events, contacts, finance_lines, venue_tech_specs tables remain as-is
- Authority dedup logic (Advance Master priority) unchanged
- Tech pack extraction pipeline unchanged
- AKB sovereignty / sign-off gates unchanged
- No frontend changes in this phase (data goes in; UI for viewing new sections can follow)

