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

// ─── AI Provider Error Types ───

class AIProviderError extends Error {
  code: string;
  providerStatus: number;
  providerBody: string;

  constructor(code: string, message: string, providerStatus: number, providerBody: string) {
    super(message);
    this.name = "AIProviderError";
    this.code = code;
    this.providerStatus = providerStatus;
    this.providerBody = providerBody;
  }

  toResponse() {
    return new Response(JSON.stringify({
      error: this.message,
      code: this.code,
      provider_status: this.providerStatus,
    }), {
      status: this.providerStatus === 429 ? 429 : this.providerStatus === 402 ? 402 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

function mapProviderError(status: number, body: string): AIProviderError {
  if (status === 402) {
    return new AIProviderError("AI_PAYMENT_REQUIRED", "AI credits exhausted. Please wait for credits to refresh or contact support.", 402, body);
  }
  if (status === 429) {
    return new AIProviderError("AI_RATE_LIMIT", "AI rate limit reached. Please try again in a few minutes.", 429, body);
  }
  return new AIProviderError("AI_PROVIDER_ERROR", `AI provider returned error (${status}). Please try again later.`, status, body);
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
      "first_name": "First Name or null",
      "last_name": "Last Name or null",
      "preferred_name": "Preferred/Nickname or null",
      "role": "ROLE TITLE",
      "phone": "phone number",
      "email": "email@domain.com",
      "category": "TOUR_TEAM" or "TOUR_CREW" or "CAST" or "VENUE_STAFF",
      "bus_number": "Bus # or null",
      "dob": "YYYY-MM-DD or null",
      "age": number or null,
      "jacket_size": "size or null",
      "pants_size": "size or null",
      "sweatshirt_size": "size or null",
      "tshirt_size": "size or null",
      "contract": "status or null",
      "caps": "status or null",
      "mvr": "status or null",
      "drivers_release": "status or null",
      "confirmed_wc": "status or null",
      "address": "street address or null",
      "city": "city or null",
      "state": "state or null",
      "zip": "zip code or null",
      "arrival_date": "YYYY-MM-DD or null",
      "special_notes": "dietary restrictions, allergies, notes or null"
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
- For contacts, capture ALL people mentioned with any identifying info. For each contact, classify their "category":
  * "TOUR_TEAM" = management, agents, accountants, business managers, production managers, tour managers, promoter reps, tour coordinators, legal counsel — people who run the business/management side of the tour.
  * "TOUR_CREW" = stagehands, riggers, lighting techs, audio techs, carpenters, drivers, wardrobe, catering staff, backline techs, video operators, FOH engineers, monitor engineers, lighting designers, guitar/drum/bass techs — people who execute the production.
  * "VENUE_STAFF" = house manager, box office, venue security, venue production manager, local crew chief, promoter local rep — people employed by the venue or local promoter.
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

// ─── Excel Serial Date Converter ───

/** Convert an Excel serial date number to ISO YYYY-MM-DD deterministically.
 *  Excel epoch is 1899-12-30 (serial 0), but has a Lotus-123 bug treating 1900 as leap year.
 *  Valid range: roughly 40000–60000 covers years ~2009–2064. */
function excelSerialToISO(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 100000) return null;
  // Only treat as date if in plausible touring range (2020-2040 → ~43831-51501)
  if (serial < 40000 || serial > 60000) return null;
  const utcMs = Math.round((serial - 25569) * 86400000);
  const d = new Date(utcMs);
  if (isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Labels that indicate a date-type field in the spreadsheet */
const DATE_LABEL_PATTERNS = /^(day[_ ]?and[_ ]?date|date|event[_ ]?date|show[_ ]?date|day\/date)/i;

/** Normalize a cell value that may be an Excel serial date.
 *  Only converts if the label suggests it's a date field OR the raw value is a 5-digit number. */
function normalizeDateCell(label: string, rawValue: unknown): { isoDate: string | null; display: string } {
  if (rawValue == null) return { isoDate: null, display: "" };
  
  const num = Number(rawValue);
  const strVal = String(rawValue).trim();
  
  // If it's a number that looks like an Excel serial and the label is date-like
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const iso = excelSerialToISO(num);
    if (iso) return { isoDate: iso, display: iso };
  }
  
  // If it's already ISO formatted
  const isoMatch = strVal.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return { isoDate: isoMatch[1], display: strVal };
  
  // 5-digit string that could be an Excel serial even without a date label
  if (/^\d{5}$/.test(strVal)) {
    const iso = excelSerialToISO(parseInt(strVal, 10));
    if (iso) return { isoDate: iso, display: iso };
  }
  
  return { isoDate: null, display: strVal };
}

// ─── Deterministic Date Parser for VAN text fields ───

interface ParsedDateEntry {
  date: string;
  type: string;
  show_time: string | null;
}

function parseDatesFromVanText(text: string | null | undefined): ParsedDateEntry[] {
  if (!text) return [];

  const results: ParsedDateEntry[] = [];
  // Match all YYYY-MM-DD dates with surrounding context
  const dateRegex = /(\d{4}-\d{2}-\d{2})/g;
  let match: RegExpExecArray | null;

  while ((match = dateRegex.exec(text)) !== null) {
    const dateStr = match[1];
    const pos = match.index;
    // Look at the ~60 chars before and after the date for context
    const before = text.substring(Math.max(0, pos - 60), pos).toLowerCase();
    const after = text.substring(pos + 10, Math.min(text.length, pos + 60)).toLowerCase();

    // Classify date type based on surrounding text
    let type = "SHOW";
    if (/load[- ]?in/.test(before)) {
      type = "LOAD_IN";
    } else if (/travel/.test(before)) {
      type = "TRAVEL";
    } else if (/off\b|day off/.test(before)) {
      type = "OFF";
    } else if (/rehearsal/.test(before)) {
      type = "REHEARSAL";
    }

    // Extract show time from patterns like "@ 7:30 PM" or "@ 7:30PM"
    let showTime: string | null = null;
    const timeMatch = after.match(/@?\s*(\d{1,2}):(\d{2})\s*(am|pm)/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const m = parseInt(timeMatch[2], 10);
      const isPM = timeMatch[3].toLowerCase() === "pm";
      if (isPM && h < 12) h += 12;
      if (!isPM && h === 12) h = 0;
      showTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }

    results.push({ date: dateStr, type, show_time: showTime });
  }

  return results;
}

// Also parse "Month DD" style dates when no YYYY-MM-DD found (e.g. "March 12 & 13")
function parseFuzzyDatesFromText(text: string | null | undefined, yearHint: number = 2026): ParsedDateEntry[] {
  if (!text) return [];
  // Only use this if no ISO dates found
  if (/\d{4}-\d{2}-\d{2}/.test(text)) return [];

  const results: ParsedDateEntry[] = [];
  const months: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };

  // Match "March 12 & 13" or "March 12, 13" patterns
  const pattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:\s*[&,]\s*(\d{1,2}))?/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const month = months[m[1].toLowerCase()];
    const day1 = parseInt(m[2], 10);
    const d1 = `${yearHint}-${String(month).padStart(2, "0")}-${String(day1).padStart(2, "0")}`;
    results.push({ date: d1, type: "SHOW", show_time: null });
    if (m[3]) {
      const day2 = parseInt(m[3], 10);
      const d2 = `${yearHint}-${String(month).padStart(2, "0")}-${String(day2).padStart(2, "0")}`;
      results.push({ date: d2, type: "SHOW", show_time: null });
    }
  }

  // Try to extract show time
  const timeMatch = text.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (timeMatch && results.length > 0) {
    let h = parseInt(timeMatch[1], 10);
    const min = parseInt(timeMatch[2], 10);
    const isPM = timeMatch[3].toLowerCase() === "pm";
    if (isPM && h < 12) h += 12;
    if (!isPM && h === 12) h = 0;
    const t = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    for (const r of results) {
      if (r.type === "SHOW") r.show_time = t;
    }
  }

  return results;
}

// ─── Advance Master VAN Extraction Prompt ───

const ADVANCE_MASTER_VAN_PROMPT = `You are the Advance Master extraction engine for the live touring industry. You will receive pre-parsed venue data as structured key-value text blocks. Each block (separated by "---") contains data for EXACTLY ONE venue, with section headers (EVENT DETAILS, PRODUCTION CONTACT, etc.) and their associated fields. Your job is to extract ALL advance notes into structured Venue Advance Notes (VANs).

IMPORTANT: Each text block separated by "---" represents EXACTLY ONE venue.
The "Column Header" line at the top of each block identifies the venue. Do NOT create multiple venue objects from a single text block. Extract exactly ONE venue per block.
If you see a "City (from header)" line, use that as the city field.
The "Column Header" and any "Venue" field under EVENT DETAILS refer to the SAME venue — do NOT split them into separate venues.

CRITICAL NULL ENFORCEMENT: For EVERY field in the schema below, if the data is not present in the source text, you MUST set the value to null. Do NOT omit any field from the output. Every venue object MUST contain ALL top-level keys and ALL nested keys, even if their values are null.

Return a JSON object:
{
  "venues": [
    {
      "venue_name": "Official Venue Name",
      "normalized_venue_name": "lowercase-hyphenated-venue-name",
      "city": "City, ST",
      "event_date": "YYYY-MM-DD" or null (first show date, for backward compat),
      "event_dates": [
        {"date": "YYYY-MM-DD", "type": "LOAD_IN" | "SHOW" | "TRAVEL" | "OFF" | "REHEARSAL", "show_time": "HH:MM" or null}
      ],

      "event_details": {
        "day_and_date": "full day and date string" or null,
        "venue": "venue name" or null,
        "onsale_capacity": "capacity and sales info verbatim" or null,
        "production_rider_sent": "Yes/No/description" or null,
        "bus_arrival_time": "time or description" or null
      },

      "production_contact": {"name": null, "phone": null, "email": null, "notes": null},
      "house_rigger_contact": {"name": null, "phone": null, "email": null, "notes": null},

      "summary": {
        "cad_received": "verbatim response" or null,
        "rigging_overlay_done": "verbatim response" or null,
        "distance_to_low_steel": "verbatim measurement and notes" or null
      },

      "venue_schedule": {
        "chair_set": "time" or null,
        "show_times": "doors and show times verbatim" or null
      },

      "plant_equipment": {
        "forklifts": "verbatim forklift description" or null,
        "co2_confirmed": "verbatim CO2 status" or null
      },

      "labour": {
        "union_venue": "verbatim union status" or null,
        "labor_notes": "FULL verbatim labor rules, minimums, meal penalties, overtime rules — capture EVERYTHING" or null,
        "labor_estimate_received": "verbatim response" or null,
        "labor_call": "verbatim description" or null,
        "number_to_feed": "verbatim feed count" or null,
        "house_electrician_catering": "verbatim" or null,
        "follow_spots": "verbatim description" or null
      },

      "dock_and_logistics": {
        "loading_dock": "verbatim dock description with count and type" or null,
        "distance_dock_to_stage": "verbatim distance" or null,
        "trucks_parked": "verbatim parking rules" or null,
        "bus_trailer_unload": "verbatim" or null,
        "parking_situation": "verbatim parking description" or null,
        "catering_truck": "verbatim" or null,
        "merch_truck": "verbatim" or null,
        "vom_entry": "verbatim vom/entry description" or null,
        "height_to_seating": "verbatim measurement" or null
      },

      "power": {
        "power_available": "FULL verbatim power description with amps, phases, locations" or null,
        "catering_power": "verbatim" or null
      },

      "staging": {
        "foh_vip_risers": "verbatim" or null,
        "vip_riser_height": "verbatim measurement" or null,
        "handrails": "verbatim" or null,
        "foh_lighting_riser": "verbatim" or null,
        "camera_risers": "verbatim" or null,
        "preset_in_place": "verbatim" or null,
        "end_stage_curtain": "verbatim" or null,
        "bike_rack": "verbatim" or null
      },

      "misc": {
        "curfew": "verbatim" or null,
        "dead_case_storage": "verbatim description" or null,
        "haze_restrictions": "verbatim" or null,
        "audio_spl_restrictions": "verbatim" or null
      },

      "lighting": {
        "houselight_control": "verbatim dimmable/control/comms description" or null
      },

      "video": {
        "flypack_location": "verbatim" or null,
        "hardline_internet": "verbatim" or null,
        "house_tv_patch": "verbatim with resolution" or null,
        "led_ribbon": "verbatim" or null
      },

      "notes": "any additional notes from the NOTES row for this venue" or null,

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
- Extract EVERY venue provided in the input. Do NOT skip any venue.
- Each venue gets its own object in the "venues" array.
- CAPTURE VERBATIM: Copy the exact text from each field. Do NOT summarize, paraphrase, or truncate. The touring production team needs the EXACT words from the advance.
- NULL ENFORCEMENT: If a field's data is not present, set it to null. NEVER omit any field. Every venue MUST have ALL keys shown above.
- For dates, use YYYY-MM-DD format.
- For times in event_details and venue_schedule, keep the original format (e.g., "5:30pm doors 7pm show").
- The labour.labor_notes field is CRITICAL — capture the COMPLETE labor rules including minimums, meal penalties, overtime, department rules, etc. This is often the longest field. Do NOT truncate.
- PRODUCTION CONTACT and HOUSE RIGGER CONTACT sections: The name, phone, and email may appear as separate rows under the section header (e.g., "Name: John Smith", "Phone: 555-1234", "Email: john@venue.com") OR as a single combined value on the section header row itself. Extract ALL contact details you find. If a phone number or email appears anywhere in the section, capture it. Do NOT return null for these if any contact info exists in the data.
- Flag risks: no docks, long push distance (>200ft), restricted haze, complex union rules, limited power, no CO2, street load.
- Return ONLY valid JSON, no markdown, no code blocks.
- ZERO DATA LOSS. Every piece of data provided must appear in the output.
- CRITICAL: Most venues have MULTIPLE dates (load-in day + show days + travel days). Extract ALL dates into the event_dates array. Do NOT collapse multiple dates into one. If a venue has "Wed Load-In, Thu Show, Fri Show", that is 3 entries in event_dates. If only one date is mentioned, still use the array format with one entry. Set event_date to the first SHOW date for backward compatibility.`;

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
      throw mapProviderError(resp.status, errBody);
    }

    const data = await resp.json();
    let content = data.choices?.[0]?.message?.content || "";
    content = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    if (!content.startsWith("{") && !content.startsWith("[")) {
      console.error("[extract] PDF AI returned non-JSON response:", content.slice(0, 200));
      return null;
    }

    content = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    try {
      return JSON.parse(content);
    } catch (firstErr) {
      console.log("[extract] PDF JSON.parse failed, attempting string-interior fix...");
      const fixed = content.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
        return match
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t');
      });
      return JSON.parse(fixed);
    }
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
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
      const errBody = await resp.text();
      console.error("[extract] Text extraction API error:", resp.status, errBody);
      throw mapProviderError(resp.status, errBody);
    }

    const data = await resp.json();
    let content = data.choices?.[0]?.message?.content || "";
    content = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    // If the AI returned a non-JSON response (e.g. apology text), bail early
    if (!content.startsWith("{") && !content.startsWith("[")) {
      console.error("[extract] AI returned non-JSON response:", content.slice(0, 200));
      return null;
    }

    // Sanitize control characters that are illegal inside JSON string literals.
    // We must only target chars INSIDE quoted strings, not structural whitespace.
    // Strategy: replace all raw control chars except \n \r \t (valid JSON whitespace)
    // with nothing, then fix any raw \n \r \t inside string values by doing a
    // careful parse that tolerates them.
    content = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    try {
      return JSON.parse(content);
    } catch (firstErr) {
      // If still failing, the AI put raw newlines/tabs inside string values.
      // Escape them only within quoted strings.
      console.log("[extract] First JSON.parse failed, attempting string-interior fix...");
      const fixed = content.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
        return match
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t');
      });
      return JSON.parse(fixed);
    }
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
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

// ─── Delta Computation for Version Updates ───

interface DeltaChange {
  type: "added" | "updated" | "removed";
  entity: "event" | "contact" | "venue";
  detail: string;
}

function computeDelta(
  oldSnapshot: { events: any[]; contacts: any[]; vans: any[] },
  newDocId: string,
  adminClient: any,
): Promise<DeltaChange[]> {
  // This is called after extraction completes — query the NEW data
  return (async () => {
    const [newEvents, newContacts, newVans] = await Promise.all([
      adminClient.from("schedule_events").select("*").eq("source_doc_id", newDocId),
      adminClient.from("contacts").select("*").eq("source_doc_id", newDocId),
      adminClient.from("venue_advance_notes").select("*").eq("source_doc_id", newDocId),
    ]);

    const changes: DeltaChange[] = [];

    // Compare events by event_date + venue
    const oldEventKeys = new Map(oldSnapshot.events.map(e => [`${e.event_date}|${(e.venue || "").toLowerCase()}`, e]));
    const newEventKeys = new Map((newEvents.data || []).map((e: any) => [`${e.event_date}|${(e.venue || "").toLowerCase()}`, e]));

    for (const [key, newEvt] of newEventKeys) {
      const oldEvt = oldEventKeys.get(key);
      if (!oldEvt) {
        changes.push({ type: "added", entity: "event", detail: `${newEvt.venue || "Unknown"}, ${newEvt.city || ""} (${newEvt.event_date})` });
      } else {
        // Check for field changes
        const diffs: string[] = [];
        if (oldEvt.show_time !== newEvt.show_time) diffs.push(`show_time ${oldEvt.show_time || "null"} → ${newEvt.show_time || "null"}`);
        if (oldEvt.load_in !== newEvt.load_in) diffs.push(`load_in changed`);
        if (oldEvt.notes !== newEvt.notes) diffs.push(`notes updated`);
        if (diffs.length > 0) {
          changes.push({ type: "updated", entity: "event", detail: `${newEvt.venue || "Unknown"}: ${diffs.join(", ")}` });
        }
      }
    }
    for (const [key, oldEvt] of oldEventKeys) {
      if (!newEventKeys.has(key)) {
        changes.push({ type: "removed", entity: "event", detail: `${oldEvt.venue || "Unknown"} (${oldEvt.event_date})` });
      }
    }

    // Compare contacts by name
    const oldContactNames = new Map(oldSnapshot.contacts.map(c => [c.name.toLowerCase(), c]));
    const newContactNames = new Map((newContacts.data || []).map((c: any) => [c.name.toLowerCase(), c]));

    for (const [name, newC] of newContactNames) {
      const oldC = oldContactNames.get(name);
      if (!oldC) {
        changes.push({ type: "added", entity: "contact", detail: `${newC.name} (${newC.role || "no role"})` });
      } else {
        const diffs: string[] = [];
        if (oldC.phone !== newC.phone) diffs.push("phone changed");
        if (oldC.email !== newC.email) diffs.push("email changed");
        if (oldC.role !== newC.role) diffs.push("role changed");
        if (diffs.length > 0) {
          changes.push({ type: "updated", entity: "contact", detail: `${newC.name}: ${diffs.join(", ")}` });
        }
      }
    }
    for (const [name, oldC] of oldContactNames) {
      if (!newContactNames.has(name)) {
        changes.push({ type: "removed", entity: "contact", detail: `${oldC.name}` });
      }
    }

    // Compare VANs by normalized venue name
    const oldVanKeys = new Map(oldSnapshot.vans.map(v => [v.normalized_venue_name, v]));
    const newVanKeys = new Map((newVans.data || []).map((v: any) => [v.normalized_venue_name, v]));

    for (const [key, newV] of newVanKeys) {
      if (!oldVanKeys.has(key)) {
        changes.push({ type: "added", entity: "venue", detail: `${newV.venue_name}, ${newV.city || ""}` });
      } else {
        // VAN data is JSONB — just check if it changed
        const oldData = JSON.stringify(oldVanKeys.get(key)!.van_data);
        const newData = JSON.stringify(newV.van_data);
        if (oldData !== newData) {
          changes.push({ type: "updated", entity: "venue", detail: `${newV.venue_name} — advance notes updated` });
        }
      }
    }
    for (const [key, oldV] of oldVanKeys) {
      if (!newVanKeys.has(key)) {
        changes.push({ type: "removed", entity: "venue", detail: `${oldV.venue_name}` });
      }
    }

    return changes;
  })();
}

// ─── Auto-Log Delta Changes to akb_change_log ───

async function logDeltaChanges(
  changes: DeltaChange[],
  adminClient: any,
  tourId: string,
  userId: string,
  filename: string,
  oldVersion: number,
  newVersion: number,
) {
  if (changes.length === 0) return;
  const reason = `Document re-upload: ${filename} v${oldVersion} → v${newVersion}`;
  const entityTypeMap: Record<string, string> = {
    event: "schedule_event",
    contact: "contact",
    venue: "venue_advance_note",
  };
  const rows = changes.map(c => ({
    tour_id: tourId,
    user_id: userId,
    entity_id: tourId, // best-effort; no per-row ID available at this point
    entity_type: entityTypeMap[c.entity] || c.entity,
    action: "VERSION_UPDATE",
    change_summary: `${c.type === "added" ? "+" : c.type === "removed" ? "−" : "~"} ${c.type}: ${c.detail}`,
    change_reason: reason,
    severity: "INFO",
  }));
  const { error } = await adminClient.from("akb_change_log").insert(rows);
  if (error) console.error("[extract] Failed to log delta changes:", error);
  else console.log("[extract] Logged", rows.length, "delta changes to akb_change_log");
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

    const { document_id, replaces_doc_id } = await req.json();
    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Snapshot old data for delta detection if this is a version update ──
    let oldSnapshot: { events: any[]; contacts: any[]; vans: any[] } | null = null;
    if (replaces_doc_id) {
      console.log("[extract] Version update detected, snapshotting old data from doc:", replaces_doc_id);
      const [oldEvents, oldContacts, oldVans] = await Promise.all([
        adminClient.from("schedule_events").select("*").eq("source_doc_id", replaces_doc_id),
        adminClient.from("contacts").select("*").eq("source_doc_id", replaces_doc_id),
        adminClient.from("venue_advance_notes").select("*").eq("source_doc_id", replaces_doc_id),
      ]);
      oldSnapshot = {
        events: oldEvents.data || [],
        contacts: oldContacts.data || [],
        vans: oldVans.data || [],
      };
      console.log("[extract] Old snapshot:", oldSnapshot.events.length, "events,", oldSnapshot.contacts.length, "contacts,", oldSnapshot.vans.length, "VANs");
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
          const arrayBuf = await fileData.arrayBuffer();
          const wb = XLSX.read(new Uint8Array(arrayBuf), { type: "array", dense: true });

          // Check if this is an advance master — if so, use per-column parsing
          const fnLower = filename.toLowerCase();
          const looksLikeAdvanceMaster = (fnLower.includes("advance") && fnLower.includes("master")) ||
            fnLower.includes("advance_master") || fnLower.includes("advance master");

          if (looksLikeAdvanceMaster) {
            // ── Per-Column Parsing for Advance Masters ──
            // Read worksheet as 2D array: rows[rowIdx][colIdx]
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows: (string | number | boolean | null | undefined)[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

            if (rows.length > 0) {
              // Section headers to detect in column A
              // Two-tier section header matching:
              // Long headers (>=10 chars): use startsWith (safe, no false positives)
              // Short headers (<10 chars): use includes (unique enough)
              const LONG_SECTION_HEADERS = [
                "EVENT DETAILS", "PRODUCTION CONTACT", "HOUSE RIGGER CONTACT",
                "VENUE SCHEDULE", "PLANT EQUIPMENT",
                "DOCK AND LOGISTICS", "LOADING DOCK AND LOGISTICS", "LOADING DOCK",
              ];
              const SHORT_SECTION_HEADERS = [
                "SUMMARY", "LABOUR", "LABOR", "POWER", "STAGING", "MISC",
                "LIGHTING", "VIDEO", "NOTES", "SCHEDULE", "DOCK",
              ];

              // Find how many columns have data
              let maxCol = 0;
              for (const row of rows) {
                if (row && row.length > maxCol) maxCol = row.length;
              }

              // ── Detect layout: ROW-based vs COLUMN-based ──
              // ROW-based: column headers are field names (venue_name, onsale_capacity, production_contact_name...)
              // COLUMN-based: column headers are city/venue names with section headers in column A
              const ROW_FIELD_INDICATORS = [
                "venue_name", "venue", "onsale", "capacity", "production_contact",
                "house_rigger", "bus_arrival", "chair_set", "show_time", "load_in",
                "curfew", "forklift", "power", "dock", "labor", "labour",
                "rigging", "staging", "haze", "catering", "parking",
              ];

              // Check if column headers (row 0) look like field names
              const headerRow = rows[0] || [];
              let fieldNameMatches = 0;
              const colHeaders: string[] = [];
              for (let c = 0; c < maxCol; c++) {
                const h = headerRow[c] != null ? String(headerRow[c]).trim().toLowerCase() : "";
                colHeaders.push(h);
                if (h && ROW_FIELD_INDICATORS.some(f => h.includes(f))) fieldNameMatches++;
              }
              const isRowBased = fieldNameMatches >= 3;
              console.log("[extract] Layout detection: fieldNameMatches=", fieldNameMatches, "isRowBased=", isRowBased);

              const venueColumnTexts: string[] = [];
              const venueColumnCities: string[] = [];

              if (isRowBased) {
                // ── ROW-BASED: each row is a venue, columns are fields ──
                console.log("[extract] Using ROW-based parsing (venues in rows, fields in columns)");

                // Find which column has venue_name
                const venueColIdx = colHeaders.findIndex(h => h.includes("venue_name") || h === "venue");
                // Find date column (often column A or a column named event_date)
                const dateColIdx = colHeaders.findIndex(h => h.includes("event_date") || h.includes("date"));

                // Map column headers to semantic section groupings
                const SECTION_MAP: Record<string, string> = {};
                for (let c = 0; c < colHeaders.length; c++) {
                  const h = colHeaders[c];
                  if (!h) continue;
                  if (h.includes("production_contact")) SECTION_MAP[String(c)] = "PRODUCTION CONTACT";
                  else if (h.includes("house_rigger")) SECTION_MAP[String(c)] = "HOUSE RIGGER CONTACT";
                  else if (h.includes("onsale") || h.includes("capacity") || h.includes("bus_arrival") || h.includes("rider") || h.includes("day_and_date") || h.includes("show_time") || h.includes("venue_name") || h === "venue") SECTION_MAP[String(c)] = "EVENT DETAILS";
                  else if (h.includes("dock") || h.includes("loading") || h.includes("parking") || h.includes("truck") || h.includes("merch") || h.includes("vom") || h.includes("catering_truck")) SECTION_MAP[String(c)] = "DOCK AND LOGISTICS";
                  else if (h.includes("labor") || h.includes("labour") || h.includes("union") || h.includes("feed") || h.includes("follow_spot") || h.includes("electrician")) SECTION_MAP[String(c)] = "LABOUR";
                  else if (h.includes("power")) SECTION_MAP[String(c)] = "POWER";
                  else if (h.includes("staging") || h.includes("riser") || h.includes("handrail") || h.includes("curtain") || h.includes("preset") || h.includes("bike_rack") || h.includes("camera")) SECTION_MAP[String(c)] = "STAGING";
                  else if (h.includes("curfew") || h.includes("dead_case") || h.includes("haze") || h.includes("spl") || h === "misc") SECTION_MAP[String(c)] = "MISC";
                  else if (h.includes("houselight") || h.includes("lighting")) SECTION_MAP[String(c)] = "LIGHTING";
                  else if (h.includes("flypack") || h.includes("hardline") || h.includes("tv_patch") || h.includes("led_ribbon") || h.includes("video")) SECTION_MAP[String(c)] = "VIDEO";
                  else if (h.includes("rigging") || h.includes("low_steel") || h.includes("cad") || h.includes("overlay")) SECTION_MAP[String(c)] = "SUMMARY";
                  else if (h.includes("forklift") || h.includes("co2")) SECTION_MAP[String(c)] = "PLANT EQUIPMENT";
                  else if (h.includes("chair_set") || h.includes("doors")) SECTION_MAP[String(c)] = "VENUE SCHEDULE";
                  else if (h.includes("note")) SECTION_MAP[String(c)] = "NOTES";
                }

                // Helper to convert Excel serial date to ISO string
                const excelDateToISO = (val: unknown): string | null => {
                  if (val == null) return null;
                  const num = Number(val);
                  if (!isNaN(num) && num > 40000 && num < 60000) {
                    // Excel serial date: days since 1899-12-30
                    const d = new Date((num - 25569) * 86400000);
                    return d.toISOString().split("T")[0];
                  }
                  const s = String(val).trim();
                  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
                  return null;
                };

                // Process each data row (skip header row 0)
                for (let r = 1; r < rows.length; r++) {
                  const row = rows[r];
                  if (!row) continue;

                  // Get venue name
                  const venueName = venueColIdx >= 0 && row[venueColIdx] != null ? String(row[venueColIdx]).trim() : "";
                  if (!venueName || venueName === "[empty]" || venueName === "#VALUE!") continue;

                  // Get event date
                  const rawDate = dateColIdx >= 0 ? row[dateColIdx] : null;
                  const isoDate = excelDateToISO(rawDate);

                  // Build text block grouped by section
                  const sectionData: Record<string, string[]> = {};
                  for (let c = 0; c < maxCol; c++) {
                    if (c === 0 && dateColIdx === 0) continue; // Skip date-only column A
                    const header = colHeaders[c];
                    if (!header) continue;
                    const val = row[c] != null ? String(row[c]).trim() : "";
                    if (!val || val === "[empty]" || val === "#VALUE!") continue;

                    // Convert serial dates in value
                    let displayVal = val;
                    const possibleDate = excelDateToISO(row[c]);
                    if (possibleDate && /^\d{5}$/.test(val)) displayVal = possibleDate;

                    // Prettify the header for AI consumption
                    const prettyHeader = header.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
                    const section = SECTION_MAP[String(c)] || "EVENT DETAILS";
                    if (!sectionData[section]) sectionData[section] = [];
                    sectionData[section].push(`${prettyHeader}: ${displayVal}`);
                  }

                  // Compose the text block
                  const lines: string[] = [
                    `=== SINGLE VENUE ===`,
                    `Venue Name: ${venueName}`,
                  ];
                  if (isoDate) lines.push(`Event Date: ${isoDate}`);

                  // Output sections in standard order
                  const sectionOrder = [
                    "EVENT DETAILS", "PRODUCTION CONTACT", "HOUSE RIGGER CONTACT",
                    "SUMMARY", "VENUE SCHEDULE", "PLANT EQUIPMENT", "LABOUR",
                    "DOCK AND LOGISTICS", "POWER", "STAGING", "MISC",
                    "LIGHTING", "VIDEO", "NOTES",
                  ];
                  for (const sec of sectionOrder) {
                    if (sectionData[sec] && sectionData[sec].length > 0) {
                      lines.push(`\n${sec}`);
                      for (const line of sectionData[sec]) {
                        lines.push(`  ${line}`);
                      }
                    }
                  }

                  venueColumnTexts.push(lines.join("\n"));
                  venueColumnCities.push(""); // City will be extracted from the data by AI
                }
                console.log("[extract] Row-based parsing found", venueColumnTexts.length, "venue rows");

              } else {
                // ── COLUMN-BASED: original path (venues in columns, section headers in col A) ──
                console.log("[extract] Using COLUMN-based parsing (venues in columns, sections in rows)");

                for (let col = 1; col < maxCol; col++) {
                  let headerValue = "";
                  for (let r = 0; r < Math.min(5, rows.length); r++) {
                    const cell = rows[r]?.[col];
                    if (cell != null && String(cell).trim()) {
                      headerValue = String(cell).trim();
                      break;
                    }
                  }
                  if (!headerValue) continue;

                  let nonEmpty = 0;
                  for (let r = 0; r < rows.length; r++) {
                    if (rows[r]?.[col] != null && String(rows[r][col]).trim()) nonEmpty++;
                  }
                  if (nonEmpty < 8) continue;
                  if (/^\d+$/.test(headerValue) || headerValue.length <= 2) continue;

                  const cityMatch = headerValue.match(/^(?:\d+\.\s*)?(.+)/);
                  const parsedCity = cityMatch ? cityMatch[1].trim() : headerValue;
                  const lines: string[] = [
                    `=== SINGLE VENUE ===`,
                    `Column Header: ${headerValue}`,
                    `City (from header): ${parsedCity}`,
                  ];
                  let currentSection = "";

                  // Track deterministic date and venue per column
                  let colDeterministicDate: string | null = null;
                  let colDeterministicVenue: string | null = null;
                  let excelSerialDatesConverted = 0;

                  for (let r = 0; r < rows.length; r++) {
                    if (r === 0) {
                      const row0Val = rows[0]?.[col] != null ? String(rows[0][col]).trim() : "";
                      if (!row0Val || row0Val === headerValue || row0Val === "#VALUE!" || row0Val === "0") continue;
                    }
                    const labelCell = rows[r]?.[0];
                    const valueCell = rows[r]?.[col];
                    const label = labelCell != null ? String(labelCell).trim() : "";
                    let value = valueCell != null ? String(valueCell).trim() : "";

                    // ── Excel serial date normalization ──
                    // Check if this cell value is a 5-digit number that could be an Excel serial date
                    const normalized = normalizeDateCell(label, valueCell);
                    if (normalized.isoDate && /^\d{5}$/.test(value)) {
                      value = normalized.display; // Replace serial with ISO date
                      excelSerialDatesConverted++;
                    }
                    // Capture deterministic date from "Day and Date" or similar labels
                    if (DATE_LABEL_PATTERNS.test(label) && normalized.isoDate) {
                      colDeterministicDate = normalized.isoDate;
                    }
                    // Capture deterministic venue from "Venue" label
                    if (/^venue$/i.test(label) && value && value !== "[empty]" && value !== "#VALUE!") {
                      colDeterministicVenue = value;
                    }

                    const upperLabel = label.toUpperCase();
                    const isSection = LONG_SECTION_HEADERS.some(h => upperLabel === h || upperLabel.startsWith(h + " ") || upperLabel.startsWith(h + ":")) ||
                      SHORT_SECTION_HEADERS.some(h => upperLabel.includes(h));
                    if (isSection && label) {
                      currentSection = label.toUpperCase();
                      lines.push(`\n${currentSection}`);
                      if (value) lines.push(`  ${value}`);
                      continue;
                    }

                    if (label && value) {
                      lines.push(`${label}: ${value}`);
                    } else if (!label && value) {
                      lines.push(`  ${value}`);
                    } else if (label && !value) {
                      lines.push(`${label}: [empty]`);
                    }
                  }

                  // Inject deterministic date and venue into the text block for AI context
                  if (colDeterministicDate) {
                    lines.splice(2, 0, `Deterministic Event Date: ${colDeterministicDate}`);
                  }
                  if (colDeterministicVenue) {
                    lines.splice(colDeterministicDate ? 3 : 2, 0, `Deterministic Venue: ${colDeterministicVenue}`);
                  }
                  if (excelSerialDatesConverted > 0) {
                    console.log(`[extract] Column ${col}: converted ${excelSerialDatesConverted} Excel serial dates, det_date=${colDeterministicDate}, det_venue=${colDeterministicVenue}`);
                  }

                  venueColumnTexts.push(lines.join("\n"));
                  venueColumnCities.push(parsedCity);
                }
              }

              if (venueColumnTexts.length > 0) {
                console.log("[extract] Per-column parsing found", venueColumnTexts.length, "venue columns");
                // Store as special format — rawText will be used differently in the multi-venue path
                // We tag it so the extraction path knows to use batched processing
                rawText = `__ADVANCE_MASTER_COLUMNS__\n${venueColumnTexts.join("\n\n===VENUE_SEPARATOR===\n\n")}`;
              } else {
                // Fallback to CSV if per-column parsing found nothing
                const csvParts: string[] = [];
                for (const sheetName of wb.SheetNames) {
                  const ws2 = wb.Sheets[sheetName];
                  csvParts.push(`--- Sheet: ${sheetName} ---`);
                  csvParts.push(XLSX.utils.sheet_to_csv(ws2));
                }
                rawText = csvParts.join("\n\n");
              }
            }
            console.log("[extract] Advance master Excel per-column parsed, length:", rawText?.length || 0);
          } else {
            // Non-advance-master Excel: use standard CSV conversion
            const csvParts: string[] = [];
            for (const sheetName of wb.SheetNames) {
              const ws = wb.Sheets[sheetName];
              csvParts.push(`--- Sheet: ${sheetName} ---`);
              csvParts.push(XLSX.utils.sheet_to_csv(ws));
            }
            rawText = csvParts.join("\n\n");
            console.log("[extract] Excel parsed to CSV text, length:", rawText.length);
          }
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
      let venueBlocks: string[] | null = null; // Track venue text blocks for deterministic city injection
      // Use dedicated VAN prompt for advance masters
      const extractPrompt = isAdvanceMaster ? ADVANCE_MASTER_VAN_PROMPT : MULTI_VENUE_PROMPT;

      // ── Batched per-column extraction for advance masters ──
      if (isAdvanceMaster && rawText && rawText.startsWith("__ADVANCE_MASTER_COLUMNS__")) {
        console.log("[extract] Using batched per-column extraction for advance master");
        const columnData = rawText.replace("__ADVANCE_MASTER_COLUMNS__\n", "");
        venueBlocks = columnData.split("\n\n===VENUE_SEPARATOR===\n\n").filter(b => b.trim());
        console.log("[extract] Found", venueBlocks.length, "venue column blocks to process");

        // Process in parallel batches of 4 venues to reduce per-batch runtime
        const BATCH_SIZE = 4;
        const extractModel = "google/gemini-2.5-pro";

        const batchPromises: Promise<Array<Record<string, unknown>>>[] = [];
        const totalBatches = Math.ceil(venueBlocks.length / BATCH_SIZE);
        for (let i = 0; i < venueBlocks.length; i += BATCH_SIZE) {
          const batch = venueBlocks.slice(i, i + BATCH_SIZE);
          const batchText = batch.join("\n\n---\n\n");
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          console.log(`[extract] Queuing batch ${batchNum}/${totalBatches}, ${batch.length} venues, ${batchText.length} chars`);

          batchPromises.push(
            aiExtractFromText(
              batchText,
              apiKey,
              extractPrompt,
              extractModel,
              120000,
            )
              .then((result: any) => {
                const venues = result?.venues || [];
                console.log(`[extract] Batch ${batchNum} extracted ${venues.length} venues`);
                return venues;
              })
              .catch((err: any) => {
                if (err instanceof AIProviderError) throw err;
                console.error(`[extract] Batch ${batchNum} failed:`, err.message);
                return [] as Array<Record<string, unknown>>;
              })
          );
        }

        // Run all batches in parallel
        console.log(`[extract] Firing ${batchPromises.length} batches in parallel`);
        const batchResults = await Promise.all(batchPromises);
        const allVenues: Array<Record<string, unknown>> = batchResults.flat();

        if (allVenues.length > 0) {
          multiResult = { venues: allVenues };
        }
      } else {
        // Standard single-pass extraction (non-advance-master or PDF advance masters)
        const extractModel = "google/gemini-2.5-flash";
        const maxChars = isAdvanceMaster ? 80000 : 60000;

        if (base64Data) {
          multiResult = await aiExtractFromPdf(base64Data, apiKey, extractPrompt, base64MimeType) as typeof multiResult;
        } else if (rawText) {
          multiResult = await aiExtractFromText(rawText, apiKey, extractPrompt, extractModel, maxChars) as typeof multiResult;
        }
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

        // Reconciliation counters (declared outside if/else so they're accessible in result)
        let vans_city_backfilled = 0;
        let vans_date_backfilled = 0;
        let events_venue_backfilled = 0;
        let events_city_backfilled = 0;

        // Extraction sanity counters (declared outside isAdvanceMaster so they're in scope for the response)
        let excel_serial_dates_converted = 0;
        let deterministic_dates_used = 0;
        let ai_dates_overridden = 0;
        let unknown_venue_fallbacks = 0;

        // ── If advance master, store VANs ──
        if (isAdvanceMaster) {
          // Source-doc scoped cleanup: delete ALL old data from this document first
          // This prevents stale/wrong rows from surviving across re-extractions
          await adminClient.from("venue_advance_notes").delete().eq("source_doc_id", document_id);
          await adminClient.from("schedule_events").delete().eq("source_doc_id", document_id);
          console.log("[extract] Source-doc scoped cleanup: deleted old VANs and schedule_events for doc", document_id);

          for (let vi = 0; vi < multiResult.venues.length; vi++) {
            const v = multiResult.venues[vi];
            const venueName = (v.venue_name as string) || "Unknown Venue";
            const normalizedName = (v.normalized_venue_name as string) || venueName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            
            // Deterministic city injection: if AI returned null city, try to extract from the venue block's "City (from header)" line
            let city = (v.city as string) || null;
            if (!city && venueBlocks && vi < venueBlocks.length) {
              const cityLineMatch = venueBlocks[vi].match(/City \(from header\):\s*(.+)/);
              if (cityLineMatch) city = cityLineMatch[1].trim();
            }
            // ── Normalize AI event_date: catch Excel serials AI may have left as-is ──
            let eventDate = (v.event_date as string) || null;
            if (eventDate && /^\d{5}$/.test(eventDate)) {
              const fixedDate = excelSerialToISO(parseInt(eventDate, 10));
              if (fixedDate) {
                console.log(`[extract] Fixed AI event_date serial ${eventDate} → ${fixedDate} for ${venueName}`);
                eventDate = fixedDate;
                excel_serial_dates_converted++;
              }
            }

            // ── Extract deterministic date/venue from the source text block ──
            let deterministicDate: string | null = null;
            let deterministicVenue: string | null = null;
            if (venueBlocks && vi < venueBlocks.length) {
              const detDateMatch = venueBlocks[vi].match(/Deterministic Event Date:\s*(\d{4}-\d{2}-\d{2})/);
              if (detDateMatch) deterministicDate = detDateMatch[1];
              const detVenueMatch = venueBlocks[vi].match(/Deterministic Venue:\s*(.+)/);
              if (detVenueMatch) deterministicVenue = detVenueMatch[1].trim();
            }

            // ── Override AI event_date with deterministic date when available ──
            if (deterministicDate) {
              if (eventDate && eventDate !== deterministicDate) {
                console.log(`[extract] Overriding AI event_date ${eventDate} with deterministic ${deterministicDate} for ${venueName}`);
                ai_dates_overridden++;
              }
              eventDate = deterministicDate;
              deterministic_dates_used++;
            }

            // ── Harden venue name: replace "Unknown Venue" or city-as-venue ──
            if (deterministicVenue) {
              const aiVenue = venueName;
              if (aiVenue === "Unknown Venue" || (city && aiVenue.toLowerCase() === city.toLowerCase())) {
                console.log(`[extract] Venue fallback: replacing "${aiVenue}" with deterministic "${deterministicVenue}"`);
                unknown_venue_fallbacks++;
                // Override venueName and normalizedName for the rest of this iteration
                Object.assign(v, { venue_name: deterministicVenue });
              }
            }
            // Re-read potentially updated venue name
            const finalVenueName = (v.venue_name as string) || "Unknown Venue";
            const finalNormalizedName = finalVenueName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

            // Dedup existing VANs for same venue+tour
            await adminClient.from("venue_advance_notes").delete()
              .eq("tour_id", doc.tour_id)
              .eq("normalized_venue_name", finalNormalizedName);

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
              venue_name: finalVenueName,
              normalized_venue_name: finalNormalizedName,
              city,
              event_date: eventDate,
              van_data: vanData,
            });

            if (vanErr) {
              console.error("[extract] VAN insert error for", finalVenueName, vanErr);
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
                venue: finalVenueName,
              }));
              const { error: cErr } = await adminClient.from("contacts").insert(contactRows);
              if (!cErr) totalContacts += venueContacts.length;
            }

            // Insert/update schedule events (supports multiple dates per venue)
            let eventDates = (v.event_dates as Array<{ date?: string; type?: string; show_time?: string }>) || [];

            // ── Deterministic date fallback: parse dates from day_and_date text ──
            if (!eventDates || eventDates.filter(ed => ed.date).length === 0) {
              const dayAndDateText = ((v.event_details as Record<string, string | null>)?.day_and_date) || null;
              const showTimesText = ((v.venue_schedule as Record<string, string | null>)?.show_times) || null;

              // Try ISO dates first (YYYY-MM-DD), then fuzzy month names
              let parsed = parseDatesFromVanText(dayAndDateText);
              if (parsed.length === 0) {
                parsed = parseFuzzyDatesFromText(showTimesText);
              }
              if (parsed.length === 0) {
                parsed = parseFuzzyDatesFromText(dayAndDateText);
              }

              if (parsed.length > 0) {
                console.log(`[extract] Deterministic parser found ${parsed.length} dates for ${finalVenueName} from VAN text`);
                eventDates = parsed;

                // Also backfill event_date on the VAN if it was null
                if (!eventDate) {
                  const firstShow = parsed.find(p => p.type === "SHOW") || parsed[0];
                  if (firstShow) {
                    await adminClient.from("venue_advance_notes")
                      .update({ event_date: firstShow.date })
                      .eq("tour_id", doc.tour_id)
                      .eq("normalized_venue_name", finalNormalizedName);
                  }
                }
              }
            }

            // Backward compat: if still no event_dates, fall back to single event_date
            const datesToInsert = eventDates.length > 0
              ? eventDates.filter(ed => ed.date)
              : (eventDate ? [{ date: eventDate, type: "SHOW" as string, show_time: null as string | null }] : []);

            const showTimes = ((v.venue_schedule as Record<string, string>)?.show_times) || null;
            const chairSet = ((v.venue_schedule as Record<string, string>)?.chair_set) || null;
            const busArrival = ((v.event_details as Record<string, string>)?.bus_arrival_time) || null;
            const capacity = ((v.event_details as Record<string, string>)?.onsale_capacity) || null;

            for (const dateEntry of datesToInsert) {
              const entryDate = dateEntry.date!;
              const entryType = (dateEntry.type || "SHOW").toUpperCase();

              // Normalize dateEntry.date if it's an Excel serial
              let normalizedEntryDate = entryDate;
              if (/^\d{5}$/.test(entryDate)) {
                const fixed = excelSerialToISO(parseInt(entryDate, 10));
                if (fixed) {
                  normalizedEntryDate = fixed;
                  excel_serial_dates_converted++;
                }
              }

              // No broad date-based dedup needed — source-doc scoped cleanup was done above

              // Build notes
              const notesParts: string[] = [];
              if (entryType === "LOAD_IN") notesParts.push("Load-In Day");
              else if (entryType === "TRAVEL") notesParts.push("Travel Day");
              else if (entryType === "OFF") notesParts.push("Day Off");
              else if (entryType === "REHEARSAL") notesParts.push("Rehearsal Day");
              else notesParts.push("Show Day");

              if (busArrival) notesParts.push(`Bus Arrival: ${busArrival}`);
              if (chairSet) notesParts.push(`Chair Set: ${chairSet}`);
              if (showTimes && entryType === "SHOW") notesParts.push(`Show: ${showTimes}`);
              if (capacity) notesParts.push(`Capacity: ${capacity}`);

              // Parse show_time for SHOW-type events
              let showTimeTs: string | null = null;
              const timeSource = dateEntry.show_time || (entryType === "SHOW" ? showTimes : null);
              if (timeSource) {
                // Try HH:MM 24h format first
                const hhmm = timeSource.match(/^(\d{1,2}):(\d{2})$/);
                if (hhmm) {
                  showTimeTs = `${normalizedEntryDate}T${String(hhmm[1]).padStart(2, "0")}:${hhmm[2]}:00`;
                } else {
                  // Try 12h format
                  const showMatch = timeSource.match(/(?:show\s*(?:at\s*)?|start\s*)?(\d{1,2}(?::?\d{2})?\s*(?:am|pm))/i);
                  if (showMatch) {
                    const t = showMatch[1].replace(/\s+/g, "").toLowerCase();
                    const isPM = t.includes("pm");
                    const nums = t.replace(/[apm]/g, "");
                    let [h, m] = nums.includes(":") ? nums.split(":").map(Number) : [Number(nums), 0];
                    if (isPM && h < 12) h += 12;
                    if (!isPM && h === 12) h = 0;
                    showTimeTs = `${normalizedEntryDate}T${String(h).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}:00`;
                  }
                }
              }

              const { error: evtErr } = await adminClient.from("schedule_events").insert({
                tour_id: doc.tour_id,
                event_date: normalizedEntryDate,
                city: city || null,
                venue: finalVenueName,
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

          // Log extraction sanity counters
          console.log("[extract] Extraction sanity:", JSON.stringify({ excel_serial_dates_converted, deterministic_dates_used, ai_dates_overridden, unknown_venue_fallbacks }));

          // ── Authority dedup: remove lower-authority schedule_events that duplicate this Advance Master ──
          {
            const normForDedup = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
            const fuzzyDedup = (a: string, b: string): boolean => {
              const na = normForDedup(a);
              const nb = normForDedup(b);
              if (na === nb) return true;
              if (na.includes(nb) || nb.includes(na)) return true;
              const wordsA = na.split(/\s+/).filter(Boolean);
              const wordsB = nb.split(/\s+/).filter(Boolean);
              if (wordsA.length === 0 || wordsB.length === 0) return false;
              const overlap = wordsA.filter(w => wordsB.includes(w)).length;
              return overlap / Math.max(wordsA.length, wordsB.length) >= 0.7;
            };

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
                    fuzzyDedup(am.venue, other.venue)
                  );
                  if (matchesAM) toDelete.push(other.id);
                }
                if (toDelete.length > 0) {
                  await adminClient.from("schedule_events").delete().in("id", toDelete);
                  console.log(`[extract] Authority dedup: removed ${toDelete.length} lower-authority duplicates`);
                }
              }
            }
          }

          // ── Cross-link reconciliation: backfill missing data between VANs and schedule_events ──
          console.log("[extract] Running cross-link reconciliation for tour", doc.tour_id);
          
          // Reset reconciliation counters for this branch
          vans_city_backfilled = 0;
          vans_date_backfilled = 0;
          events_venue_backfilled = 0;
          events_city_backfilled = 0;

          // Fetch all VANs and schedule_events for this tour
          const { data: allVans } = await adminClient.from("venue_advance_notes")
            .select("id, venue_name, normalized_venue_name, city, event_date")
            .eq("tour_id", doc.tour_id);
          const { data: allEvents } = await adminClient.from("schedule_events")
            .select("id, venue, city, event_date, show_time")
            .eq("tour_id", doc.tour_id);

          if (allVans && allEvents) {
            const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
            const fuzzyMatch = (a: string, b: string): boolean => {
              const na = normalizeForMatch(a);
              const nb = normalizeForMatch(b);
              if (na === nb) return true;
              if (na.includes(nb) || nb.includes(na)) return true;
              // Word-token overlap >= 70%
              const wordsA = na.split(/\s+/).filter(Boolean);
              const wordsB = nb.split(/\s+/).filter(Boolean);
              if (wordsA.length === 0 || wordsB.length === 0) return false;
              const overlap = wordsA.filter(w => wordsB.includes(w)).length;
              return overlap / Math.max(wordsA.length, wordsB.length) >= 0.7;
            };

            for (const van of allVans) {
              // Backfill VAN city from schedule_event
              if (!van.city && van.venue_name) {
                const matchEvent = allEvents.find(e => 
                  e.venue && fuzzyMatch(van.venue_name, e.venue) && e.city
                );
                if (matchEvent) {
                  await adminClient.from("venue_advance_notes").update({ city: matchEvent.city }).eq("id", van.id);
                  vans_city_backfilled++;
                }
              }

              // Backfill VAN event_date from schedule_event
              if (!van.event_date && van.venue_name) {
                const matchEvent = allEvents.find(e => 
                  e.venue && fuzzyMatch(van.venue_name, e.venue) && e.event_date
                );
                if (matchEvent) {
                  await adminClient.from("venue_advance_notes").update({ event_date: matchEvent.event_date }).eq("id", van.id);
                  vans_date_backfilled++;
                }
              }

              // Backfill VAN city from schedule_event by date match
              if (!van.city && van.event_date) {
                const matchEvent = allEvents.find(e => 
                  e.event_date === van.event_date && e.city
                );
                if (matchEvent) {
                  await adminClient.from("venue_advance_notes").update({ city: matchEvent.city }).eq("id", van.id);
                  vans_city_backfilled++;
                }
              }
            }

            // Backfill schedule_events with null/unknown venue from VANs
            // Strengthened: match by tour_id + event_date + city first, then date-only
            for (const evt of allEvents) {
              if ((!evt.venue || evt.venue === "Unknown Venue") && evt.event_date) {
                // Try matching by date + city first (most precise)
                let matchVan = evt.city
                  ? allVans.find(v =>
                      v.event_date === evt.event_date &&
                      v.venue_name && v.venue_name !== "Unknown Venue" &&
                      v.city && normalizeForMatch(v.city).includes(normalizeForMatch(evt.city!))
                    )
                  : null;
                // Fall back to date-only match
                if (!matchVan) {
                  matchVan = allVans.find(v => 
                    v.event_date === evt.event_date && v.venue_name && v.venue_name !== "Unknown Venue"
                  );
                }
                if (matchVan) {
                  await adminClient.from("schedule_events").update({ venue: matchVan.venue_name, city: matchVan.city || evt.city }).eq("id", evt.id);
                  events_venue_backfilled++;
                }
              }
              // Backfill event city from VAN
              if (!evt.city && evt.venue) {
                const matchVan = allVans.find(v => 
                  v.venue_name && fuzzyMatch(evt.venue, v.venue_name) && v.city
                );
                if (matchVan) {
                  await adminClient.from("schedule_events").update({ city: matchVan.city }).eq("id", evt.id);
                  events_city_backfilled++;
                }
              }
            }
            console.log("[extract] Cross-link reconciliation complete:", JSON.stringify({ vans_city_backfilled, vans_date_backfilled, events_venue_backfilled, events_city_backfilled }));
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

            // Insert schedule event if date exists (skip if Advance Master already has this venue+date)
            const eventDate = v.event_date as string | undefined;
            if (eventDate) {
              // Authority guard: check if a SCHEDULE-type doc already owns this date
              const { data: existingSchedEvents } = await adminClient.from("schedule_events")
                .select("id, source_doc_id")
                .eq("tour_id", doc.tour_id)
                .eq("event_date", eventDate);
              let skipInsert = false;
              if (existingSchedEvents && existingSchedEvents.length > 0) {
                const sourceDocIds = [...new Set(existingSchedEvents.map(e => e.source_doc_id).filter(Boolean))];
                if (sourceDocIds.length > 0) {
                  const { data: schedDocs } = await adminClient.from("documents")
                    .select("id")
                    .in("id", sourceDocIds)
                    .eq("doc_type", "SCHEDULE");
                  if (schedDocs && schedDocs.length > 0) {
                    skipInsert = true;
                    console.log(`[extract] Skipping tech-pack schedule insert for ${eventDate} — Advance Master is authoritative`);
                  }
                }
              }
              if (skipInsert) {
                // Skip this venue's schedule insert entirely
              } else {
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
        }

        const result: Record<string, unknown> = {
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
          // Only include risk_flags array for non-advance-master (tech packs need it for review dialog)
          ...(isAdvanceMaster ? {} : { risk_flags: allRiskFlags }),
          // Include reconciliation counters
          reconciliation: { vans_city_backfilled, vans_date_backfilled, events_venue_backfilled, events_city_backfilled },
          // Include extraction sanity counters (only for advance master)
          ...(isAdvanceMaster ? { extraction_sanity: { excel_serial_dates_converted, deterministic_dates_used, ai_dates_overridden, unknown_venue_fallbacks } } : {}),
        };

        // ── Delta detection for version updates ──
        if (oldSnapshot) {
          const changes = await computeDelta(oldSnapshot, document_id, adminClient);
          result.changes = changes;
          console.log("[extract] Delta detected:", changes.length, "changes");
          await logDeltaChanges(changes, adminClient, doc.tour_id, user.id, filename, doc.version - 1, doc.version);
        }

        // Lean log: only counts, not full payload
        console.log("[extract] Multi-venue result: venues=", multiResult.venues.length, "events=", totalEvents, "vans=", totalVans, "contacts=", totalContacts);

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        // For advance masters, zero venues is an explicit failure
        if (isAdvanceMaster) {
          console.error("[extract] Advance Master extraction returned 0 venues — failing explicitly");
          return new Response(JSON.stringify({
            error: "Advance Master extraction returned no venues. The document may not be in a recognized format.",
            code: "EXTRACTION_EMPTY_RESULT",
          }), {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
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

        if (oldSnapshot) {
          const changes = await computeDelta(oldSnapshot, document_id, adminClient);
          (result as any).changes = changes;
          await logDeltaChanges(changes, adminClient, doc.tour_id, user.id, filename, doc.version - 1, doc.version);
        }

        console.log("[extract] Tech pack result: venue=", techResult.venue_name, "risks=", riskCount, "contacts=", contactCount);

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
      // Authority guard: check if any SCHEDULE-type doc already has events for this tour
      const allEventDates = [...new Set(events.map(e => e.event_date).filter(Boolean))];
      let amDates: Set<string> = new Set();
      if (allEventDates.length > 0) {
        const { data: existingSchedEvents } = await adminClient.from("schedule_events")
          .select("event_date, source_doc_id")
          .eq("tour_id", doc.tour_id)
          .in("event_date", allEventDates);
        if (existingSchedEvents && existingSchedEvents.length > 0) {
          const sourceDocIds = [...new Set(existingSchedEvents.map(e => e.source_doc_id).filter(Boolean))];
          if (sourceDocIds.length > 0) {
            const { data: schedDocs } = await adminClient.from("documents")
              .select("id")
              .in("id", sourceDocIds)
              .eq("doc_type", "SCHEDULE");
            if (schedDocs && schedDocs.length > 0) {
              const schedDocIds = new Set(schedDocs.map(d => d.id));
              for (const se of existingSchedEvents) {
                if (se.source_doc_id && schedDocIds.has(se.source_doc_id) && se.event_date) {
                  amDates.add(se.event_date);
                }
              }
            }
          }
        }
      }

      const toTimestamp = (date: string | undefined, time: string | undefined): string | null => {
        if (!date || !time) return null;
        return `${date}T${time}:00`;
      };

      // Filter out events whose date is already covered by an Advance Master
      const filteredEvents = events.filter(evt => {
        if (evt.event_date && amDates.has(evt.event_date)) {
          console.log(`[extract] Skipping single-doc schedule insert for ${evt.event_date} — Advance Master is authoritative`);
          return false;
        }
        return true;
      });

      if (filteredEvents.length > 0) {
        const rows = filteredEvents.map(evt => ({
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
        else console.log("[extract] Inserted", filteredEvents.length, "schedule events (skipped", events.length - filteredEvents.length, "AM-covered)");
      } else {
        console.log("[extract] All", events.length, "schedule events skipped — Advance Master covers all dates");
      }
      totalExtracted += events.length;
    }

    const contacts = aiResult?.contacts || [];
    const isVenueDoc = ["TECH", "VENUE"].includes(finalDocType);
    const isContactsDoc = finalDocType === "CONTACTS";
    if (contacts.length > 0) {
      // Insert ALL contacts — crew, cast, management, venue staff
      const rows = contacts.map(c => {
        const cat = (c as any).category?.toUpperCase?.() || "";
        // VENUE_STAFF → VENUE scope; everything else → TOUR scope (unless venue doc)
        const isVenueStaff = cat === "VENUE_STAFF";
        const scope = isVenueDoc || isVenueStaff ? "VENUE" : "TOUR";

        // Prefix role with category for crew/cast so they're distinguishable in sidebar
        let role = c.role || null;
        if (cat === "TOUR_CREW" && role) {
          role = `Crew | ${role}`;
        } else if (cat === "TOUR_CREW" && !role) {
          role = "Crew";
        } else if (cat === "CAST" && role) {
          role = `Cast | ${role}`;
        } else if (cat === "CAST" && !role) {
          role = "Cast";
        }

        // Build metadata from extended crew/cast fields
        const metadata: Record<string, unknown> = {};
        const metaFields = [
          'bus_number','first_name','last_name','preferred_name',
          'dob','age','jacket_size','pants_size','sweatshirt_size',
          'tshirt_size','contract','caps','mvr','drivers_release',
          'confirmed_wc','address','city','state','zip',
          'arrival_date','special_notes'
        ];
        for (const f of metaFields) {
          if ((c as any)[f] != null && (c as any)[f] !== "") metadata[f] = (c as any)[f];
        }

        return {
          tour_id: doc.tour_id,
          name: c.name,
          phone: c.phone || null,
          email: c.email || null,
          role,
          source_doc_id: document_id,
          scope,
          venue: (isVenueDoc || isVenueStaff)
            ? ((c as any).venue || aiResult?.venues?.[0]?.name || filename.replace(/\.[^.]+$/, ""))
            : null,
          metadata: Object.keys(metadata).length > 0 ? metadata : {},
        };
      });

      if (rows.length > 0) {
        const { error: cErr } = await adminClient.from("contacts").insert(rows);
        if (cErr) console.error("[extract] contacts insert error:", cErr);
        else console.log("[extract] Inserted", rows.length, "contacts");
        totalExtracted += rows.length;
      }
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

    if (oldSnapshot) {
      const changes = await computeDelta(oldSnapshot, document_id, adminClient);
      (result as any).changes = changes;
      await logDeltaChanges(changes, adminClient, doc.tour_id, user.id, filename, doc.version - 1, doc.version);
    }

    console.log("[extract] Final result:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof AIProviderError) {
      console.error("[extract] AI provider error:", err.code, err.providerStatus);
      return err.toResponse();
    }
    console.error("[extract] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
