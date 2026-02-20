import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MtDay {
  id: string;
  date?: string;
  generalNotes?: string;
  travelNotes?: string;
  hotelNotes?: string;
  events?: MtEvent[];
}

interface MtEvent {
  id: string;
  venue?: { name?: string; city?: string };
  loadIn?: string;
  showTime?: string;
  endTime?: string;
  contacts?: MtContact[];
}

interface MtContact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  title?: string;
  company?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Authenticate caller
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { integration_id } = await req.json();
    if (!integration_id) {
      return new Response(
        JSON.stringify({ error: "integration_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch integration (uses user's RLS context)
    const { data: integration, error: intErr } = await userClient
      .from("tour_integrations")
      .select("*")
      .eq("id", integration_id)
      .single();

    if (intErr || !integration) {
      return new Response(
        JSON.stringify({ error: "Integration not found or access denied" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (integration.provider !== "MASTER_TOUR") {
      return new Response(
        JSON.stringify({ error: "This endpoint is for Master Tour integrations only" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tourId = integration.tour_id;
    const mtTourId = integration.config?.mt_tour_id;
    const apiKey = integration.api_key_encrypted;
    const apiSecret = integration.api_secret_encrypted;

    if (!apiKey || !apiSecret || !mtTourId) {
      return new Response(
        JSON.stringify({ error: "Missing MT API credentials or tour ID in integration config" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create sync log (service role to bypass RLS)
    const { data: syncLog } = await supabaseAdmin
      .from("sync_logs")
      .insert({
        integration_id,
        tour_id: tourId,
        status: "SYNCING",
      })
      .select("id")
      .single();

    // Update integration status
    await supabaseAdmin
      .from("tour_integrations")
      .update({ last_sync_status: "SYNCING" })
      .eq("id", integration_id);

    // Pull from Master Tour API v5
    // NOTE: MT uses OAuth 1.0 signing. For MVP, we use basic key auth.
    // Full OAuth 1.0 signing should be implemented for production.
    const mtBase = "https://api.eventric.com";
    const counters = { events: 0, contacts: 0, finance: 0, conflicts: 0, gaps: 0 };

    try {
      // Fetch tour data with all days
      const tourRes = await fetch(
        `${mtBase}/api/v5/tour/${mtTourId}?numPastDays=0&version=7`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!tourRes.ok) {
        const errText = await tourRes.text();
        throw new Error(`MT API error ${tourRes.status}: ${errText}`);
      }

      const tourData = await tourRes.json();
      if (!tourData.success) {
        throw new Error(`MT API returned error: ${tourData.message}`);
      }

      const days: MtDay[] = tourData.data?.days || [];

      for (const day of days) {
        if (!day.date) continue;

        // Fetch events for this day
        let events: MtEvent[] = [];
        try {
          const eventsRes = await fetch(
            `${mtBase}/api/v5/day/${day.id}/events?version=7`,
            { headers: { Authorization: `Bearer ${apiKey}` } }
          );
          if (eventsRes.ok) {
            const eventsData = await eventsRes.json();
            events = eventsData.data || [];
          } else {
            await eventsRes.text(); // consume
          }
        } catch {
          // Skip day if events fail
        }

        for (const evt of events) {
          // Upsert schedule event
          const eventDate = day.date; // YYYY-MM-DD
          const venueName = evt.venue?.name || null;
          const cityName = evt.venue?.city || null;

          const noteParts: string[] = [];
          if (day.generalNotes) noteParts.push(day.generalNotes);
          if (day.travelNotes) noteParts.push(`Travel: ${day.travelNotes}`);

          await supabaseAdmin.from("schedule_events").upsert(
            {
              tour_id: tourId,
              event_date: eventDate,
              venue: venueName,
              city: cityName,
              load_in: evt.loadIn || null,
              show_time: evt.showTime || null,
              end_time: evt.endTime || null,
              notes: noteParts.join("\n") || null,
              confidence_score: 1.0, // MT data is authoritative
              source_doc_id: null,
            },
            { onConflict: "tour_id,event_date,venue", ignoreDuplicates: false }
          );
          counters.events++;

          // Upsert contacts from event
          if (evt.contacts) {
            for (const c of evt.contacts) {
              const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
              if (!name) continue;

              await supabaseAdmin.from("contacts").upsert(
                {
                  tour_id: tourId,
                  name,
                  email: c.email || null,
                  phone: c.phone || null,
                  role: c.title || null,
                  venue: venueName,
                  scope: venueName ? "VENUE" : "TOUR",
                },
                { onConflict: "tour_id,name,venue", ignoreDuplicates: false }
              );
              counters.contacts++;
            }
          }
        }
      }

      // Fetch crew for tour-level contacts
      try {
        const crewRes = await fetch(
          `${mtBase}/api/v5/tour/${mtTourId}/crew?version=7`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );
        if (crewRes.ok) {
          const crewData = await crewRes.json();
          const crew = crewData.data || [];
          for (const member of crew) {
            const name = [member.firstName, member.lastName].filter(Boolean).join(" ");
            if (!name) continue;

            await supabaseAdmin.from("contacts").upsert(
              {
                tour_id: tourId,
                name,
                email: member.email || null,
                phone: member.phone || null,
                role: member.title || member.position || null,
                scope: "TOUR",
              },
              { onConflict: "tour_id,name,venue", ignoreDuplicates: false }
            );
            counters.contacts++;
          }
        } else {
          await crewRes.text();
        }
      } catch {
        // Non-fatal
      }

      // Update sync log as success
      await supabaseAdmin
        .from("sync_logs")
        .update({
          status: "SUCCESS",
          finished_at: new Date().toISOString(),
          events_upserted: counters.events,
          contacts_upserted: counters.contacts,
          finance_upserted: counters.finance,
          conflicts_created: counters.conflicts,
          gaps_created: counters.gaps,
        })
        .eq("id", syncLog?.id);

      await supabaseAdmin
        .from("tour_integrations")
        .update({
          last_sync_status: "SUCCESS",
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", integration_id);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Master Tour sync completed",
          counters,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (syncError) {
      const errMsg = syncError instanceof Error ? syncError.message : "Unknown sync error";

      await supabaseAdmin
        .from("sync_logs")
        .update({
          status: "FAILED",
          finished_at: new Date().toISOString(),
          error_message: errMsg,
        })
        .eq("id", syncLog?.id);

      await supabaseAdmin
        .from("tour_integrations")
        .update({ last_sync_status: "FAILED" })
        .eq("id", integration_id);

      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Request error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
