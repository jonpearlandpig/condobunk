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

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No API key" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, tour_id } = await req.json();

    // Gather AKB context from the database
    const admin = createClient(supabaseUrl, serviceKey);

    const [eventsRes, contactsRes, gapsRes, conflictsRes, docsRes] = await Promise.all([
      admin.from("schedule_events").select("event_date, venue, city, load_in, show_time, notes").eq("tour_id", tour_id).order("event_date").limit(50),
      admin.from("contacts").select("name, role, email, phone").eq("tour_id", tour_id).limit(30),
      admin.from("knowledge_gaps").select("question, domain, resolved").eq("tour_id", tour_id).limit(20),
      admin.from("calendar_conflicts").select("conflict_type, severity, resolved").eq("tour_id", tour_id).limit(20),
      admin.from("documents").select("filename, doc_type, raw_text").eq("tour_id", tour_id).eq("is_active", true).limit(5),
    ]);

    const akbContext = {
      schedule: eventsRes.data || [],
      contacts: contactsRes.data || [],
      knowledge_gaps: gapsRes.data || [],
      conflicts: conflictsRes.data || [],
      documents: (docsRes.data || []).map(d => ({
        filename: d.filename,
        doc_type: d.doc_type,
        excerpt: d.raw_text?.substring(0, 2000) || "",
      })),
    };

    const systemPrompt = `You are the Condo Bunk AKB (Automated Knowledge Base) — the single source of truth for this tour. IMPORTANT: Your responses here are the EXACT same answers that crew and production teams receive when they text the TourText SMS number (888-340-0564). Every answer must be deterministic, factual, and sourced from the verified tour data below.

## Your AKB Data:

### Schedule Events:
${JSON.stringify(akbContext.schedule, null, 1)}

### Contacts:
${JSON.stringify(akbContext.contacts, null, 1)}

### Knowledge Gaps (unresolved questions):
${JSON.stringify(akbContext.knowledge_gaps.filter(g => !g.resolved), null, 1)}

### Calendar Conflicts:
${JSON.stringify(akbContext.conflicts.filter(c => !c.resolved), null, 1)}

### Active Documents:
${akbContext.documents.map(d => `[${d.doc_type}] ${d.filename}:\n${d.excerpt}`).join("\n---\n")}

## Rules:
- ONLY answer from the tour data above. Never fabricate or assume information.
- If the data doesn't contain the answer, say exactly what's missing and tell the user to upload the relevant document so both this chat AND TourText SMS will have the answer.
- Be direct, specific, and reference exact dates/venues/names.
- When identifying issues, propose a clear next step or solution.
- Format responses with clear structure. Use **bold** for key info.
- Keep responses concise — tour managers are busy.
- Remember: if the AKB can't answer it here, crew texting TourText won't get an answer either. Flag gaps clearly.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await resp.text();
      console.error("[akb-chat] AI error:", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(resp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (err) {
    console.error("[akb-chat] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
