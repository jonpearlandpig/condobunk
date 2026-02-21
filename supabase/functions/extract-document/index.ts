import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import * as XLSX from "npm:xlsx@0.18.5/xlsx.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Domain Detection Engine (Deterministic) ───

const FILENAME_HINTS: Record<string, string[]> = {
  SCHEDULE: ["schedule", "itinerary", "routing", "dates", "calendar"],
  CONTACTS: ["contacts", "directory", "crew", "roster", "personnel"],
  RUN_OF_SHOW: ["ros", "run of show", "runofshow", "runsheet", "cue"],
  FINANCE: ["budget", "settlement", "p&l", "pnl", "finance", "expenses"],
  TRAVEL: ["travel", "flights", "hotel", "transport", "logistics"],
  TECH: ["rider", "stage plot", "tech", "production", "audio", "lighting", "tech pack", "techpack", "tech spec"],
  HOSPITALITY: ["hospitality", "catering", "hotel", "accommodation"],
  CAST: ["cast", "artist", "talent", "performer"],
  VENUE: ["venue", "room", "hall", "arena", "theater"],
};

const KEYWORD_SETS: Record<string, string[]> = {
  SCHEDULE: [
    "load-in", "load in", "doors", "show", "soundcheck", "curfew",
    "venue", "city", "date", "set time", "showtime", "downbeat",
  ],
  CONTACTS: [
    "phone", "email", "cell", "ext", "manager", "production",
    "foh", "monitor", "ld", "rigger", "tm", "promoter", "@",
  ],
  RUN_OF_SHOW: [
    "act", "intro", "walk-on", "cues", "setlist", "segment",
    "timecode", "blackout", "encore", "intermission",
  ],
  FINANCE: [
    "gross", "net", "guarantee", "settlement", "expenses",
    "labor", "catering", "hotel", "per diem", "merch", "$",
  ],
  TRAVEL: [
    "flight", "depart", "arrive", "hotel", "check-in",
    "checkout", "bus", "van", "driver", "pickup",
  ],
  TECH: [
    "proscenium", "stage depth", "stage width", "grid height", "rigging",
    "counterweight", "line sets", "arbor", "dock", "load-in", "forklift",
    "company switch", "amps", "cam lock", "foh", "clearcom", "washer",
    "dryer", "iatse", "union", "firewatch", "fly system",
  ],
};

interface DomainResult {
  doc_type: string;
  confidence: number;
  scores: Record<string, number>;
}

function detectDomain(filename: string, text: string): DomainResult {
  const fn = filename.toLowerCase();
  const lowerText = text.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [dtype, hints] of Object.entries(FILENAME_HINTS)) {
    scores[dtype] = (scores[dtype] || 0);
    for (const hint of hints) {
      if (fn.includes(hint)) {
        scores[dtype] += 0.45;
        break;
      }
    }
  }

  for (const [dtype, keywords] of Object.entries(KEYWORD_SETS)) {
    let matched = 0;
    for (const kw of keywords) {
      if (lowerText.includes(kw)) matched++;
    }
    const kwScore = Math.min(matched / Math.max(keywords.length * 0.4, 1), 1) * 0.35;
    scores[dtype] = (scores[dtype] || 0) + kwScore;
  }

  const timePattern = /\b\d{1,2}:\d{2}\s*(am|pm|AM|PM)?\b/g;
  const emailPattern = /[\w.+-]+@[\w-]+\.[\w.]+/g;
  const phonePattern = /(\+1|1)?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
  const currencyPattern = /\$[\d,.]+/g;

  const timeCount = (lowerText.match(timePattern) || []).length;
  const emailCount = (text.match(emailPattern) || []).length;
  const phoneCount = (text.match(phonePattern) || []).length;
  const currencyCount = (text.match(currencyPattern) || []).length;

  if (timeCount > 5) {
    scores["SCHEDULE"] = (scores["SCHEDULE"] || 0) + 0.15;
    scores["RUN_OF_SHOW"] = (scores["RUN_OF_SHOW"] || 0) + 0.10;
  }
  if (emailCount > 3 || phoneCount > 3) {
    scores["CONTACTS"] = (scores["CONTACTS"] || 0) + 0.20;
  }
  if (currencyCount > 3) {
    scores["FINANCE"] = (scores["FINANCE"] || 0) + 0.20;
  }

  let topType = "UNKNOWN";
  let topScore = 0;
  for (const [dtype, score] of Object.entries(scores)) {
    if (score > topScore) {
      topScore = score;
      topType = dtype;
    }
  }

  if (topScore < 0.30) topType = "UNKNOWN";
  return { doc_type: topType, confidence: topScore, scores };
}

// ─── AI-Powered Structured Extraction ───

const EXTRACTION_PROMPT = `You are a tour document extraction engine for the live music industry. Your job is to extract EVERY piece of structured data from tour documents with zero data loss. Missing even one detail (a call time, a travel day, a crew name) is a critical failure.

Return a JSON object with these fields (include only what you find, omit empty arrays):

{
  "tour_name": "Artist Name — Tour Name" or null,
  "doc_type": "SCHEDULE" | "CONTACTS" | "RUN_OF_SHOW" | "FINANCE" | "TRAVEL" | "TECH" | "HOSPITALITY" | "LOGISTICS" | "CAST" | "VENUE" | "UNKNOWN",
  "schedule_events": [
    {
      "event_date": "YYYY-MM-DD",
      "city": "City, ST" (always include state/province abbreviation),
      "venue": "Venue Name",
      "load_in": "HH:MM" (24h) — this is the EARLIEST call time or first activity of the day,
      "show_time": "HH:MM" (24h) — the actual performance/show start time, not rehearsal,
      "end_time": "HH:MM" (24h) — the last scheduled activity end time for that day,
      "doors": "HH:MM" (24h),
      "soundcheck": "HH:MM" (24h),
      "notes": "FULL daily schedule. Line 1 = day title (e.g. 'Band Only Rehearsal' or 'Travel Day' or 'Day Off'). Lines 2+ = every activity with times, one per line. Include ALL: crew calls, rigging, load-ins, soundchecks, rehearsals, tech checks, cue-to-cues, meals (LUNCH, DINNER), breaks, production handovers, lighting sessions, load outs. NEVER skip an activity."
    }
  ],
  "contacts": [
    {
      "name": "Full Name",
      "role": "ROLE TITLE",
      "phone": "phone number",
      "email": "email@domain.com"
    }
  ],
  "travel": [
    {
      "date": "YYYY-MM-DD",
      "type": "FLIGHT" | "BUS" | "VAN" | "HOTEL" | "OTHER",
      "description": "Details",
      "departure": "departure location or time",
      "arrival": "arrival location or time",
      "hotel_name": "hotel name if applicable",
      "hotel_checkin": "YYYY-MM-DD",
      "hotel_checkout": "YYYY-MM-DD",
      "confirmation": "confirmation number if found"
    }
  ],
  "finance": [
    {
      "category": "Category name",
      "amount": 1234.56,
      "venue": "venue if applicable",
      "line_date": "YYYY-MM-DD if applicable"
    }
  ],
  "protocols": [
    {
      "category": "SECURITY" | "HOSPITALITY" | "PRODUCTION" | "CATERING" | "DRESSING_ROOM" | "OTHER",
      "title": "Protocol title",
      "details": "Full protocol text/requirements"
    }
  ],
  "venues": [
    {
      "name": "Venue Name",
      "city": "City",
      "state": "State/Province",
      "capacity": 1234,
      "address": "Full address if available",
      "contact_name": "Venue contact",
      "contact_phone": "phone",
      "contact_email": "email",
      "notes": "any venue-specific notes"
    }
  ]
}

MISSION-CRITICAL RULES:

SCHEDULE EXTRACTION:
- Extract EVERY day mentioned in the document — including Travel Days, Day Offs, Prep Days, Load In Days, Rehearsal Days. These are NOT optional. If a weekly overview strip shows "Sun: Travel Day, Mon: Travel Day, Tue: Backline Prep" — those MUST each become a schedule_event.
- "load_in" = the EARLIEST call time or first activity of the day (e.g., if Rigging Mark Up is at 08:00 and Load In is at 09:00, load_in = "08:00").
- "end_time" = the LAST activity's end time for that day.
- The "notes" field is the MOST IMPORTANT field. It must contain the COMPLETE daily production schedule with EVERY time block. Format: first line = day description, subsequent lines = "Activity Name: Time" or "Activity Name: Start Time - End Time". Never omit meals, breaks, or any scheduled block.
- If a document has one page per day, create one schedule_event per day.
- If a document has a weekly overview strip/table at the bottom of pages, extract ALL days from it — including days without their own dedicated page. These often show Travel Days, Off Days, and Prep Days that have no other page.
- For cities, ALWAYS include the state abbreviation (e.g., "Nashville, TN" not just "Nashville").

GENERAL:
- Extract EVERYTHING you can find, even partial data.
- For dates, always use YYYY-MM-DD format. If only month/day given, assume the most likely year.
- For times, use 24-hour HH:MM format.
- CRITICAL: If a time (show_time, doors, soundcheck) is NOT explicitly stated, set it to null. NEVER guess. Only include times literally written in the source.
- For contacts, capture ALL people mentioned with any identifying info.
- For travel, capture flights, buses, hotels, ground transport — anything.
- For protocols, capture rider requirements, security protocols, hospitality needs, dressing room requirements, catering specs.
- For venues, capture the full address, capacity, and any venue contacts mentioned.
- Return ONLY valid JSON, no markdown formatting, no code blocks.
- If the document covers multiple categories (schedule + contacts + travel), extract ALL of them.
- ZERO DATA LOSS. If you can read it in the document, it must appear in the output.`;

// ─── Tech Pack Extraction Prompt ───

const TECH_PACK_PROMPT = `You are a venue tech pack extraction engine for the live touring industry. Your job is to extract ALL operational specifications from a venue tech pack / tech rider document into a structured format. Missing even one specification is a failure.

Return a JSON object with these fields:

{
  "venue_name": "Official Venue Name",
  "normalized_venue_name": "lowercase-hyphenated-venue-name",

  "venue_identity": {
    "official_name": "Full official name",
    "address": "Full street address",
    "main_phone": "phone",
    "production_contacts": [{"name": "Name", "title": "Title", "phone": "phone", "email": "email"}],
    "union_house": true/false/null,
    "union_local": "IATSE Local #" or null
  },

  "stage_specs": {
    "proscenium_width": "measurement",
    "proscenium_height": "measurement",
    "stage_width_wall_to_wall": "measurement",
    "stage_depth_pl_to_back": "measurement",
    "grid_height": "measurement",
    "wing_space_sr": "measurement",
    "wing_space_sl": "measurement",
    "crossover": true/false/null,
    "apron_dimensions": "measurement",
    "pit_type": "open/covered/lift/none",
    "pit_dimensions": "measurement",
    "stage_surface": "masonite/marley/wood/concrete/etc",
    "notes": "any additional stage notes"
  },

  "rigging_system": {
    "counterweight_type": "single purchase/double purchase/etc",
    "total_line_sets": number or null,
    "line_set_spacing": "measurement",
    "pipe_length": "measurement",
    "max_arbor_weight": "weight",
    "total_counterweight_capacity": "weight",
    "electric_line_sets": number or null,
    "motorized_sets": number or null,
    "acoustic_clouds": "description or null",
    "immovable_battens": "description or null",
    "foh_rigging_positions": "description",
    "followspot_positions": "description",
    "followspot_throw_distance": "measurement",
    "notes": "any additional rigging notes"
  },

  "dock_load_in": {
    "dock_door_width": "measurement",
    "dock_door_height": "measurement",
    "dock_height": "truck level/street load/measurement",
    "truck_capacity": number or null,
    "push_distance_ft": number or null,
    "push_notes": "ramp/stairs/elevator details",
    "forklift_available": true/false/null,
    "stacking_motor_location": "description",
    "security_stage_door_notes": "description",
    "bus_parking": "description",
    "bus_shore_power": true/false/null,
    "bus_shore_power_rating": "rating",
    "notes": "any additional dock notes"
  },

  "power": {
    "company_switch_amps": "amps",
    "company_switch_phase": "phase",
    "company_switch_cam_type": "cam type",
    "company_switch_location": "USR/DSL/dock/etc",
    "isolated_audio_ground": true/false/null,
    "foh_power": "description",
    "bus_power_rating": "rating",
    "notes": "any additional power notes"
  },

  "lighting_audio": {
    "foh_positions": "bridge/catwalk/balcony rail/etc",
    "house_spot_inventory": "description",
    "clearcom_wired_count": number or null,
    "clearcom_wireless_count": number or null,
    "house_console_type": "console model",
    "speaker_system": "system type/model",
    "blackout_capability": true/false/null,
    "notes": "any additional lighting/audio notes"
  },

  "wardrobe_laundry": {
    "washer_count": number or null,
    "dryer_count": number or null,
    "wardrobe_room_location": "description",
    "rolling_racks_count": number or null,
    "quick_change_areas": "description",
    "notes": "any additional wardrobe notes"
  },

  "labor_union": {
    "iatse_local": "local number or null",
    "minimum_calls": "description",
    "required_heads": "description",
    "coffee_break_rules": "description",
    "meal_rules": "description",
    "firewatch_required": true/false/null,
    "notes": "any additional labor notes"
  },

  "permanent_installations": {
    "orchestra_clouds_height": "measurement",
    "border_lights_clearance": "measurement",
    "fixed_electrics": "description",
    "immovable_cyc_or_traveler": "description",
    "notes": "any additional notes"
  },

  "production_compatibility": {
    "truss_vs_pipe_length": "comparison notes",
    "motor_quantity_vs_capacity": "comparison notes",
    "led_wall_hang_positions": "description",
    "co2_usage_allowed": true/false/null,
    "low_fog_vs_hvac": "notes",
    "foh_truss_sightlines": "notes",
    "notes": "any additional compatibility notes"
  },

  "contact_chain_of_command": {
    "production_manager": {"name": "", "phone": "", "email": ""},
    "technical_director": {"name": "", "phone": "", "email": ""},
    "head_rigger": {"name": "", "phone": "", "email": ""},
    "foh_engineer": {"name": "", "phone": "", "email": ""},
    "security_lead": {"name": "", "phone": "", "email": ""},
    "promoter_rep": {"name": "", "phone": "", "email": ""},
    "after_hours_emergency": [{"name": "", "phone": "", "role": ""}],
    "escalation_hierarchy": "description of escalation chain",
    "notes": "any additional notes"
  },

  "insurance_liability": {
    "coi_required": true/false/null,
    "additional_insured_language": "description",
    "coverage_minimums": "dollar amounts or description",
    "fire_marshal_rules": "description",
    "pyro_restrictions": "description",
    "haze_restrictions": "description",
    "indemnification_clauses": "description",
    "notes": "any additional notes"
  },

  "safety_compliance": {
    "osha_requirements": "description",
    "fall_protection_rules": "description",
    "ppe_requirements": "description",
    "fire_lanes": "description",
    "emergency_exits": "description or count",
    "evacuation_protocols": "description",
    "local_curfew_enforcement": "description",
    "notes": "any additional notes"
  },

  "security_crowd_control": {
    "barricade_type": "type description",
    "crowd_capacity_by_section": "description or object",
    "security_staffing_ratios": "description",
    "bag_policy": "description",
    "artist_escort_paths": "description",
    "credential_zones": "description",
    "notes": "any additional notes"
  },

  "hospitality_catering": {
    "green_room_size": "measurement or description",
    "catering_kitchen_capabilities": "description",
    "dietary_limitations": "description",
    "local_vendor_restrictions": "description",
    "runner_policy": "description",
    "meal_break_rules": "description",
    "notes": "any additional notes"
  },

  "comms_infrastructure": {
    "in_house_radio_system": "description",
    "rf_coordination_policies": "description",
    "comms_frequency_conflicts": "description",
    "wifi_bandwidth": "description",
    "hardline_phone_drops": "description or count",
    "das_cellular_performance": "description",
    "notes": "any additional notes"
  },

  "it_network": {
    "network_access_policies": "description",
    "vlan_availability": "description",
    "static_ip_capability": true/false/null,
    "firewall_constraints": "description",
    "media_ingest_speeds": "description",
    "cloud_streaming_support": "description",
    "notes": "any additional notes"
  },

  "environmental_conditions": {
    "hvac_capacity": "description",
    "temperature_limits": "description",
    "load_dock_weather_exposure": "description",
    "humidity_control": "description",
    "noise_bleed": "description",
    "acoustic_profile_notes": "description",
    "notes": "any additional notes"
  },

  "local_ordinances": {
    "sound_curfew_time": "time or description",
    "overtime_penalties": "description",
    "pyro_permits": "description",
    "union_jurisdiction_disputes": "description",
    "labor_meal_penalties": "description",
    "truck_idling_restrictions": "description",
    "notes": "any additional notes"
  },

  "financial_settlement": {
    "ticket_tax_rate": "percentage or description",
    "facility_fees": "description",
    "merchandise_percentage": "percentage or description",
    "credit_card_fees": "description",
    "box_office_reporting_standards": "description",
    "union_overtime_triggers": "description",
    "house_nut_structure": "description",
    "notes": "any additional notes"
  },

  "venue_history": {
    "prior_incidents": "description",
    "known_bottlenecks": "description",
    "past_tour_notes": "description",
    "past_settlement_variances": "description",
    "rigging_red_flags": "description",
    "load_in_delays_historically": "description",
    "notes": "any additional notes"
  },

  "transportation_logistics": {
    "bus_truck_parking": "description",
    "shore_power_availability": "description",
    "truck_staging_limits": "description",
    "police_escort_requirements": "description",
    "airport_proximity": "description",
    "city_traffic_constraints": "description",
    "notes": "any additional notes"
  },

  "ada_accessibility": {
    "wheelchair_seating_layout": "description",
    "accessible_dressing_rooms": "description",
    "lift_availability": "description",
    "asl_placement_policies": "description",
    "accessible_merch_path": "description",
    "notes": "any additional notes"
  },

  "content_media_policy": {
    "in_house_video_rights": "description",
    "recording_restrictions": "description",
    "drone_policy": "description",
    "press_access_rules": "description",
    "backstage_media_zones": "description",
    "notes": "any additional notes"
  },

  "load_out_constraints": {
    "hard_curfew_on_load_out": "time or description",
    "overnight_parking_policy": "description",
    "dock_availability_window": "description",
    "noise_restrictions_after_show": "description",
    "elevator_downtime": "description",
    "notes": "any additional notes"
  },

  "risk_flags": [
    {
      "category": "STAGE" | "RIGGING" | "DOCK" | "POWER" | "LIGHTING_AUDIO" | "WARDROBE" | "LABOR" | "PERMANENT_INSTALL" | "COMPATIBILITY" | "INSURANCE" | "SAFETY" | "SECURITY" | "FINANCIAL" | "LOCAL_ORDINANCE" | "LOGISTICS" | "ENVIRONMENTAL",
      "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "title": "Short risk title (e.g. 'Short Stage')",
      "detail": "Specific detail (e.g. 'Stage depth 26ft < 30ft minimum')"
    }
  ],

  "contacts": [
    {
      "name": "Full Name",
      "role": "ROLE TITLE",
      "phone": "phone number",
      "email": "email@domain.com"
    }
  ]
}

RISK FLAG DETECTION RULES — flag ALL that apply:
- Stage depth < 30ft → HIGH "Short Stage"
- Grid height < 40ft → HIGH "Low Grid"
- Wing space < 8ft or no crossover → MEDIUM "Limited Backstage Flow"
- Dock door < 10'×10' → MEDIUM "Tight Dock Door"
- Push distance > 200ft → MEDIUM "Difficult Load-In/Out"
- Street load or ramp → MEDIUM "Load-In Complexity"
- No bus shore power → LOW "Bus Power Shortfall"
- Insufficient amperage for touring rig → HIGH "Insufficient Power"
- No isolated audio ground → MEDIUM "No Isolated Ground"
- No full blackout capability → MEDIUM "No Full Blackout"
- Limited comm positions → LOW "Limited Comms"
- Fewer than 2 washers or dryers → MEDIUM "Laundry Capacity Risk"
- Union-only restrictions → LOW "Union Restrictions"
- Firewatch required → MEDIUM "Firewatch Required"
- Restricted hours → MEDIUM "Restricted Hours"
- No haze/CO₂/pyro allowed → HIGH "Effects Restricted"
- Acoustic cloud interference → HIGH "Rigging Conflict — Acoustic Clouds"
- Non-movable line sets blocking positions → HIGH "Rigging Conflict — Immovable Battens"
- Weight conflicts on arbors → CRITICAL "Weight Limit Exceeded"

CRITICAL RULES:
- Extract EVERY measurement, number, and specification you can find.
- If a value is not stated, set it to null. NEVER guess.
- Normalize the venue name to lowercase-hyphenated (e.g. "Fox Theatre" → "fox-theatre").
- For contacts, extract ALL venue staff mentioned (TD, Production Manager, Head Carpenter, etc.).
- Return ONLY valid JSON, no markdown formatting, no code blocks.
- ZERO DATA LOSS. If you can read it, it must appear in the output.`;

// ─── Advance Master VAN Extraction Prompt ───

const ADVANCE_MASTER_VAN_PROMPT = `You are the Advance Master extraction engine for the live touring industry. This document is a columnar spreadsheet where CITIES are across the header row and CATEGORIES run down the left column. Your job is to extract ALL advance notes for EVERY venue/city into structured Venue Advance Notes (VANs).

Return a JSON object:
{
  "venues": [
    {
      "venue_name": "Official Venue Name",
      "normalized_venue_name": "lowercase-hyphenated-venue-name",
      "city": "City, ST",
      "event_date": "YYYY-MM-DD" or null,

      "event_details": {
        "day_and_date": "full day and date string",
        "venue": "venue name",
        "onsale_capacity": "capacity and sales info verbatim",
        "production_rider_sent": "Yes/No/description",
        "bus_arrival_time": "time or description"
      },

      "production_contact": {"name": "", "phone": "", "email": "", "notes": ""},
      "house_rigger_contact": {"name": "", "phone": "", "email": "", "notes": ""},

      "summary": {
        "cad_received": "verbatim response",
        "rigging_overlay_done": "verbatim response",
        "distance_to_low_steel": "verbatim measurement and notes"
      },

      "venue_schedule": {
        "chair_set": "time",
        "show_times": "doors and show times verbatim"
      },

      "plant_equipment": {
        "forklifts": "verbatim forklift description",
        "co2_confirmed": "verbatim CO2 status"
      },

      "labour": {
        "union_venue": "verbatim union status",
        "labor_notes": "FULL verbatim labor rules, minimums, meal penalties, overtime rules — capture EVERYTHING",
        "labor_estimate_received": "verbatim response",
        "labor_call": "verbatim description",
        "number_to_feed": "verbatim feed count",
        "house_electrician_catering": "verbatim",
        "follow_spots": "verbatim description"
      },

      "dock_and_logistics": {
        "loading_dock": "verbatim dock description with count and type",
        "distance_dock_to_stage": "verbatim distance",
        "trucks_parked": "verbatim parking rules",
        "bus_trailer_unload": "verbatim",
        "parking_situation": "verbatim parking description",
        "catering_truck": "verbatim",
        "merch_truck": "verbatim",
        "vom_entry": "verbatim vom/entry description",
        "height_to_seating": "verbatim measurement"
      },

      "power": {
        "power_available": "FULL verbatim power description with amps, phases, locations",
        "catering_power": "verbatim"
      },

      "staging": {
        "foh_vip_risers": "verbatim",
        "vip_riser_height": "verbatim measurement",
        "handrails": "verbatim",
        "foh_lighting_riser": "verbatim",
        "camera_risers": "verbatim",
        "preset_in_place": "verbatim",
        "end_stage_curtain": "verbatim",
        "bike_rack": "verbatim"
      },

      "misc": {
        "curfew": "verbatim",
        "dead_case_storage": "verbatim description",
        "haze_restrictions": "verbatim",
        "audio_spl_restrictions": "verbatim"
      },

      "lighting": {
        "houselight_control": "verbatim dimmable/control/comms description"
      },

      "video": {
        "flypack_location": "verbatim",
        "hardline_internet": "verbatim",
        "house_tv_patch": "verbatim with resolution",
        "led_ribbon": "verbatim"
      },

      "notes": "any additional notes from the NOTES row for this venue",

      "risk_flags": [
        {
          "category": "DOCK" | "RIGGING" | "POWER" | "LABOR" | "STAGING" | "LOGISTICS" | "SAFETY",
          "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
          "title": "Short risk title",
          "detail": "Specific detail about the risk"
        }
      ]
    }
  ]
}

CRITICAL RULES:
- Extract EVERY venue/city column. Do NOT skip any venue.
- Each venue gets its own object in the "venues" array.
- CAPTURE VERBATIM: Copy the exact text from each cell. Do NOT summarize, paraphrase, or truncate. The touring production team needs the EXACT words from the advance.
- If a venue column has blank/empty cells, set those fields to null.
- For dates, use YYYY-MM-DD format.
- For times in event_details and venue_schedule, keep the original format (e.g., "5:30pm doors 7pm show").
- The labour.labor_notes field is CRITICAL — capture the COMPLETE labor rules including minimums, meal penalties, overtime, department rules, etc. This is often the longest field. Do NOT truncate.
- Flag risks: no docks, long push distance (>200ft), restricted haze, complex union rules, limited power, no CO2, street load.
- Return ONLY valid JSON, no markdown, no code blocks.
- ZERO DATA LOSS. Every cell of data in every venue column must appear.`;

// ─── Multi-Venue Master Document Prompt (legacy non-advance-master) ───

const MULTI_VENUE_PROMPT = `You are a multi-venue production confirmation extraction engine for the live touring industry. This document contains a GRID or TABLE with one column per venue/city. Your job is to extract ALL data for EVERY venue into separate objects.

Return a JSON object:
{
  "venues": [
    {
      "venue_name": "Official Venue Name",
      "normalized_venue_name": "lowercase-hyphenated-venue-name",
      "city": "City, ST",
      "event_date": "YYYY-MM-DD" or null,
      "doors_time": "HH:MM" (24h) or null,
      "show_time": "HH:MM" (24h) or null,
      "chair_set_time": "HH:MM" (24h) or null,
      "bus_arrival_time": "description" or null,
      "capacity": "capacity description" or null,
      "production_rider_sent": true/false/null,

      "production_contact": {"name": "", "phone": "", "email": ""},
      "house_rigger": {"name": "", "phone": "", "email": ""},
      "additional_contacts": [{"name": "", "role": "", "phone": "", "email": ""}],

      "dock_load_in": {
        "num_docks": number or null,
        "dock_description": "description",
        "push_distance_ft": number or null,
        "push_notes": "description",
        "truck_parking": "description",
        "vom_entry": "description",
        "height_to_seating": "description"
      },

      "rigging_system": {
        "distance_to_low_steel": "measurement",
        "cad_received": true/false/null,
        "rigging_overlay_done": true/false/null,
        "notes": "additional rigging notes"
      },

      "power": {
        "power_available": "full power description with amps, phases, locations",
        "catering_power": "description or null"
      },

      "labor_union": {
        "union_status": "Union/Non-union description",
        "labor_notes": "full labor rules, minimums, meal penalties, overtime rules",
        "labor_estimate_received": true/false/null,
        "labor_call": "description",
        "feed_count": "number to feed description"
      },

      "staging": {
        "vip_risers": "description",
        "vip_riser_height": "measurement",
        "handrails": "description",
        "foh_riser": "description",
        "camera_risers": "description",
        "preset": "description",
        "end_stage_curtain": "description",
        "bike_rack": "description"
      },

      "plant_equipment": {
        "forklifts": "forklift description",
        "co2": "CO2 status"
      },

      "lighting_audio": {
        "house_lights": "dimmable, control method, comms",
        "follow_spots": "description",
        "haze_restrictions": "description",
        "spl_restrictions": "description"
      },

      "video": {
        "flypack_location": "description",
        "hardline_internet": "description",
        "house_tv_patch": "description and resolution",
        "led_ribbon": "description"
      },

      "misc": {
        "curfew": "description",
        "dead_case_storage": "description",
        "notes": "any other notes"
      },

      "risk_flags": [
        {
          "category": "DOCK" | "RIGGING" | "POWER" | "LABOR" | "STAGING" | "LOGISTICS" | "SAFETY",
          "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
          "title": "Short risk title",
          "detail": "Specific detail about the risk"
        }
      ]
    }
  ]
}

CRITICAL RULES:
- Extract EVERY venue column. Do NOT skip any venue.
- Each venue gets its own object in the "venues" array.
- If a venue column has blank/empty cells, set those fields to null.
- For dates, use YYYY-MM-DD. For times, use 24h HH:MM.
- For contacts, extract the production contact AND house rigger separately.
- Flag risks: no docks, long push distance, tight dock doors, restricted haze, union overtime complexity, limited power.
- Return ONLY valid JSON, no markdown, no code blocks.
- ZERO DATA LOSS. Every cell of data in every venue column must appear.`;


interface AIExtractionResult {
  tour_name?: string | null;
  doc_type?: string;
  schedule_events?: Array<{
    event_date?: string;
    city?: string;
    venue?: string;
    load_in?: string;
    show_time?: string;
    end_time?: string;
    doors?: string;
    soundcheck?: string;
    notes?: string;
  }>;
  contacts?: Array<{
    name: string;
    role?: string;
    phone?: string;
    email?: string;
  }>;
  travel?: Array<{
    date?: string;
    type?: string;
    description?: string;
    departure?: string;
    arrival?: string;
    hotel_name?: string;
    hotel_checkin?: string;
    hotel_checkout?: string;
    confirmation?: string;
  }>;
  finance?: Array<{
    category?: string;
    amount?: number;
    venue?: string;
    line_date?: string;
  }>;
  protocols?: Array<{
    category?: string;
    title?: string;
    details?: string;
  }>;
  venues?: Array<{
    name?: string;
    city?: string;
    state?: string;
    capacity?: number;
    address?: string;
    contact_name?: string;
    contact_phone?: string;
    contact_email?: string;
    notes?: string;
  }>;
}

interface TechPackResult {
  venue_name: string;
  normalized_venue_name: string;
  venue_identity: Record<string, unknown>;
  stage_specs: Record<string, unknown>;
  rigging_system: Record<string, unknown>;
  dock_load_in: Record<string, unknown>;
  power: Record<string, unknown>;
  lighting_audio: Record<string, unknown>;
  wardrobe_laundry: Record<string, unknown>;
  labor_union: Record<string, unknown>;
  permanent_installations: Record<string, unknown>;
  production_compatibility: Record<string, unknown>;
  contact_chain_of_command: Record<string, unknown>;
  insurance_liability: Record<string, unknown>;
  safety_compliance: Record<string, unknown>;
  security_crowd_control: Record<string, unknown>;
  hospitality_catering: Record<string, unknown>;
  comms_infrastructure: Record<string, unknown>;
  it_network: Record<string, unknown>;
  environmental_conditions: Record<string, unknown>;
  local_ordinances: Record<string, unknown>;
  financial_settlement: Record<string, unknown>;
  venue_history: Record<string, unknown>;
  transportation_logistics: Record<string, unknown>;
  ada_accessibility: Record<string, unknown>;
  content_media_policy: Record<string, unknown>;
  load_out_constraints: Record<string, unknown>;
  risk_flags: Array<{
    category: string;
    severity: string;
    title: string;
    detail: string;
  }>;
  contacts?: Array<{
    name: string;
    role?: string;
    phone?: string;
    email?: string;
  }>;
}

// Single AI call: extract structured data directly from PDF or text
async function aiExtractFromPdf(base64: string, apiKey: string, prompt: string, mimeType = "application/pdf"): Promise<unknown | null> {
  try {
    console.log("[extract] Single-pass binary structured extraction... mimeType:", mimeType);
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
            ],
          },
        ],
      }),
    });

    console.log("[extract] PDF extraction response status:", resp.status);
    if (!resp.ok) {
      const errBody = await resp.text();
      console.error("[extract] PDF extraction failed:", resp.status, errBody);
      return null;
    }

    const data = await resp.json();
    let content = data.choices?.[0]?.message?.content || "";
    content = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    return JSON.parse(content);
  } catch (err) {
    console.error("[extract] PDF structured extraction failed:", err);
    return null;
  }
}

async function aiExtractFromText(text: string, apiKey: string, prompt: string, model = "google/gemini-2.5-flash", maxChars = 60000): Promise<unknown | null> {
  try {
    console.log("[extract] Text structured extraction... model:", model, "chars:", Math.min(text.length, maxChars));
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: text.substring(0, maxChars) },
        ],
      }),
    });

    if (!resp.ok) {
      console.error("[extract] Text extraction API error:", resp.status);
      return null;
    }

    const data = await resp.json();
    let content = data.choices?.[0]?.message?.content || "";
    content = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    // Escape control characters inside JSON string values
    content = content.replace(/[\x00-\x1F\x7F]/g, (ch) => {
      if (ch === '\n') return '\\n';
      if (ch === '\r') return '\\r';
      if (ch === '\t') return '\\t';
      return '';
    });
    return JSON.parse(content);
  } catch (err) {
    console.error("[extract] Text extraction failed:", err);
    return null;
  }
}

// Determine if a document is an Advance Master (highest authority)
function isAdvanceMasterDocument(filename: string, rawText: string): boolean {
  const fn = filename.toLowerCase();
  if (fn.includes("advance") && fn.includes("master")) return true;
  if (fn.includes("advance_master") || fn.includes("advance master")) return true;
  return false;
}

// Determine if a document is a multi-venue master (production confirmation grid)
function isMultiVenueDocument(filename: string, rawText: string): boolean {
  const fn = filename.toLowerCase();
  const multiHints = ["master", "production confirmation", "venue confirmation", "prod confirm",
    "venue_production_confirmation", "venue production confirmation", "advance"];
  for (const hint of multiHints) {
    if (fn.includes(hint)) return true;
  }
  // Content check: multiple venue names in a tabular pattern
  if (rawText) {
    const lower = rawText.toLowerCase();
    const venueSignals = ["arena", "center", "coliseum", "garden", "theatre", "theater", "stadium", "amphitheatre"];
    let venueHits = 0;
    for (const sig of venueSignals) {
      const count = (lower.match(new RegExp(sig, "g")) || []).length;
      if (count >= 2) venueHits++;
    }
    // Also check for grid-like signals
    const hasGrid = lower.includes("production contact") && lower.includes("venue") && (lower.includes("loading dock") || lower.includes("power available"));
    if (venueHits >= 2 && hasGrid) return true;
  }
  return false;
}

// Determine if a document is likely a tech pack based on filename + content hints
function isTechPackDocument(filename: string, rawText: string): boolean {
  const fn = filename.toLowerCase();
  const techHints = ["tech pack", "techpack", "tech spec", "tech rider", "venue spec", "stage spec",
    "tech info", "technical information", "venue information", "production information",
    "techdeck", "tech deck", "tech_deck", "tech-deck"];
  for (const hint of techHints) {
    if (fn.includes(hint)) return true;
  }
  // Check content for heavy tech pack signals
  if (rawText) {
    const lower = rawText.toLowerCase();
    const techSignals = ["proscenium", "stage depth", "grid height", "counterweight",
      "line sets", "dock door", "company switch", "rigging"];
    let hits = 0;
    for (const sig of techSignals) {
      if (lower.includes(sig)) hits++;
    }
    if (hits >= 3) return true;
  }
  return false;
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");

    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { document_id } = await req.json();
    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch document
    const { data: doc, error: docErr } = await adminClient
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .single();

    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is tour member
    const { data: membership } = await adminClient
      .from("tour_members")
      .select("role")
      .eq("tour_id", doc.tour_id)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["TA", "MGMT"].includes(membership.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let rawText = doc.raw_text || "";
    const filename = doc.filename || "";
    let base64Data: string | null = null;
    let base64MimeType = "application/pdf";
    const isPdf = filename.toLowerCase().endsWith(".pdf");
    const isExcel = /\.xlsx?$/i.test(filename.toLowerCase());

    // ── Download binary if needed ──
    if (!rawText && doc.file_path) {
      const { data: fileData, error: dlErr } = await adminClient.storage
        .from("document-files")
        .download(doc.file_path);

      if (!dlErr && fileData) {
        if (isExcel) {
          // Parse Excel to CSV text using SheetJS — Gemini doesn't support xlsx MIME type
          const arrayBuf = await fileData.arrayBuffer();
          const wb = XLSX.read(new Uint8Array(arrayBuf), { type: "array", dense: true });
          const csvParts: string[] = [];
          for (const sheetName of wb.SheetNames) {
            const ws = wb.Sheets[sheetName];
            csvParts.push(`--- Sheet: ${sheetName} ---`);
            csvParts.push(XLSX.utils.sheet_to_csv(ws));
          }
          rawText = csvParts.join("\n\n");
          console.log("[extract] Excel parsed to CSV text, length:", rawText.length);
        } else if (isPdf) {
          const arrayBuf = await fileData.arrayBuffer();
          const bytes = new Uint8Array(arrayBuf);
          let binary = "";
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          base64Data = btoa(binary);
          base64MimeType = "application/pdf";
          console.log("[extract] PDF binary file size:", bytes.length, "bytes");
        } else {
          rawText = await fileData.text();
        }
      }
    }

    // ── Determine document type ──
    const isAdvanceMaster = isAdvanceMasterDocument(filename, rawText || "");
    const isMultiVenue = isMultiVenueDocument(filename, rawText || "");
    const isTechPack = !isMultiVenue && isTechPackDocument(filename, rawText || "");
    console.log("[extract] isAdvanceMaster:", isAdvanceMaster, "isMultiVenue:", isMultiVenue, "isTechPack:", isTechPack, "filename:", filename);

    // Advance Master doc_type = SCHEDULE (for TELA authority hierarchy)
    const multiVenueDocType = isAdvanceMaster ? "SCHEDULE" : "TECH";

    // ═══ MULTI-VENUE MASTER EXTRACTION PATH ═══
    if (isMultiVenue && apiKey) {
      let multiResult: { venues: Array<Record<string, unknown>> } | null = null;

      // Use flash model for speed (avoids timeout) — still high quality for structured extraction
      const extractModel = "google/gemini-2.5-flash";
      const maxChars = isAdvanceMaster ? 80000 : 60000;
      // Use dedicated VAN prompt for advance masters
      const extractPrompt = isAdvanceMaster ? ADVANCE_MASTER_VAN_PROMPT : MULTI_VENUE_PROMPT;

      if (base64Data) {
        multiResult = await aiExtractFromPdf(base64Data, apiKey, extractPrompt, base64MimeType) as typeof multiResult;
      } else if (rawText) {
        multiResult = await aiExtractFromText(rawText, apiKey, extractPrompt, extractModel, maxChars) as typeof multiResult;
      }

      if (multiResult && multiResult.venues && multiResult.venues.length > 0) {
        console.log("[extract] Multi-venue extraction found", multiResult.venues.length, "venues, isAdvanceMaster:", isAdvanceMaster);

        // Save raw text
        if (rawText && !doc.raw_text) {
          await adminClient.from("documents").update({ raw_text: rawText }).eq("id", document_id);
        }
        await adminClient.from("documents").update({ doc_type: multiVenueDocType }).eq("id", document_id);

        // Delete old data from this document
        await adminClient.from("contacts").delete().eq("source_doc_id", document_id);

        let totalSpecs = 0;
        let totalContacts = 0;
        let totalEvents = 0;
        let totalRisks = 0;
        let totalVans = 0;
        const allRiskFlags: Array<Record<string, string>> = [];

        // ── If advance master, store VANs ──
        if (isAdvanceMaster) {
          // Delete old VANs from same document
          await adminClient.from("venue_advance_notes").delete().eq("source_doc_id", document_id);

          for (const v of multiResult.venues) {
            const venueName = (v.venue_name as string) || "Unknown Venue";
            const normalizedName = (v.normalized_venue_name as string) || venueName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            const city = (v.city as string) || null;
            const eventDate = (v.event_date as string) || null;

            // Dedup existing VANs for same venue+tour
            await adminClient.from("venue_advance_notes").delete()
              .eq("tour_id", doc.tour_id)
              .eq("normalized_venue_name", normalizedName);

            // Build the full VAN data object — store EVERYTHING
            const vanData: Record<string, unknown> = {};
            const vanFields = [
              "event_details", "production_contact", "house_rigger_contact",
              "summary", "venue_schedule", "plant_equipment", "labour",
              "dock_and_logistics", "power", "staging", "misc",
              "lighting", "video", "notes", "risk_flags"
            ];
            for (const field of vanFields) {
              if (v[field] !== undefined && v[field] !== null) {
                vanData[field] = v[field];
              }
            }
            // Also store legacy fields if present
            for (const field of ["dock_load_in", "rigging_system", "labor_union", "lighting_audio", "plant_equipment"]) {
              if (v[field] !== undefined && v[field] !== null && !vanData[field]) {
                vanData[field] = v[field];
              }
            }

            const { error: vanErr } = await adminClient.from("venue_advance_notes").insert({
              tour_id: doc.tour_id,
              source_doc_id: document_id,
              venue_name: venueName,
              normalized_venue_name: normalizedName,
              city,
              event_date: eventDate,
              van_data: vanData,
            });

            if (vanErr) {
              console.error("[extract] VAN insert error for", venueName, vanErr);
            } else {
              totalVans++;
            }

            // Insert contacts
            const venueContacts: Array<Record<string, string | null>> = [];
            const prodContact = (v.production_contact || v.event_details && (v.event_details as Record<string, unknown>)) as Record<string, string> | undefined;
            const pc = v.production_contact as Record<string, string> | undefined;
            if (pc?.name) {
              venueContacts.push({ name: pc.name, role: "Production Contact", phone: pc.phone || null, email: pc.email || null });
            }
            const rigger = v.house_rigger_contact as Record<string, string> | undefined;
            if (rigger?.name) {
              venueContacts.push({ name: rigger.name, role: "House Rigger", phone: rigger.phone || null, email: rigger.email || null });
            }

            if (venueContacts.length > 0) {
              const contactRows = venueContacts.map(c => ({
                tour_id: doc.tour_id,
                name: c.name!,
                role: c.role || null,
                phone: c.phone || null,
                email: c.email || null,
                source_doc_id: document_id,
                scope: "VENUE" as const,
                venue: venueName,
              }));
              const { error: cErr } = await adminClient.from("contacts").insert(contactRows);
              if (!cErr) totalContacts += venueContacts.length;
            }

            // Insert/update schedule event
            if (eventDate) {
              const showTimes = ((v.venue_schedule as Record<string, string>)?.show_times) || null;
              const chairSet = ((v.venue_schedule as Record<string, string>)?.chair_set) || null;
              const busArrival = ((v.event_details as Record<string, string>)?.bus_arrival_time) || null;
              const capacity = ((v.event_details as Record<string, string>)?.onsale_capacity) || null;

              // Dedup by date + venue + tour
              await adminClient.from("schedule_events").delete()
                .eq("tour_id", doc.tour_id)
                .eq("event_date", eventDate);

              const notesParts: string[] = [];
              if (busArrival) notesParts.push(`Bus Arrival: ${busArrival}`);
              if (chairSet) notesParts.push(`Chair Set: ${chairSet}`);
              if (showTimes) notesParts.push(`Show: ${showTimes}`);
              if (capacity) notesParts.push(`Capacity: ${capacity}`);

              // Try to parse show time for the show_time column
              let showTimeTs: string | null = null;
              if (showTimes) {
                const showMatch = showTimes.match(/(?:show\s*(?:at\s*)?|start\s*)(\d{1,2}(?::?\d{2})?\s*(?:am|pm))/i);
                if (showMatch) {
                  const t = showMatch[1].replace(/\s+/g, "").toLowerCase();
                  const isPM = t.includes("pm");
                  const nums = t.replace(/[apm]/g, "");
                  let [h, m] = nums.includes(":") ? nums.split(":").map(Number) : [Number(nums), 0];
                  if (isPM && h < 12) h += 12;
                  if (!isPM && h === 12) h = 0;
                  showTimeTs = `${eventDate}T${String(h).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}:00`;
                }
              }

              const { error: evtErr } = await adminClient.from("schedule_events").insert({
                tour_id: doc.tour_id,
                event_date: eventDate,
                city: city || null,
                venue: venueName,
                show_time: showTimeTs,
                source_doc_id: document_id,
                confidence_score: 0.95,
                notes: notesParts.join(" | ") || null,
              });
              if (!evtErr) totalEvents++;
            }

            // Risk flags — store in venue_risk_flags too
            const risks = (v.risk_flags as Array<Record<string, string>>) || [];
            if (risks.length > 0) {
              allRiskFlags.push(...risks);
              totalRisks += risks.length;
            }
          }
        } else {
          // ── Non-advance-master multi-venue (legacy path) ──
          for (const v of multiResult.venues) {
            const venueName = (v.venue_name as string) || "Unknown Venue";
            const normalizedName = (v.normalized_venue_name as string) || venueName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

            // Dedup existing tech specs for same venue
            const { data: existingSpecs } = await adminClient
              .from("venue_tech_specs")
              .select("id")
              .eq("tour_id", doc.tour_id)
              .eq("normalized_venue_name", normalizedName);

            if (existingSpecs && existingSpecs.length > 0) {
              const oldIds = existingSpecs.map(s => s.id);
              await adminClient.from("venue_risk_flags").delete().in("tech_spec_id", oldIds);
              await adminClient.from("venue_scores").delete().in("tech_spec_id", oldIds);
              await adminClient.from("venue_tech_specs").delete().in("id", oldIds);
            }

            // Build tech spec row from multi-venue data
            const { data: specRow, error: specErr } = await adminClient
              .from("venue_tech_specs")
              .insert({
                tour_id: doc.tour_id,
                source_doc_id: document_id,
                venue_name: venueName,
                normalized_venue_name: normalizedName,
                venue_identity: { official_name: venueName, capacity: v.capacity || null, bus_arrival: v.bus_arrival || null },
                dock_load_in: v.dock_load_in || {},
                rigging_system: v.rigging_system || {},
                power: v.power || {},
                labor_union: v.labor_union || {},
                stage_specs: v.staging || {},
                lighting_audio: v.lighting_audio || {},
                production_compatibility: v.plant_equipment || {},
                transportation_logistics: v.misc || {},
                contact_chain_of_command: {
                  production_manager: v.production_contact || {},
                  head_rigger: v.house_rigger || {},
                },
                comms_infrastructure: v.video || {},
              })
              .select("id")
              .single();

            if (specErr) {
              console.error("[extract] multi-venue tech spec insert error for", venueName, specErr);
              continue;
            }
            totalSpecs++;

            // Insert risk flags
            const risks = (v.risk_flags as Array<Record<string, string>>) || [];
            if (specRow && risks.length > 0) {
              const flagRows = risks.map(f => ({
                tour_id: doc.tour_id,
                tech_spec_id: specRow.id,
                venue_name: venueName,
                category: f.category || "LOGISTICS",
                risk_title: f.title || "Unknown Risk",
                risk_detail: f.detail || null,
                severity: (f.severity || "MEDIUM") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
              }));
              const { error: flagErr } = await adminClient.from("venue_risk_flags").insert(flagRows);
              if (!flagErr) totalRisks += risks.length;
              allRiskFlags.push(...risks);
            }

            // Insert contacts (production contact + house rigger + additional)
            const venueContacts: Array<Record<string, string | null>> = [];
            const prodContact = v.production_contact as Record<string, string> | undefined;
            if (prodContact?.name) {
              venueContacts.push({ name: prodContact.name, role: "Production Contact", phone: prodContact.phone || null, email: prodContact.email || null });
            }
            const rigger = v.house_rigger as Record<string, string> | undefined;
            if (rigger?.name) {
              venueContacts.push({ name: rigger.name, role: "House Rigger", phone: rigger.phone || null, email: rigger.email || null });
            }
            const additional = (v.additional_contacts as Array<Record<string, string>>) || [];
            for (const ac of additional) {
              if (ac.name) venueContacts.push({ name: ac.name, role: ac.role || null, phone: ac.phone || null, email: ac.email || null });
            }

            if (venueContacts.length > 0) {
              const contactRows = venueContacts.map(c => ({
                tour_id: doc.tour_id,
                name: c.name!,
                role: c.role || null,
                phone: c.phone || null,
                email: c.email || null,
                source_doc_id: document_id,
                scope: "VENUE" as const,
                venue: venueName,
              }));
              const { error: cErr } = await adminClient.from("contacts").insert(contactRows);
              if (!cErr) totalContacts += venueContacts.length;
            }

            // Insert schedule event if date exists
            const eventDate = v.event_date as string | undefined;
            if (eventDate) {
              const toTs = (d: string, t: string | undefined | null): string | null => {
                if (!t) return null;
                if (/^\d{1,2}:\d{2}$/.test(t)) return `${d}T${t}:00`;
                return null;
              };
              const showTime = v.show_time as string | undefined;
              const doorsTime = v.doors_time as string | undefined;
              const chairSetTime = v.chair_set_time as string | undefined;
              const busArrival = v.bus_arrival_time as string | undefined;
              const city = v.city as string | undefined;

              await adminClient.from("schedule_events").delete()
                .eq("tour_id", doc.tour_id)
                .eq("event_date", eventDate)
                .eq("venue", venueName);

              const notesParts: string[] = [];
              if (busArrival) notesParts.push(`Bus Arrival: ${busArrival}`);
              if (chairSetTime) notesParts.push(`Chair Set: ${chairSetTime}`);
              if (doorsTime) notesParts.push(`Doors: ${doorsTime}`);
              if (showTime) notesParts.push(`Show: ${showTime}`);
              if (v.capacity) notesParts.push(`Capacity: ${v.capacity}`);
              if (v.production_rider_sent) notesParts.push(`Production Rider Sent: Yes`);

              const { error: evtErr } = await adminClient.from("schedule_events").insert({
                tour_id: doc.tour_id,
                event_date: eventDate,
                city: city || null,
                venue: venueName,
                show_time: toTs(eventDate, showTime),
                load_in: toTs(eventDate, chairSetTime || doorsTime),
                source_doc_id: document_id,
                confidence_score: 0.95,
                notes: notesParts.join(" | ") || null,
              });
              if (!evtErr) totalEvents++;
            }
          }
        }

        const result = {
          doc_type: multiVenueDocType,
          is_tech_pack: !isAdvanceMaster,
          is_advance_master: isAdvanceMaster,
          is_multi_venue: true,
          venue_count: multiResult.venues.length,
          extracted_count: totalSpecs + totalContacts + totalEvents + totalRisks + totalVans,
          summary: {
            events: totalEvents,
            contacts: totalContacts,
            travel: 0,
            finance: 0,
            protocols: 0,
            venues: totalSpecs || totalVans,
            tech_specs: totalSpecs,
            vans: totalVans,
            risk_flags: totalRisks,
          },
          risk_flags: allRiskFlags,
        };

        console.log("[extract] Multi-venue result:", JSON.stringify(result));

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        console.log("[extract] Multi-venue extraction returned no venues, falling through");
      }
    }

    if (isTechPack && apiKey) {
      // ═══ TECH PACK EXTRACTION PATH ═══
      let techResult: TechPackResult | null = null;

      if (base64Data) {
        techResult = await aiExtractFromPdf(base64Data, apiKey, TECH_PACK_PROMPT, base64MimeType) as TechPackResult | null;
      } else if (rawText) {
        techResult = await aiExtractFromText(rawText, apiKey, TECH_PACK_PROMPT) as TechPackResult | null;
      }

      if (!techResult || !techResult.venue_name) {
        // Fall through to general extraction if tech pack parse fails
        console.log("[extract] Tech pack extraction failed, falling through to general");
      } else {
        console.log("[extract] Tech pack extracted for:", techResult.venue_name, "risks:", techResult.risk_flags?.length || 0);

        // Save raw text if we got it
        if (rawText && !doc.raw_text) {
          await adminClient.from("documents").update({ raw_text: rawText }).eq("id", document_id);
        }

        // Update doc type to TECH
        await adminClient.from("documents").update({ doc_type: "TECH" }).eq("id", document_id);

        // Delete existing tech spec for same venue + tour (dedup)
        const { data: existingSpecs } = await adminClient
          .from("venue_tech_specs")
          .select("id")
          .eq("tour_id", doc.tour_id)
          .eq("normalized_venue_name", techResult.normalized_venue_name);

        if (existingSpecs && existingSpecs.length > 0) {
          const oldIds = existingSpecs.map(s => s.id);
          await adminClient.from("venue_risk_flags").delete().in("tech_spec_id", oldIds);
          await adminClient.from("venue_tech_specs").delete().in("id", oldIds);
          console.log("[extract] Deduped", oldIds.length, "old tech specs for", techResult.normalized_venue_name);
        }

        // Insert venue_tech_specs
        const { data: specRow, error: specErr } = await adminClient
          .from("venue_tech_specs")
          .insert({
            tour_id: doc.tour_id,
            source_doc_id: document_id,
            venue_name: techResult.venue_name,
            normalized_venue_name: techResult.normalized_venue_name,
            venue_identity: techResult.venue_identity || {},
            stage_specs: techResult.stage_specs || {},
            rigging_system: techResult.rigging_system || {},
            dock_load_in: techResult.dock_load_in || {},
            power: techResult.power || {},
            lighting_audio: techResult.lighting_audio || {},
            wardrobe_laundry: techResult.wardrobe_laundry || {},
            labor_union: techResult.labor_union || {},
            permanent_installations: techResult.permanent_installations || {},
            production_compatibility: techResult.production_compatibility || {},
            contact_chain_of_command: techResult.contact_chain_of_command || {},
            insurance_liability: techResult.insurance_liability || {},
            safety_compliance: techResult.safety_compliance || {},
            security_crowd_control: techResult.security_crowd_control || {},
            hospitality_catering: techResult.hospitality_catering || {},
            comms_infrastructure: techResult.comms_infrastructure || {},
            it_network: techResult.it_network || {},
            environmental_conditions: techResult.environmental_conditions || {},
            local_ordinances: techResult.local_ordinances || {},
            financial_settlement: techResult.financial_settlement || {},
            venue_history: techResult.venue_history || {},
            transportation_logistics: techResult.transportation_logistics || {},
            ada_accessibility: techResult.ada_accessibility || {},
            content_media_policy: techResult.content_media_policy || {},
            load_out_constraints: techResult.load_out_constraints || {},
          })
          .select("id")
          .single();

        if (specErr) {
          console.error("[extract] venue_tech_specs insert error:", specErr);
        }

        // Insert risk flags
        const riskFlags = techResult.risk_flags || [];
        let riskCount = 0;
        if (specRow && riskFlags.length > 0) {
          const flagRows = riskFlags.map(f => ({
            tour_id: doc.tour_id,
            tech_spec_id: specRow.id,
            venue_name: techResult!.venue_name,
            category: f.category || "UNKNOWN",
            risk_title: f.title || "Unknown Risk",
            risk_detail: f.detail || null,
            severity: (f.severity || "MEDIUM") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
          }));

          const { error: flagErr } = await adminClient.from("venue_risk_flags").insert(flagRows);
          if (flagErr) console.error("[extract] risk flags insert error:", flagErr);
          else riskCount = riskFlags.length;
        }

        // Insert contacts from tech pack — pull from ALL sources
        const techContacts = techResult.contacts || [];
        const identityContacts = (techResult.venue_identity as Record<string, unknown>)?.production_contacts as Array<Record<string, string>> || [];
        
        // Extract contacts from contact_chain_of_command (production_manager, technical_director, etc.)
        const chainOfCommand = (techResult.contact_chain_of_command || {}) as Record<string, unknown>;
        const chainContacts: Array<Record<string, string>> = [];
        const roleMap: Record<string, string> = {
          production_manager: "Production Manager",
          technical_director: "Technical Director",
          head_rigger: "Head Rigger",
          foh_engineer: "FOH Engineer",
          security_lead: "Security Lead",
          promoter_rep: "Promoter Rep",
        };
        for (const [key, val] of Object.entries(chainOfCommand)) {
          if (key === "after_hours_emergency" && Array.isArray(val)) {
            for (const e of val) {
              if (e && typeof e === "object" && (e as Record<string, string>).name) {
                chainContacts.push({ name: (e as Record<string, string>).name, role: (e as Record<string, string>).role || "Emergency Contact", phone: (e as Record<string, string>).phone || "", email: "" });
              }
            }
          } else if (val && typeof val === "object" && !Array.isArray(val) && (val as Record<string, string>).name) {
            const v = val as Record<string, string>;
            chainContacts.push({ name: v.name, role: roleMap[key] || key, phone: v.phone || "", email: v.email || "" });
          }
        }

        const allContacts = [
          ...techContacts.map(c => ({ name: c.name, role: c.role, phone: c.phone, email: c.email })),
          ...identityContacts.map(c => ({ name: c.name, role: c.title, phone: c.phone, email: c.email })),
          ...chainContacts,
        ];

        let contactCount = 0;
        if (allContacts.length > 0) {
          // Dedup by name
          const seen = new Set<string>();
          const uniqueContacts = allContacts.filter(c => {
            const key = c.name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          const contactRows = uniqueContacts.map(c => ({
            tour_id: doc.tour_id,
            name: c.name,
            phone: c.phone || null,
            email: c.email || null,
            role: c.role || null,
            source_doc_id: document_id,
            scope: "VENUE" as const,
            venue: techResult!.venue_name,
          }));

          // Delete old contacts from same doc
          await adminClient.from("contacts").delete().eq("source_doc_id", document_id);

          const { error: cErr } = await adminClient.from("contacts").insert(contactRows);
          if (cErr) console.error("[extract] tech pack contacts insert error:", cErr);
          else contactCount = uniqueContacts.length;
        }

        const result = {
          doc_type: "TECH",
          is_tech_pack: true,
          venue_name: techResult.venue_name,
          extracted_count: 1 + riskCount + contactCount,
          summary: {
            events: 0,
            contacts: contactCount,
            travel: 0,
            finance: 0,
            protocols: 0,
            venues: 1,
            tech_specs: 1,
            risk_flags: riskCount,
          },
          tech_spec_id: specRow?.id || null,
          risk_flags: riskFlags,
        };

        console.log("[extract] Tech pack result:", JSON.stringify(result));

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ═══ GENERAL EXTRACTION PATH (existing logic) ═══
    let aiResult: AIExtractionResult | null = null;

    if (base64Data && apiKey) {
      aiResult = await aiExtractFromPdf(base64Data, apiKey, EXTRACTION_PROMPT, base64MimeType) as AIExtractionResult | null;
      if (aiResult) {
        console.log("[extract] Single-pass extraction keys:", Object.keys(aiResult));
      }
    }

    if (!aiResult && rawText && apiKey) {
      aiResult = await aiExtractFromText(rawText, apiKey, EXTRACTION_PROMPT) as AIExtractionResult | null;
    }

    if (rawText && !doc.raw_text) {
      await adminClient
        .from("documents")
        .update({ raw_text: rawText })
        .eq("id", document_id);
    }

    if (!aiResult) {
      if (rawText) {
        const domain = detectDomain(filename, rawText);
        await adminClient
          .from("documents")
          .update({ doc_type: domain.doc_type })
          .eq("id", document_id);
        return new Response(JSON.stringify({
          doc_type: domain.doc_type,
          domain_confidence: domain.confidence,
          extracted_count: 0,
          tour_name: null,
          summary: { events: 0, contacts: 0, travel: 0, finance: 0, protocols: 0, venues: 0 },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ error: "Could not extract from document" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Domain detection for doc_type ──
    const domain = detectDomain(filename, rawText || JSON.stringify(aiResult));
    const finalDocType = domain.confidence >= 0.30
      ? domain.doc_type
      : (aiResult?.doc_type || domain.doc_type);

    await adminClient
      .from("documents")
      .update({ doc_type: finalDocType })
      .eq("id", document_id);

    // ── Update tour name ──
    const extractedTourName = aiResult?.tour_name || null;
    if (extractedTourName) {
      const { data: tourData } = await adminClient
        .from("tours")
        .select("name")
        .eq("id", doc.tour_id)
        .single();
      if (tourData && tourData.name.startsWith("New Tour")) {
        await adminClient
          .from("tours")
          .update({ name: extractedTourName })
          .eq("id", doc.tour_id);
      }
    }

    // ── Deduplicate ──
    if ((aiResult?.schedule_events || []).length > 0) {
      const extractedDates = (aiResult?.schedule_events || [])
        .map(e => e.event_date)
        .filter(Boolean) as string[];
      
      if (extractedDates.length > 0) {
        const { error: dedupeErr } = await adminClient
          .from("schedule_events")
          .delete()
          .eq("tour_id", doc.tour_id)
          .in("event_date", extractedDates);
        
        if (dedupeErr) console.error("[extract] dedup schedule_events error:", dedupeErr);
        else console.log("[extract] Deduped schedule_events for dates:", extractedDates.join(", "));
      }
    }

    if ((aiResult?.contacts || []).length > 0) {
      const { error: dedupeContactErr } = await adminClient
        .from("contacts")
        .delete()
        .eq("tour_id", doc.tour_id)
        .not("source_doc_id", "is", null);
      
      if (dedupeContactErr) console.error("[extract] dedup contacts error:", dedupeContactErr);
      else console.log("[extract] Deduped old extracted contacts");
    }

    // ── Persist extracted entities ──
    let totalExtracted = 0;

    const events = aiResult?.schedule_events || [];
    if (events.length > 0) {
      const toTimestamp = (date: string | undefined, time: string | undefined): string | null => {
        if (!date || !time) return null;
        return `${date}T${time}:00`;
      };

      const rows = events.map(evt => ({
        tour_id: doc.tour_id,
        city: evt.city || null,
        venue: evt.venue || null,
        event_date: evt.event_date || null,
        load_in: toTimestamp(evt.event_date, evt.load_in),
        show_time: toTimestamp(evt.event_date, evt.show_time),
        end_time: toTimestamp(evt.event_date, evt.end_time),
        confidence_score: 0.85,
        source_doc_id: document_id,
        notes: evt.notes || null,
      }));

      const { error: evtErr } = await adminClient.from("schedule_events").insert(rows);
      if (evtErr) console.error("[extract] schedule_events insert error:", evtErr);
      else console.log("[extract] Inserted", events.length, "schedule events");
      totalExtracted += events.length;
    }

    const contacts = aiResult?.contacts || [];
    const isVenueDoc = ["TECH", "VENUE"].includes(finalDocType);
    if (contacts.length > 0) {
      const rows = contacts.map(c => ({
        tour_id: doc.tour_id,
        name: c.name,
        phone: c.phone || null,
        email: c.email || null,
        role: c.role || null,
        source_doc_id: document_id,
        scope: isVenueDoc ? "VENUE" : "TOUR",
        venue: isVenueDoc ? (aiResult?.venues?.[0]?.name || filename.replace(/\.[^.]+$/, "")) : null,
      }));

      const { error: cErr } = await adminClient.from("contacts").insert(rows);
      if (cErr) console.error("[extract] contacts insert error:", cErr);
      else console.log("[extract] Inserted", contacts.length, "contacts (scope:", isVenueDoc ? "VENUE" : "TOUR", ")");
      totalExtracted += contacts.length;
    }

    const venues = aiResult?.venues || [];
    const venueContacts = venues
      .filter(v => v.contact_name)
      .map(v => ({
        tour_id: doc.tour_id,
        name: v.contact_name!,
        phone: v.contact_phone || null,
        email: v.contact_email || null,
        role: "Venue Contact",
        source_doc_id: document_id,
        scope: "VENUE" as const,
        venue: v.name || null,
      }));
    if (venueContacts.length > 0) {
      const { error: vcErr } = await adminClient.from("contacts").insert(venueContacts);
      if (vcErr) console.error("[extract] venue contacts insert error:", vcErr);
      else console.log("[extract] Inserted", venueContacts.length, "venue contacts");
      totalExtracted += venueContacts.length;
    }

    const finance = aiResult?.finance || [];
    if (finance.length > 0) {
      const rows = finance.map(fl => ({
        tour_id: doc.tour_id,
        category: fl.category || "Uncategorized",
        amount: fl.amount || null,
        venue: fl.venue || null,
        line_date: fl.line_date || null,
      }));
      await adminClient.from("finance_lines").insert(rows);
      totalExtracted += finance.length;
    }

    const travel = aiResult?.travel || [];
    if (travel.length > 0) {
      const rows = travel.map(t => ({
        tour_id: doc.tour_id,
        question: `[TRAVEL ${t.date || ""}] ${[
          t.type || "",
          t.description || "",
          t.hotel_name ? `Hotel: ${t.hotel_name}` : "",
          t.departure ? `From: ${t.departure}` : "",
          t.arrival ? `To: ${t.arrival}` : "",
          t.confirmation ? `Conf#: ${t.confirmation}` : "",
        ].filter(Boolean).join(" | ")}`,
        domain: "TRAVEL",
        resolved: true,
        user_id: user.id,
      }));
      await adminClient.from("knowledge_gaps").insert(rows);
      totalExtracted += travel.length;
    }

    const protocols = aiResult?.protocols || [];
    if (protocols.length > 0) {
      const rows = protocols.map(p => ({
        tour_id: doc.tour_id,
        question: `[${p.category || "PROTOCOL"}] ${p.title || "Protocol"}: ${p.details || ""}`,
        domain: p.category || "PROTOCOL",
        resolved: true,
        user_id: user.id,
      }));
      await adminClient.from("knowledge_gaps").insert(rows);
      totalExtracted += protocols.length;
    }

    if (venues.length > 0) {
      const rows = venues.map(v => ({
        tour_id: doc.tour_id,
        question: `[VENUE] ${v.name || "Unknown Venue"}${v.city ? `, ${v.city}` : ""}${v.state ? `, ${v.state}` : ""} | ${[
          v.address ? `Address: ${v.address}` : "",
          v.capacity ? `Capacity: ${v.capacity}` : "",
          v.contact_name ? `Contact: ${v.contact_name}` : "",
          v.contact_phone ? `Phone: ${v.contact_phone}` : "",
          v.contact_email ? `Email: ${v.contact_email}` : "",
          v.notes || "",
        ].filter(Boolean).join(" | ")}`,
        domain: "VENUE",
        resolved: true,
        user_id: user.id,
      }));
      await adminClient.from("knowledge_gaps").insert(rows);
      totalExtracted += venues.length;
    }

    const result = {
      doc_type: finalDocType,
      domain_confidence: domain.confidence,
      extracted_count: totalExtracted,
      tour_name: extractedTourName,
      summary: {
        events: events.length,
        contacts: contacts.length,
        travel: travel.length,
        finance: finance.length,
        protocols: protocols.length,
        venues: (aiResult?.venues || []).length,
      },
    };

    console.log("[extract] Final result:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[extract] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
