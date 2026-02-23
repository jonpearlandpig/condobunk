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
            content: `You are a tour operations briefing assistant. Given tour data, produce exactly 4-5 items that give a tour manager a quick snapshot of what they're dealing with right now.

The data includes time horizons: next_24h, next_3_days, and next_7_days. Use these to prioritize urgency.

Focus on:
1. IMMEDIATE (next 24h): What's happening tomorrow? Lead with this if anything exists.
2. SHORT-TERM (next 3 days): Any deadlines, events, or prep needed in the next 3 days.
3. THIS WEEK (next 7 days): Broader view of what's coming up this week.
4. Conflicts or problems that need attention (any timeframe)
5. Open knowledge gaps that could block advance work

Rules:
- IMPORTANT: Treat rehearsals, load-in days, travel days, and prep days as real tour events — do NOT skip them to find the "first show." The next calendar entry is the next event, period.
- Be concise and direct — each item should be one clear sentence
- Use specific dates and venue names from the data
- If there are conflicts, lead with those
- Don't be generic — reference actual data points
- Return ONLY a JSON array of objects with "text" (string) and "actionable" (boolean)
- Set "actionable" to true for items that describe a problem, conflict, missing data, or issue that needs resolution
- Set "actionable" to false for informational/status items
- Example: [{"text":"2 duplicate entries for Mar 5-6 with conflicting venue info — needs review.","actionable":true},{"text":"Next event is Feb 25 — Travel Day at Rock Nashville, Nashville, TN.","actionable":false}]`,
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

    let items: Array<{ text: string; actionable: boolean }>;
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
