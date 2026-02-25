import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { encode as encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

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
  // Build the data string: URL + sorted params concatenated as key=value
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
    .replace(/\*\*(.*?)\*\*/g, "$1")       // bold
    .replace(/\*(.*?)\*/g, "$1")            // italic
    .replace(/#{1,6}\s/g, "")               // headings
    .replace(/`{1,3}[^`]*`{1,3}/g, "")      // code blocks
    .replace(/\[Source:[^\]]*\]/g, "")       // source citations
    .replace(/<<ACTION:[^>]*>>/g, "")        // action blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/\n{3,}/g, "\n\n")             // excess newlines
    .trim()
    .substring(0, 1500);
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
    // The URL Twilio uses to compute the signature is the full request URL
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
    // Normalize phone: strip everything except digits, keep last 10
    const normalizePhone = (p: string) => p.replace(/\D/g, "").slice(-10);
    const normalized = normalizePhone(fromPhone);

    // Search contacts table for matching phone
    const { data: matchedContacts } = await admin
      .from("contacts")
      .select("tour_id, name, role, scope")
      .not("phone", "is", null);

    let matchedTourId: string | null = null;
    let senderName = "Unknown";

    if (matchedContacts) {
      for (const contact of matchedContacts) {
        const contactPhone = normalizePhone(contact.phone || "");
        if (contactPhone === normalized && contactPhone.length >= 10) {
          matchedTourId = contact.tour_id;
          senderName = contact.name;
          break;
        }
      }
    }

    // Also check profiles table by phone
    if (!matchedTourId) {
      const { data: profileMatch } = await admin
        .from("profiles")
        .select("id, display_name, phone")
        .not("phone", "is", null);

      if (profileMatch) {
        for (const profile of profileMatch) {
          const profilePhone = normalizePhone(profile.phone || "");
          if (profilePhone === normalized && profilePhone.length >= 10) {
            // Find tour membership for this user
            const { data: membership } = await admin
              .from("tour_members")
              .select("tour_id")
              .eq("user_id", profile.id)
              .limit(1)
              .single();

            if (membership) {
              matchedTourId = membership.tour_id;
              senderName = profile.display_name || "Team Member";
            }
            break;
          }
        }
      }
    }

    // Log inbound SMS
    await admin.from("sms_inbound").insert({
      from_phone: fromPhone,
      message_text: messageBody,
      tour_id: matchedTourId,
      sender_name: senderName !== "Unknown" ? senderName : null,
    });

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

    // --- Guest list intent detection ---
    const guestListKeywords = /guest\s*list|comp\s*ticket|put\s.+\s*on\s*the\s*list|tickets?\s*for|\+\s*\d|plus\s*\d|will\s*call/i;
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
          // Parse JSON from response (handle markdown code blocks)
          const jsonMatch = rawExtract.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const fields = JSON.parse(jsonMatch[0]);
            const { guest_names, ticket_count, event_date, venue } = fields;

            if (guest_names && ticket_count && event_date) {
              // All required fields present — call guest-list-request
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

                // Don't send SMS here — guest-list-request already handles it for approvals
                // Only send if the function returned a reply but didn't auto-send (NO_ALLOTMENT, PAST_DEADLINE, PENDING)
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
              // Missing fields — ask for them
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
          // Fall through to normal TELA flow
        }
      }
    }

    // --- Fetch AKB data for the matched tour (normal TELA Q&A flow) ---
    const [eventsRes, contactsRes, vansRes, tourRes] = await Promise.all([
      admin.from("schedule_events").select("event_date, venue, city, load_in, show_time, notes").eq("tour_id", matchedTourId).order("event_date").limit(50),
      admin.from("contacts").select("name, role, email, phone, scope, venue").eq("tour_id", matchedTourId).limit(50),
      admin.from("venue_advance_notes").select("venue_name, city, event_date, van_data").eq("tour_id", matchedTourId).order("event_date").limit(30),
      admin.from("tours").select("name").eq("id", matchedTourId).single(),
    ]);

    const tourName = tourRes.data?.name || "Unknown Tour";

    const akbContext = `
Tour: ${tourName}

Schedule:
${JSON.stringify(eventsRes.data || [], null, 1)}

Contacts:
${JSON.stringify(contactsRes.data || [], null, 1)}

Venue Advance Notes:
${(vansRes.data || []).map((v: any) => `${v.venue_name} (${v.city || "?"}, ${v.event_date || "?"}):\n${JSON.stringify(v.van_data, null, 1)}`).join("\n\n")}
`.substring(0, 12000);

    // --- Generate AI response ---
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are TELA, the Tour Intelligence for "${tourName}". A crew member just texted the TourText number (888-340-0564). Reply in SHORT, punchy SMS style — no markdown, no headers, no source citations. Keep it under 300 characters when possible. Be direct and factual. If you don't know, say so honestly.\n\nAKB DATA:\n${akbContext}`,
          },
          {
            role: "user",
            content: `${senderName}: ${messageBody}`,
          },
        ],
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

    // Return TwiML (empty — we send via REST API instead)
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
