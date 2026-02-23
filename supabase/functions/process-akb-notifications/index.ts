import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
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

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Verify tour membership (TA/MGMT only)
    const { data: membership } = await supabase
      .from("tour_members")
      .select("id, role")
      .eq("tour_id", tour_id)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["TA", "MGMT"].includes(membership.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get unprocessed change log entries for this tour
    const { data: changes } = await supabase
      .from("akb_change_log")
      .select("*")
      .eq("tour_id", tour_id)
      .eq("notified", false)
      .order("created_at", { ascending: true });

    if (!changes || changes.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get tour members
    const { data: members } = await supabase
      .from("tour_members")
      .select("user_id")
      .eq("tour_id", tour_id);

    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const memberIds = members.map((m) => m.user_id);

    // Get notification preferences for all members
    const { data: allPrefs } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("tour_id", tour_id)
      .in("user_id", memberIds);

    // Get tour defaults
    const { data: tourDefaults } = await supabase
      .from("tour_notification_defaults")
      .select("*")
      .eq("tour_id", tour_id)
      .maybeSingle();

    const prefsMap: Record<string, any> = {};
    if (allPrefs) {
      for (const p of allPrefs) prefsMap[p.user_id] = p;
    }

    const SEVERITY_ORDER: Record<string, number> = { INFO: 0, IMPORTANT: 1, CRITICAL: 2 };
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalSent = 0;
    const processedIds: string[] = [];

    for (const change of changes) {
      let daysOut = Infinity;
      if (change.event_date) {
        const eventDate = new Date(change.event_date);
        eventDate.setHours(0, 0, 0, 0);
        daysOut = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }

      for (const memberId of memberIds) {
        if (memberId === change.user_id) continue;

        const prefs = prefsMap[memberId] || tourDefaults || {
          notify_schedule_changes: true,
          notify_venue_changes: true,
          notify_contact_changes: false,
          notify_finance_changes: false,
          day_window: 3,
          min_severity: "IMPORTANT",
          safety_always: true,
          time_always: true,
          money_always: true,
        };

        const forcedBySafety = change.affects_safety && prefs.safety_always;
        const forcedByTime = change.affects_time && prefs.time_always;
        const forcedByMoney = change.affects_money && prefs.money_always;
        const forced = forcedBySafety || forcedByTime || forcedByMoney;

        if (!forced) {
          const entityType = change.entity_type;
          const categoryEnabled =
            (entityType === "schedule_event" && prefs.notify_schedule_changes) ||
            (entityType === "venue_tech_spec" && prefs.notify_venue_changes) ||
            (entityType === "venue_advance_note" && prefs.notify_venue_changes) ||
            (entityType === "contact" && prefs.notify_contact_changes) ||
            (entityType === "finance_line" && prefs.notify_finance_changes);

          if (!categoryEnabled) continue;
          if (daysOut > prefs.day_window && daysOut !== Infinity) continue;

          const changeSev = SEVERITY_ORDER[change.severity] ?? 0;
          const minSev = SEVERITY_ORDER[prefs.min_severity] ?? 1;
          if (changeSev < minSev) continue;
        }

        let message = "";
        const impactTags: string[] = [];
        if (change.affects_safety) impactTags.push("🛡️ SAFETY");
        if (change.affects_time) impactTags.push("⏰ TIME");
        if (change.affects_money) impactTags.push("💰 MONEY");

        if (forced) {
          message = `⚠️ ${impactTags.join(" ")} — ${change.change_summary}`;
        } else if (change.severity === "CRITICAL") {
          message = `🔴 ${change.change_summary}`;
        } else if (change.severity === "IMPORTANT") {
          message = `🟡 ${change.change_summary}`;
        } else {
          message = `ℹ️ ${change.change_summary}`;
        }

        if (daysOut <= 3 && daysOut >= 0) {
          const dayLabel = daysOut === 0 ? "TODAY" : daysOut === 1 ? "TOMORROW" : `in ${daysOut} days`;
          message = `[${dayLabel}] ${message}`;
        }

        await supabase.from("direct_messages").insert({
          tour_id: tour_id,
          sender_id: change.user_id,
          recipient_id: memberId,
          message_text: message,
        });
        totalSent++;
      }

      processedIds.push(change.id);
    }

    if (processedIds.length > 0) {
      await supabase
        .from("akb_change_log")
        .update({ notified: true })
        .in("id", processedIds);
    }

    return new Response(JSON.stringify({ sent: totalSent, processed: processedIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
