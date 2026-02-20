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
            content: `You are a tour operations briefing assistant. Given tour data, produce exactly 4-5 short bullet points (one sentence each) that give a tour manager a quick snapshot of what they're dealing with right now.

Focus on:
1. What's coming up next (nearest event, when, where)
2. Any deadlines or time-sensitive items (events without venues, missing load-in times, etc.)
3. Conflicts or problems that need attention
4. Open knowledge gaps that could block advance work
5. General status/momentum of the tour

Rules:
- Be concise and direct — each line should be one clear sentence
- Use specific dates and venue names from the data
- If there are conflicts, lead with those
- Don't be generic — reference actual data points
- Return ONLY a JSON array of strings, no markdown, no explanation
- Example: ["Next show is Mar 5 at Allen County War Memorial in Fort Wayne — 3 days out.", "2 schedule conflicts still unresolved, including an overlapping show time.", ...]`,
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

    const lines = JSON.parse(content);

    return new Response(JSON.stringify({ lines }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[tldr] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
