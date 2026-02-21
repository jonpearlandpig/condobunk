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

    const { messages, tour_id, tour_ids } = await req.json();

    const admin = createClient(supabaseUrl, serviceKey);

    // Determine which tours to query
    let targetTourIds: string[] = [];
    let isGlobalMode = false;

    if (tour_ids && Array.isArray(tour_ids) && tour_ids.length > 0) {
      targetTourIds = tour_ids;
      isGlobalMode = tour_ids.length > 1;
    } else if (tour_id) {
      targetTourIds = [tour_id];
    } else {
      return new Response(JSON.stringify({ error: "No tour_id or tour_ids provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tour names for context
    const { data: tourRows } = await admin
      .from("tours")
      .select("id, name")
      .in("id", targetTourIds);

    const tourNameMap: Record<string, string> = {};
    (tourRows || []).forEach((t: any) => { tourNameMap[t.id] = t.name; });

    // Query all tours in parallel
    const allTourData = await Promise.all(
      targetTourIds.map(async (tid) => {
        const [eventsRes, contactsRes, gapsRes, conflictsRes, docsRes, vansRes] = await Promise.all([
          admin.from("schedule_events").select("id, event_date, venue, city, load_in, show_time, notes").eq("tour_id", tid).order("event_date").limit(50),
          admin.from("contacts").select("id, name, role, email, phone, scope, venue").eq("tour_id", tid).limit(50),
          admin.from("knowledge_gaps").select("id, question, domain, resolved").eq("tour_id", tid).limit(20),
          admin.from("calendar_conflicts").select("id, conflict_type, severity, resolved, event_id").eq("tour_id", tid).limit(20),
          admin.from("documents").select("id, filename, doc_type, raw_text, file_path").eq("tour_id", tid).eq("is_active", true).limit(10),
          admin.from("venue_advance_notes").select("id, venue_name, city, event_date, van_data").eq("tour_id", tid).order("event_date").limit(30),
        ]);

        const docsWithUrls = await Promise.all(
          (docsRes.data || []).map(async (d: any) => {
            let fileUrl: string | null = null;
            if (d.file_path) {
              const { data: signedData } = await admin.storage
                .from("document-files")
                .createSignedUrl(d.file_path, 3600);
              if (signedData?.signedUrl) {
                fileUrl = signedData.signedUrl;
              }
            }
            return {
              id: d.id,
              filename: d.filename,
              doc_type: d.doc_type,
              file_url: fileUrl,
              excerpt: d.raw_text?.substring(0, 2000) || "(visual/binary document — no text extracted)",
            };
          })
        );

        return {
          tour_id: tid,
          tour_name: tourNameMap[tid] || "Unknown Tour",
          schedule: eventsRes.data || [],
          contacts: contactsRes.data || [],
          knowledge_gaps: gapsRes.data || [],
          conflicts: conflictsRes.data || [],
          documents: docsWithUrls,
          vans: vansRes.data || [],
        };
      })
    );

    // Build system prompt based on mode
    let akbDataSection: string;

    if (isGlobalMode) {
      // Multi-tour: group data by tour name
      akbDataSection = allTourData.map((td) => {
        const tourContacts = td.contacts as any[];
        return `
## ═══ TOUR: ${td.tour_name} (ID: ${td.tour_id}) ═══

### Schedule Events:
${JSON.stringify(td.schedule, null, 1)}

### Tour Team Contacts (scope=TOUR):
${JSON.stringify(tourContacts.filter((c: any) => c.scope !== "VENUE"), null, 1)}

### Venue Contacts (scope=VENUE):
${JSON.stringify(tourContacts.filter((c: any) => c.scope === "VENUE"), null, 1)}

### Venue Advance Notes (VANs) — PRIMARY SOURCE for venue-specific advance data:
${td.vans.length > 0 ? td.vans.map((van: any) => `#### ${van.venue_name} (${van.city || "no city"}, ${van.event_date || "no date"}):\n${JSON.stringify(van.van_data, null, 1)}`).join("\n\n") : "(No VANs extracted yet)"}

### Knowledge Gaps:
${JSON.stringify(td.knowledge_gaps, null, 1)}

### Calendar Conflicts:
${JSON.stringify(td.conflicts, null, 1)}

### Active Documents:
${td.documents.map(d => `[${d.doc_type}] ${d.filename} (id: ${d.id})${d.file_url ? `\nDownload: ${d.file_url}` : ""}:\n${d.excerpt}`).join("\n---\n")}
`;
      }).join("\n\n");
    } else {
      // Single-tour: same format as before
      const td = allTourData[0];
      const tourContacts = td.contacts as any[];
      akbDataSection = `
### Schedule Events (with IDs):
${JSON.stringify(td.schedule, null, 1)}

### Tour Team Contacts (scope=TOUR):
${JSON.stringify(tourContacts.filter((c: any) => c.scope !== "VENUE"), null, 1)}

### Venue Contacts (scope=VENUE — these are venue-specific staff, NOT your touring team):
${JSON.stringify(tourContacts.filter((c: any) => c.scope === "VENUE"), null, 1)}

### Venue Advance Notes (VANs) — PRIMARY SOURCE for venue-specific advance data:
${td.vans.length > 0 ? td.vans.map((van: any) => `#### ${van.venue_name} (${van.city || "no city"}, ${van.event_date || "no date"}):\n${JSON.stringify(van.van_data, null, 1)}`).join("\n\n") : "(No VANs extracted yet — upload an Advance Master to populate)"}

### Knowledge Gaps (with IDs):
${JSON.stringify(td.knowledge_gaps, null, 1)}

### Calendar Conflicts (with IDs):
${JSON.stringify(td.conflicts, null, 1)}

### Active Documents (with download links):
${td.documents.map(d => `[${d.doc_type}] ${d.filename} (id: ${d.id})${d.file_url ? `\nDownload: ${d.file_url}` : ""}:\n${d.excerpt}`).join("\n---\n")}
`;
    }

    const modeInstructions = isGlobalMode
      ? `## MODE: GLOBAL (Cross-Tour Search)

You are searching across ${allTourData.length} active tours. The data below is grouped by tour name.

CRITICAL BEHAVIOR FOR GLOBAL MODE:
- When a query matches data from MULTIPLE tours (e.g., same date, same venue name), ALWAYS show ALL matching results grouped by tour name.
- Prefix each answer section with the tour name in bold: **[Tour Name]**
- If only ONE tour has a match, answer directly but still mention which tour the data comes from.
- NEVER mix data from different tours without clearly labeling which tour each piece belongs to.
- For action blocks, ALWAYS include the tour_id in the action so the correct tour is modified.
- Source citations MUST include the tour name: [Source: Schedule — Tour Name — 2026-03-08]
`
      : `## MODE: SCOPED (Single Tour: ${allTourData[0]?.tour_name || "Unknown"})

You are locked to a single tour. All data below belongs to "${allTourData[0]?.tour_name}". Do NOT reference any other tours.
`;

    const systemPrompt = `You are TELA (Touring Efficiency Liaison Assistant) — the single source of truth for tour data. Your responses here are the EXACT same answers that crew and production teams receive when they text the TourText SMS number (888-340-0564). Every answer must be deterministic, factual, and sourced from the verified tour data below.

${modeInstructions}

## CRITICAL BEHAVIOR: SOLVE, DON'T JUST REPORT

You are NOT a reporter. You are a FIXER. When a user asks about an issue:
1. DIAGNOSE the exact problem from the data
2. PROPOSE a specific fix with clear details
3. OFFER TO EXECUTE the fix using an action block (see format below)
4. The ONLY reason you can't fix something is if it requires the tour admin to upload new information or provide data you don't have

NEVER leave the user wondering what to do. NEVER just state a problem without proposing a solution. ALWAYS end with a concrete next step.

## Action Blocks

When you can fix something directly in the database, include an action block in your response. The format is:

<<ACTION:{"type":"resolve_conflict","id":"<conflict_uuid>","tour_id":"<tour_uuid>"}>>
<<ACTION:{"type":"resolve_gap","id":"<gap_uuid>","tour_id":"<tour_uuid>"}>>
<<ACTION:{"type":"update_event","id":"<event_uuid>","tour_id":"<tour_uuid>","fields":{"venue":"New Venue","city":"New City","notes":"Updated notes"}}>>
<<ACTION:{"type":"update_contact","id":"<contact_uuid>","tour_id":"<tour_uuid>","fields":{"phone":"555-1234","email":"new@email.com"}}>>
<<ACTION:{"type":"create_contact","id":"new","tour_id":"<tour_uuid>","fields":{"name":"Jane Doe","role":"Stage Manager","phone":"555-9999","email":"jane@tour.com","scope":"TOUR"}}>>

Rules for actions:
- Include the action block AFTER your explanation of what the fix does
- You can include multiple action blocks if multiple fixes are needed
- ALWAYS explain what the action will do before the block
- The user will see a confirmation button — the fix only happens when they approve
- Use real IDs from the data below — EXCEPT for create_contact where id must be "new"
- For create_contact, you MUST include "name" and "scope" (TOUR or VENUE) in fields. Optionally include role, phone, email, venue.
- NEVER use fake IDs like "new_contact_xyz" for update_contact — that action is for EXISTING contacts only. Use create_contact to add new people.
- ALWAYS include "tour_id" in action blocks so the correct tour is modified.

## Your AKB Data:

${akbDataSection}

## SOURCE CITATIONS (MANDATORY)

Every factual claim in your response MUST end with an inline source tag. Use this exact format:

> **Source format:** \`[Source: <TABLE> — <identifier>]\`

Examples:
- "Load-in is at 2:00 PM [Source: Schedule — 2026-03-08, Little Caesars Arena]"
- "Contact the venue PM, Sarah Chen [Source: Contacts — Sarah Chen, Venue PM]"
- "The parking map shows bus staging downstairs [Source: Document — 3.8.26_Parking_Downstairs.pdf]"
- "There's a HIGH severity overlap conflict [Source: Conflict — OVERLAP_SHOW_TIMES]"
- "Missing load-in time for Detroit [Source: Gap — load_in not listed]"

Rules for citations:
- EVERY piece of data you reference must have a source tag
- Group citations at the end of each paragraph or bullet point, not after every word
- If information comes from multiple sources, list them: [Source: Schedule — 3/8, Document — parking.pdf]
- When data is MISSING, cite it as a Gap: [Source: Gap — field not in AKB]
- Keep source tags concise — just enough to identify the record
${isGlobalMode ? "- In global mode, ALWAYS include the tour name in citations: [Source: Schedule — Tour Name — 3/8]" : ""}

## DOCUMENT AUTHORITY HIERARCHY (CRITICAL)

The **Tour Advance Master** is the HIGHEST AUTHORITY source. Its extracted data is stored as **Venue Advance Notes (VANs)** — structured per-venue records containing production contacts, rigging, power, labor, staging, video, logistics, and all advance call details.

**DATA RESOLUTION ORDER:**
1. **FIRST** check the Venue Advance Notes (VANs) for the venue/city/date in question. VANs contain the most current advance data from the Advance Master and are the PRIMARY source.
2. **SECOND** check the Advance Master document text (doc_type "SCHEDULE" or filename containing "advance", "master") for any details not captured in VANs.
3. **THIRD** search other AKB sources (tech packs, contacts table, other documents).
4. **CONFLICT RESOLUTION:** If a venue tech pack lists Contact A but the VAN (Advance Master) lists Contact B for the SAME city/date, the **VAN wins**. VANs are authoritative. Tech pack data is supplementary.
5. When citing VAN data, use: [Source: VAN — Venue Name — field]
6. If you detect a conflict between VAN and another source, briefly note it.

**VAN FIELD CATEGORIES** — when a user asks about any of these topics for a venue, check the VAN first:
- Event Details (date, capacity, bus arrival, rider sent)
- Production Contact & House Rigger Contact
- Summary (CAD, rigging overlay, low steel distance)
- Venue Schedule (chair set, show times)
- Plant Equipment (forklifts, CO2)
- Labour (union status, labor notes, labor call, feed count, house electrician, follow spots)
- Dock & Logistics (loading dock, push distance, truck parking, vom entry, seating height)
- Power (available power, catering power)
- Staging (VIP risers, handrails, FOH riser, camera risers, preset, end stage curtain, bike rack)
- Misc (curfew, dead case storage, haze restrictions, SPL restrictions)
- Lighting (houselight control)
- Video (flypack location, hardline internet, house TV patch, LED ribbon)

## Rules:
- ONLY answer from the tour data above. NEVER fabricate, assume, or guess ANY information.
- If a field is null, empty, or missing (load_in, show_time, phone, email, etc.), do NOT invent a value. Do NOT say "likely", "probably", "typically", or "usually". Simply state that the information is not in the AKB.
- NEVER display placeholder or assumed times. If load_in is null, say "Load-in time is not listed in the AKB" — do NOT guess "2:00 AM" or any other time. Same for all other fields.
- Only present data that is explicitly stored and approved in the AKB. If it's not there, it doesn't exist yet.
- If the data doesn't contain the answer, say exactly what's missing and tell the user to upload the relevant document so both this chat AND TourText SMS will have the answer.
- Be direct, specific, and reference exact dates/venues/names FROM THE DATA ONLY.
- When a document has a download link, ALWAYS include a markdown link so the user can view or download the file. Format: [filename](url). This is especially important for visual documents like parking maps, venue layouts, floor plans, and tech riders.
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
