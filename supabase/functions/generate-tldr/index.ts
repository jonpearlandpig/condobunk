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

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No API key" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { context } = await req.json();

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a tour operations briefing assistant. Given tour data, produce exactly 4-6 items that give a tour manager a quick snapshot of what they're dealing with right now.

The data includes time horizons: next_24h, next_3_days, and next_7_days. Use these to prioritize urgency. Each event includes a "tour" field with the tour name.

Focus on:
1. IMMEDIATE (next 24h): What's happening tomorrow? Lead with this if anything exists.
2. SHORT-TERM (next 3 days): Any deadlines, events, or prep needed in the next 3 days.
3. THIS WEEK (next 7 days): Broader view of what's coming up this week.
4. Conflicts or problems that need attention (any timeframe)
5. Open knowledge gaps that could block advance work

RECENT UPDATES (IMPORTANT):
If "recent_artifact_updates" or "recent_akb_changes" contain entries, include 1-2 briefing items summarizing the most notable recent changes. Examples:
- "Tour Wi-Fi info was updated in TourText." (set actionable: true, route: "/bunk/artifacts")
- "W2 Post Show Food notes added to CondoBunk." (set actionable: true, route: "/bunk/artifacts")
- "TELA updated Gainbridge Fieldhouse venue info." (set actionable: true, route: "/bunk/changelog")
For artifact updates, use route "/bunk/artifacts". For AKB changelog items, use route "/bunk/changelog".

PATTERN DETECTION (CRITICAL):
If "pattern_artifacts" contains multiple entries of the same type (e.g., W1 and W2 post-show food), compare their content for repeated vendors/restaurants/suppliers. If the same vendor appears in consecutive weeks, flag it with a specific callout like:
- "W2 Post Show Food includes Five Guys again (also in W1 Stop 002 and Stop 004) — consider rotating."
Set actionable: true and route: "/bunk/artifacts" for pattern items.

PREDICTIVE NUDGES:
Look for patterns that suggest upcoming issues: same hotel chains, same catering, same vendors across multiple stops. Don't just report data — surface the insight.

STRICT RULES — you MUST follow these exactly:
- NEVER use the phrase "first show." Always say "next scheduled event" or "next date on the calendar."
- The chronologically first event in the data IS the next event. Do NOT skip it for any reason.
- Any event with a venue name and/or city is a venue date, period. The "day_title" or notes field contains logistics details (equipment, confirmations, contacts) — it does NOT indicate event type.
- Do NOT classify events as "show" vs "travel day" vs "load-in" vs "rehearsal" vs "prep day" unless the data explicitly contains that label in a dedicated field. Just state the venue, city, and date.
- When the "tour" field is present on events, always prefix each briefing item with the tour name.
- If two tours have events on the same date, list them as separate items.
- Be concise and direct — each item should be one clear sentence
- Use specific dates and venue names from the data
- If there are conflicts, lead with those
- Don't be generic — reference actual data points
- Return ONLY a JSON array of objects with "text" (string), "actionable" (boolean), and optionally "route" (string)
- Set "actionable" to true for items that describe a problem, conflict, missing data, issue, update, or pattern alert
- Set "actionable" to false for informational/status items
- The "route" field is optional. Use it when the item points to a specific section:
  - Artifact updates/patterns -> "/bunk/artifacts"
  - Changelog items -> "/bunk/changelog"
  - Schedule changes -> "/bunk/calendar"
  - Conflicts -> "/bunk/conflicts"
  - Gaps -> "/bunk/gaps"
- Example: [{"text":"KOH Advance: 2 duplicate entries for Mar 5-6 with conflicting venue info — needs review.","actionable":true,"route":"/bunk/conflicts"},{"text":"Tour Wi-Fi info updated in TourText.","actionable":true,"route":"/bunk/artifacts"},{"text":"KOH Advance: Next scheduled event is Feb 25 at Rock Nashville, Nashville, TN.","actionable":false}]`,
          },
          {
            role: "user",
            content: context,
          },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[tldr] AI error:", resp.status, errText);
      return new Response(JSON.stringify({ error: "AI call failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    let content = data.choices?.[0]?.message?.content || "[]";
    content = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    let items: Array<{ text: string; actionable: boolean; route?: string }>;
    try {
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        const parsed = JSON.parse(arrayMatch[0]);
        if (typeof parsed[0] === "string") {
          items = parsed.map((s: string) => ({
            text: s,
            actionable: /conflict|duplicate|missing|unresolved|issue|problem|error|gap|block/i.test(s),
          }));
        } else {
          items = parsed;
        }
      } else {
        items = content
          .split("\n")
          .map((l: string) => l.replace(/^[-•*\d.)\s]+/, "").trim())
          .filter((l: string) => l.length > 10)
          .slice(0, 5)
          .map((s: string) => ({
            text: s,
            actionable: /conflict|duplicate|missing|unresolved|issue|problem|error|gap|block/i.test(s),
          }));
      }
    } catch (_parseErr) {
      items = content
        .split("\n")
        .map((l: string) => l.replace(/^[-•*\d.)\s]+/, "").trim())
        .filter((l: string) => l.length > 10)
        .slice(0, 5)
        .map((s: string) => ({
          text: s,
          actionable: /conflict|duplicate|missing|unresolved|issue|problem|error|gap|block/i.test(s),
        }));
    }

    if (!items.length) {
      items = [{ text: "Tour briefing is being prepared — check back shortly.", actionable: false }];
    }

    return new Response(JSON.stringify({ lines: items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[tldr] Error:", err);
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
