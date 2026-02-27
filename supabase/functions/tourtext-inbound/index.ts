import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-twilio-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

// --- Match phone to contact on an ACTIVE tour, preferring nearest future event ---
async function matchPhoneToTour(
  admin: ReturnType<typeof createClient>,
  normalized: string,
): Promise<{ tourId: string | null; senderName: string }> {
  const today = new Date().toISOString().split("T")[0];

  // 1. Search contacts on ACTIVE tours with TOUR scope only
  const { data: matchedContacts } = await admin
    .from("contacts")
    .select("tour_id, name, role, scope, phone, tours!inner(id, status)")
    .eq("scope", "TOUR")
    .eq("tours.status", "ACTIVE")
    .not("phone", "is", null);

  if (matchedContacts) {
    // Filter by phone match
    const phoneMatches = matchedContacts.filter((c: any) => {
      const cp = normalizePhone(c.phone || "");
      return cp === normalized && cp.length >= 10;
    });

    if (phoneMatches.length === 1) {
      return { tourId: phoneMatches[0].tour_id, senderName: phoneMatches[0].name };
    }

    if (phoneMatches.length > 1) {
      // Multiple tours — pick the one with the nearest upcoming event
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
      return { tourId: match.tour_id, senderName: match.name };
    }
  }

  // 2. Fallback: check profiles table
  const { data: profileMatch } = await admin
    .from("profiles")
    .select("id, display_name, phone")
    .not("phone", "is", null);

  if (profileMatch) {
    for (const profile of profileMatch) {
      const profilePhone = normalizePhone(profile.phone || "");
      if (profilePhone === normalized && profilePhone.length >= 10) {
        // Find ACTIVE tour membership, preferring tour with nearest future event
        const { data: memberships } = await admin
          .from("tour_members")
          .select("tour_id, tours!inner(id, status)")
          .eq("user_id", profile.id)
          .eq("tours.status", "ACTIVE");

        if (memberships && memberships.length > 0) {
          const memberTourIds = memberships.map((m: any) => m.tour_id);

          if (memberTourIds.length === 1) {
            return { tourId: memberTourIds[0], senderName: profile.display_name || "Team Member" };
          }

          // Multiple active tours — pick nearest upcoming event
          const { data: events } = await admin
            .from("schedule_events")
            .select("tour_id, event_date")
            .in("tour_id", memberTourIds)
            .gte("event_date", today)
            .order("event_date")
            .limit(1);

          const preferredTourId = events?.[0]?.tour_id || memberTourIds[0];
          return { tourId: preferredTourId, senderName: profile.display_name || "Team Member" };
        }
        break;
      }
    }
  }

  return { tourId: null, senderName: "Unknown" };
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
      return twimlResponse("Sorry, we couldn't process your message.");
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

    // --- Match phone number to contact → tour (ACTIVE tours only, nearest event preferred) ---
    const normalized = normalizePhone(fromPhone);
    const { tourId: matchedTourId, senderName } = await matchPhoneToTour(admin, normalized);

    // Log inbound SMS (with error handling for null tour_id)
    const { error: inboundErr } = await admin.from("sms_inbound").insert({
      from_phone: fromPhone,
      message_text: messageBody,
      tour_id: matchedTourId,
      sender_name: senderName !== "Unknown" ? senderName : null,
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
      return twimlResponse(replyText);
    }

    // --- Guest list intent detection (tightened regex — removed overly broad patterns) ---
    const guestListKeywords = /guest\s*list|comp\s*ticket|put\s.+\s*on\s*the\s*list|will\s*call|can\s+i\s+get\s+\d|i\s+need\s+\d\s+ticket/i;
    if (guestListKeywords.test(messageBody)) {
      console.log("Guest list intent detected, extracting fields...");

      // Use AI to extract structured fields
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

                return twimlResponse("");
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
              return twimlResponse("");
            }
          }
        } catch (parseErr) {
          console.error("Failed to parse guest list extraction:", parseErr);
        }
      }
    }

    // --- Fetch AKB data + recent SMS history for the matched tour ---
    const [eventsRes, contactsRes, vansRes, tourRes, recentInbound, recentOutbound] = await Promise.all([
      admin.from("schedule_events").select("event_date, venue, city, load_in, show_time, doors, soundcheck, curfew, notes").eq("tour_id", matchedTourId).order("event_date").limit(50),
      admin.from("contacts").select("name, role, email, phone, scope, venue").eq("tour_id", matchedTourId).limit(50),
      admin.from("venue_advance_notes").select("venue_name, city, event_date, van_data").eq("tour_id", matchedTourId).order("event_date").limit(30),
      admin.from("tours").select("name").eq("id", matchedTourId).single(),
      admin.from("sms_inbound").select("message_text, created_at").eq("from_phone", fromPhone).eq("tour_id", matchedTourId).order("created_at", { ascending: false }).limit(5),
      admin.from("sms_outbound").select("message_text, created_at").eq("to_phone", fromPhone).eq("tour_id", matchedTourId).order("created_at", { ascending: false }).limit(5),
    ]);

    const tourName = tourRes.data?.name || "Unknown Tour";

    // Build conversation history from recent messages
    const historyMessages: { role: string; content: string; ts: string }[] = [];
    for (const m of (recentInbound.data || [])) {
      historyMessages.push({ role: "user", content: m.message_text, ts: m.created_at });
    }
    for (const m of (recentOutbound.data || [])) {
      historyMessages.push({ role: "assistant", content: m.message_text, ts: m.created_at });
    }
    historyMessages.sort((a, b) => a.ts.localeCompare(b.ts));
    const recentHistory = historyMessages.slice(-6);

    const akbContext = `
Tour: ${tourName}

Schedule:
${JSON.stringify(eventsRes.data || [], null, 1)}

Contacts:
${JSON.stringify(contactsRes.data || [], null, 1)}

Venue Advance Notes:
${(vansRes.data || []).map((v: any) => `${v.venue_name} (${v.city || "?"}, ${v.event_date || "?"}):\n${JSON.stringify(v.van_data, null, 1)}`).join("\n\n")}
`.substring(0, 12000);

    // Build chat messages with history
    const chatMessages: { role: string; content: string }[] = [
      {
        role: "system",
        content: `You are TELA, the Tour Intelligence for "${tourName}". A crew member named ${senderName} just texted the TourText number (888-340-0564). Reply in SHORT, punchy SMS style — no markdown, no headers, no source citations. Keep it under 300 characters when possible. Be direct and factual. If you don't know, say so honestly.

IMPORTANT: When the user asks about a role (like "PM", "Production Manager", "TM", etc.), search the CONTACTS list for someone with that role — do NOT assume they are asking about themselves. Short abbreviations like "PM" = Production Manager, "TM" = Tour Manager, "LD" = Lighting Director, "FOH" = Front of House.

When the user sends a short follow-up (like "PM?" after asking about load-in), use the conversation history to understand the context.

AKB DATA:
${akbContext}`,
      },
    ];

    // Add conversation history
    for (const msg of recentHistory.slice(0, -1)) {
      chatMessages.push({ role: msg.role, content: msg.content });
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
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", errText);
      const fallback = "Sorry, I'm having trouble right now. Try again in a moment.";
      await sendTwilioSms(fromPhone, fallback, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);
      return twimlResponse(fallback);
    }

    const aiData = await aiResponse.json();
    const rawReply = aiData.choices?.[0]?.message?.content || "I don't have an answer for that right now.";
    const smsReply = toPlaintext(rawReply);

    // --- Send SMS reply via Twilio REST API ---
    await sendTwilioSms(fromPhone, smsReply, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);

    // Log outbound SMS
    await admin.from("sms_outbound").insert({
      to_phone: fromPhone,
      message_text: smsReply,
      tour_id: matchedTourId,
      status: "sent",
    });

    return twimlResponse("");
  } catch (error) {
    console.error("tourtext-inbound error:", error);
    return twimlResponse("Sorry, something went wrong. Try again later.");
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

// --- Return TwiML response ---
function twimlResponse(message: string): Response {
  const twiml = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

  return new Response(twiml, {
    headers: { ...corsHeaders, "Content-Type": "text/xml" },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
