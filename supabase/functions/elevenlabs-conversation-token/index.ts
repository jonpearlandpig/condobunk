import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ error: "ElevenLabs API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const agentId = body.agent_id;
    const tourId = body.tour_id;

    if (!agentId) {
      return new Response(JSON.stringify({ error: "agent_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Request a conversation token from ElevenLabs
    const elResponse = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`,
      {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      }
    );

    if (!elResponse.ok) {
      const errText = await elResponse.text();
      console.error("[elevenlabs-token] API error:", elResponse.status, errText);
      return new Response(
        JSON.stringify({ error: "Failed to generate conversation token" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { token: conversationToken } = await elResponse.json();

    // If no tour_id, return token only (backward compat)
    if (!tourId) {
      return new Response(JSON.stringify({ token: conversationToken }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Fetch AKB data for the tour ---
    const admin = createClient(supabaseUrl, serviceKey);

    // Validate membership
    const { data: memberRow } = await admin
      .from("tour_members")
      .select("tour_id")
      .eq("user_id", user.id)
      .eq("tour_id", tourId)
      .maybeSingle();

    if (!memberRow) {
      return new Response(JSON.stringify({ token: conversationToken }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tour name
    const { data: tourRow } = await admin
      .from("tours")
      .select("name")
      .eq("id", tourId)
      .single();
    const tourName = tourRow?.name || "Unknown Tour";

    // Fetch AKB data in parallel (condensed for voice)
    const [eventsRes, contactsRes, vansRes, routingRes, policiesRes, gapsRes, conflictsRes, artifactsRes, metadataRes] = await Promise.all([
      admin.from("schedule_events").select("event_date, venue, city, load_in, show_time, doors, soundcheck, curfew, notes").eq("tour_id", tourId).order("event_date").limit(50),
      admin.from("contacts").select("name, role, email, phone, scope, venue").eq("tour_id", tourId).limit(50),
      admin.from("venue_advance_notes").select("venue_name, city, event_date, van_data").eq("tour_id", tourId).order("event_date").limit(30),
      admin.from("tour_routing").select("event_date, city, hotel_name, hotel_checkin, hotel_checkout, hotel_confirmation, bus_notes, truck_notes, routing_notes").eq("tour_id", tourId).order("event_date").limit(30),
      admin.from("tour_policies").select("policy_type, policy_data").eq("tour_id", tourId).limit(10),
      admin.from("knowledge_gaps").select("question, domain, resolved").eq("tour_id", tourId).eq("resolved", false).limit(15),
      admin.from("calendar_conflicts").select("conflict_type, severity, resolved").eq("tour_id", tourId).eq("resolved", false).limit(15),
      admin.from("user_artifacts").select("title, artifact_type, content, visibility").eq("tour_id", tourId).or(`visibility.in.(tourtext,condobunk),and(visibility.eq.bunk_stash,user_id.eq.${user.id})`).order("updated_at", { ascending: false }).limit(10),
      admin.from("tour_metadata").select("artist, region, date_range_start, date_range_end, authority, change_policy, showtime_standard").eq("tour_id", tourId).maybeSingle(),
    ]);

    const events = eventsRes.data || [];
    const contacts = contactsRes.data || [];
    const vans = vansRes.data || [];
    const routing = routingRes.data || [];
    const policies = policiesRes.data || [];
    const gaps = gapsRes.data || [];
    const conflicts = conflictsRes.data || [];
    const artifacts = artifactsRes.data || [];
    const metadata = metadataRes.data;

    // Build voice-optimized system prompt
    const tourTeam = contacts.filter((c: any) => c.scope !== "VENUE");
    const venueContacts = contacts.filter((c: any) => c.scope === "VENUE");

    const systemPrompt = `You are TELA (Touring Efficiency Liaison Assistant) — the voice-based tour knowledge assistant for "${tourName}". You answer questions using verified tour data only.

## VOICE RULES
- Keep answers SHORT and conversational. You are speaking, not typing.
- Lead with the answer, then cite the source briefly.
- For simple facts (curfew, capacity, contacts), answer in one sentence.
- For complex questions, use 2-3 short sentences max.
- Never spell out UUIDs, file paths, or technical IDs.
- Say "I don't have that information" if the data is missing. Never guess.
- When mentioning contacts, include their phone number if available so the user can call them.

## SOURCE AUTHORITY (in order)
1. Venue Advance Notes (VANs) — highest authority for venue-specific data
2. Schedule events and routing data
3. Tour policies and metadata
4. User artifacts

${metadata ? `## TOUR PROFILE
Artist: ${metadata.artist || "N/A"}
Region: ${metadata.region || "N/A"}
Dates: ${metadata.date_range_start || "?"} to ${metadata.date_range_end || "?"}
Authority: ${metadata.authority || "N/A"}
Change Policy: ${metadata.change_policy || "N/A"}
Showtime Standard: ${metadata.showtime_standard || "N/A"}
` : ""}

## SCHEDULE (${events.length} events)
${events.length > 0 ? events.map((e: any) => `${e.event_date}: ${e.venue || "TBD"}, ${e.city || "TBD"}${e.load_in ? ` | Load-in: ${e.load_in}` : ""}${e.soundcheck ? ` | SC: ${e.soundcheck}` : ""}${e.doors ? ` | Doors: ${e.doors}` : ""}${e.show_time ? ` | Show: ${e.show_time}` : ""}${e.curfew ? ` | Curfew: ${e.curfew}` : ""}${e.notes ? ` | ${e.notes}` : ""}`).join("\n") : "(No schedule events)"}

## TOUR TEAM (${tourTeam.length})
${tourTeam.length > 0 ? tourTeam.map((c: any) => `${c.name}${c.role ? ` (${c.role})` : ""}${c.phone ? ` — ${c.phone}` : ""}${c.email ? ` — ${c.email}` : ""}`).join("\n") : "(No tour team contacts)"}

## VENUE CONTACTS (${venueContacts.length})
${venueContacts.length > 0 ? venueContacts.map((c: any) => `${c.venue || "?"}: ${c.name}${c.role ? ` (${c.role})` : ""}${c.phone ? ` — ${c.phone}` : ""}${c.email ? ` — ${c.email}` : ""}`).join("\n") : "(No venue contacts)"}

## VENUE ADVANCE NOTES (VANs) — ${vans.length} venues
${vans.length > 0 ? vans.map((v: any) => `### ${v.venue_name} (${v.city || "?"}, ${v.event_date || "?"}):\n${JSON.stringify(v.van_data, null, 1)}`).join("\n\n") : "(No VANs)"}

## ROUTING & HOTELS (${routing.length} stops)
${routing.length > 0 ? routing.map((r: any) => `${r.event_date}: ${r.city || "?"} | Hotel: ${r.hotel_name || "TBD"}${r.hotel_checkin ? ` (in: ${r.hotel_checkin})` : ""}${r.hotel_checkout ? ` (out: ${r.hotel_checkout})` : ""}${r.hotel_confirmation ? ` Conf#: ${r.hotel_confirmation}` : ""}${r.bus_notes ? ` | Bus: ${r.bus_notes}` : ""}${r.routing_notes ? ` | ${r.routing_notes}` : ""}`).join("\n") : "(No routing data)"}

## TOUR POLICIES
${policies.length > 0 ? policies.map((p: any) => `${p.policy_type}: ${JSON.stringify(p.policy_data)}`).join("\n") : "(No policies)"}

## UNRESOLVED GAPS (${gaps.length})
${gaps.length > 0 ? gaps.map((g: any) => `- ${g.question}${g.domain ? ` [${g.domain}]` : ""}`).join("\n") : "(None)"}

## UNRESOLVED CONFLICTS (${conflicts.length})
${conflicts.length > 0 ? conflicts.map((c: any) => `- ${c.conflict_type} (${c.severity})`).join("\n") : "(None)"}

## ARTIFACTS (${artifacts.length})
${artifacts.length > 0 ? artifacts.map((a: any) => `[${a.artifact_type}] "${a.title}" (${a.visibility}):\n${(a.content || "").substring(0, 800)}`).join("\n---\n") : "(No artifacts)"}
`;

    return new Response(JSON.stringify({ token: conversationToken, system_prompt: systemPrompt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[elevenlabs-token] error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
