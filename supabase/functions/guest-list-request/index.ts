import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

// --- Trigger box office notification via notify-box-office edge function ---
async function notifyBoxOffice(
  supabaseUrl: string,
  serviceKey: string,
  allotmentId: string,
): Promise<void> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/notify-box-office`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ allotment_id: allotmentId }),
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error("notify-box-office call failed:", response.status, errText);
    } else {
      const result = await response.json();
      console.log("notify-box-office result:", result);
    }
  } catch (err) {
    console.error("notify-box-office error:", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const {
      tour_id,
      requester_phone,
      requester_name,
      requester_user_id,
      guest_names,
      ticket_count,
      event_date,
      venue,
      // When called from frontend for TA actions
      action,        // "approve" | "deny" | "next_time"
      request_id,    // for TA actions
    } = body;

    // --- TA actions from frontend (approve/deny/next_time) ---
    if (action && request_id) {
      // Authenticate the caller
      const authHeader = req.headers.get("authorization") || "";
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get the request
      const { data: glRequest, error: reqErr } = await admin
        .from("guest_list_requests")
        .select("*, guest_list_allotments(pickup_instructions, venue, event_date)")
        .eq("id", request_id)
        .limit(1)
        .maybeSingle();

      if (reqErr || !glRequest) {
        return new Response(JSON.stringify({ error: "Request not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify caller is TA/MGMT for this tour
      const { data: memberCheck } = await admin
        .from("tour_members")
        .select("role")
        .eq("tour_id", glRequest.tour_id)
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!memberCheck || !["TA", "MGMT"].includes(memberCheck.role)) {
        return new Response(JSON.stringify({ error: "Not authorized" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "approve") {
        await admin.from("guest_list_requests").update({
          status: "APPROVED",
          status_reason: "Approved by Tour Admin",
          approved_by: user.id,
          resolved_at: new Date().toISOString(),
        }).eq("id", request_id);

        // Send SMS confirmation if we have phone + Twilio config
        if (glRequest.requester_phone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
          const allotment = glRequest.guest_list_allotments;
          const pickupInfo = allotment?.pickup_instructions || "Check with your Tour Admin for pickup details.";
          const smsBody = `You're on the guest list! ${glRequest.guest_names} (${glRequest.ticket_count} ticket${glRequest.ticket_count !== 1 ? "s" : ""}) for ${allotment?.venue || "the show"} on ${allotment?.event_date || "TBD"}. ${pickupInfo}`;
          await sendTwilioSms(glRequest.requester_phone, smsBody, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);
          await admin.from("guest_list_requests").update({ pickup_info_sent: true }).eq("id", request_id);
          await admin.from("sms_outbound").insert({
            to_phone: glRequest.requester_phone,
            message_text: smsBody,
            tour_id: glRequest.tour_id,
            status: "sent",
          });
        }

        // Notify box office if configured
        if (glRequest.allotment_id) {
          await notifyBoxOffice(supabaseUrl, serviceKey, glRequest.allotment_id);
        }

        return new Response(JSON.stringify({ success: true, action: "approved" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "deny" || action === "next_time") {
        await admin.from("guest_list_requests").update({
          status: "DENIED",
          status_reason: action === "next_time" ? "Next time" : "Denied by Tour Admin",
          approved_by: user.id,
          resolved_at: new Date().toISOString(),
        }).eq("id", request_id);

        if (glRequest.requester_phone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
          const smsBody = action === "next_time"
            ? "Guest list is full for this show. We'll try to get you on the next one."
            : "Your guest list request was not approved for this show. Reach out to your Tour Admin for details.";
          await sendTwilioSms(glRequest.requester_phone, smsBody, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);
          await admin.from("sms_outbound").insert({
            to_phone: glRequest.requester_phone,
            message_text: smsBody,
            tour_id: glRequest.tour_id,
            status: "sent",
          });
        }

        return new Response(JSON.stringify({ success: true, action }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Inbound request processing (called from tourtext-inbound or frontend) ---
    if (!tour_id || !guest_names || !ticket_count || !event_date) {
      return new Response(JSON.stringify({ error: "Missing required fields", missing: { tour_id: !tour_id, guest_names: !guest_names, ticket_count: !ticket_count, event_date: !event_date } }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find matching allotment
    const { data: allotments } = await admin
      .from("guest_list_allotments")
      .select("*")
      .eq("tour_id", tour_id)
      .eq("event_date", event_date);

    let allotment = null;
    if (allotments && allotments.length > 0) {
      // Try venue fuzzy match first
      if (venue) {
        const venueNorm = venue.toLowerCase().trim();
        allotment = allotments.find((a: any) => a.venue.toLowerCase().trim().includes(venueNorm) || venueNorm.includes(a.venue.toLowerCase().trim()));
      }
      // Fall back to first allotment for that date
      if (!allotment) allotment = allotments[0];
    }

    // Get tour name and tour admin for DMs
    const { data: tourData } = await admin.from("tours").select("name, owner_id").eq("id", tour_id).limit(1).maybeSingle();
    const tourName = tourData?.name || "Unknown Tour";
    const tourOwnerId = tourData?.owner_id;

    if (!allotment) {
      // No allotment — notify TA and respond
      if (tourOwnerId) {
        // Find a system/bot user or use the owner as sender for DM
        // We'll use service role insert directly
        await admin.from("direct_messages").insert({
          tour_id,
          sender_id: tourOwnerId, // self-DM shows as system notification
          recipient_id: tourOwnerId,
          message_text: `🎟️ Guest list request from ${requester_name || "Unknown"}: ${ticket_count} ticket(s) for ${event_date}${venue ? ` at ${venue}` : ""}. No allotment is set up for this show — please create one in Admin > Guest List.`,
        });
      }

      return new Response(JSON.stringify({
        success: false,
        status: "NO_ALLOTMENT",
        sms_reply: "Guest list isn't set up for that show yet. Your Tour Admin has been notified.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check deadline
    if (allotment.deadline && new Date(allotment.deadline) < new Date()) {
      return new Response(JSON.stringify({
        success: false,
        status: "PAST_DEADLINE",
        sms_reply: "Guest list requests for this show are closed.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Count approved tickets for this allotment
    const { data: approvedRequests } = await admin
      .from("guest_list_requests")
      .select("ticket_count, requester_phone, requester_user_id")
      .eq("allotment_id", allotment.id)
      .eq("status", "APPROVED");

    const totalUsed = (approvedRequests || []).reduce((sum: number, r: any) => sum + (r.ticket_count || 0), 0);
    const remaining = allotment.total_tickets - totalUsed;

    // Check per-person limit
    const requesterApproved = (approvedRequests || []).filter((r: any) => {
      if (requester_user_id && r.requester_user_id) return r.requester_user_id === requester_user_id;
      if (requester_phone && r.requester_phone) return r.requester_phone === requester_phone;
      return false;
    });
    const requesterUsed = requesterApproved.reduce((sum: number, r: any) => sum + (r.ticket_count || 0), 0);
    const requesterRemaining = allotment.per_person_max - requesterUsed;

    const canAutoApprove = ticket_count <= remaining && ticket_count <= requesterRemaining;

    if (canAutoApprove) {
      // Auto-approve
      await admin.from("guest_list_requests").insert({
        tour_id,
        allotment_id: allotment.id,
        requester_phone: requester_phone || null,
        requester_name: requester_name || null,
        requester_user_id: requester_user_id || null,
        guest_names,
        ticket_count,
        status: "APPROVED",
        status_reason: "Auto-approved",
        pickup_info_sent: !!requester_phone,
        resolved_at: new Date().toISOString(),
      });

      const pickupInfo = allotment.pickup_instructions || "Check with your Tour Admin for pickup details.";
      const smsReply = `You're on the guest list! ${guest_names} (${ticket_count} ticket${ticket_count !== 1 ? "s" : ""}) for ${allotment.venue} on ${event_date}. ${pickupInfo}`;

      // Send SMS if we have phone + Twilio
      if (requester_phone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
        await sendTwilioSms(requester_phone, smsReply, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);
        await admin.from("sms_outbound").insert({
          to_phone: requester_phone,
          message_text: smsReply,
          tour_id,
          status: "sent",
        });
      }

      // Notify box office if configured
      await notifyBoxOffice(supabaseUrl, serviceKey, allotment.id);

      return new Response(JSON.stringify({
        success: true,
        status: "APPROVED",
        sms_reply: smsReply,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Pending — escalate
      const reason = ticket_count > remaining
        ? `No tickets available (${remaining} remaining, ${ticket_count} requested)`
        : `Over per-person limit (${requesterRemaining} remaining for this person, ${ticket_count} requested)`;

      await admin.from("guest_list_requests").insert({
        tour_id,
        allotment_id: allotment.id,
        requester_phone: requester_phone || null,
        requester_name: requester_name || null,
        requester_user_id: requester_user_id || null,
        guest_names,
        ticket_count,
        status: "PENDING",
        status_reason: reason,
      });

      // DM the Tour Admin
      if (tourOwnerId) {
        await admin.from("direct_messages").insert({
          tour_id,
          sender_id: tourOwnerId,
          recipient_id: tourOwnerId,
          message_text: `🎟️ Guest list request from ${requester_name || "Unknown"}: ${guest_names} (${ticket_count} ticket${ticket_count !== 1 ? "s" : ""}) for ${allotment.venue} on ${event_date}. ${reason}. Review in Admin > Guest List.`,
        });
      }

      const smsReply = "Your request is in — your Tour Admin will confirm shortly.";

      return new Response(JSON.stringify({
        success: false,
        status: "PENDING",
        sms_reply: smsReply,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("guest-list-request error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
