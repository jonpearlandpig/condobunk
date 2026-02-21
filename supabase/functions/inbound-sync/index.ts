import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Zod schemas for inbound payload validation ---

const scheduleEventSchema = z.object({
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  venue: z.string().max(500).nullable().optional(),
  city: z.string().max(500).nullable().optional(),
  load_in: z.string().nullable().optional(),
  show_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  role: z.string().max(200).nullable().optional(),
  venue: z.string().max(500).nullable().optional(),
  scope: z.enum(["TOUR", "VENUE"]).optional().default("TOUR"),
});

const financeLineSchema = z.object({
  category: z.string().max(200).nullable().optional(),
  venue: z.string().max(500).nullable().optional(),
  line_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  amount: z.number().nullable().optional(),
});

const inboundPayloadSchema = z.object({
  schedule_events: z.array(scheduleEventSchema).max(200, "Max 200 schedule events").optional().default([]),
  contacts: z.array(contactSchema).max(500, "Max 500 contacts").optional().default([]),
  finance_lines: z.array(financeLineSchema).max(500, "Max 500 finance lines").optional().default([]),
  source_label: z.string().max(200).optional(), // e.g. "Master Tour", "Band Manager"
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "POST required" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // --- Auth: either webhook secret header or Bearer token ---
    const webhookSecret = req.headers.get("x-webhook-secret");
    const authHeader = req.headers.get("Authorization");
    let tourId: string | null = null;
    let integrationId: string | null = null;

    if (webhookSecret) {
      // Validate webhook secret against tour_integrations
      const { data: integration } = await supabaseAdmin
        .from("tour_integrations")
        .select("id, tour_id")
        .eq("webhook_secret", webhookSecret)
        .eq("is_active", true)
        .single();

      if (!integration) {
        return new Response(
          JSON.stringify({ error: "Invalid webhook secret" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      tourId = integration.tour_id;
      integrationId = integration.id;
    } else if (authHeader?.startsWith("Bearer ")) {
      // Authenticated user pushing data
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Expect tour_id in body for authenticated users
    } else {
      return new Response(
        JSON.stringify({ error: "Provide x-webhook-secret header or Bearer token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawBody = await req.json();

    // For authenticated users, tour_id comes from body
    if (!tourId) {
      tourId = rawBody.tour_id;
      if (!tourId) {
        return new Response(
          JSON.stringify({ error: "tour_id required in body for authenticated requests" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find or create a generic webhook integration for this tour
      const { data: existing } = await supabaseAdmin
        .from("tour_integrations")
        .select("id")
        .eq("tour_id", tourId)
        .eq("provider", "GENERIC_WEBHOOK")
        .single();

      integrationId = existing?.id || null;
    }

    // Validate payload
    const parseResult = inboundPayloadSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid payload",
          details: parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = parseResult.data;
    const counters = { events: 0, contacts: 0, finance: 0, conflicts: 0, gaps: 0 };

    // Create sync log
    const { data: syncLog } = await supabaseAdmin
      .from("sync_logs")
      .insert({
        integration_id: integrationId,
        tour_id: tourId,
        status: "SYNCING",
        raw_payload: rawBody,
      })
      .select("id")
      .single();

    try {
      // Upsert schedule events
      for (const evt of payload.schedule_events) {
        const { error } = await supabaseAdmin.from("schedule_events").insert({
          tour_id: tourId,
          event_date: evt.event_date,
          venue: evt.venue || null,
          city: evt.city || null,
          load_in: evt.load_in || null,
          show_time: evt.show_time || null,
          end_time: evt.end_time || null,
          notes: evt.notes || null,
          confidence_score: 0.9, // External data slightly less than manual
        });
        if (!error) counters.events++;
      }

      // Upsert contacts
      for (const c of payload.contacts) {
        const { error } = await supabaseAdmin.from("contacts").insert({
          tour_id: tourId,
          name: c.name,
          email: c.email || null,
          phone: c.phone || null,
          role: c.role || null,
          venue: c.venue || null,
          scope: c.scope || "TOUR",
        });
        if (!error) counters.contacts++;
      }

      // Upsert finance lines
      for (const f of payload.finance_lines) {
        const { error } = await supabaseAdmin.from("finance_lines").insert({
          tour_id: tourId,
          category: f.category || null,
          venue: f.venue || null,
          line_date: f.line_date || null,
          amount: f.amount || null,
        });
        if (!error) counters.finance++;
      }

      // Finalize
      await supabaseAdmin
        .from("sync_logs")
        .update({
          status: "SUCCESS",
          finished_at: new Date().toISOString(),
          events_upserted: counters.events,
          contacts_upserted: counters.contacts,
          finance_upserted: counters.finance,
        })
        .eq("id", syncLog?.id);

      if (integrationId) {
        await supabaseAdmin
          .from("tour_integrations")
          .update({ last_sync_status: "SUCCESS", last_sync_at: new Date().toISOString() })
          .eq("id", integrationId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Synced ${counters.events} events, ${counters.contacts} contacts, ${counters.finance} finance lines`,
          counters,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (syncError) {
      const errMsg = syncError instanceof Error ? syncError.message : "Sync processing error";
      await supabaseAdmin
        .from("sync_logs")
        .update({ status: "FAILED", finished_at: new Date().toISOString(), error_message: errMsg })
        .eq("id", syncLog?.id);

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
