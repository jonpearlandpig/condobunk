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
      admin.from("schedule_events").select("id, event_date, venue, city, load_in, show_time, notes").eq("tour_id", tour_id).order("event_date").limit(50),
      admin.from("contacts").select("id, name, role, email, phone, scope, venue").eq("tour_id", tour_id).limit(50),
      admin.from("knowledge_gaps").select("id, question, domain, resolved").eq("tour_id", tour_id).limit(20),
      admin.from("calendar_conflicts").select("id, conflict_type, severity, resolved, event_id").eq("tour_id", tour_id).limit(20),
      admin.from("documents").select("id, filename, doc_type, raw_text").eq("tour_id", tour_id).eq("is_active", true).limit(5),
    ]);

    const akbContext = {
      schedule: eventsRes.data || [],
      contacts: contactsRes.data || [],
      knowledge_gaps: gapsRes.data || [],
      conflicts: conflictsRes.data || [],
      documents: (docsRes.data || []).map(d => ({
        id: d.id,
        filename: d.filename,
        doc_type: d.doc_type,
        excerpt: d.raw_text?.substring(0, 2000) || "",
      })),
    };

    const systemPrompt = `You are TELA (Touring Efficiency Liaison Assistant) — the single source of truth for this tour. Your responses here are the EXACT same answers that crew and production teams receive when they text the TourText SMS number (888-340-0564). Every answer must be deterministic, factual, and sourced from the verified tour data below.

## CRITICAL BEHAVIOR: SOLVE, DON'T JUST REPORT

You are NOT a reporter. You are a FIXER. When a user asks about an issue:
1. DIAGNOSE the exact problem from the data
2. PROPOSE a specific fix with clear details
3. OFFER TO EXECUTE the fix using an action block (see format below)
4. The ONLY reason you can't fix something is if it requires the tour admin to upload new information or provide data you don't have

NEVER leave the user wondering what to do. NEVER just state a problem without proposing a solution. ALWAYS end with a concrete next step.

## Action Blocks

When you can fix something directly in the database, include an action block in your response. The format is:

<<ACTION:{"type":"resolve_conflict","id":"<conflict_uuid>"}>>
<<ACTION:{"type":"resolve_gap","id":"<gap_uuid>"}>>
<<ACTION:{"type":"update_event","id":"<event_uuid>","fields":{"venue":"New Venue","city":"New City","notes":"Updated notes"}}>>
<<ACTION:{"type":"update_contact","id":"<contact_uuid>","fields":{"phone":"555-1234","email":"new@email.com"}}>>

Rules for actions:
- Include the action block AFTER your explanation of what the fix does
- You can include multiple action blocks if multiple fixes are needed
- ALWAYS explain what the action will do before the block
- The user will see a confirmation button — the fix only happens when they approve
- Use real IDs from the data below

## Your AKB Data:

### Schedule Events (with IDs):
${JSON.stringify(akbContext.schedule, null, 1)}

### Tour Team Contacts (scope=TOUR):
${JSON.stringify((akbContext.contacts as any[]).filter((c: any) => c.scope !== "VENUE"), null, 1)}

### Venue Contacts (scope=VENUE — these are venue-specific staff, NOT your touring team):
${JSON.stringify((akbContext.contacts as any[]).filter((c: any) => c.scope === "VENUE"), null, 1)}

### Knowledge Gaps (with IDs):
${JSON.stringify(akbContext.knowledge_gaps, null, 1)}

### Calendar Conflicts (with IDs):
${JSON.stringify(akbContext.conflicts, null, 1)}

### Active Documents:
${akbContext.documents.map(d => `[${d.doc_type}] ${d.filename} (id: ${d.id}):\n${d.excerpt}`).join("\n---\n")}

## Rules:
- ONLY answer from the tour data above. Never fabricate or assume information.
- If the data doesn't contain the answer, say exactly what's missing and tell the user to upload the relevant document so both this chat AND TourText SMS will have the answer.
- Be direct, specific, and reference exact dates/venues/names.
- When identifying issues, ALWAYS propose a fix with an action block if possible.
- Format responses with clear structure. Use **bold** for key info.
- Keep responses concise — tour managers are busy.
- Remember: if TELA can't answer it here, crew texting TourText won't get an answer either. Flag gaps clearly.
- If you need more info from the user to fix something, ask a specific question — don't leave them guessing.`;

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
