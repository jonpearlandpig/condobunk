

# Fix: Extraction Field Keys Don't Match Advance Field Templates

## Root Cause

The extraction AI uses `VENUE_SCHEMA_CATEGORIES` with field keys like `low_steel`, `union_house`, `standard_load_in_time`, `co2_allowed`, etc. But the `advance_field_templates` table uses different keys: `distance_to_low_steel`, `union_venue`, `load_in_call_time`, `co2_confirmed`, etc.

The mapping step at line 506 does `mergedExtracted[field.field_key]` — this silently fails for any key that doesn't exactly match, which is **most of them**.

Template field keys from DB:
```text
EVENT_DETAILS:     venue_name, day_and_date, venue_mode, onsale_capacity, bus_arrival_time, rider_version_sent
PRODUCTION_CONTACT: production_contact_name/phone/email/notes
HOUSE_RIGGER:      house_rigger_name/phone/email/notes
SUMMARY:           distance_to_low_steel, rigging_overlay_submitted, venue_cad_received
SCHEDULE:          load_in_call_time, show_call, show_times, chair_set, labor_call_back
PLANT_EQUIPMENT:   co2_confirmed, forklift_3k/5k_confirmed, shore_power_notes
LABOR:             union_venue, labor_call, labor_notes, followspot_notes, house_electrician_catering_truck, lunch/dinner_headcount, labor_estimate_received
SETTLEMENT_AND_COST: estimated_labor/rigging/power/forklift_cost, settlement_notes, cost_risk_notes
```

Extraction schema keys that DO match: `venue_name`, `production_contact_name/phone/email`, `house_rigger_name/phone/email`. That's only ~7 of ~40 fields.

## Fix (single file change)

**`supabase/functions/advance-venue-analyze/index.ts`**:

1. **Add an alias map** from extraction keys → template field keys (e.g. `low_steel` → `distance_to_low_steel`, `union_house` → `union_venue`, `standard_load_in_time` → `load_in_call_time`, `co2_allowed` → `co2_confirmed`, `shore_power` → `shore_power_notes`).

2. **Update `VENUE_SCHEMA_CATEGORIES`** to also include the template's actual field keys that the AI should try to extract (e.g. `show_times`, `labor_call`, `onsale_capacity`, `venue_mode`, `estimated_labor_cost`). This way the AI extracts data using keys the templates already expect.

3. **In the mapping step (line 492-523)**, apply the alias map: for each extracted key, check the alias map first, then try exact match. This ensures extracted values land on the correct advance_fields rows.

4. **The build error** (`Cannot find package 'rollup'`) is a transient infrastructure issue unrelated to code — it will resolve on retry.

## Files Changed

- **`supabase/functions/advance-venue-analyze/index.ts`**: Add field key alias map, expand extraction schema to include template keys, apply aliases during field mapping step.

