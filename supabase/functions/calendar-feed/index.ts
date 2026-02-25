import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Escape iCal text values (fold long lines handled by clients) */
const esc = (s: string | null | undefined): string =>
  (s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");

/** Format a JS Date as iCal DATE (YYYYMMDD) */
const fmtDate = (d: Date): string =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

/** Format a JS Date as iCal DATETIME in UTC (YYYYMMDDTHHmmSSZ) */
const fmtDateTime = (d: Date): string =>
  `${fmtDate(d)}T${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}${String(d.getUTCSeconds()).padStart(2, "0")}Z`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const tourId = url.searchParams.get("tour_id");

  if (!tourId) {
    return new Response("Missing tour_id", {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Fetch tour name + schedule events in parallel
  const [{ data: tour }, { data: events }] = await Promise.all([
    supabase.from("tours").select("name").eq("id", tourId).single(),
    supabase
      .from("schedule_events")
      .select("id, event_date, venue, city, notes, load_in, show_time, end_time")
      .eq("tour_id", tourId)
      .order("event_date", { ascending: true }),
  ]);

  if (!tour) {
    return new Response("Tour not found", {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  const calName = `${tour.name} — Condo Bunk`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//CondoBunk//Calendar Feed//EN`,
    `X-WR-CALNAME:${esc(calName)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  if (events) {
    for (const ev of events) {
      if (!ev.event_date) continue;

      // Parse event_date as a UTC date
      const baseDate = new Date(ev.event_date + "T00:00:00Z");

      // DTSTART / DTEND
      let dtStart: string;
      let dtEnd: string;

      if (ev.show_time) {
        const st = new Date(ev.show_time);
        dtStart = `DTSTART:${fmtDateTime(st)}`;
        if (ev.end_time) {
          dtEnd = `DTEND:${fmtDateTime(new Date(ev.end_time))}`;
        } else {
          // Default 2-hour duration
          const end = new Date(st.getTime() + 2 * 60 * 60 * 1000);
          dtEnd = `DTEND:${fmtDateTime(end)}`;
        }
      } else {
        // All-day event
        const nextDay = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
        dtStart = `DTSTART;VALUE=DATE:${fmtDate(baseDate)}`;
        dtEnd = `DTEND;VALUE=DATE:${fmtDate(nextDay)}`;
      }

      // Description
      const descParts: string[] = [];
      if (ev.load_in) {
        const li = new Date(ev.load_in);
        const h = li.getUTCHours();
        const m = li.getUTCMinutes();
        const ampm = h >= 12 ? "PM" : "AM";
        descParts.push(`Load-in: ${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`);
      }
      if (ev.notes) descParts.push(ev.notes);

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${ev.id}@condobunk`);
      lines.push(`DTSTAMP:${fmtDateTime(new Date())}`);
      lines.push(dtStart);
      lines.push(dtEnd);
      lines.push(`SUMMARY:${esc(ev.venue || "TBD Venue")}`);
      if (ev.city) lines.push(`LOCATION:${esc(ev.city)}`);
      if (descParts.length) lines.push(`DESCRIPTION:${esc(descParts.join("\\n"))}`);
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${tour.name.replace(/[^a-zA-Z0-9]/g, "_")}.ics"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
});
