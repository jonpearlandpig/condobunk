import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendTwilioSms(
  to: string,
  body: string,
  accountSid: string,
  authToken: string,
  fromNumber: string,
) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
    },
    body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
  });
  if (!response.ok) {
    const errText = await response.text();
    console.error("Twilio send error:", response.status, errText);
    return false;
  }
  return true;
}

const formatTime = (ts: string): string => {
  const d = new Date(ts);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
};

const REMIND_TYPE_LABELS: Record<string, string> = {
  load_in: "Load-in",
  show_time: "Showtime",
  doors: "Doors",
  soundcheck: "Soundcheck",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      console.error("Missing Twilio credentials");
      return new Response(JSON.stringify({ error: "Missing Twilio config" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all enabled reminders with their events
    const { data: reminders, error: remError } = await admin
      .from("event_reminders")
      .select("*, schedule_events!inner(id, venue, city, event_date, load_in, show_time, doors, soundcheck, tour_id)")
      .eq("enabled", true);

    if (remError) {
      console.error("Error fetching reminders:", remError);
      return new Response(JSON.stringify({ error: remError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    let sentCount = 0;

    for (const reminder of reminders) {
      const event = (reminder as any).schedule_events;
      if (!event) continue;

      // Get the target time based on remind_type
      const targetTimeStr = event[reminder.remind_type];
      if (!targetTimeStr) continue;

      // Parse target time — stored as UTC timestamp
      const targetTime = new Date(targetTimeStr);
      const diffMinutes = (targetTime.getTime() - now.getTime()) / (1000 * 60);

      // Check if we're within the reminder window (±7.5 minutes of the configured lead time)
      const reminderWindow = reminder.remind_before_minutes;
      if (diffMinutes < reminderWindow - 7.5 || diffMinutes > reminderWindow + 7.5) {
        continue;
      }

      // Check deduplication
      const { data: alreadySent } = await admin
        .from("sent_reminders")
        .select("id")
        .eq("event_id", event.id)
        .eq("phone", reminder.phone)
        .eq("remind_type", reminder.remind_type)
        .maybeSingle();

      if (alreadySent) continue;

      // Build and send the SMS
      const typeLabel = REMIND_TYPE_LABELS[reminder.remind_type] || reminder.remind_type;
      const timeFormatted = formatTime(targetTimeStr);
      const venue = event.venue || "TBD";
      const city = event.city ? ` (${event.city})` : "";
      const leadLabel = reminderWindow >= 1440
        ? `tomorrow`
        : reminderWindow >= 60
          ? `in ${Math.round(reminderWindow / 60)} hour${Math.round(reminderWindow / 60) !== 1 ? "s" : ""}`
          : `in ${reminderWindow} min`;

      const smsBody = `REMINDER: ${typeLabel} at ${venue}${city} ${leadLabel} — ${timeFormatted}. -TELA`;

      const success = await sendTwilioSms(
        reminder.phone,
        smsBody,
        TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN,
        TWILIO_PHONE_NUMBER,
      );

      if (success) {
        // Log to sent_reminders
        await admin.from("sent_reminders").insert({
          reminder_id: reminder.id,
          event_id: event.id,
          phone: reminder.phone,
          remind_type: reminder.remind_type,
        });

        // Log to sms_outbound
        await admin.from("sms_outbound").insert({
          to_phone: reminder.phone,
          message_text: smsBody,
          tour_id: event.tour_id,
          status: "sent",
        });

        sentCount++;
        console.log(`Sent reminder to ${reminder.phone} for ${venue} ${typeLabel}`);
      }
    }

    // ─── Scheduled Messages (personal reminders + outbound texts) ───
    let scheduledSent = 0;
    const { data: scheduled, error: schedError } = await admin
      .from("scheduled_messages")
      .select("*")
      .eq("sent", false)
      .lte("send_at", new Date(now.getTime() + 7.5 * 60 * 1000).toISOString());

    if (schedError) {
      console.error("Error fetching scheduled_messages:", schedError);
    } else if (scheduled && scheduled.length > 0) {
      for (const msg of scheduled) {
        // Validate E.164
        if (!/^\+[1-9]\d{1,14}$/.test(msg.to_phone)) {
          console.warn("Skipping invalid phone:", msg.to_phone);
          continue;
        }

        const smsBody = `${msg.message_text}. -TELA`;
        const success = await sendTwilioSms(
          msg.to_phone,
          smsBody,
          TWILIO_ACCOUNT_SID,
          TWILIO_AUTH_TOKEN,
          TWILIO_PHONE_NUMBER,
        );

        if (success) {
          // Mark as sent
          await admin.from("scheduled_messages").update({ sent: true }).eq("id", msg.id);

          // Log to sms_outbound — no contact creation for external recipients
          await admin.from("sms_outbound").insert({
            to_phone: msg.to_phone,
            message_text: smsBody,
            tour_id: msg.tour_id,
            status: "sent",
          });

          scheduledSent++;
          console.log(`Sent scheduled ${msg.is_self ? "reminder" : "text"} to ${msg.to_phone}`);
        }
      }
    }

    // Auto-cleanup: delete sent scheduled messages older than 7 days
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("scheduled_messages").delete().eq("sent", true).lt("created_at", sevenDaysAgo);

    return new Response(JSON.stringify({ sent: sentCount, scheduled_sent: scheduledSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-event-reminders error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
