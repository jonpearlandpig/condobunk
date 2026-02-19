import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Domain Detection Engine (Deterministic) ───

const FILENAME_HINTS: Record<string, string[]> = {
  SCHEDULE: ["schedule", "itinerary", "routing", "dates", "calendar"],
  CONTACTS: ["contacts", "directory", "crew", "roster", "personnel"],
  RUN_OF_SHOW: ["ros", "run of show", "runofshow", "runsheet", "cue"],
  FINANCE: ["budget", "settlement", "p&l", "pnl", "finance", "expenses"],
  TRAVEL: ["travel", "flights", "hotel", "transport", "logistics"],
  TECH: ["rider", "stage plot", "tech", "production", "audio", "lighting"],
  HOSPITALITY: ["hospitality", "catering", "hotel", "accommodation"],
  CAST: ["cast", "artist", "talent", "performer"],
  VENUE: ["venue", "room", "hall", "arena", "theater"],
};

const KEYWORD_SETS: Record<string, string[]> = {
  SCHEDULE: [
    "load-in", "load in", "doors", "show", "soundcheck", "curfew",
    "venue", "city", "date", "set time", "showtime", "downbeat",
  ],
  CONTACTS: [
    "phone", "email", "cell", "ext", "manager", "production",
    "foh", "monitor", "ld", "rigger", "tm", "promoter", "@",
  ],
  RUN_OF_SHOW: [
    "act", "intro", "walk-on", "cues", "setlist", "segment",
    "timecode", "blackout", "encore", "intermission",
  ],
  FINANCE: [
    "gross", "net", "guarantee", "settlement", "expenses",
    "labor", "catering", "hotel", "per diem", "merch", "$",
  ],
  TRAVEL: [
    "flight", "depart", "arrive", "hotel", "check-in",
    "checkout", "bus", "van", "driver", "pickup",
  ],
};

interface DomainResult {
  doc_type: string;
  confidence: number;
  scores: Record<string, number>;
}

function detectDomain(filename: string, text: string): DomainResult {
  const fn = filename.toLowerCase();
  const lowerText = text.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [dtype, hints] of Object.entries(FILENAME_HINTS)) {
    scores[dtype] = (scores[dtype] || 0);
    for (const hint of hints) {
      if (fn.includes(hint)) {
        scores[dtype] += 0.45;
        break;
      }
    }
  }

  for (const [dtype, keywords] of Object.entries(KEYWORD_SETS)) {
    let matched = 0;
    for (const kw of keywords) {
      if (lowerText.includes(kw)) matched++;
    }
    const kwScore = Math.min(matched / Math.max(keywords.length * 0.4, 1), 1) * 0.35;
    scores[dtype] = (scores[dtype] || 0) + kwScore;
  }

  const timePattern = /\b\d{1,2}:\d{2}\s*(am|pm|AM|PM)?\b/g;
  const emailPattern = /[\w.+-]+@[\w-]+\.[\w.]+/g;
  const phonePattern = /(\+1|1)?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
  const currencyPattern = /\$[\d,.]+/g;

  const timeCount = (lowerText.match(timePattern) || []).length;
  const emailCount = (text.match(emailPattern) || []).length;
  const phoneCount = (text.match(phonePattern) || []).length;
  const currencyCount = (text.match(currencyPattern) || []).length;

  if (timeCount > 5) {
    scores["SCHEDULE"] = (scores["SCHEDULE"] || 0) + 0.15;
    scores["RUN_OF_SHOW"] = (scores["RUN_OF_SHOW"] || 0) + 0.10;
  }
  if (emailCount > 3 || phoneCount > 3) {
    scores["CONTACTS"] = (scores["CONTACTS"] || 0) + 0.20;
  }
  if (currencyCount > 3) {
    scores["FINANCE"] = (scores["FINANCE"] || 0) + 0.20;
  }

  let topType = "UNKNOWN";
  let topScore = 0;
  for (const [dtype, score] of Object.entries(scores)) {
    if (score > topScore) {
      topScore = score;
      topType = dtype;
    }
  }

  if (topScore < 0.30) topType = "UNKNOWN";
  return { doc_type: topType, confidence: topScore, scores };
}

// ─── AI-Powered Structured Extraction ───

const EXTRACTION_PROMPT = `You are a tour document extraction engine. Analyze the following tour document and extract ALL structured data you can find.

Return a JSON object with these fields (include only what you find, omit empty arrays):

{
  "tour_name": "Artist Name — Tour Name" or null,
  "doc_type": "SCHEDULE" | "CONTACTS" | "RUN_OF_SHOW" | "FINANCE" | "TRAVEL" | "TECH" | "HOSPITALITY" | "LOGISTICS" | "CAST" | "VENUE" | "UNKNOWN",
  "schedule_events": [
    {
      "event_date": "YYYY-MM-DD",
      "city": "City Name",
      "venue": "Venue Name",
      "load_in": "HH:MM" (24h),
      "show_time": "HH:MM" (24h),
      "end_time": "HH:MM" (24h),
      "doors": "HH:MM" (24h),
      "soundcheck": "HH:MM" (24h),
      "notes": "any special notes for this date"
    }
  ],
  "contacts": [
    {
      "name": "Full Name",
      "role": "ROLE TITLE",
      "phone": "phone number",
      "email": "email@domain.com"
    }
  ],
  "travel": [
    {
      "date": "YYYY-MM-DD",
      "type": "FLIGHT" | "BUS" | "VAN" | "HOTEL" | "OTHER",
      "description": "Details",
      "departure": "departure location or time",
      "arrival": "arrival location or time",
      "hotel_name": "hotel name if applicable",
      "hotel_checkin": "YYYY-MM-DD",
      "hotel_checkout": "YYYY-MM-DD",
      "confirmation": "confirmation number if found"
    }
  ],
  "finance": [
    {
      "category": "Category name",
      "amount": 1234.56,
      "venue": "venue if applicable",
      "line_date": "YYYY-MM-DD if applicable"
    }
  ],
  "protocols": [
    {
      "category": "SECURITY" | "HOSPITALITY" | "PRODUCTION" | "CATERING" | "DRESSING_ROOM" | "OTHER",
      "title": "Protocol title",
      "details": "Full protocol text/requirements"
    }
  ],
  "venues": [
    {
      "name": "Venue Name",
      "city": "City",
      "state": "State/Province",
      "capacity": 1234,
      "address": "Full address if available",
      "contact_name": "Venue contact",
      "contact_phone": "phone",
      "contact_email": "email",
      "notes": "any venue-specific notes"
    }
  ]
}

IMPORTANT RULES:
- Extract EVERYTHING you can find, even partial data
- For dates, always use YYYY-MM-DD format. If only month/day given, assume the most likely year
- For times, use 24-hour HH:MM format
- For contacts, capture ALL people mentioned with any identifying info
- For travel, capture flights, buses, hotels, ground transport — anything
- For protocols, capture rider requirements, security protocols, hospitality needs, dressing room requirements, catering specs
- Return ONLY valid JSON, no markdown formatting, no code blocks
- If the document covers multiple categories (schedule + contacts + travel), extract ALL of them`;

interface AIExtractionResult {
  tour_name?: string | null;
  doc_type?: string;
  schedule_events?: Array<{
    event_date?: string;
    city?: string;
    venue?: string;
    load_in?: string;
    show_time?: string;
    end_time?: string;
    doors?: string;
    soundcheck?: string;
    notes?: string;
  }>;
  contacts?: Array<{
    name: string;
    role?: string;
    phone?: string;
    email?: string;
  }>;
  travel?: Array<{
    date?: string;
    type?: string;
    description?: string;
    departure?: string;
    arrival?: string;
    hotel_name?: string;
    hotel_checkin?: string;
    hotel_checkout?: string;
    confirmation?: string;
  }>;
  finance?: Array<{
    category?: string;
    amount?: number;
    venue?: string;
    line_date?: string;
  }>;
  protocols?: Array<{
    category?: string;
    title?: string;
    details?: string;
  }>;
  venues?: Array<{
    name?: string;
    city?: string;
    state?: string;
    capacity?: number;
    address?: string;
    contact_name?: string;
    contact_phone?: string;
    contact_email?: string;
    notes?: string;
  }>;
}

// Single AI call: extract structured data directly from PDF or text
async function aiExtractFromPdf(base64: string, apiKey: string): Promise<AIExtractionResult | null> {
  try {
    console.log("[extract] Single-pass PDF structured extraction...");
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: EXTRACTION_PROMPT },
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${base64}` },
              },
            ],
          },
        ],
      }),
    });

    console.log("[extract] PDF extraction response status:", resp.status);
    if (!resp.ok) {
      const errBody = await resp.text();
      console.error("[extract] PDF extraction failed:", resp.status, errBody);
      return null;
    }

    const data = await resp.json();
    let content = data.choices?.[0]?.message?.content || "";
    content = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    return JSON.parse(content);
  } catch (err) {
    console.error("[extract] PDF structured extraction failed:", err);
    return null;
  }
}

async function aiExtractFromText(text: string, apiKey: string): Promise<AIExtractionResult | null> {
  try {
    console.log("[extract] Text structured extraction...");
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: EXTRACTION_PROMPT },
          { role: "user", content: text.substring(0, 60000) },
        ],
      }),
    });

    if (!resp.ok) {
      console.error("[extract] Text extraction API error:", resp.status);
      return null;
    }

    const data = await resp.json();
    let content = data.choices?.[0]?.message?.content || "";
    content = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    return JSON.parse(content);
  } catch (err) {
    console.error("[extract] Text extraction failed:", err);
    return null;
  }
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");

    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { document_id } = await req.json();
    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch document
    const { data: doc, error: docErr } = await adminClient
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .single();

    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is tour member
    const { data: membership } = await adminClient
      .from("tour_members")
      .select("role")
      .eq("tour_id", doc.tour_id)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["TA", "MGMT"].includes(membership.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let rawText = doc.raw_text || "";
    const filename = doc.filename || "";
    let aiResult: AIExtractionResult | null = null;

    // ── Single-pass extraction: PDF goes directly to structured extraction ──
    if (!rawText && doc.file_path && apiKey) {
      const { data: fileData, error: dlErr } = await adminClient.storage
        .from("document-files")
        .download(doc.file_path);

      if (!dlErr && fileData) {
        const isPdf = filename.toLowerCase().endsWith(".pdf");

        if (isPdf) {
          // Convert to base64 with chunked encoding
          const arrayBuf = await fileData.arrayBuffer();
          const bytes = new Uint8Array(arrayBuf);
          let binary = "";
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          const base64 = btoa(binary);
          console.log("[extract] PDF size:", bytes.length, "bytes, base64 length:", base64.length);

          // SINGLE AI call: send PDF directly for structured extraction
          aiResult = await aiExtractFromPdf(base64, apiKey);

          if (aiResult) {
            console.log("[extract] Single-pass extraction keys:", Object.keys(aiResult));
          }
        } else {
          rawText = await fileData.text();
        }
      }
    }

    // For text files or if PDF single-pass failed, do text-based extraction
    if (!aiResult && rawText && apiKey) {
      aiResult = await aiExtractFromText(rawText, apiKey);
    }

    // If we got text but no AI key, at least save raw text
    if (rawText && !doc.raw_text) {
      await adminClient
        .from("documents")
        .update({ raw_text: rawText })
        .eq("id", document_id);
    }

    if (!aiResult) {
      // Fallback: try deterministic domain detection on whatever text we have
      if (rawText) {
        const domain = detectDomain(filename, rawText);
        await adminClient
          .from("documents")
          .update({ doc_type: domain.doc_type })
          .eq("id", document_id);
        return new Response(JSON.stringify({
          doc_type: domain.doc_type,
          domain_confidence: domain.confidence,
          extracted_count: 0,
          tour_name: null,
          summary: { events: 0, contacts: 0, travel: 0, finance: 0, protocols: 0, venues: 0 },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ error: "Could not extract from document" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Domain detection for doc_type ──
    const domain = detectDomain(filename, rawText || JSON.stringify(aiResult));
    const finalDocType = domain.confidence >= 0.30
      ? domain.doc_type
      : (aiResult?.doc_type || domain.doc_type);

    await adminClient
      .from("documents")
      .update({ doc_type: finalDocType })
      .eq("id", document_id);

    // ── Update tour name ──
    const extractedTourName = aiResult?.tour_name || null;
    if (extractedTourName) {
      const { data: tourData } = await adminClient
        .from("tours")
        .select("name")
        .eq("id", doc.tour_id)
        .single();
      if (tourData && tourData.name.startsWith("New Tour")) {
        await adminClient
          .from("tours")
          .update({ name: extractedTourName })
          .eq("id", doc.tour_id);
      }
    }

    // ── Persist extracted entities ──
    let totalExtracted = 0;

    // Schedule events - batch insert
    const events = aiResult?.schedule_events || [];
    if (events.length > 0) {
      const toTimestamp = (date: string | undefined, time: string | undefined): string | null => {
        if (!date || !time) return null;
        return `${date}T${time}:00`;
      };

      const rows = events.map(evt => ({
        tour_id: doc.tour_id,
        city: evt.city || null,
        venue: evt.venue || null,
        event_date: evt.event_date || null,
        load_in: toTimestamp(evt.event_date, evt.load_in),
        show_time: toTimestamp(evt.event_date, evt.show_time),
        end_time: toTimestamp(evt.event_date, evt.end_time),
        confidence_score: 0.85,
        source_doc_id: document_id,
      }));

      const { error: evtErr } = await adminClient.from("schedule_events").insert(rows);
      if (evtErr) console.error("[extract] schedule_events insert error:", evtErr);
      else console.log("[extract] Inserted", events.length, "schedule events");
      totalExtracted += events.length;
    }

    // Contacts - batch insert
    const contacts = aiResult?.contacts || [];
    if (contacts.length > 0) {
      const rows = contacts.map(c => ({
        tour_id: doc.tour_id,
        name: c.name,
        phone: c.phone || null,
        email: c.email || null,
        role: c.role || null,
        source_doc_id: document_id,
      }));

      const { error: cErr } = await adminClient.from("contacts").insert(rows);
      if (cErr) console.error("[extract] contacts insert error:", cErr);
      else console.log("[extract] Inserted", contacts.length, "contacts");
      totalExtracted += contacts.length;
    }

    // Finance - batch insert
    const finance = aiResult?.finance || [];
    if (finance.length > 0) {
      const rows = finance.map(fl => ({
        tour_id: doc.tour_id,
        category: fl.category || "Uncategorized",
        amount: fl.amount || null,
        venue: fl.venue || null,
        line_date: fl.line_date || null,
      }));
      await adminClient.from("finance_lines").insert(rows);
      totalExtracted += finance.length;
    }

    // Travel — store as knowledge gaps
    const travel = aiResult?.travel || [];
    if (travel.length > 0) {
      const rows = travel.map(t => ({
        tour_id: doc.tour_id,
        question: `[TRAVEL ${t.date || ""}] ${[
          t.type || "",
          t.description || "",
          t.hotel_name ? `Hotel: ${t.hotel_name}` : "",
          t.departure ? `From: ${t.departure}` : "",
          t.arrival ? `To: ${t.arrival}` : "",
          t.confirmation ? `Conf#: ${t.confirmation}` : "",
        ].filter(Boolean).join(" | ")}`,
        domain: "TRAVEL",
        resolved: true,
        user_id: user.id,
      }));
      await adminClient.from("knowledge_gaps").insert(rows);
      totalExtracted += travel.length;
    }

    // Protocols
    const protocols = aiResult?.protocols || [];
    if (protocols.length > 0) {
      const rows = protocols.map(p => ({
        tour_id: doc.tour_id,
        question: `[${p.category || "PROTOCOL"}] ${p.title || "Protocol"}: ${p.details || ""}`,
        domain: p.category || "PROTOCOL",
        resolved: true,
        user_id: user.id,
      }));
      await adminClient.from("knowledge_gaps").insert(rows);
      totalExtracted += protocols.length;
    }

    // ── Activate document ──
    if (totalExtracted > 0) {
      await adminClient
        .from("documents")
        .update({ is_active: false })
        .eq("tour_id", doc.tour_id)
        .eq("doc_type", finalDocType)
        .neq("id", document_id);

      await adminClient
        .from("documents")
        .update({ is_active: true })
        .eq("id", document_id);
    }

    const result = {
      doc_type: finalDocType,
      domain_confidence: domain.confidence,
      extracted_count: totalExtracted,
      tour_name: extractedTourName,
      summary: {
        events: events.length,
        contacts: contacts.length,
        travel: travel.length,
        finance: finance.length,
        protocols: protocols.length,
        venues: (aiResult?.venues || []).length,
      },
    };

    console.log("[extract] Final result:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[extract] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
