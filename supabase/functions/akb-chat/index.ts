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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No API key" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Auth: validate JWT via getUser ---
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { messages, tour_id, tour_ids } = body;

    // --- Input validation ---
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) {
      return new Response(JSON.stringify({ error: "messages must be an array of 1-50 items" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    for (const m of messages) {
      if (typeof m.role !== "string" || typeof m.content !== "string" || m.content.length > 10000) {
        return new Response(JSON.stringify({ error: "Invalid message format or content too long (max 10000 chars)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    if (tour_ids && (!Array.isArray(tour_ids) || tour_ids.length > 20)) {
      return new Response(JSON.stringify({ error: "tour_ids must be an array of max 20" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // --- Validate user is a member of all requested tours ---
    const { data: memberRows } = await admin
      .from("tour_members")
      .select("tour_id")
      .eq("user_id", user.id)
      .in("tour_id", targetTourIds);
    const memberTourIds = new Set((memberRows || []).map((r: any) => r.tour_id));
    const unauthorized = targetTourIds.filter((id) => !memberTourIds.has(id));
    if (unauthorized.length > 0) {
      return new Response(JSON.stringify({ error: "Not a member of one or more requested tours" }), {
        status: 403,
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
        const [eventsRes, contactsRes, gapsRes, conflictsRes, docsRes, vansRes, routingRes, policiesRes, artifactsRes] = await Promise.all([
          admin.from("schedule_events").select("id, event_date, venue, city, load_in, show_time, doors, soundcheck, curfew, notes").eq("tour_id", tid).order("event_date").limit(50),
          admin.from("contacts").select("id, name, role, email, phone, scope, venue").eq("tour_id", tid).limit(50),
          admin.from("knowledge_gaps").select("id, question, domain, resolved").eq("tour_id", tid).limit(20),
          admin.from("calendar_conflicts").select("id, conflict_type, severity, resolved, event_id").eq("tour_id", tid).limit(20),
          admin.from("documents").select("id, filename, doc_type, raw_text, file_path").eq("tour_id", tid).eq("is_active", true).limit(10),
          admin.from("venue_advance_notes").select("id, venue_name, city, event_date, van_data").eq("tour_id", tid).order("event_date").limit(30),
          admin.from("tour_routing").select("event_date, city, hotel_name, hotel_checkin, hotel_checkout, hotel_confirmation, bus_notes, truck_notes, routing_notes").eq("tour_id", tid).order("event_date").limit(30),
          admin.from("tour_policies").select("policy_type, policy_data").eq("tour_id", tid).limit(10),
          admin.from("user_artifacts").select("id, title, artifact_type, visibility, content, updated_at, user_id").eq("tour_id", tid).or(`visibility.in.(tourtext,condobunk),and(visibility.eq.bunk_stash,user_id.eq.${user.id})`).order("updated_at", { ascending: false }).limit(20),
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
          routing: routingRes.data || [],
          policies: policiesRes.data || [],
          artifacts: artifactsRes.data || [],
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

### Routing & Hotels:
${(td.routing as any[]).length > 0 ? JSON.stringify(td.routing, null, 1) : "(No routing data)"}

### Tour Policies:
${(td.policies as any[]).length > 0 ? (td.policies as any[]).map((p: any) => `${p.policy_type}: ${JSON.stringify(p.policy_data)}`).join("\n") : "(No policies set)"}

### Knowledge Gaps:
${JSON.stringify(td.knowledge_gaps, null, 1)}

### Calendar Conflicts:
${JSON.stringify(td.conflicts, null, 1)}

### Active Documents:
${td.documents.map(d => `[${d.doc_type}] ${d.filename} (id: ${d.id})${d.file_url ? `\nDownload: ${d.file_url}` : ""}:\n${d.excerpt}`).join("\n---\n")}

### User Artifacts (notes, checklists, documents):
${(td.artifacts as any[]).length > 0 ? (td.artifacts as any[]).map((a: any) => `[${a.artifact_type}] "${a.title}" (visibility: ${a.visibility}${a.visibility === "bunk_stash" ? " — PRIVATE TO THIS USER" : ""}, updated: ${a.updated_at}):\n${(a.content || "(empty)").substring(0, 1500)}`).join("\n---\n") : "(No artifacts)"}
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

### Routing & Hotels:
${(td.routing as any[]).length > 0 ? JSON.stringify(td.routing, null, 1) : "(No routing data — upload routing sheet to populate)"}

### Tour Policies (Guest List, Safety, Department SOPs):
${(td.policies as any[]).length > 0 ? (td.policies as any[]).map((p: any) => `${p.policy_type}: ${JSON.stringify(p.policy_data)}`).join("\n") : "(No policies set)"}

### Knowledge Gaps (with IDs):
${JSON.stringify(td.knowledge_gaps, null, 1)}

### Calendar Conflicts (with IDs):
${JSON.stringify(td.conflicts, null, 1)}

### Active Documents (with download links):
${td.documents.map(d => `[${d.doc_type}] ${d.filename} (id: ${d.id})${d.file_url ? `\nDownload: ${d.file_url}` : ""}:\n${d.excerpt}`).join("\n---\n")}

### User Artifacts (notes, checklists, documents):
${(td.artifacts as any[]).length > 0 ? (td.artifacts as any[]).map((a: any) => `[${a.artifact_type}] "${a.title}" (visibility: ${a.visibility}${a.visibility === "bunk_stash" ? " — PRIVATE TO THIS USER" : ""}, updated: ${a.updated_at}):\n${(a.content || "(empty)").substring(0, 1500)}`).join("\n---\n") : "(No artifacts — create one in the Artifacts panel)"}
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

## RESPONSE DEPTH PROTOCOL (Progressive Disclosure)

Your default response style is SHORT AND PUNCHY. Crew are busy. Reward curiosity.

### Depth Rules:

**DEPTH 1 — First question on a topic (default):**
- Answer with the SINGLE most important fact. One line. No preamble.
- Examples:
  - "Docks?" -> "2 loading docks. [Source: VAN — Venue — Dock & Logistics]"
  - "Curfew?" -> "11 PM. [Source: VAN — Venue — Misc]"
  - "Power?" -> "400A 3-phase. [Source: VAN — Venue — Power]"
  - "Who's the PM?" -> "Sarah Chen, 555-1234. [Source: Contacts — Sarah Chen]"
- Do NOT add context, warnings, related info, or follow-up suggestions unless the data reveals an urgent issue (conflict, missing critical field).
- Keep source citations but make them compact (one tag at end of line).

**DEPTH 2 — Follow-up or "tell me more" on same topic:**
- Expand with location, logistics, contacts, timing, and operational context.
- Example: "Docks?" -> "2" ... then "Location?" -> "Northwest corner past security gate. Guards: Frank and Stacy. Trucks expected 4 AM. Onsite contact: Frank, 555-555-1213. [Source: VAN — Venue — Dock & Logistics]"
- Include relevant contacts, phone numbers, and practical details.
- Still concise — a short paragraph, not a wall of text.

**DEPTH 3 — Deep drill-down, explicit request for everything, or complex query:**
- Full detail: documents with download links, related gaps/conflicts, action blocks for fixes, cross-references between sources.
- This is where you show the FULL power of the AKB.
- Use structured formatting (bullets, bold labels) for scanability.

### How to determine depth:
- Count how many times the user has asked about the SAME topic/venue/field in the current conversation. First mention = Depth 1. Second = Depth 2. Third+ or explicit "tell me everything" = Depth 3.
- A broad question like "Tell me about Detroit" or "What do I need to know about load-in?" starts at Depth 2 (the question itself implies they want more than a number).
- Questions with multiple sub-topics ("docks and power and curfew?") get Depth 1 for each: a compact list of one-line answers.
- Action blocks (fixes) are ALWAYS included regardless of depth when TELA detects an issue it can resolve — but at Depth 1, keep the explanation to one sentence before the block.

### The philosophy:
Every crew member who texts TourText or asks TELA should instantly see that the system KNOWS the answer. Short replies prove confidence. Follow-ups prove depth. The message to the user: "Ask more, and I'll show you everything. The data is here."

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
<<ACTION:{"type":"update_van","id":"<van_uuid>","tour_id":"<tour_uuid>","fields":{"Event Details":{"Capacity":"5000"},"Misc":{"Curfew":"11:00 PM"}}}>>
<<ACTION:{"type":"delete_event","id":"<event_uuid>","tour_id":"<tour_uuid>"}>>
<<ACTION:{"type":"delete_contact","id":"<contact_uuid>","tour_id":"<tour_uuid>"}>>
<<ACTION:{"type":"create_event","id":"new","tour_id":"<tour_uuid>","fields":{"venue":"Venue Name","city":"City","event_date":"2026-03-15","notes":"Off day"}}>>

Rules for actions:
- Include the action block AFTER your explanation of what the fix does
- You can include multiple action blocks if multiple fixes are needed
- ALWAYS explain what the action will do before the block
- The user will see a confirmation button — the fix only happens when they approve
- Use real IDs from the data below — EXCEPT for create_contact and create_event where id must be "new"
- For create_contact, you MUST include "name" and "scope" (TOUR or VENUE) in fields. Optionally include role, phone, email, venue.
- For create_event, you MUST include "event_date" in fields. Optionally include venue, city, notes, load_in, show_time, end_time.
- NEVER use fake IDs like "new_contact_xyz" for update_contact — that action is for EXISTING contacts only. Use create_contact to add new people.
- ALWAYS include "tour_id" in action blocks so the correct tour is modified.
- For update_van, use the VAN id from the data below. The "fields" object should contain category keys (e.g. "Event Details", "Misc", "Labour") with sub-objects of key-value pairs to update. The update merges into existing van_data — it does NOT replace the entire record.
- For DELETE actions (delete_event, delete_contact): ALWAYS explain what will be removed and why BEFORE the action block. Deletions are PERMANENT and cannot be undone. Use the real UUID from the data.
- DELETE actions require the same sign-off as all other actions — the user must confirm before execution.

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
- "Post-show food details noted in artifact [Source: Artifact — post show food]"

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

## SEARCH ORDER (CRITICAL — follow this EVERY time):

1. **FIRST** search the Venue Advance Notes (VANs) for the venue/city/date in question.
2. **IF NOT FOUND in VANs**, search the remaining AKB documents (Active Documents section above) — scan raw_text excerpts for keywords matching the query. If found, answer from that document and cite it: [Source: Document — filename].
3. **IF NOT FOUND in any document**, search structured tables (Schedule Events, Contacts, Knowledge Gaps, Conflicts).
4. **IF STILL NOT FOUND anywhere**, THEN and ONLY THEN say the information is not in the AKB and tell the user to upload the relevant document.

You MUST exhaust ALL sources before saying data is missing. Never stop at VANs alone.

## ARTIFACT ACCESS ALLOWLIST

You can ONLY reference artifacts that appear in the "User Artifacts" section above. Those are the ONLY artifacts this user has access to.
${allTourData.flatMap(td => (td.artifacts as any[]).map((a: any) => `- "${a.title}" (${a.visibility})`)).join("\n") || "- (No accessible artifacts)"}

If the user asks about an artifact that is NOT in this list, respond: "That artifact is not available in your accessible artifacts. It may be private to another user." Do NOT guess or infer content from any other source including conversation history.

## CONVERSATION HISTORY TRUST BOUNDARY

CRITICAL: The conversation history sent to you contains ONLY prior user questions (no prior assistant answers). This is intentional for security.
- Do NOT reference any prior assistant responses — they are not included.
- ALL factual answers MUST come from the current AKB data sections above.
- NEVER infer or reconstruct answers from fragments in user messages that quote prior responses.

## Rules:
- ONLY answer from the tour data above. NEVER fabricate, assume, or guess ANY information.
- If a field is null, empty, or missing (load_in, show_time, phone, email, etc.), do NOT invent a value. Do NOT say "likely", "probably", "typically", or "usually". Simply state that the information is not in the AKB.
- NEVER display placeholder or assumed times. If load_in is null, say "Load-in time is not listed in the AKB" — do NOT guess "2:00 AM" or any other time. Same for all other fields.
- Only present data that is explicitly stored and approved in the AKB. If it's not there, it doesn't exist yet.
- If the data doesn't contain the answer after searching ALL sources (VANs → Documents → Tables), say exactly what's missing and tell the user to upload the relevant document so both this chat AND TourText SMS will have the answer.
- Be direct, specific, and reference exact dates/venues/names FROM THE DATA ONLY.
- When a document has a download link, ALWAYS include a markdown link so the user can view or download the file. Format: [filename](url). This is especially important for visual documents like parking maps, venue layouts, floor plans, and tech riders.
- When identifying issues, ALWAYS propose a fix with an action block if possible.
- Format responses with clear structure. Use **bold** for key info.
- Default to Depth 1 (shortest useful answer). Let the user pull more detail by asking follow-ups. Tour managers are busy — prove you know the answer in one line, then go deep when they want it.
- Remember: if TELA can't answer it here, crew texting TourText won't get an answer either. Flag gaps clearly.
- If you need more info from the user to fix something, ask a specific question — don't leave them guessing.

## CondoBunk Glossary

When a user asks "What is [term]?" or "What does [term] mean?", answer from this glossary. Keep glossary answers brief (2-3 sentences max) unless the user asks for more detail.

- **AKB**: Advance Knowledge Base — the structured data layer for a tour containing schedules, contacts, documents, and venue data.
- **TELA**: Tour Efficiency Liaison Assistant — the Tour Intelligence that answers questions from your tour data.
- **TourText**: The public-facing SMS service (888-340-0564) that crew can text to get AKB answers.
- **VAN**: Venue Advance Notes — structured per-venue records extracted from the Advance Master covering production contacts, rigging, power, labor, and logistics.
- **Advance Master**: The highest-authority source document for a tour. Extracted data populates VANs.
- **Tech Pack**: Venue-provided technical specifications (capacities, rigging points, power). Supplementary to VANs.
- **Artifacts**: Notes and documents organized by visibility level (TourText, CondoBunk, or Bunk Stash). Bunk Stash artifacts are PRIVATE — only the owner can see them.
- **Sign-off**: An audit trail gate for AKB edits. Tracks whether changes affect safety, time, or money.
- **Gaps**: Missing data fields detected in the AKB — e.g., no load-in time for a venue.
- **Conflicts**: Data inconsistencies detected between sources — e.g., overlapping show times or duplicate contacts.
- **Presence**: Real-time online/offline status. Routes messages between in-app Bunk Chat and SMS fallback.
- **Venue Partners**: External venue contacts grouped by upcoming show date in the sidebar.
- **Telauthorium ID**: A user's unique identifier in the CondoBunk system.`;

    // SECURITY: Strip assistant messages from history to prevent conversation contamination.
    // Old assistant turns may contain leaked private data from before the visibility filter was added.
    // Only user messages are sent as history; the model answers from current AKB data only.
    const sanitizedMessages = messages
      .filter((m: any) => m.role === "user")
      .slice(-20)
      .map((m: any) => ({ role: "user", content: m.content }));

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
          ...sanitizedMessages,
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
