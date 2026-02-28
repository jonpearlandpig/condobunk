import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-twilio-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- US State name → abbreviation map ---
const STATE_NAME_TO_ABBREV: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};
const STATE_ABBREV_SET = new Set(Object.values(STATE_NAME_TO_ABBREV));

// --- Twilio signature validation ---
async function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
  authToken: string,
): Promise<boolean> {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const computed = encodeBase64(new Uint8Array(sig));

  return computed === signature;
}

// --- Topic keyword groups for Progressive Depth ---
const TOPIC_GROUPS: Record<string, string[]> = {
  schedule: ["load-in", "load in", "loadin", "doors", "soundcheck", "curfew", "show time", "showtime", "set time", "settime", "set list", "setlist", "downbeat", "changeover"],
  venue_tech: ["haze", "haze machine", "fog", "rigging", "steel", "power", "docks", "dock", "labor", "labour", "union", "staging", "spl", "decibel", "db limit", "pyro", "confetti", "co2", "laser", "barricade", "pit"],
  logistics: ["hotel", "routing", "bus", "truck", "travel", "drive", "fly", "flight", "van", "lobby", "checkout", "check-in", "checkin", "day room"],
  tour_info: ["wifi", "wi-fi", "wi fi", "password", "network", "internet", "tour code", "house code", "ssid", "sop", "packing list", "checklist"],
  contacts: ["pm", "tm", "ld", "foh", "monitor", "prod manager", "production manager", "tour manager", "lighting director", "stage manager", "sm", "who is", "who's the", "contact"],
  guest_list: ["ticket", "tickets", "guest", "comp", "will call", "list", "plus one", "+1", "allotment"],
  catering: ["catering", "hospitality", "buyout", "meal", "breakfast", "lunch", "dinner", "rider"],
  follow_up: ["special notes", "notes", "anything else", "what about", "details", "more", "anything special", "restrictions", "rules", "policy", "policies", "what else", "other info", "other details", "more info"],
};

// --- Venue-tech intent keywords for deterministic responder ---
const VENUE_TECH_INTENT_KEYWORDS = [
  "labor", "labour", "labor notes", "labour notes", "labor call", "labour call",
  "haze", "haze restrictions", "haze machine", "hazer", "fog",
  "union", "union venue", "union house",
  "power", "available power", "catering power",
  "dock", "docks", "loading dock", "push distance",
  "rigging", "low steel", "steel", "rigging points",
  "staging", "vip riser", "foh riser", "camera riser", "bike rack",
  "spl", "spl limit", "spl restrictions", "audio spl", "decibel", "db limit",
  "curfew",
  "dead case", "dead case storage",
  "forklift", "plant equipment", "co2",
  "follow spot", "follow spots", "house electrician",
];

// --- Correction/follow-up intent patterns (expanded) ---
const CORRECTION_FOLLOW_UP_PATTERNS = /^(look again|check again|again|that's wrong|thats wrong|you're wrong|youre wrong|not right|not correct|incorrect|try again|wrong answer|nope wrong|no that's wrong|come on|seriously|really|what|huh|bull|bs|dude|bro|yes|yeah|yep|yup|no|nope|nah|it is|it's not|correct|right|exactly|absolutely|definitely|for sure|not true|true|details|more)$/i;

// --- Extract venue-tech facts deterministically from VAN JSON ---
function extractVenueTechFacts(
  vanData: Record<string, any>,
  requestedTopics: string[],
): { found: Record<string, string>; missing: string[] } {
  const found: Record<string, string> = {};
  const missing: string[] = [];

  // Helper: deep-get with alias-safe access
  const getField = (obj: Record<string, any>, ...paths: string[]): string | null => {
    for (const path of paths) {
      const parts = path.split(".");
      let cur: any = obj;
      for (const p of parts) {
        if (cur == null || typeof cur !== "object") { cur = null; break; }
        // Case-insensitive key lookup
        const key = Object.keys(cur).find(k => k.toLowerCase() === p.toLowerCase());
        cur = key ? cur[key] : null;
      }
      if (cur != null && cur !== "") return String(cur);
    }
    return null;
  };

  for (const topic of requestedTopics) {
    const t = topic.toLowerCase();
    let value: string | null = null;
    let label = topic;

    if (t.includes("labor") || t.includes("labour")) {
      const notes = getField(vanData, "labour.labor_notes", "labor.labor_notes", "Labour.Labor Notes", "Labour.labor_notes");
      const call = getField(vanData, "labour.labor_call", "labor.labor_call", "Labour.Labor Call", "Labour.labor_call");
      const unionVenue = getField(vanData, "labour.union_venue", "labor.union_venue", "Labour.Union Venue", "Labour.union_venue");
      const houseElec = getField(vanData, "labour.house_electrician", "labor.house_electrician", "Labour.House Electrician");
      const followSpots = getField(vanData, "labour.follow_spots", "labor.follow_spots", "Labour.Follow Spots");
      const feedCount = getField(vanData, "labour.feed_count", "labor.feed_count", "Labour.Feed Count");
      const parts: string[] = [];
      if (unionVenue) parts.push(`Union: ${unionVenue}`);
      if (notes) parts.push(`Notes: ${notes}`);
      if (call) parts.push(`Call: ${call}`);
      if (houseElec) parts.push(`House Electrician: ${houseElec}`);
      if (followSpots) parts.push(`Follow Spots: ${followSpots}`);
      if (feedCount) parts.push(`Feed Count: ${feedCount}`);
      value = parts.length > 0 ? parts.join(" | ") : null;
      label = "Labor/Labour";
    } else if (t.includes("haze") || t.includes("fog")) {
      value = getField(vanData, "misc.haze_restrictions", "Misc.Haze Restrictions", "misc.Haze Restrictions", "Misc.haze_restrictions");
      label = "Haze Restrictions";
    } else if (t.includes("spl") || t.includes("decibel") || t.includes("db limit")) {
      value = getField(vanData, "misc.audio_spl_restrictions", "Misc.Audio SPL Restrictions", "misc.Audio SPL Restrictions", "Misc.audio_spl_restrictions");
      label = "SPL Restrictions";
    } else if (t === "curfew") {
      value = getField(vanData, "misc.curfew", "Misc.Curfew", "misc.Curfew");
      label = "Curfew";
    } else if (t.includes("dead case")) {
      value = getField(vanData, "misc.dead_case_storage", "Misc.Dead Case Storage", "misc.Dead Case Storage");
      label = "Dead Case Storage";
    } else if (t.includes("union")) {
      value = getField(vanData, "labour.union_venue", "labor.union_venue", "Labour.Union Venue");
      label = "Union Venue";
    } else if (t.includes("power")) {
      const avail = getField(vanData, "power.available_power", "Power.Available Power", "power.Available Power");
      const catering = getField(vanData, "power.catering_power", "Power.Catering Power", "power.Catering Power");
      const parts: string[] = [];
      if (avail) parts.push(`Available: ${avail}`);
      if (catering) parts.push(`Catering: ${catering}`);
      value = parts.length > 0 ? parts.join(" | ") : null;
      label = "Power";
    } else if (t.includes("dock") || t.includes("push")) {
      const dock = getField(vanData, "dock_logistics.loading_dock", "Dock & Logistics.Loading Dock", "dock_logistics.Loading Dock");
      const push = getField(vanData, "dock_logistics.push_distance", "Dock & Logistics.Push Distance", "dock_logistics.Push Distance");
      const truck = getField(vanData, "dock_logistics.truck_parking", "Dock & Logistics.Truck Parking", "dock_logistics.Truck Parking");
      const parts: string[] = [];
      if (dock) parts.push(`Dock: ${dock}`);
      if (push) parts.push(`Push: ${push}`);
      if (truck) parts.push(`Truck Parking: ${truck}`);
      value = parts.length > 0 ? parts.join(" | ") : null;
      label = "Dock & Logistics";
    } else if (t.includes("rigging") || t.includes("steel")) {
      const steel = getField(vanData, "summary.low_steel_distance", "Summary.Low Steel Distance", "summary.Low Steel Distance");
      const cad = getField(vanData, "summary.cad", "Summary.CAD", "summary.CAD");
      const overlay = getField(vanData, "summary.rigging_overlay", "Summary.Rigging Overlay", "summary.Rigging Overlay");
      const parts: string[] = [];
      if (steel) parts.push(`Low Steel: ${steel}`);
      if (cad) parts.push(`CAD: ${cad}`);
      if (overlay) parts.push(`Rigging Overlay: ${overlay}`);
      value = parts.length > 0 ? parts.join(" | ") : null;
      label = "Rigging";
    } else if (t.includes("staging") || t.includes("riser") || t.includes("bike rack")) {
      const sections = ["staging", "Staging"];
      for (const sec of sections) {
        const block = vanData[sec];
        if (block && typeof block === "object") {
          const parts = Object.entries(block).map(([k, v]) => `${k}: ${v}`);
          if (parts.length > 0) { value = parts.join(" | "); break; }
        }
      }
      label = "Staging";
    } else if (t.includes("forklift") || t.includes("plant")) {
      const sections = ["plant_equipment", "Plant Equipment"];
      for (const sec of sections) {
        const block = vanData[sec];
        if (block && typeof block === "object") {
          const parts = Object.entries(block).map(([k, v]) => `${k}: ${v}`);
          if (parts.length > 0) { value = parts.join(" | "); break; }
        }
      }
      label = "Plant Equipment";
    } else if (t.includes("follow spot")) {
      value = getField(vanData, "labour.follow_spots", "labor.follow_spots", "Labour.Follow Spots");
      label = "Follow Spots";
    } else if (t.includes("house electrician")) {
      value = getField(vanData, "labour.house_electrician", "labor.house_electrician", "Labour.House Electrician");
      label = "House Electrician";
    }

    if (value) {
      found[label] = value;
    } else {
      missing.push(label);
    }
  }

  return { found, missing };
}

// --- Resolve best VAN match for a city/venue/date ---
function resolveTargetVan(
  vans: any[],
  targetCities: string[],
  targetVenue: string | null,
  targetDates: string[],
  allEvents: any[],
): any | null {
  if (vans.length === 0) return null;

  // 1. Exact city + date
  if (targetCities.length > 0 && targetDates.length > 0) {
    for (const van of vans) {
      const vanCity = (van.city || "").toLowerCase().split(",")[0].trim();
      for (const tc of targetCities) {
        const tCity = tc.toLowerCase().split(",")[0].trim();
        if (vanCity.includes(tCity) || tCity.includes(vanCity)) {
          if (targetDates.includes(van.event_date)) return van;
        }
      }
    }
  }

  // 2. Exact city (any date) — prefer nearest upcoming anchor
  if (targetCities.length > 0) {
    const todayStr = new Date().toISOString().split("T")[0];
    const cityMatches: any[] = [];
    for (const van of vans) {
      const vanCity = (van.city || "").toLowerCase().split(",")[0].trim();
      for (const tc of targetCities) {
        const tCity = tc.toLowerCase().split(",")[0].trim();
        if (vanCity.includes(tCity) || tCity.includes(vanCity)) {
          cityMatches.push(van);
        }
      }
    }
    if (cityMatches.length > 0) {
      // Prefer nearest upcoming, else latest past
      const upcoming = cityMatches.filter(v => v.event_date && v.event_date >= todayStr).sort((a: any, b: any) => a.event_date.localeCompare(b.event_date));
      if (upcoming.length > 0) return upcoming[0];
      const past = cityMatches.sort((a: any, b: any) => b.event_date.localeCompare(a.event_date));
      return past[0];
    }
  }

  // 3. Venue name match
  if (targetVenue) {
    const tvLower = targetVenue.toLowerCase();
    for (const van of vans) {
      const vnLower = (van.venue_name || "").toLowerCase();
      if (vnLower.includes(tvLower.substring(0, 10)) || tvLower.includes(vnLower.substring(0, 10))) return van;
    }
  }

  // 4. Nearest event-date fallback using schedule events matched to target cities
  if (targetCities.length > 0 && allEvents.length > 0) {
    const todayStr = new Date().toISOString().split("T")[0];
    for (const tc of targetCities) {
      const tCity = tc.toLowerCase().split(",")[0].trim();
      // Prefer nearest upcoming event for this city
      const cityEvents = allEvents.filter((e: any) => {
        const eCity = (e.city || "").toLowerCase().split(",")[0].trim();
        return eCity.includes(tCity) || tCity.includes(eCity);
      });
      const upcoming = cityEvents.filter((e: any) => e.event_date && e.event_date >= todayStr).sort((a: any, b: any) => a.event_date.localeCompare(b.event_date));
      const anchor = upcoming[0] || cityEvents.sort((a: any, b: any) => (b.event_date || "").localeCompare(a.event_date || ""))[0];
      if (anchor?.event_date) {
        const van = vans.find((v: any) => v.event_date === anchor.event_date);
        if (van) return van;
      }
    }
  }

  return null;
}

function extractTopics(text: string): Set<string> {
  const lower = text.toLowerCase();
  const matched = new Set<string>();
  for (const [group, keywords] of Object.entries(TOPIC_GROUPS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        matched.add(group);
        break;
      }
    }
  }
  return matched;
}

// --- Check if message has venue-tech intent keywords ---
function hasVenueTechIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return VENUE_TECH_INTENT_KEYWORDS.some(kw => lower.includes(kw));
}

// --- Progressive Depth Detection ---
function detectDepth(
  currentMessage: string,
  recentHistory: { role: string; content: string }[],
): 1 | 2 | 3 {
  const depth3Triggers = /\b(full rundown|everything about|everything on|give me everything|all the details|complete info|complete details|full breakdown|full detail|tell me everything)\b/i;
  if (depth3Triggers.test(currentMessage)) return 3;

  const depth2Triggers = /\b(tell me more|more details|more info|what else|elaborate|expand on|go deeper|details|specifics|can you explain|more about)\b/i;
  if (depth2Triggers.test(currentMessage)) return 2;

  const currentTopics = extractTopics(currentMessage);
  const isShortFollowUp = currentMessage.length < 30 && recentHistory.length >= 1;

  if (currentTopics.size === 0) {
    return isShortFollowUp ? 2 : 1;
  }

  let sameTopicCount = 0;
  for (const msg of recentHistory) {
    const msgTopics = extractTopics(msg.content);
    for (const t of currentTopics) {
      if (msgTopics.has(t)) {
        sameTopicCount++;
        break;
      }
    }
    if (currentTopics.has("follow_up") && msgTopics.size > 0) {
      sameTopicCount++;
    }
  }

  if (sameTopicCount >= 3) return 3;
  if (sameTopicCount >= 1) return 2;
  return isShortFollowUp ? 2 : 1;
}

// --- Strip markdown for SMS ---
function toPlaintext(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[Source:[^\]]*\]/g, "")
    .replace(/<<ACTION:[^>]*>>/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .substring(0, 1500);
}

// --- Normalize phone: strip non-digits, keep last 10 ---
function normalizePhone(p: string): string {
  return p.replace(/\D/g, "").slice(-10);
}

// --- Build city-state index from schedule rows ---
// Returns: { stateAbbrevToCities: { "NC": ["Raleigh, NC"], ... }, cityToState: { "raleigh": "NC" } }
function buildCityStateIndex(knownCities: string[]): {
  stateAbbrevToCities: Record<string, string[]>;
  cityToState: Record<string, string>;
} {
  const stateAbbrevToCities: Record<string, string[]> = {};
  const cityToState: Record<string, string> = {};
  for (const city of knownCities) {
    if (!city) continue;
    // Expect format "City, ST" or "City Name, ST"
    const parts = city.split(",").map(s => s.trim());
    if (parts.length >= 2) {
      const stateAbbrev = parts[parts.length - 1].toUpperCase();
      if (STATE_ABBREV_SET.has(stateAbbrev)) {
        if (!stateAbbrevToCities[stateAbbrev]) stateAbbrevToCities[stateAbbrev] = [];
        stateAbbrevToCities[stateAbbrev].push(city);
        const cityName = parts.slice(0, -1).join(",").toLowerCase().trim();
        cityToState[cityName] = stateAbbrev;
      }
    }
  }
  return { stateAbbrevToCities, cityToState };
}

// --- Resolve state references in message to matching tour cities ---
function resolveStateToCities(
  message: string,
  stateAbbrevToCities: Record<string, string[]>,
): string[] {
  const msgLower = message.toLowerCase().trim();
  const resolved: string[] = [];

  // Check full state names first (e.g., "north carolina")
  for (const [stateName, abbrev] of Object.entries(STATE_NAME_TO_ABBREV)) {
    if (msgLower.includes(stateName)) {
      const cities = stateAbbrevToCities[abbrev];
      if (cities) {
        for (const c of cities) {
          if (!resolved.includes(c)) resolved.push(c);
        }
      }
    }
  }

  // Check state abbreviations (e.g., "NC", "N.C.")
  // Match 2-letter state codes surrounded by word boundaries or punctuation
  const abbrevPatterns = msgLower.match(/\b([a-z])\.?([a-z])\.?\b/g) || [];
  for (const pat of abbrevPatterns) {
    const clean = pat.replace(/\./g, "").toUpperCase();
    if (clean.length === 2 && STATE_ABBREV_SET.has(clean)) {
      const cities = stateAbbrevToCities[clean];
      if (cities) {
        for (const c of cities) {
          if (!resolved.includes(c)) resolved.push(c);
        }
      }
    }
  }

  return resolved;
}

// --- Extract date/city/venue relevance from user message ---
function extractRelevanceFromMessage(
  message: string,
  knownCities: string[],
  knownVenues: string[],
  eventDates: string[],
  stateAbbrevToCities?: Record<string, string[]>,
): { targetDates: string[]; targetCities: string[]; targetVenue: string | null } {
  const today = new Date();
  const msgLower = message.toLowerCase();
  let targetDates: string[] = [];
  const targetCities: string[] = [];
  let targetVenue: string | null = null;

  // --- Date extraction ---
  const mdMatch = msgLower.match(/(\d{1,2})[\/\-](\d{1,2})/);
  if (mdMatch) {
    const month = parseInt(mdMatch[1]);
    const day = parseInt(mdMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let year = today.getFullYear();
      const candidate = new Date(year, month - 1, day);
      if (candidate < today) year++;
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      targetDates = [dateStr];
    }
  }

  if (/\btomorrow\b/i.test(message)) {
    const tmrw = new Date(today);
    tmrw.setDate(tmrw.getDate() + 1);
    targetDates = [tmrw.toISOString().split("T")[0]];
  } else if (/\btonight\b|\btoday\b/i.test(message)) {
    targetDates = [today.toISOString().split("T")[0]];
  }

  const monthNames: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
    nov: 11, november: 11, dec: 12, december: 12,
  };
  const monthMatch = msgLower.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monthMatch && targetDates.length === 0) {
    const month = monthNames[monthMatch[1]];
    const day = parseInt(monthMatch[2]);
    if (month && day >= 1 && day <= 31) {
      let year = today.getFullYear();
      const candidate = new Date(year, month - 1, day);
      if (candidate < today) year++;
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      targetDates = [dateStr];
    }
  }

  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayMatch = msgLower.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (dayMatch && targetDates.length === 0) {
    const targetDay = dayNames.indexOf(dayMatch[2]);
    const currentDay = today.getDay();
    let daysAhead = targetDay - currentDay;
    if (daysAhead <= 0 || dayMatch[1]) daysAhead += 7;
    const target = new Date(today);
    target.setDate(target.getDate() + daysAhead);
    targetDates = [target.toISOString().split("T")[0]];
  }

  if (/\bnext\s+(show|event|gig|date)\b/i.test(message) && targetDates.length === 0) {
    const todayStr = today.toISOString().split("T")[0];
    const futureDates = eventDates.filter((d) => d >= todayStr).sort();
    if (futureDates.length > 0) {
      targetDates = [futureDates[0]];
    }
  }

  // --- City matching (supports partial/first-word matches for multi-word cities) ---
  const COMMON_CITY_WORDS = new Set(["new", "old", "north", "south", "east", "west", "san", "saint", "los", "las", "fort", "mount", "lake", "park", "city", "beach", "bay", "port", "del", "the"]);
  for (const city of knownCities) {
    if (!city) continue;
    const cityLower = city.toLowerCase();
    const cityName = cityLower.split(",")[0].trim();
    if (cityName.length < 3) continue;
    if (targetCities.includes(city)) continue;

    if (msgLower.includes(cityName)) {
      targetCities.push(city);
      continue;
    }

    const cityWords = cityName.split(/\s+/).filter(w => w.length >= 3);
    if (cityWords.length > 1) {
      const firstWord = cityWords[0];
      if (firstWord.length >= 4 && !COMMON_CITY_WORDS.has(firstWord) && msgLower.includes(firstWord)) {
        targetCities.push(city);
      }
    }
  }

  // --- State-based city resolution (A) ---
  if (stateAbbrevToCities && targetCities.length === 0) {
    const stateCities = resolveStateToCities(message, stateAbbrevToCities);
    for (const sc of stateCities) {
      if (!targetCities.includes(sc)) targetCities.push(sc);
    }
  }

  // --- Venue matching ---
  for (const venue of knownVenues) {
    if (!venue) continue;
    const venueLower = venue.toLowerCase();
    const venueWords = venueLower.split(/\s+/).filter((w) => w.length > 3);
    const matchCount = venueWords.filter((w) => msgLower.includes(w)).length;
    if (venueWords.length > 0 && matchCount / venueWords.length >= 0.5) {
      targetVenue = venue;
      break;
    }
  }

  return { targetDates, targetCities, targetVenue };
}

// --- Match phone to contact on an ACTIVE tour, preferring nearest future event ---
async function matchPhoneToTour(
  admin: ReturnType<typeof createClient>,
  normalized: string,
): Promise<{ tourId: string | null; senderName: string; senderRole: string | null }> {
  const today = new Date().toISOString().split("T")[0];

  const { data: matchedContacts } = await admin
    .from("contacts")
    .select("tour_id, name, role, scope, phone, tours!inner(id, status)")
    .eq("scope", "TOUR")
    .eq("tours.status", "ACTIVE")
    .not("phone", "is", null);

  if (matchedContacts) {
    const phoneMatches = matchedContacts.filter((c: any) => {
      const cp = normalizePhone(c.phone || "");
      return cp === normalized && cp.length >= 10;
    });

    if (phoneMatches.length === 1) {
      return { tourId: phoneMatches[0].tour_id, senderName: phoneMatches[0].name, senderRole: phoneMatches[0].role || null };
    }

    if (phoneMatches.length > 1) {
      const tourIds = phoneMatches.map((m: any) => m.tour_id);
      const { data: events } = await admin
        .from("schedule_events")
        .select("tour_id, event_date")
        .in("tour_id", tourIds)
        .gte("event_date", today)
        .order("event_date")
        .limit(1);

      const preferredTourId = events?.[0]?.tour_id || tourIds[0];
      const match = phoneMatches.find((m: any) => m.tour_id === preferredTourId) || phoneMatches[0];
      return { tourId: match.tour_id, senderName: match.name, senderRole: match.role || null };
    }
  }

  const { data: profileMatch } = await admin
    .from("profiles")
    .select("id, display_name, phone")
    .not("phone", "is", null);

  if (profileMatch) {
    for (const profile of profileMatch) {
      const profilePhone = normalizePhone(profile.phone || "");
      if (profilePhone === normalized && profilePhone.length >= 10) {
        const { data: memberships } = await admin
          .from("tour_members")
          .select("tour_id, tours!inner(id, status)")
          .eq("user_id", profile.id)
          .eq("tours.status", "ACTIVE");

        if (memberships && memberships.length > 0) {
          const memberTourIds = memberships.map((m: any) => m.tour_id);

          if (memberTourIds.length === 1) {
            return { tourId: memberTourIds[0], senderName: profile.display_name || "Team Member", senderRole: null };
          }

          const { data: events } = await admin
            .from("schedule_events")
            .select("tour_id, event_date")
            .in("tour_id", memberTourIds)
            .gte("event_date", today)
            .order("event_date")
            .limit(1);

          const preferredTourId = events?.[0]?.tour_id || memberTourIds[0];
          return { tourId: preferredTourId, senderName: profile.display_name || "Team Member", senderRole: null };
        }
        break;
      }
    }
  }

  return { tourId: null, senderName: "Unknown", senderRole: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!TWILIO_AUTH_TOKEN || !TWILIO_ACCOUNT_SID || !TWILIO_PHONE_NUMBER) {
    console.error("Missing Twilio configuration");
    return new Response("Server misconfigured", { status: 500, headers: corsHeaders });
  }
  if (!LOVABLE_API_KEY) {
    console.error("Missing LOVABLE_API_KEY");
    return new Response("Server misconfigured", { status: 500, headers: corsHeaders });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    // --- Parse form-encoded Twilio webhook body ---
    const formData = await req.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      params[key] = value.toString();
    }

    const fromPhone = params["From"] || "";
    const messageBody = (params["Body"] || "").trim();

    if (!fromPhone || !messageBody) {
      return emptyTwiml();
    }

    // --- Validate Twilio signature ---
    const twilioSignature = req.headers.get("x-twilio-signature") || "";
    const requestUrl = `${supabaseUrl}/functions/v1/tourtext-inbound`;

    const isValid = await validateTwilioSignature(
      requestUrl,
      params,
      twilioSignature,
      TWILIO_AUTH_TOKEN,
    );

    if (!isValid) {
      console.error("Invalid Twilio signature");
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    // --- Match phone number to contact → tour ---
    const normalized = normalizePhone(fromPhone);
    const { tourId: matchedTourId, senderName, senderRole } = await matchPhoneToTour(admin, normalized);

    // Auto-categorize using topic keywords
    const inboundTopics = extractTopics(messageBody);
    const category = inboundTopics.has("guest_list") ? "guest_list"
      : inboundTopics.has("venue_tech") ? "venue_tech"
      : inboundTopics.has("schedule") ? "schedule"
      : inboundTopics.has("logistics") ? "logistics"
      : inboundTopics.has("contacts") ? "contacts"
      : inboundTopics.has("catering") ? "catering"
      : "general";

    // Log inbound SMS with category
    const { error: inboundErr } = await admin.from("sms_inbound").insert({
      from_phone: fromPhone,
      message_text: messageBody,
      tour_id: matchedTourId,
      sender_name: senderName !== "Unknown" ? senderName : null,
      category,
    });
    if (inboundErr) {
      console.error("Failed to log inbound SMS:", inboundErr.message);
    }

    if (!matchedTourId) {
      const replyText = "Sorry, this number isn't linked to any active tour. Contact your Tour Admin to be added.";
      await sendTwilioSms(fromPhone, replyText, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);
      await admin.from("sms_outbound").insert({
        to_phone: fromPhone,
        message_text: replyText,
        tour_id: null,
        status: "sent",
      });
      return emptyTwiml();
    }

    // --- Guest list intent detection (tightened regex) ---
    const guestListKeywords = /guest\s*list|comp\s*ticket|put\s.+\s*on\s*the\s*list|will\s*call|can\s+i\s+get\s+\d|i\s+need\s+\d\s+ticket/i;
    if (guestListKeywords.test(messageBody)) {
      console.log("Guest list intent detected, extracting fields...");

      const extractResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `Extract guest list request fields from this crew member's text message. Today's date is ${new Date().toISOString().split("T")[0]}. "Tomorrow" means one day from today. Return ONLY valid JSON with these fields:
{
  "guest_names": "Full names of guests, comma separated",
  "ticket_count": number,
  "event_date": "YYYY-MM-DD or null if not specified",
  "venue": "venue name or null if not specified"
}
If the message says "+1" or "plus one" after a name, that means 2 tickets total (the named guest + 1). If just "+1" with no names, ticket_count is 1 and guest_names should be "Guest +1". Always try to parse relative dates like "tomorrow", "tonight", "Saturday".`,
            },
            { role: "user", content: messageBody },
          ],
          max_tokens: 200,
          temperature: 0,
        }),
      });

      if (extractResponse.ok) {
        const extractData = await extractResponse.json();
        const rawExtract = extractData.choices?.[0]?.message?.content || "";
        try {
          const jsonMatch = rawExtract.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const fields = JSON.parse(jsonMatch[0]);
            const { guest_names, ticket_count, event_date, venue } = fields;

            if (guest_names && ticket_count && event_date) {
              const glResponse = await fetch(`${supabaseUrl}/functions/v1/guest-list-request`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({
                  tour_id: matchedTourId,
                  requester_phone: fromPhone,
                  requester_name: senderName,
                  guest_names,
                  ticket_count,
                  event_date,
                  venue: venue || null,
                }),
              });

              if (glResponse.ok) {
                const glData = await glResponse.json();
                const smsReply = glData.sms_reply || "Your guest list request has been received.";

                if (glData.status !== "APPROVED") {
                  await sendTwilioSms(fromPhone, smsReply, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);
                  await admin.from("sms_outbound").insert({
                    to_phone: fromPhone,
                    message_text: smsReply,
                    tour_id: matchedTourId,
                    status: "sent",
                  });
                }

                return emptyTwiml();
              }
            } else {
              const missing: string[] = [];
              if (!guest_names) missing.push("guest names (full names)");
              if (!event_date) missing.push("which show date");
              if (!ticket_count) missing.push("how many tickets");

              const askReply = `Got it! Just need a few details: ${missing.join(", ")}?`;
              await sendTwilioSms(fromPhone, askReply, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);
              await admin.from("sms_outbound").insert({
                to_phone: fromPhone,
                message_text: askReply,
                tour_id: matchedTourId,
                status: "sent",
              });
              return emptyTwiml();
            }
          }
        } catch (parseErr) {
          console.error("Failed to parse guest list extraction:", parseErr);
        }
      }
    }

    // --- SMART CONTEXT: Extract relevance from user message ---
    const todayStr = new Date().toISOString().split("T")[0];

    // Pre-fetch known cities, venues, and dates for this tour
    const { data: allEvents } = await admin
      .from("schedule_events")
      .select("event_date, venue, city")
      .eq("tour_id", matchedTourId)
      .order("event_date");

    const knownCities = [...new Set((allEvents || []).map((e: any) => e.city).filter(Boolean))];
    const knownVenues = [...new Set((allEvents || []).map((e: any) => e.venue).filter(Boolean))];
    const eventDates = (allEvents || []).map((e: any) => e.event_date).filter(Boolean) as string[];

    // Build city-state index for state-based parsing (A)
    const { stateAbbrevToCities } = buildCityStateIndex(knownCities as string[]);

    const { targetDates, targetCities, targetVenue } = extractRelevanceFromMessage(
      messageBody,
      knownCities as string[],
      knownVenues as string[],
      eventDates,
      stateAbbrevToCities,
    );

    // --- Multi-step context carryover for follow-ups (backtrack up to 6 prior messages) ---
    // Also supports TOPIC CARRYOVER (B): inherit prior tech topic for location-only follow-ups
    let effectiveCities = [...targetCities];
    let effectiveVenue = targetVenue;
    let effectiveDates = [...targetDates];
    let inheritedTopic: string | null = null; // (B) topic carried from prior turn
    let inheritedTopicKeywords: string[] = []; // actual keywords for deterministic routing

    const hasCurrentLocation = targetCities.length > 0 || targetVenue !== null;
    const hasCurrentTopic = hasVenueTechIntent(messageBody) || inboundTopics.has("schedule") || inboundTopics.has("logistics") || inboundTopics.has("contacts") || inboundTopics.has("catering");
    const isLocationOnlyFollowUp = hasCurrentLocation && !hasCurrentTopic;
    const isFollowUp = !hasCurrentLocation && effectiveVenue === null && effectiveDates.length === 0 &&
      (CORRECTION_FOLLOW_UP_PATTERNS.test(messageBody.trim()) || messageBody.trim().length < 30);

    if (isFollowUp || isLocationOnlyFollowUp) {
      // Fetch last 7 inbound messages (current + 6 prior)
      const { data: priorInbound } = await admin
        .from("sms_inbound")
        .select("message_text")
        .eq("from_phone", fromPhone)
        .eq("tour_id", matchedTourId)
        .order("created_at", { ascending: false })
        .limit(7);

      const priorMessages = (priorInbound || []).slice(1);
      for (const priorMsg of priorMessages) {
        const priorExtracted = extractRelevanceFromMessage(
          priorMsg.message_text,
          knownCities as string[],
          knownVenues as string[],
          eventDates,
          stateAbbrevToCities,
        );

        // (B) Topic carryover: if current message has location but no topic, inherit prior topic
        if (isLocationOnlyFollowUp && !inheritedTopic) {
          if (hasVenueTechIntent(priorMsg.message_text)) {
            inheritedTopic = "venue_tech";
            inheritedTopicKeywords = VENUE_TECH_INTENT_KEYWORDS.filter(kw => priorMsg.message_text.toLowerCase().includes(kw));
          } else {
            const priorTopics = extractTopics(priorMsg.message_text);
            if (priorTopics.has("schedule")) inheritedTopic = "schedule";
            else if (priorTopics.has("logistics")) inheritedTopic = "logistics";
            else if (priorTopics.has("contacts")) inheritedTopic = "contacts";
          }
        }

        // Context carryover for pure follow-ups (no location/topic)
        if (isFollowUp) {
          if (priorExtracted.targetCities.length > 0 || priorExtracted.targetVenue || priorExtracted.targetDates.length > 0) {
            if (effectiveCities.length === 0 && priorExtracted.targetCities.length > 0) {
              effectiveCities = priorExtracted.targetCities;
            }
            if (!effectiveVenue && priorExtracted.targetVenue) {
              effectiveVenue = priorExtracted.targetVenue;
            }
            if (effectiveDates.length === 0 && priorExtracted.targetDates.length > 0) {
              effectiveDates = priorExtracted.targetDates;
            }
            // Also inherit topic if not yet found
            if (!inheritedTopic && hasVenueTechIntent(priorMsg.message_text)) {
              inheritedTopic = "venue_tech";
              inheritedTopicKeywords = VENUE_TECH_INTENT_KEYWORDS.filter(kw => priorMsg.message_text.toLowerCase().includes(kw));
            }
            console.log("Multi-step carryover from prior message:", JSON.stringify({
              carriedCities: effectiveCities,
              carriedVenue: effectiveVenue,
              carriedDates: effectiveDates,
              inheritedTopic,
              fromMessage: priorMsg.message_text.substring(0, 50),
            }));
            break;
          }
        }
      }
    }

    console.log("DIAG: Smart Context:", JSON.stringify({
      targetCities,
      effectiveCities,
      effectiveVenue,
      targetDates,
      effectiveDates,
      isFollowUp,
      isLocationOnlyFollowUp,
      inheritedTopic,
      inheritedTopicKeywords: inheritedTopicKeywords.slice(0, 3),
      stateResolution: Object.keys(stateAbbrevToCities).length > 0 ? Object.keys(stateAbbrevToCities).join(",") : "none",
      branch: "pending",
    }));

    // --- Deterministic schedule-presence responder ---
    const schedulePresenceIntent = /\b(on\s+(the\s+)?schedule|show\??|on\s+tour|playing|not\s+on\s+(the\s+)?schedule|scheduled)\b/i;
    const isScheduleQuestion = schedulePresenceIntent.test(messageBody) ||
      (CORRECTION_FOLLOW_UP_PATTERNS.test(messageBody.trim()) && effectiveCities.length > 0 && !inboundTopics.has("venue_tech") && inheritedTopic !== "venue_tech");

    if (isScheduleQuestion && effectiveCities.length > 0) {
      const results: string[] = [];
      for (const city of effectiveCities) {
        const cityName = city.toLowerCase().split(",")[0].trim();
        const match = (allEvents || []).find((e: any) =>
          e.city && e.city.toLowerCase().split(",")[0].trim().includes(cityName)
        );
        if (match) {
          results.push(`${city} — ${match.event_date} at ${match.venue || "TBD"}`);
        } else {
          results.push(`${city} — not found on this tour's schedule`);
        }
      }
      const deterministicReply = results.join("\n");
      console.log("DIAG: Deterministic schedule reply:", deterministicReply);

      await sendTwilioSms(fromPhone, deterministicReply, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);
      await admin.from("sms_outbound").insert({
        to_phone: fromPhone,
        message_text: deterministicReply,
        tour_id: matchedTourId,
        status: "sent",
      });
      return emptyTwiml();
    }

    // --- (C) Deterministic schedule responder for location-only queries (no topic at all) ---
    if (isLocationOnlyFollowUp && !inheritedTopic && effectiveCities.length > 0) {
      const todayAnchor = new Date().toISOString().split("T")[0];
      const results: string[] = [];
      for (const city of effectiveCities) {
        const cityName = city.toLowerCase().split(",")[0].trim();
        const cityEvents = (allEvents || []).filter((e: any) =>
          e.city && e.city.toLowerCase().split(",")[0].trim().includes(cityName)
        );
        if (cityEvents.length > 0) {
          // Pick nearest upcoming anchor (D)
          const upcoming = cityEvents.filter((e: any) => e.event_date && e.event_date >= todayAnchor).sort((a: any, b: any) => a.event_date.localeCompare(b.event_date));
          const anchor = upcoming[0] || cityEvents.sort((a: any, b: any) => (b.event_date || "").localeCompare(a.event_date || ""))[0];
          results.push(`${city} — ${anchor.event_date} at ${anchor.venue || "TBD"}`);
        } else {
          results.push(`${city} — not found on this tour's schedule`);
        }
      }
      const deterministicReply = results.join("\n");
      console.log("DIAG: Location-only schedule reply (no inherited topic):", JSON.stringify({
        branch: "deterministic_schedule_location_only",
        cities: effectiveCities,
        reply: deterministicReply,
      }));

      await sendTwilioSms(fromPhone, deterministicReply, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);
      await admin.from("sms_outbound").insert({
        to_phone: fromPhone,
        message_text: deterministicReply,
        tour_id: matchedTourId,
        status: "sent",
      });
      return emptyTwiml();
    }

    // --- (D) Anchor-date windowing instead of min/max multi-year spans ---
    let startDate: string;
    let endDate: string;

    const activeDates = effectiveDates.length > 0 ? effectiveDates : targetDates;

    if (activeDates.length > 0) {
      const d = new Date(activeDates[0]);
      const before = new Date(d); before.setDate(before.getDate() - 1);
      const after = new Date(d); after.setDate(after.getDate() + 1);
      startDate = before.toISOString().split("T")[0];
      endDate = after.toISOString().split("T")[0];
    } else if (effectiveCities.length > 0 || effectiveVenue) {
      // (D) Anchor-date: find nearest upcoming event per city, not min/max across all years
      const cityVenueEvents = (allEvents || []).filter((e: any) => {
        if (effectiveCities.length > 0 && e.city) {
          const eCityName = e.city.toLowerCase().split(",")[0].trim();
          for (const tc of effectiveCities) {
            const tCityName = tc.toLowerCase().split(",")[0].trim();
            if (eCityName.includes(tCityName) || tCityName.includes(eCityName)) return true;
          }
        }
        if (effectiveVenue && e.venue) {
          if (e.venue.toLowerCase().includes(effectiveVenue.toLowerCase().substring(0, 10))) return true;
        }
        return false;
      });
      if (cityVenueEvents.length > 0) {
        // Anchor-date logic: nearest upcoming first, else latest past
        const upcoming = cityVenueEvents.filter((e: any) => e.event_date && e.event_date >= todayStr)
          .sort((a: any, b: any) => a.event_date.localeCompare(b.event_date));
        const anchor = upcoming[0] || cityVenueEvents.sort((a: any, b: any) => (b.event_date || "").localeCompare(a.event_date || ""))[0];
        if (anchor?.event_date) {
          const anchorD = new Date(anchor.event_date);
          const before = new Date(anchorD); before.setDate(before.getDate() - 2);
          const after = new Date(anchorD); after.setDate(after.getDate() + 2);
          startDate = before.toISOString().split("T")[0];
          endDate = after.toISOString().split("T")[0];
          console.log("DIAG: Anchor-date window:", JSON.stringify({
            anchorDate: anchor.event_date,
            anchorCity: anchor.city,
            anchorVenue: anchor.venue,
            window: `${startDate} to ${endDate}`,
          }));
        } else {
          startDate = todayStr;
          const farDate = new Date(); farDate.setDate(farDate.getDate() + 30);
          endDate = farDate.toISOString().split("T")[0];
        }
      } else {
        startDate = todayStr;
        const farDate = new Date(); farDate.setDate(farDate.getDate() + 30);
        endDate = farDate.toISOString().split("T")[0];
      }
    } else {
      const futureEvents = (allEvents || []).filter((e: any) => e.event_date && e.event_date >= todayStr);
      if (futureEvents.length > 0) {
        startDate = futureEvents[0].event_date;
        const lastIdx = Math.min(7, futureEvents.length - 1);
        const lastD = new Date(futureEvents[lastIdx].event_date);
        lastD.setDate(lastD.getDate() + 1);
        endDate = lastD.toISOString().split("T")[0];
      } else {
        const sorted = (allEvents || []).filter((e: any) => e.event_date).sort((a: any, b: any) => b.event_date.localeCompare(a.event_date));
        if (sorted.length > 0) {
          endDate = sorted[0].event_date;
          const firstIdx = Math.min(2, sorted.length - 1);
          startDate = sorted[firstIdx].event_date;
        } else {
          startDate = todayStr;
          endDate = todayStr;
        }
      }
    }
    console.log("Date window:", { startDate, endDate });

    // --- Filtered AKB data fetches + ALL VANs for deterministic responder ---
    const [eventsRes, contactsRes, vansRes, allVansRes, tourRes, routingRes, policiesRes, recentInbound, recentOutbound, artifactsRes] = await Promise.all([
      admin.from("schedule_events")
        .select("event_date, venue, city, load_in, show_time, doors, soundcheck, curfew, notes")
        .eq("tour_id", matchedTourId)
        .gte("event_date", startDate)
        .lte("event_date", endDate)
        .order("event_date")
        .limit(10),
      admin.from("contacts")
        .select("name, role, email, phone, scope, venue")
        .eq("tour_id", matchedTourId)
        .limit(50),
      admin.from("venue_advance_notes")
        .select("venue_name, city, event_date, van_data")
        .eq("tour_id", matchedTourId)
        .gte("event_date", startDate)
        .lte("event_date", endDate)
        .order("event_date")
        .limit(10),
      // (E) ALL VANs for deterministic venue-tech responder (not date-windowed)
      admin.from("venue_advance_notes")
        .select("id, venue_name, city, event_date, van_data")
        .eq("tour_id", matchedTourId)
        .order("event_date")
        .limit(50),
      admin.from("tours").select("name").eq("id", matchedTourId).single(),
      admin.from("tour_routing")
        .select("event_date, city, hotel_name, hotel_checkin, hotel_checkout, hotel_confirmation, bus_notes, truck_notes, routing_notes")
        .eq("tour_id", matchedTourId)
        .gte("event_date", startDate)
        .lte("event_date", endDate)
        .order("event_date")
        .limit(10),
      admin.from("tour_policies")
        .select("policy_type, policy_data")
        .eq("tour_id", matchedTourId)
        .limit(10),
      admin.from("sms_inbound")
        .select("message_text, created_at")
        .eq("from_phone", fromPhone)
        .eq("tour_id", matchedTourId)
        .order("created_at", { ascending: false })
        .limit(5),
      admin.from("sms_outbound")
        .select("message_text, created_at")
        .eq("to_phone", fromPhone)
        .eq("tour_id", matchedTourId)
        .order("created_at", { ascending: false })
        .limit(5),
      admin.from("user_artifacts")
        .select("title, content, artifact_type")
        .eq("tour_id", matchedTourId)
        .eq("visibility", "tourtext")
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);

    console.log("Events in context:", (eventsRes.data || []).length, (eventsRes.data || []).map((e: any) => e.city));
    const tourName = tourRes.data?.name || "Unknown Tour";

    // Build conversation history — interleaved user + assistant with guardrails
    const historyMessages: { role: string; content: string; ts: string }[] = [];
    for (const m of (recentInbound.data || [])) {
      historyMessages.push({ role: "user", content: m.message_text, ts: m.created_at });
    }
    for (const m of (recentOutbound.data || [])) {
      historyMessages.push({ role: "assistant", content: m.message_text, ts: m.created_at });
    }
    historyMessages.sort((a, b) => a.ts.localeCompare(b.ts));
    const recentHistory = historyMessages.slice(-6);

    // --- FIRST-CONTACT IDENTITY CONFIRMATION ---
    const priorMessagesForFirstContact = historyMessages.filter(m => {
      return !(m.role === "user" && m.content === messageBody);
    });
    const isFirstContact = priorMessagesForFirstContact.length === 0;

    if (isFirstContact) {
      const { data: tourMeta } = await admin
        .from("tour_metadata")
        .select("tour_code, akb_id")
        .eq("tour_id", matchedTourId)
        .maybeSingle();

      const tourLabel = tourMeta?.tour_code || tourMeta?.akb_id || tourName;
      const roleLabel = senderRole || "team member";

      const confirmMsg = `Hey ${senderName}! This is TELA for ${tourLabel}. I have you as ${roleLabel}. Text YES to confirm, or let me know if anything's off.`;

      await sendTwilioSms(fromPhone, confirmMsg, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);
      await admin.from("sms_outbound").insert({
        to_phone: fromPhone,
        message_text: confirmMsg,
        tour_id: matchedTourId,
        status: "sent",
      });

      console.log(`First-contact confirmation sent to ${senderName} (${fromPhone}) for tour ${tourLabel}`);
      return emptyTwiml();
    }

    // --- CONFIRMATION RESPONSE HANDLER ---
    const lastOutbound = (recentOutbound.data || [])[0];
    const confirmationPattern = /This is TELA for .+\. I have you as .+\. Text YES to confirm/i;
    
    if (lastOutbound && confirmationPattern.test(lastOutbound.message_text)) {
      const msgLower = messageBody.toLowerCase().trim();
      const affirmatives = /^(yes|yeah|yep|yup|correct|confirmed|that's me|thats me|that's right|si|confirm|y|ya|ye|right|affirmative)$/i;
      const negatives = /^(no|nope|nah|wrong|incorrect|not me|that's wrong|thats wrong|not right)$/i;

      if (affirmatives.test(msgLower)) {
        const welcomeMsg = "Confirmed! You're all set. Ask me anything about the tour — schedule, venues, contacts, hotels. I'm here 24/7.";
        await sendTwilioSms(fromPhone, welcomeMsg, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);
        await admin.from("sms_outbound").insert({
          to_phone: fromPhone,
          message_text: welcomeMsg,
          tour_id: matchedTourId,
          status: "sent",
        });
        console.log(`Identity confirmed by ${senderName} (${fromPhone})`);
        return emptyTwiml();
      }

      if (negatives.test(msgLower)) {
        const deniedMsg = "No worries. Reach out to your Tour Admin to update your info.";
        await sendTwilioSms(fromPhone, deniedMsg, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);
        await admin.from("sms_outbound").insert({
          to_phone: fromPhone,
          message_text: deniedMsg,
          tour_id: matchedTourId,
          status: "sent",
        });
        console.log(`Identity denied by ${fromPhone}`);
        return emptyTwiml();
      }

      console.log(`User ${senderName} skipped confirmation, treating as confirmed and processing message`);
    }

    // --- DETERMINISTIC ARTIFACT MATCHING ---
    const ARTIFACT_KEYWORDS = /\b(wifi|wi-?fi|wi fi|password|network|internet|tour code|house code|ssid)\b/i;
    if (ARTIFACT_KEYWORDS.test(messageBody) && (artifactsRes.data || []).length > 0) {
      const msgLower = messageBody.toLowerCase();
      const matchedArtifact = (artifactsRes.data || []).find((a: any) => {
        const titleLower = (a.title || "").toLowerCase();
        const contentLower = (a.content || "").toLowerCase();
        return (
          (msgLower.includes("wifi") || msgLower.includes("wi-fi") || msgLower.includes("wi fi")) &&
          (titleLower.includes("wifi") || titleLower.includes("wi-fi") || titleLower.includes("wi fi") ||
           contentLower.includes("wifi") || contentLower.includes("wi-fi") || contentLower.includes("wi fi"))
        ) || (
          msgLower.includes("password") &&
          (titleLower.includes("password") || contentLower.includes("password"))
        ) || (
          msgLower.includes("internet") &&
          (titleLower.includes("internet") || titleLower.includes("wifi") || titleLower.includes("wi-fi"))
        ) || (
          msgLower.includes("network") &&
          (titleLower.includes("network") || titleLower.includes("wifi") || titleLower.includes("wi-fi"))
        );
      });

      if (matchedArtifact) {
        const artifactReply = toPlaintext(matchedArtifact.content || matchedArtifact.title);
        console.log(`Deterministic artifact match: "${matchedArtifact.title}" for message "${messageBody}"`);

        await sendTwilioSms(fromPhone, artifactReply, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);
        await admin.from("sms_outbound").insert({
          to_phone: fromPhone,
          message_text: artifactReply,
          tour_id: matchedTourId,
          status: "sent",
        });
        return emptyTwiml();
      }
    }

    // --- DETERMINISTIC VENUE-TECH RESPONDER ---
    // Includes (B) topic carryover: if inherited topic is venue_tech, use inherited keywords
    const allVans = allVansRes.data || [];
    const msgLowerForTech = messageBody.toLowerCase();
    let matchedVenueTechTopics = VENUE_TECH_INTENT_KEYWORDS.filter(kw => msgLowerForTech.includes(kw));

    // (B) If no direct tech keywords but inherited topic is venue_tech, use inherited keywords
    if (matchedVenueTechTopics.length === 0 && inheritedTopic === "venue_tech" && inheritedTopicKeywords.length > 0) {
      matchedVenueTechTopics = inheritedTopicKeywords;
      console.log("DIAG: Topic carryover activated — inherited venue-tech keywords:", inheritedTopicKeywords);
    }

    if (matchedVenueTechTopics.length > 0 && (effectiveCities.length > 0 || effectiveVenue || effectiveDates.length > 0)) {
      // (E) Resolve target VAN from ALL VANs first, not just date-windowed
      const targetVan = resolveTargetVan(allVans, effectiveCities, effectiveVenue, effectiveDates, allEvents || []);

      if (targetVan) {
        const { found, missing } = extractVenueTechFacts(targetVan.van_data || {}, matchedVenueTechTopics);
        const cityLabel = targetVan.city || targetVan.venue_name || "venue";
        const dateLabel = targetVan.event_date || "";

        const parts: string[] = [];
        for (const [label, value] of Object.entries(found)) {
          parts.push(`${label}: ${value}`);
        }
        for (const label of missing) {
          parts.push(`${label}: not listed in ${cityLabel} VAN`);
        }

        const deterministicReply = `${cityLabel}${dateLabel ? ` (${dateLabel})` : ""}:\n${parts.join("\n")}`;
        console.log("DIAG: DETERMINISTIC VENUE-TECH REPLY:", JSON.stringify({
          intent: matchedVenueTechTopics.slice(0, 5),
          vanId: targetVan.id,
          city: targetVan.city,
          venue: targetVan.venue_name,
          anchorDate: targetVan.event_date,
          foundFields: Object.keys(found),
          missingFields: missing,
          branch: "deterministic",
          topicCarryover: inheritedTopic === "venue_tech",
          targetVanIncluded: true,
        }));

        await sendTwilioSms(fromPhone, deterministicReply, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);
        await admin.from("sms_outbound").insert({
          to_phone: fromPhone,
          message_text: deterministicReply,
          tour_id: matchedTourId,
          status: "sent",
        });
        return emptyTwiml();
      } else if (effectiveCities.length === 0 && !effectiveVenue && effectiveDates.length === 0) {
        const clarifyReply = "Which city or date are you asking about?";
        await sendTwilioSms(fromPhone, clarifyReply, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);
        await admin.from("sms_outbound").insert({
          to_phone: fromPhone,
          message_text: clarifyReply,
          tour_id: matchedTourId,
          status: "sent",
        });
        console.log("DIAG: VENUE-TECH: no venue resolved, asked clarification", JSON.stringify({ intent: matchedVenueTechTopics.slice(0, 5) }));
        return emptyTwiml();
      }
      console.log("DIAG: VENUE-TECH: city/venue resolved but no VAN match, falling through to LLM", JSON.stringify({
        intent: matchedVenueTechTopics.slice(0, 5),
        cities: effectiveCities,
        venue: effectiveVenue,
        branch: "llm_fallback",
      }));
    }

    // Build Schedule Facts — authoritative city list for prompt hardening
    const scheduleFacts = (allEvents || []).map((e: any) =>
      `${e.event_date} | ${e.city || "?"} | ${e.venue || "TBD"}`
    ).join("\n");

    // --- RELEVANCE-FIRST VAN PACKING ---
    const BUDGET_ARTIFACTS = 4000;
    const BUDGET_SCHEDULE = 3000;
    const BUDGET_CONTACTS = 2000;
    const BUDGET_ROUTING = 2000;
    const BUDGET_POLICIES = 1000;
    const BUDGET_VANS = 6000;
    const PER_VENUE_CAP = 2500;
    const TOTAL_CAP = 16000;

    const artifactsSection = (artifactsRes.data || []).length > 0
      ? (artifactsRes.data || []).map((a: any) =>
          `${a.title} (${a.artifact_type}): ${(a.content || "").substring(0, 1500)}`
        ).join("\n\n").substring(0, BUDGET_ARTIFACTS)
      : "(No TourText artifacts)";

    const scheduleSection = JSON.stringify(eventsRes.data || [], null, 1).substring(0, BUDGET_SCHEDULE);
    const contactsSection = JSON.stringify(contactsRes.data || [], null, 1).substring(0, BUDGET_CONTACTS);

    // (E) Relevance-first VAN packing: resolve target from ALL VANs first
    const dateWindowVans = vansRes.data || [];
    const targetVanForPacking = resolveTargetVan(allVans.length > 0 ? allVans : dateWindowVans, effectiveCities, effectiveVenue, effectiveDates, allEvents || []);
    let vansSection = "";
    let vansBudgetRemaining = BUDGET_VANS;
    const includedVanIds = new Set<string>();

    // 1. Target VAN first (guaranteed inclusion)
    if (targetVanForPacking) {
      const vanStr = `${targetVanForPacking.venue_name} (${targetVanForPacking.city || "?"}, ${targetVanForPacking.event_date || "?"}):\n${JSON.stringify(targetVanForPacking.van_data, null, 1)}`.substring(0, PER_VENUE_CAP);
      vansSection += vanStr;
      vansBudgetRemaining -= vanStr.length;
      includedVanIds.add(`${targetVanForPacking.venue_name}-${targetVanForPacking.event_date}`);
    }

    // 2. Fill remaining budget with other date-window VANs
    for (const v of dateWindowVans) {
      const vKey = `${v.venue_name}-${v.event_date}`;
      if (includedVanIds.has(vKey)) continue;
      if (vansBudgetRemaining <= 200) break;
      const vanStr = `\n\n${v.venue_name} (${v.city || "?"}, ${v.event_date || "?"}):\n${JSON.stringify(v.van_data, null, 1)}`.substring(0, Math.min(PER_VENUE_CAP, vansBudgetRemaining));
      vansSection += vanStr;
      vansBudgetRemaining -= vanStr.length;
      includedVanIds.add(vKey);
    }

    if (!vansSection) vansSection = "(No VAN data for this date range)";

    const targetVanIncluded = targetVanForPacking ? includedVanIds.has(`${targetVanForPacking.venue_name}-${targetVanForPacking.event_date}`) : false;
    console.log("DIAG: VAN packing:", JSON.stringify({
      targetVan: targetVanForPacking ? `${targetVanForPacking.venue_name} (${targetVanForPacking.city})` : null,
      targetIncluded: targetVanIncluded,
      totalVansIncluded: includedVanIds.size,
      vansLength: vansSection.length,
    }));

    const routingSection = ((routingRes.data || []).length > 0
      ? JSON.stringify(routingRes.data, null, 1)
      : "(No routing data for this date range)").substring(0, BUDGET_ROUTING);
    const policiesSection = ((policiesRes.data || []).length > 0
      ? (policiesRes.data || []).map((p: any) => `${p.policy_type}: ${JSON.stringify(p.policy_data)}`).join("\n")
      : "(No policies set)").substring(0, BUDGET_POLICIES);

    console.log("Section lengths:", JSON.stringify({
      artifacts_len: artifactsSection.length,
      schedule_len: scheduleSection.length,
      contacts_len: contactsSection.length,
      vans_len: vansSection.length,
      routing_len: routingSection.length,
      policies_len: policiesSection.length,
    }));

    // Build "Verified Venue Facts" block if target VAN exists
    let verifiedFactsBlock = "";
    if (targetVanForPacking && (inboundTopics.has("venue_tech") || matchedVenueTechTopics.length > 0 || inheritedTopic === "venue_tech")) {
      const allTopics = ["labor", "haze", "curfew", "power", "dock", "rigging", "staging", "spl", "dead case", "forklift", "follow spot", "house electrician"];
      const { found, missing } = extractVenueTechFacts(targetVanForPacking.van_data || {}, allTopics);
      const factLines = Object.entries(found).map(([k, v]) => `  ${k}: ${v}`);
      const gapLines = missing.map(k => `  ${k}: NOT IN VAN`);
      verifiedFactsBlock = `
=== VERIFIED VENUE FACTS (${targetVanForPacking.venue_name}, ${targetVanForPacking.city || "?"}, ${targetVanForPacking.event_date || "?"}) ===
${factLines.join("\n")}
${gapLines.length > 0 ? `GAPS:\n${gapLines.join("\n")}` : ""}
=== END VERIFIED FACTS ===
`;
    }

    // Artifacts FIRST so they are never truncated, verified facts prepended
    const akbContext = `
Tour: ${tourName}
Date window: ${startDate} to ${endDate}
${verifiedFactsBlock}
Tour Artifacts (crew-shared notes, WiFi, SOPs, checklists):
${artifactsSection}

Schedule:
${scheduleSection}

Contacts:
${contactsSection}

Routing & Hotels:
${routingSection}

Tour Policies (guest list, safety SOPs):
${policiesSection}

Venue Advance Notes (VANs) — haze, rigging, labor, power, docks, staging, curfew, SPL limits:
${vansSection}
`.substring(0, TOTAL_CAP);

    // --- Progressive Depth ---
    const depth = detectDepth(messageBody, recentHistory.map(m => ({ role: m.role, content: m.content })));
    const depthMaxTokens = depth === 3 ? 800 : depth === 2 ? 500 : 250;
    const depthInstruction = `RESPONSE DEPTH PROTOCOL:
- Depth 1 (first ask on a topic): One punchy line, under 160 chars. Just the single key fact.
- Depth 2 (follow-up or "tell me more"): 2-4 lines of operational context, under 480 chars.
- Depth 3 (third ask or "full rundown"/"everything"): Complete detail, up to 1500 chars. Include all relevant specs, contacts, and action items.

Current depth level: ${depth}`;

    console.log(`Progressive Depth: level=${depth}, max_tokens=${depthMaxTokens}, message="${messageBody.substring(0, 50)}"`);

    // Build chat messages with history
    const chatMessages: { role: string; content: string }[] = [
      {
        role: "system",
        content: `You are TELA, the Tour Intelligence for "${tourName}". A crew member named ${senderName} just texted the TourText number (888-340-0564). Reply in SHORT, punchy SMS style — no markdown, no headers, no source citations. Be direct and factual. If you don't know, say so honestly.

Today's date is ${new Date().toISOString().split("T")[0]}.

ABSOLUTE RULE: NEVER fabricate, guess, or infer any information not explicitly present in the data sections below. If the answer is not in your data, respond with "I don't have that information." Do NOT use your training data to fill in missing tour details. Wrong information is infinitely worse than no information.

SELF-CORRECTION RULE: If your previous replies in the conversation history contained errors or incomplete information, correct them in your current response — do NOT repeat previous mistakes.

IMPORTANT: The user is currently asking about ${effectiveCities.length > 0 ? effectiveCities.join(", ") : effectiveVenue || "the tour in general"}. Focus your answer ONLY on this location. Do NOT reference or repeat information about other cities from earlier in the conversation unless the user explicitly asks about them.

${depthInstruction}

=== SCHEDULE FACTS (AUTHORITATIVE — DO NOT CONTRADICT) ===
${scheduleFacts}
=== END SCHEDULE FACTS ===

SCHEDULE AUTHORITY RULES:
- The Schedule Facts section above is the SINGLE SOURCE OF TRUTH for which cities are on the tour.
- If a city appears in Schedule Facts, it IS on the schedule. NEVER say it is not.
- Missing VAN data, tech specs, or routing details does NOT mean a city is unscheduled.
- If asked about a city that IS in Schedule Facts, confirm it is scheduled and provide the date/venue.

IMPORTANT: When the user asks about a role (like "PM", "Production Manager", "TM", etc.), search the CONTACTS list for someone with that role — do NOT assume they are asking about themselves. Short abbreviations like "PM" = Production Manager, "TM" = Tour Manager, "LD" = Lighting Director, "FOH" = Front of House.

When the user sends a short follow-up (like "PM?" after asking about load-in), use the conversation history to understand the context.

VENUE DATA: The "Venue Advance Notes (VANs)" section contains the PRIMARY source for venue-specific details like haze policies, labor/union info, rigging distances, power specs, dock logistics, staging notes, curfew, SPL limits, and more. ALWAYS check VANs first when asked about any venue-specific topic.

ROUTING DATA: The "Routing & Hotels" section has hotel names, check-in/out dates, and bus/truck notes. Check here for hotel questions.

TOUR ARTIFACTS (CRITICAL — CHECK FIRST): The "Tour Artifacts" section is at the TOP of AKB DATA. It contains crew-shared notes published by tour staff: WiFi passwords, department SOPs, packing lists, checklists, and other tour-wide info. ALWAYS check Tour Artifacts FIRST for general tour questions before saying you don't have the information.

AVAILABLE ARTIFACTS: ${(artifactsRes.data || []).map((a: any) => `"${a.title}" (${a.artifact_type})`).join(", ") || "None"}

AKB DATA:
${akbContext}`,
      },
    ];

    // (F) Scoped history: when new location is explicit, filter out stale city references
    const hasNewExplicitLocation = targetCities.length > 0 || targetVenue !== null;
    for (const msg of recentHistory.slice(0, -1)) {
      if (msg.role === "user") {
        if (hasNewExplicitLocation) {
          // Only include prior user turns that are relevant to current location/topic
          // or are very recent (within last 2 turns)
          const msgIdx = recentHistory.indexOf(msg);
          const isRecent = msgIdx >= recentHistory.length - 3;
          if (isRecent) {
            chatMessages.push({ role: "user", content: msg.content });
          }
          // Skip older user turns about different cities to prevent stale context bleed
        } else {
          chatMessages.push({ role: "user", content: msg.content });
        }
      }
    }

    chatMessages.push({
      role: "user",
      content: `${senderName}: ${messageBody}`,
    });

    // --- Generate AI response ---
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: chatMessages,
        max_tokens: depthMaxTokens,
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", errText);
      const fallback = "Sorry, I'm having trouble right now. Try again in a moment.";
      await sendTwilioSms(fromPhone, fallback, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);
      return emptyTwiml();
    }

    const aiData = await aiResponse.json();
    const rawReply = aiData.choices?.[0]?.message?.content || "I don't have an answer for that right now.";
    const smsReply = toPlaintext(rawReply);

    console.log("DIAG: LLM fallback used, branch=llm", JSON.stringify({
      effectiveCities,
      effectiveVenue,
      inheritedTopic,
      historyMessagesIncluded: chatMessages.length - 2, // minus system + current
    }));

    // --- Send SMS reply via Twilio REST API (sole delivery path) ---
    await sendTwilioSms(fromPhone, smsReply, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);

    // Log outbound SMS
    await admin.from("sms_outbound").insert({
      to_phone: fromPhone,
      message_text: smsReply,
      tour_id: matchedTourId,
      status: "sent",
    });

    // Always return empty TwiML to prevent double-SMS
    return emptyTwiml();
  } catch (error) {
    console.error("tourtext-inbound error:", error);
    return emptyTwiml();
  }
});

// --- Send SMS via Twilio REST API ---
async function sendTwilioSms(
  to: string,
  body: string,
  accountSid: string,
  authToken: string,
  from: string,
): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = btoa(`${accountSid}:${authToken}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Twilio send error:", response.status, errText);
  }
}

// --- Always return empty TwiML (prevents double-SMS) ---
function emptyTwiml(): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { headers: { ...corsHeaders, "Content-Type": "text/xml" } },
  );
}
