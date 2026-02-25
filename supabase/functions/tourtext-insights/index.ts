import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  // Validate auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { tour_id, hours = 24 } = await req.json();
    if (!tour_id) {
      return new Response(JSON.stringify({ error: "tour_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check TA/MGMT access
    const { data: isAdmin } = await userClient.rpc("is_tour_admin_or_mgmt", { _tour_id: tour_id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Fetch inbound and outbound messages in parallel
    const [inboundRes, outboundRes] = await Promise.all([
      admin
        .from("sms_inbound")
        .select("id, from_phone, message_text, sender_name, created_at")
        .eq("tour_id", tour_id)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: true }),
      admin
        .from("sms_outbound")
        .select("id, to_phone, message_text, created_at")
        .eq("tour_id", tour_id)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: true }),
    ]);

    const inbound = inboundRes.data || [];
    const outbound = outboundRes.data || [];

    // Compute stats
    const uniqueSenders = new Set(inbound.map((m: any) => m.from_phone)).size;

    // Estimate avg response time by pairing inbound/outbound by phone
    let totalResponseMs = 0;
    let pairedCount = 0;
    for (const msg of inbound) {
      const reply = outbound.find(
        (o: any) =>
          o.to_phone === msg.from_phone &&
          new Date(o.created_at) > new Date(msg.created_at),
      );
      if (reply) {
        totalResponseMs += new Date(reply.created_at).getTime() - new Date(msg.created_at).getTime();
        pairedCount++;
      }
    }
    const avgResponseSeconds = pairedCount > 0 ? Math.round(totalResponseMs / pairedCount / 1000) : 0;

    const stats = {
      total_inbound: inbound.length,
      total_outbound: outbound.length,
      unique_senders: uniqueSenders,
      avg_response_seconds: avgResponseSeconds,
    };

    // Build message log with masked phones
    const maskPhone = (phone: string) => {
      const digits = phone.replace(/\D/g, "");
      return `***${digits.slice(-4)}`;
    };

    const messages = [
      ...inbound.map((m: any) => ({
        direction: "inbound" as const,
        phone: maskPhone(m.from_phone),
        sender_name: m.sender_name || null,
        text: m.message_text,
        created_at: m.created_at,
      })),
      ...outbound.map((m: any) => ({
        direction: "outbound" as const,
        phone: maskPhone(m.to_phone),
        sender_name: null,
        text: m.message_text,
        created_at: m.created_at,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // AI clustering — only if there are enough inbound messages
    let clusters: any[] = [];

    if (inbound.length >= 3 && LOVABLE_API_KEY) {
      const questions = inbound.map((m: any) => m.message_text).join("\n- ");

      const clusterPrompt = `You are analyzing TourText SMS inquiries from touring crew members. Below are ${inbound.length} questions received in the last ${hours} hours.

Group these questions by semantic similarity into topic clusters. For each cluster:
1. Name the topic concisely (2-5 words)
2. Count how many questions belong to it
3. List 2-3 sample questions
4. Rate severity: "info" (1-4 similar), "warning" (5-9 similar), "critical" (10+)
5. Suggest a concrete fix the Tour Admin can take (e.g., update a VAN, add info to schedule, send group text)
6. Identify which AKB entity is related: "venue_advance_notes", "contacts", "schedule_events", or "general"

Return ONLY valid JSON array, no markdown. Each element:
{"topic": "string", "count": number, "severity": "info"|"warning"|"critical", "sample_questions": ["string"], "suggested_fix": "string", "related_entity": "string"}

Questions:
- ${questions}`;

      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You are a data analyst. Return only valid JSON arrays. No markdown formatting." },
              { role: "user", content: clusterPrompt },
            ],
            max_tokens: 2000,
            temperature: 0.2,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const rawContent = aiData.choices?.[0]?.message?.content || "[]";
          // Strip markdown fences if present
          const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          try {
            clusters = JSON.parse(cleaned);
            // Sort by count descending, filter only warning+ for alerts
            clusters.sort((a: any, b: any) => b.count - a.count);
          } catch {
            console.error("Failed to parse AI clusters:", cleaned);
          }
        } else {
          console.error("AI gateway error:", aiResponse.status, await aiResponse.text());
        }
      } catch (e) {
        console.error("AI clustering error:", e);
      }
    }

    return new Response(
      JSON.stringify({ stats, clusters, messages }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("tourtext-insights error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
