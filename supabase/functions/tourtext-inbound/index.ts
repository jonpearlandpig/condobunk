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

// --- Topic keyword groups for Progressive Depth ---
const TOPIC_GROUPS: Record<string, string[]> = {
  schedule: ["load-in", "load in", "loadin", "doors", "soundcheck", "curfew", "show time", "showtime", "set time", "settime", "set list", "setlist", "downbeat", "changeover"],
  venue_tech: ["haze", "haze machine", "fog", "rigging", "steel", "power", "docks", "dock", "labor", "union", "staging", "spl", "decibel", "db limit", "pyro", "confetti", "co2", "laser", "barricade", "pit"],
  logistics: ["hotel", "routing", "bus", "truck", "travel", "drive", "fly", "flight", "van", "lobby", "checkout", "check-in", "checkin", "day room"],
  contacts: ["pm", "tm", "ld", "foh", "monitor", "prod manager", "production manager", "tour manager", "lighting director", "stage manager", "sm", "who is", "who's the", "contact"],
  guest_list: ["ticket", "tickets", "guest", "comp", "will call", "list", "plus one", "+1", "allotment"],
  catering: ["catering", "hospitality", "buyout", "meal", "breakfast", "lunch", "dinner", "rider"],
  follow_up: ["special notes", "notes", "anything else", "what about", "details", "more", "anything special", "restrictions", "rules", "policy", "policies", "what else", "other info", "other details", "more info"],
};

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

// --- Progressive Depth Detection ---
function detectDepth(
  currentMessage: string,
  recentHistory: { role: string; content: string }[],
): 1 | 2 | 3 {
  const lower = currentMessage.toLowerCase();

  // Explicit depth-3 triggers
  const depth3Triggers = /\b(full rundown|everything about|everything on|give me everything|all the details|complete info|complete details|full breakdown|full detail|tell me everything)\b/i;
  if (depth3Triggers.test(currentMessage)) return 3;

  // Explicit depth-2 triggers
  const depth2Triggers = /\b(tell me more|more details|more info|what else|elaborate|expand on|go deeper|details|specifics|can you explain|more about)\b/i;
  if (depth2Triggers.test(currentMessage)) return 2;

  // Topic-based depth: count how many prior exchanges touch the same topic
  const currentTopics = extractTopics(currentMessage);

  // Short-message auto-bump: if message is under 30 chars and there's recent history, it's a follow-up
  const isShortFollowUp = currentMessage.length < 30 && recentHistory.length >= 1;

  if (currentTopics.size === 0) {
    // No topic match, but short follow-up should still bump depth
    return isShortFollowUp ? 2 : 1;
  }

  let sameTopicCount = 0;
  for (const msg of recentHistory) {
    const msgTopics = extractTopics(msg.content);
    // Check overlap — also count follow_up overlapping with any prior topic
    for (const t of currentTopics) {
      if (msgTopics.has(t)) {
        sameTopicCount++;
        break;
      }
    }
    // If current is follow_up, count any prior topic as overlap
    if (currentTopics.has("follow_up") && msgTopics.size > 0) {
      sameTopicCount++;
    }
  }

  // 2+ prior messages on same topic = depth 3, 1 prior = depth 2
  if (sameTopicCount >= 3) return 3;
  if (sameTopicCount >= 1) return 2;
  // Short follow-up still gets depth 2 minimum
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

// --- Extract date/city/venue relevance from user message ---
function extractRelevanceFromMessage(
  message: string,
  knownCities: string[],
  knownVenues: string[],
  eventDates: string[],
): { targetDates: string[]; targetCities: string[]; targetVenue: string | null } {
  const today = new Date();
  const msgLower = message.toLowerCase();
  let targetDates: string[] = [];
  const targetCities: string[] = [];
  let targetVenue: string | null = null;

  // --- Date extraction ---
  // M/D or M-D patterns
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

  // "tomorrow" / "tonight"
  if (/\btomorrow\b/i.test(message)) {
    const tmrw = new Date(today);
    tmrw.setDate(tmrw.getDate() + 1);
    targetDates = [tmrw.toISOString().split("T")[0]];
  } else if (/\btonight\b|\btoday\b/i.test(message)) {
    targetDates = [today.toISOString().split("T")[0]];
  }

  // Month name + day: "March 5", "Mar 5th"
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

  // Day names: "Saturday", "next Friday"
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

  // "next show" / "next event"
  if (/\bnext\s+(show|event|gig|date)\b/i.test(message) && targetDates.length === 0) {
    const todayStr = today.toISOString().split("T")[0];
    const futureDates = eventDates.filter((d) => d >= todayStr).sort();
    if (futureDates.length > 0) {
      targetDates = [futureDates[0]];
    }
  }

  // --- City matching ---
  for (const city of knownCities) {
    if (!city) continue;
    const cityLower = city.toLowerCase();
    // Extract just city name (strip state abbrev like ", IN" or ", OH")
    const cityName = cityLower.split(",")[0].trim();
    if (cityName.length >= 3 && msgLower.includes(cityName) && !targetCities.includes(city)) {
      targetCities.push(city);
    }
  }

  // --- Venue matching ---
  for (const venue of knownVenues) {
    if (!venue) continue;
    const venueLower = venue.toLowerCase();
    // Check if significant words from the venue name appear in the message
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

  // 1. Search contacts on ACTIVE tours with TOUR scope only
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

  // 2. Fallback: check profiles table
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

    const { targetDates, targetCities, targetVenue } = extractRelevanceFromMessage(
      messageBody,
      knownCities as string[],
      knownVenues as string[],
      eventDates,
    );
    // --- City carryover for short follow-ups ---
    let effectiveCities = [...targetCities];
    const shortFollowUp = /^(yes|yeah|yep|yup|no|nope|nah|it is|it's not|that's wrong|wrong|correct|right|exactly|absolutely|definitely|for sure|not true|true|bull|bs|come on|dude|bro|seriously|really|what|huh)/i;
    if (effectiveCities.length === 0 && shortFollowUp.test(messageBody.trim())) {
      const { data: lastInbound } = await admin
        .from("sms_inbound")
        .select("message_text")
        .eq("from_phone", fromPhone)
        .eq("tour_id", matchedTourId)
        .order("created_at", { ascending: false })
        .limit(2);

      const priorMsg = lastInbound && lastInbound.length > 1 ? lastInbound[1] : null;
      if (priorMsg) {
        const priorExtracted = extractRelevanceFromMessage(
          priorMsg.message_text,
          knownCities as string[],
          knownVenues as string[],
          eventDates,
        );
        if (priorExtracted.targetCities.length > 0) {
          effectiveCities = priorExtracted.targetCities;
          console.log("City carryover from prior message:", effectiveCities);
        }
      }
    }

    console.log("Smart Context:", JSON.stringify({ targetCities, effectiveCities, targetVenue, targetDates }));

    // --- Deterministic schedule-presence responder ---
    const schedulePresenceIntent = /\b(on\s+(the\s+)?schedule|show\??|on\s+tour|playing|not\s+on\s+(the\s+)?schedule|scheduled)\b/i;
    const isScheduleQuestion = schedulePresenceIntent.test(messageBody) ||
      (shortFollowUp.test(messageBody.trim()) && effectiveCities.length > 0);

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
      console.log("Deterministic schedule reply:", deterministicReply);

      await sendTwilioSms(fromPhone, deterministicReply, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER);
      await admin.from("sms_outbound").insert({
        to_phone: fromPhone,
        message_text: deterministicReply,
        tour_id: matchedTourId,
        status: "sent",
      });
      return emptyTwiml();
    }

    // Determine date window for filtered queries
    let startDate: string;
    let endDate: string;

    if (targetDates.length > 0) {
      // Specific date: +/- 1 day
      const d = new Date(targetDates[0]);
      const before = new Date(d); before.setDate(before.getDate() - 1);
      const after = new Date(d); after.setDate(after.getDate() + 1);
      startDate = before.toISOString().split("T")[0];
      endDate = after.toISOString().split("T")[0];
    } else if (targetCities.length > 0 || targetVenue) {
      // City/venue mentioned but no date: find events at those cities/venue
      const cityVenueEvents = (allEvents || []).filter((e: any) => {
        if (targetCities.length > 0 && e.city) {
          const eCityName = e.city.toLowerCase().split(",")[0].trim();
          for (const tc of targetCities) {
            const tCityName = tc.toLowerCase().split(",")[0].trim();
            if (eCityName.includes(tCityName) || tCityName.includes(eCityName)) return true;
          }
        }
        if (targetVenue && e.venue) {
          if (e.venue.toLowerCase().includes(targetVenue.toLowerCase().substring(0, 10))) return true;
        }
        return false;
      });
      if (cityVenueEvents.length > 0) {
        const dates = cityVenueEvents.map((e: any) => e.event_date).filter(Boolean).sort();
        const firstD = new Date(dates[0]);
        firstD.setDate(firstD.getDate() - 1);
        startDate = firstD.toISOString().split("T")[0];
        const lastD = new Date(dates[dates.length - 1]);
        lastD.setDate(lastD.getDate() + 1);
        endDate = lastD.toISOString().split("T")[0];
      } else {
        // Fallback: next 5 upcoming
        startDate = todayStr;
        const farDate = new Date(); farDate.setDate(farDate.getDate() + 30);
        endDate = farDate.toISOString().split("T")[0];
      }
    } else {
      // No specific date/city/venue: next 5 upcoming events
      const futureEvents = (allEvents || []).filter((e: any) => e.event_date && e.event_date >= todayStr);
      if (futureEvents.length > 0) {
        startDate = futureEvents[0].event_date;
        const lastIdx = Math.min(4, futureEvents.length - 1);
        const lastD = new Date(futureEvents[lastIdx].event_date);
        lastD.setDate(lastD.getDate() + 1);
        endDate = lastD.toISOString().split("T")[0];
      } else {
        // All events in the past — show last 3
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

    // --- Filtered AKB data fetches ---
    const [eventsRes, contactsRes, vansRes, tourRes, routingRes, policiesRes, recentInbound, recentOutbound] = await Promise.all([
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
    // Exclude the message we just logged (it's already in sms_inbound) from history count
    // recentHistory includes the current inbound message we just inserted, so check if there's only 1 (the current one)
    const priorMessages = historyMessages.filter(m => {
      // The current message was just inserted; prior messages are everything else
      return !(m.role === "user" && m.content === messageBody);
    });
    const isFirstContact = priorMessages.length === 0;

    if (isFirstContact) {
      // Fetch tour code / abbreviation
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
    // Check if the most recent outbound message was an identity confirmation
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

      // Neither affirmative nor negative — they're engaging with a question, treat as confirmed and fall through
      console.log(`User ${senderName} skipped confirmation, treating as confirmed and processing message`);
    }

    // Build Schedule Facts — authoritative city list for prompt hardening
    const scheduleFacts = (allEvents || []).map((e: any) =>
      `${e.event_date} | ${e.city || "?"} | ${e.venue || "TBD"}`
    ).join("\n");

    // Build focused context
    const scheduleSection = JSON.stringify(eventsRes.data || [], null, 1);
    const contactsSection = JSON.stringify(contactsRes.data || [], null, 1);
    const vansSection = (vansRes.data || []).length > 0
      ? (vansRes.data || []).map((v: any) =>
          `${v.venue_name} (${v.city || "?"}, ${v.event_date || "?"}):\n${JSON.stringify(v.van_data, null, 1)}`
        ).join("\n\n")
      : "(No VAN data for this date range)";
    const routingSection = (routingRes.data || []).length > 0
      ? JSON.stringify(routingRes.data, null, 1)
      : "(No routing data for this date range)";
    const policiesSection = (policiesRes.data || []).length > 0
      ? (policiesRes.data || []).map((p: any) => `${p.policy_type}: ${JSON.stringify(p.policy_data)}`).join("\n")
      : "(No policies set)";

    const akbContext = `
Tour: ${tourName}
Date window: ${startDate} to ${endDate}

Schedule:
${scheduleSection}

Contacts:
${contactsSection}

Venue Advance Notes (VANs) — contains haze, rigging, labor, power, docks, staging, curfew, SPL limits, and all venue-specific technical details:
${vansSection}

Routing & Hotels:
${routingSection}

Tour Policies (guest list, safety SOPs):
${policiesSection}
`.substring(0, 16000);

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

SELF-CORRECTION RULE: If your previous replies in the conversation history contained errors or incomplete information, correct them in your current response — do NOT repeat previous mistakes.

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

// --- Always return empty TwiML (Fix 4: prevents double-SMS) ---
function emptyTwiml(): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { headers: { ...corsHeaders, "Content-Type": "text/xml" } },
  );
}
