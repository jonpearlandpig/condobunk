import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Strip role suffixes, prefixes, annotations from a name string */
function cleanName(raw: string): string {
  if (!raw) return raw;
  // Remove "Head Rigger:" prefix pattern
  let name = raw.replace(/^(head\s+rigger|production\s+contact)\s*[:\-–—]\s*/i, "").trim();
  // Remove role suffixes like "- Event Production Coordinator" or "| Director of Event Services"
  name = name.replace(/\s*[\-–—|]\s*(event|director|senior|production|coordinator|specialist|operations|manager|vp|svp).*$/i, "").trim();
  // Remove parenthetical notes like "(male)"
  name = name.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  // Remove "I can also..." trailing sentences
  name = name.replace(/\.\s*I\s+can\s+also\b.*$/i, "").trim();
  // Remove trailing period
  name = name.replace(/\.\s*$/, "").trim();
  // Handle "LastName, FirstName" → "FirstName LastName"
  if (name.includes(",") && !name.includes(" OR ")) {
    const parts = name.split(",").map(s => s.trim());
    if (parts.length === 2 && parts[0] && parts[1]) {
      name = `${parts[1]} ${parts[0]}`;
    }
  }
  return name;
}

/** Extract first phone number, strip prefixes like "Cell:", "Direct:" */
function cleanPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Strip label prefixes
  let phone = raw.replace(/^(cell|direct|office|main|mobile|work|fax)\s*[:\-–—]\s*/i, "").trim();
  // Extract first phone-like pattern
  const match = phone.match(/[\d(+][\d\s.()-]{7,}/);
  return match ? match[0].trim() : phone || null;
}

/** Fuzzy venue name matching: returns best match from schedule venues */
function findBestVenueMatch(vanVenue: string, scheduleVenues: string[]): string | null {
  if (!vanVenue || scheduleVenues.length === 0) return null;
  const a = vanVenue.toLowerCase().trim();

  // Exact match
  for (const sv of scheduleVenues) {
    if (sv.toLowerCase().trim() === a) return sv;
  }

  // Substring match (either direction)
  for (const sv of scheduleVenues) {
    const b = sv.toLowerCase().trim();
    if (b.includes(a) || a.includes(b)) return sv;
  }

  // Word-token overlap (≥60% shared words)
  const aWords = new Set(a.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2));
  let bestMatch: string | null = null;
  let bestOverlap = 0;
  for (const sv of scheduleVenues) {
    const bWords = new Set(sv.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2));
    const overlap = [...aWords].filter(w => bWords.has(w)).length;
    const ratio = overlap / Math.max(aWords.size, bWords.size, 1);
    if (ratio > bestOverlap && ratio >= 0.6) {
      bestOverlap = ratio;
      bestMatch = sv;
    }
  }
  return bestMatch;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { tour_id } = await req.json();
    if (!tour_id) {
      return new Response(JSON.stringify({ error: "tour_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch all VANs for this tour
    const { data: vans, error: vanErr } = await supabase
      .from("venue_advance_notes")
      .select("id, venue_name, city, event_date, van_data, source_doc_id, tour_id")
      .eq("tour_id", tour_id);

    if (vanErr) throw vanErr;
    if (!vans || vans.length === 0) {
      return new Response(
        JSON.stringify({ message: "No VANs found", contacts_created: 0, contacts_updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch all schedule event venue names for fuzzy matching
    const { data: schedEvents } = await supabase
      .from("schedule_events")
      .select("venue")
      .eq("tour_id", tour_id)
      .not("venue", "is", null);

    const scheduleVenues = [...new Set((schedEvents || []).map(e => e.venue!).filter(Boolean))];

    // 3. Fetch existing venue contacts so we can dedup
    const { data: existingContacts } = await supabase
      .from("contacts")
      .select("id, name, role, venue, tour_id")
      .eq("tour_id", tour_id)
      .eq("scope", "VENUE");

    const existingKey = (name: string, venue: string | null, role: string | null) =>
      `${name.toLowerCase().trim()}||${(venue || "").toLowerCase().trim()}||${(role || "").toLowerCase().trim()}`;

    const existingSet = new Set(
      (existingContacts || []).map(c => existingKey(c.name, c.venue, c.role))
    );

    let created = 0;
    let skipped = 0;

    for (const van of vans) {
      const vanData = van.van_data as Record<string, unknown> | null;
      if (!vanData) continue;

      // Determine best venue name from schedule
      const matchedVenue = findBestVenueMatch(van.venue_name, scheduleVenues) || van.venue_name;

      // Extract production_contact
      const pc = vanData.production_contact as Record<string, string> | undefined;
      if (pc?.name) {
        // Handle "Name1 OR Name2" pattern
        const names = pc.name.includes(" OR ") ? pc.name.split(/\s+OR\s+/i) : [pc.name];
        for (const rawName of names) {
          const name = cleanName(rawName);
          if (!name || name.length < 2) continue;

          const key = existingKey(name, matchedVenue, "Production Contact");
          if (existingSet.has(key)) { skipped++; continue; }

          const { error } = await supabase.from("contacts").insert({
            tour_id: tour_id,
            name,
            role: "Production Contact",
            phone: cleanPhone(pc.phone),
            email: pc.email || null,
            scope: "VENUE",
            venue: matchedVenue,
            source_doc_id: van.source_doc_id,
          });
          if (!error) {
            created++;
            existingSet.add(key);
          } else {
            console.error(`[backfill] Error inserting PC for ${van.venue_name}:`, error.message);
          }
        }
      }

      // Extract house_rigger_contact
      const rigger = vanData.house_rigger_contact as Record<string, string> | undefined;
      if (rigger?.name) {
        const name = cleanName(rigger.name);
        if (name && name.length >= 2) {
          const key = existingKey(name, matchedVenue, "House Rigger");
          if (!existingSet.has(key)) {
            const { error } = await supabase.from("contacts").insert({
              tour_id: tour_id,
              name,
              role: "House Rigger",
              phone: cleanPhone(rigger.phone),
              email: rigger.email || null,
              scope: "VENUE",
              venue: matchedVenue,
              source_doc_id: van.source_doc_id,
            });
            if (!error) {
              created++;
              existingSet.add(key);
            } else {
              console.error(`[backfill] Error inserting rigger for ${van.venue_name}:`, error.message);
            }
          } else {
            skipped++;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: "Backfill complete",
        vans_processed: vans.length,
        contacts_created: created,
        contacts_skipped_existing: skipped,
        schedule_venues_available: scheduleVenues.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
