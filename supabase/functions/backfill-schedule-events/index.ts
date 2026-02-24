import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Parse ISO dates + classify from VAN day_and_date text */
function parseDatesFromVanText(text: string): Array<{
  date: string;
  type: string;
  show_time: string | null;
}> {
  if (!text) return [];
  const results: Array<{ date: string; type: string; show_time: string | null }> = [];
  // Split on | or - separators, or just scan the whole string
  const datePattern = /(\d{4}-\d{2}-\d{2})/g;
  let match;
  while ((match = datePattern.exec(text)) !== null) {
    const isoDate = match[1];
    const pos = match.index;
    // Look backwards up to 60 chars for context
    const prefix = text.substring(Math.max(0, pos - 60), pos).toLowerCase();
    
    let type = "SHOW";
    if (prefix.includes("load-in") || prefix.includes("load in") || prefix.includes("loadin")) {
      type = "LOAD_IN";
    } else if (prefix.includes("travel") || prefix.includes("bus") || prefix.includes("drive")) {
      type = "TRAVEL";
    } else if (prefix.includes("off") || prefix.includes("day off")) {
      type = "OFF";
    }

    // Look ahead for show time pattern like "@ 7:30 PM"
    let showTime: string | null = null;
    const suffix = text.substring(pos, Math.min(text.length, pos + 40));
    const timeMatch = suffix.match(/@\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2];
      const ampm = timeMatch[3].toUpperCase();
      if (ampm === "PM" && hours < 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;
      showTime = `${hours.toString().padStart(2, "0")}:${minutes}`;
    }

    results.push({ date: isoDate, type, show_time: showTime });
  }
  return results;
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
      .select("id, venue_name, city, event_date, van_data, source_doc_id")
      .eq("tour_id", tour_id);

    if (vanErr) throw vanErr;
    if (!vans || vans.length === 0) {
      return new Response(
        JSON.stringify({ message: "No VANs found", events_created: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalCreated = 0;
    let totalUpdated = 0;

    for (const van of vans) {
      const vanData = van.van_data as any;
      const dayAndDate =
        vanData?.event_details?.day_and_date ||
        vanData?.event_details?.dayAndDate ||
        "";
      const showTimes = vanData?.event_details?.show_times || "";

      const textToParse = `${dayAndDate} ${showTimes}`.trim();
      if (!textToParse) continue;

      const parsed = parseDatesFromVanText(textToParse);
      if (parsed.length === 0) continue;

      // Update VAN event_date if null (use first show date or first date)
      if (!van.event_date) {
        const firstShow = parsed.find((p) => p.type === "SHOW");
        const bestDate = firstShow?.date || parsed[0].date;
        await supabase
          .from("venue_advance_notes")
          .update({ event_date: bestDate })
          .eq("id", van.id);
        totalUpdated++;
      }

      // Check for existing schedule_events for this VAN's dates
      for (const entry of parsed) {
        // Check if event already exists
        const { data: existing } = await supabase
          .from("schedule_events")
          .select("id")
          .eq("tour_id", tour_id)
          .eq("event_date", entry.date)
          .eq("venue", van.venue_name)
          .limit(1);

        if (existing && existing.length > 0) continue;

        // Build show_time timestamp if available
        let showTimeTs: string | null = null;
        let loadInTs: string | null = null;

        if (entry.type === "SHOW" && entry.show_time) {
          showTimeTs = `${entry.date}T${entry.show_time}:00`;
        }
        if (entry.type === "LOAD_IN") {
          // Default load-in to 8 AM
          loadInTs = `${entry.date}T08:00:00`;
        }

        const noteLines: string[] = [];
        if (entry.type === "LOAD_IN") noteLines.push("Load-In Day");
        if (entry.type === "SHOW") noteLines.push("Show Day");
        if (entry.type === "TRAVEL") noteLines.push("Travel Day");
        if (entry.type === "OFF") noteLines.push("Day Off");

        await supabase.from("schedule_events").insert({
          tour_id,
          event_date: entry.date,
          venue: van.venue_name,
          city: van.city,
          show_time: showTimeTs,
          load_in: loadInTs,
          notes: noteLines.join(" | "),
          source_doc_id: van.source_doc_id,
          confidence_score: 0.85,
        });

        totalCreated++;
      }
    }

    return new Response(
      JSON.stringify({
        message: "Backfill complete",
        vans_processed: vans.length,
        events_created: totalCreated,
        vans_date_updated: totalUpdated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
