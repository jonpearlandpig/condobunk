import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Canonical venue schema for extraction ── */

const VENUE_SCHEMA_CATEGORIES = {
  venue_identity: [
    "venue_name", "venue_address", "venue_city", "venue_state",
    "venue_phone", "venue_website", "venue_mode", "onsale_capacity",
  ],
  contacts: [
    "production_contact_name", "production_contact_phone", "production_contact_email",
    "production_contact_notes",
    "house_rigger_name", "house_rigger_phone", "house_rigger_email", "house_rigger_notes",
    "general_manager_name", "technical_director_name",
    "box_office_contact", "security_contact", "catering_contact",
  ],
  access_logistics: [
    "dock_address", "dock_access_notes", "truck_limitations", "truck_parking",
    "bus_parking", "bus_arrival_time", "load_in_path", "freight_elevator_notes",
    "shore_power_available", "catering_truck_power_notes",
  ],
  schedule_rules: [
    "load_in_call_time", "show_call", "show_times", "chair_set", "labor_call_back",
    "standard_load_in_time", "curfew", "noise_restrictions", "local_labor_notes",
    "union_house", "union_venue", "union_notes", "credentials_process", "after_hours_rules",
  ],
  stage_rigging: [
    "stage_width", "stage_depth", "stage_height", "trim_height",
    "low_steel", "distance_to_low_steel",
    "rigging_capacity", "rigging_notes", "rigging_submission_deadline",
    "rigging_overlay_submitted", "venue_cad_received",
  ],
  power_technical: [
    "shore_power", "shore_power_notes", "stage_power",
    "audio_power_notes", "lighting_power_notes",
    "tie_lines", "house_comms", "internet_availability",
    "co2_allowed", "co2_confirmed",
    "forklift_5k_confirmed", "forklift_3k_confirmed",
  ],
  lighting_audio_video: [
    "house_followspots", "robo_spots", "house_console_audio", "house_console_lighting",
    "projection_available", "led_wall_notes", "video_input_notes", "camera_policy",
    "followspot_notes",
  ],
  atmospherics: [
    "haze_allowed", "pyro_allowed", "flame_allowed",
    "confetti_allowed", "fx_notes",
  ],
  hospitality: [
    "dressing_rooms", "laundry", "showers", "catering_space", "hospitality_notes",
    "lunch_headcount", "dinner_headcount",
    "house_electrician_catering_truck",
  ],
  labor: [
    "labor_call", "labor_notes", "labor_estimate_received",
  ],
  settlement: [
    "estimated_labor_cost", "estimated_rigging_cost", "estimated_forklift_cost",
    "estimated_power_cost", "settlement_notes", "cost_risk_notes",
  ],
  emergency: [
    "emergency_access_notes", "medical_notes", "restricted_areas", "special_restrictions",
  ],
};

/* ── Alias map: extraction keys → template field keys ── */
const FIELD_KEY_ALIASES: Record<string, string> = {
  low_steel: "distance_to_low_steel",
  union_house: "union_venue",
  standard_load_in_time: "load_in_call_time",
  co2_allowed: "co2_confirmed",
  shore_power: "shore_power_notes",
  shore_power_available: "shore_power_notes",
  catering_truck_power_notes: "house_electrician_catering_truck",
  local_labor_notes: "labor_notes",
};

const SCHEMA_DESCRIPTION = Object.entries(VENUE_SCHEMA_CATEGORIES)
  .map(([cat, fields]) => `## ${cat}\n${fields.join(", ")}`)
  .join("\n\n");

/* ── AI Tool definitions ── */

const extractionTool = {
  type: "function" as const,
  function: {
    name: "extract_venue_data",
    description: "Extract structured venue data from a technical packet / production book. Return every field you can identify with value and confidence.",
    parameters: {
      type: "object",
      properties: {
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field_key: { type: "string", description: "Canonical field key from the schema" },
              value: { type: "string", description: "Extracted value" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              source_snippet: { type: "string", description: "Brief quote from source supporting the value" },
              page_ref: { type: "string", description: "Page or section reference if identifiable" },
            },
            required: ["field_key", "value", "confidence"],
            additionalProperties: false,
          },
        },
      },
      required: ["fields"],
      additionalProperties: false,
    },
  },
};

const intelligenceTool = {
  type: "function" as const,
  function: {
    name: "generate_intelligence",
    description: "Generate venue advance intelligence report from extracted venue data. Assess operational fit, flag risks, identify unknowns, and draft questions.",
    parameters: {
      type: "object",
      properties: {
        venue_capability_summary: { type: "string", description: "2-4 sentence operational summary of what the venue can support" },
        green_lights: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              category: { type: "string" },
            },
            required: ["text"],
            additionalProperties: false,
          },
        },
        yellow_flags: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              category: { type: "string" },
            },
            required: ["text"],
            additionalProperties: false,
          },
        },
        red_flags: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              category: { type: "string" },
            },
            required: ["text"],
            additionalProperties: false,
          },
        },
        missing_unknown: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              category: { type: "string" },
            },
            required: ["text"],
            additionalProperties: false,
          },
        },
        draft_advance_questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              category: { type: "string" },
            },
            required: ["text"],
            additionalProperties: false,
          },
        },
        draft_internal_notes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              category: { type: "string" },
            },
            required: ["text"],
            additionalProperties: false,
          },
        },
      },
      required: [
        "venue_capability_summary", "green_lights", "yellow_flags",
        "red_flags", "missing_unknown", "draft_advance_questions", "draft_internal_notes",
      ],
      additionalProperties: false,
    },
  },
};

/* ── Text extraction helpers ── */

function extractTextFromBinaryPdf(bytes: Uint8Array): string {
  // Simple text extraction from PDF streams
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);
  const textChunks: string[] = [];

  // Extract text between BT...ET blocks
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1];
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      textChunks.push(tjMatch[1]);
    }
    const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
    let tjArrMatch;
    while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
      const inner = tjArrMatch[1];
      const parts = inner.match(/\(([^)]*)\)/g);
      if (parts) {
        textChunks.push(parts.map((p: string) => p.slice(1, -1)).join(""));
      }
    }
  }

  return textChunks.join(" ").replace(/\s+/g, " ").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    /* ── 1. Auth ── */
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    /* ── 2. Parse body ── */
    const { show_advance_id, document_ids } = await req.json();
    if (!show_advance_id) {
      return new Response(JSON.stringify({ error: "show_advance_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawDocumentIds = Array.isArray(document_ids) ? document_ids : [];
    const validDocumentIds = rawDocumentIds.filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0,
    );
    const hadInvalidDocumentIds = rawDocumentIds.length > 0 && validDocumentIds.length === 0;

    const adminClient = createClient(supabaseUrl, serviceRole);

    /* ── 3. Verify membership ── */
    const { data: showAdv, error: showErr } = await adminClient
      .from("show_advances").select("id, tour_id, venue_name").eq("id", show_advance_id).single();
    if (showErr || !showAdv) {
      return new Response(JSON.stringify({ error: "Show advance not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: membership } = await adminClient
      .from("tour_members").select("id, role")
      .eq("tour_id", showAdv.tour_id).eq("user_id", userId).limit(1);
    if (!membership?.length) {
      return new Response(JSON.stringify({ error: "Not a tour member" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (![("TA"), ("MGMT")].includes(membership[0].role)) {
      return new Response(JSON.stringify({ error: "Admin or management role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── 4. Load docs to process ── */
    let docsQuery = adminClient
      .from("advance_venue_docs")
      .select("*")
      .eq("show_advance_id", show_advance_id);

    if (validDocumentIds.length) {
      docsQuery = docsQuery.in("id", validDocumentIds);
    } else if (hadInvalidDocumentIds) {
      console.warn("Received invalid document_ids payload; falling back to re-runnable docs", rawDocumentIds);
      docsQuery = docsQuery.in("processing_status", ["uploaded", "failed", "complete"]);
    } else {
      docsQuery = docsQuery.in("processing_status", ["uploaded", "failed"]);
    }

    const { data: docs, error: docsErr } = await docsQuery;
    if (docsErr || !docs?.length) {
      return new Response(JSON.stringify({ error: "No documents to process" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── 5. Process each document ── */
    const extractionResults: any[] = [];
    let docsProcessed = 0;
    let docsFailed = 0;

    for (const doc of docs) {
      try {
        // Mark as processing
        await adminClient.from("advance_venue_docs")
          .update({ processing_status: "processing" })
          .eq("id", doc.id);

        // Fetch file from storage
        const { data: fileData, error: fileErr } = await adminClient.storage
          .from("document-files")
          .download(doc.file_path);

        if (fileErr || !fileData) {
          throw new Error(`Failed to download file: ${fileErr?.message || "unknown"}`);
        }

        // Extract text based on file type
        let text = "";
        const ext = (doc.file_name || "").split(".").pop()?.toLowerCase();

        if (ext === "pdf") {
          const bytes = new Uint8Array(await fileData.arrayBuffer());
          text = extractTextFromBinaryPdf(bytes);
          if (text.length < 50) {
            // Fallback: try reading as text
            text = await fileData.text();
          }
        } else if (ext === "xlsx" || ext === "xls") {
          // Try to import XLSX
          try {
            const { default: XLSX } = await import("npm:xlsx@0.18.5/xlsx.mjs");
            const bytes = new Uint8Array(await fileData.arrayBuffer());
            const wb = XLSX.read(bytes, { type: "array" });
            const sheets = wb.SheetNames.map((name: string) => {
              const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
              return `--- Sheet: ${name} ---\n${csv}`;
            });
            text = sheets.join("\n\n");
          } catch {
            text = await fileData.text();
          }
        } else {
          text = await fileData.text();
        }

        if (!text || text.trim().length < 20) {
          throw new Error("Document text too short or empty after extraction");
        }

        // Truncate to ~60k chars to stay within AI context
        const truncatedText = text.slice(0, 60000);

        // Call AI for structured extraction
        const extractionPrompt = `You are a venue technical packet parser for live event production.

Extract structured venue data from this document into canonical fields.

CANONICAL VENUE SCHEMA:
${SCHEMA_DESCRIPTION}

RULES:
- Extract ONLY values clearly supported by the document
- Return null/skip fields not found — NEVER fabricate
- Assign confidence: high (clearly stated), medium (inferred from context), low (ambiguous)
- Include source snippet where possible
- For boolean-like fields (union_house, haze_allowed etc), use "yes"/"no"/"approval required" as values`;

        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-pro",
            messages: [
              { role: "system", content: extractionPrompt },
              { role: "user", content: `Document: ${doc.file_name} (${doc.document_category})\n\n---\n\n${truncatedText}` },
            ],
            tools: [extractionTool],
            tool_choice: { type: "function", function: { name: "extract_venue_data" } },
          }),
        });

        if (!aiResp.ok) {
          const status = aiResp.status;
          if (status === 429) {
            throw new Error("AI_RATE_LIMIT");
          }
          if (status === 402) {
            throw new Error("AI_PAYMENT_REQUIRED");
          }
          throw new Error(`AI error: ${status}`);
        }

        const aiData = await aiResp.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall) throw new Error("AI returned no extraction");

        const extracted = JSON.parse(toolCall.function.arguments);
        const fields = extracted.fields || [];

        // Build structured data and confidence maps
        const extractedData: Record<string, any> = {};
        const confidenceMap: Record<string, any> = {};

        for (const f of fields) {
          extractedData[f.field_key] = f.value;
          confidenceMap[f.field_key] = {
            confidence: f.confidence,
            source_snippet: f.source_snippet || null,
            page_ref: f.page_ref || null,
            source_doc: doc.file_name,
          };
        }

        // Upsert extraction
        const { data: existingExtraction } = await adminClient
          .from("advance_venue_extractions")
          .select("id")
          .eq("document_id", doc.id)
          .limit(1);

        if (existingExtraction?.length) {
          await adminClient.from("advance_venue_extractions")
            .update({ extracted_data: extractedData, extraction_confidence: confidenceMap, processed_at: new Date().toISOString() })
            .eq("id", existingExtraction[0].id);
        } else {
          await adminClient.from("advance_venue_extractions").insert({
            show_advance_id,
            document_id: doc.id,
            extracted_data: extractedData,
            extraction_confidence: confidenceMap,
          });
        }

        // Mark doc as complete
        await adminClient.from("advance_venue_docs")
          .update({ processing_status: "complete", processed_at: new Date().toISOString(), processing_error: null })
          .eq("id", doc.id);

        extractionResults.push({ doc_id: doc.id, fields_extracted: fields.length, extracted_data: extractedData });
        docsProcessed++;

      } catch (err: any) {
        const errMsg = err?.message || "Unknown error";
        console.error(`Failed to process doc ${doc.id}:`, errMsg);

        await adminClient.from("advance_venue_docs")
          .update({ processing_status: "failed", processing_error: errMsg })
          .eq("id", doc.id);
        docsFailed++;

        // Propagate rate limit / payment errors
        if (errMsg === "AI_RATE_LIMIT") {
          return new Response(JSON.stringify({ error: "AI rate limit exceeded", code: "AI_RATE_LIMIT" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (errMsg === "AI_PAYMENT_REQUIRED") {
          return new Response(JSON.stringify({ error: "AI credits exhausted", code: "AI_PAYMENT_REQUIRED" }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    /* ── 5b. Map extracted data → advance_fields ── */
    // Load all advance fields for this show
    const { data: advanceFields } = await adminClient
      .from("advance_fields")
      .select("id, field_key, status, locked_boolean")
      .eq("show_advance_id", show_advance_id);

    if (advanceFields?.length) {
      // Merge all extraction results into one map (last doc wins per key)
      const mergedExtracted: Record<string, { value: string; confidence: string }> = {};
      for (const result of extractionResults) {
        for (const [key, val] of Object.entries(result.extracted_data as Record<string, any>)) {
          if (val !== null && val !== undefined && val !== "") {
            mergedExtracted[key] = { value: String(val), confidence: "medium" };
          }
        }
      }

      // Build reverse alias map: template key → all extraction keys that map to it
      const reverseAliases: Record<string, string[]> = {};
      for (const [extractionKey, templateKey] of Object.entries(FIELD_KEY_ALIASES)) {
        if (!reverseAliases[templateKey]) reverseAliases[templateKey] = [];
        reverseAliases[templateKey].push(extractionKey);
      }

      let fieldsUpdated = 0;
      for (const field of advanceFields) {
        // Skip confirmed+locked fields (human decisions preserved)
        if (field.status === "confirmed" && field.locked_boolean) continue;

        // Try exact match first, then check aliases
        let extracted = mergedExtracted[field.field_key];
        if (!extracted) {
          // Check if any extraction key aliases to this template field_key
          const aliasKeys = reverseAliases[field.field_key] || [];
          for (const ak of aliasKeys) {
            if (mergedExtracted[ak]) {
              extracted = mergedExtracted[ak];
              break;
            }
          }
        }
        if (!extracted) continue;

        const confScore = extracted.confidence === "high" ? 0.9 : extracted.confidence === "medium" ? 0.7 : 0.5;
        const flagLevel = confScore >= 0.7 ? "none" : "yellow";

        await adminClient.from("advance_fields")
          .update({
            current_value: extracted.value,
            status: "needs_confirmation",
            confidence_score: confScore,
            flag_level: flagLevel,
            updated_at: new Date().toISOString(),
          })
          .eq("id", field.id);
        fieldsUpdated++;
      }
      console.log(`Mapped ${fieldsUpdated} extracted values to advance_fields (of ${advanceFields.length} total)`);
    }

    if (docsProcessed === 0) {
      return new Response(JSON.stringify({
        error: "All documents failed to process",
        docs_failed: docsFailed,
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    /* ── 6. Merge all extractions and generate intelligence ── */
    const { data: allExtractions } = await adminClient
      .from("advance_venue_extractions")
      .select("*")
      .eq("show_advance_id", show_advance_id);

    // Merge: latest extraction wins per field
    const mergedData: Record<string, any> = {};
    const mergedConfidence: Record<string, any> = {};

    for (const ext of (allExtractions || []).sort((a: any, b: any) =>
      new Date(a.processed_at).getTime() - new Date(b.processed_at).getTime()
    )) {
      const data = ext.extracted_data as Record<string, any>;
      const conf = ext.extraction_confidence as Record<string, any>;
      for (const [k, v] of Object.entries(data)) {
        if (v !== null && v !== undefined && v !== "") {
          mergedData[k] = v;
          if (conf[k]) mergedConfidence[k] = conf[k];
        }
      }
    }

    // Generate intelligence report
    const allFieldKeys = Object.values(VENUE_SCHEMA_CATEGORIES).flat();
    const foundFields = Object.keys(mergedData);
    const missingFields = allFieldKeys.filter(k => !foundFields.includes(k));

    const intelligencePrompt = `You are a production advance intelligence analyst for live touring.

Given extracted venue data from technical packets, generate an advance intelligence report.

EXTRACTED VENUE DATA:
${JSON.stringify(mergedData, null, 2)}

VENUE: ${showAdv.venue_name || "Unknown"}

MISSING FIELDS (not found in any document):
${missingFields.join(", ")}

RULES:
- Assess operational fit of this venue for a standard touring production
- Green lights: items clearly supported
- Yellow flags: items needing confirmation or potentially tight
- Red flags: likely conflicts, restrictions, or production risks
- Missing/unknown: critical items not confirmed in any packet
- Draft advance questions: ready-to-send questions for venue production contact
- Draft internal notes: notes for TM/PM/LD/Audio/Video/Carp/Logistics
- Be specific and actionable — no vague platitudes
- Reference actual extracted values where relevant`;

    const intelResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: intelligencePrompt },
          { role: "user", content: "Generate the advance intelligence report." },
        ],
        tools: [intelligenceTool],
        tool_choice: { type: "function", function: { name: "generate_intelligence" } },
      }),
    });

    if (!intelResp.ok) {
      console.error("Intelligence generation failed:", intelResp.status);
      // Still return success for extraction even if intelligence fails
      return new Response(JSON.stringify({
        docs_processed: docsProcessed,
        docs_failed: docsFailed,
        intelligence_generated: false,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const intelData = await intelResp.json();
    const intelToolCall = intelData.choices?.[0]?.message?.tool_calls?.[0];

    if (intelToolCall) {
      const intel = JSON.parse(intelToolCall.function.arguments);

      // Upsert intelligence report — preserve edited_* columns
      const { data: existingReport } = await adminClient
        .from("advance_intelligence_reports")
        .select("id, edited_questions, edited_internal_notes")
        .eq("show_advance_id", show_advance_id)
        .limit(1);

      const reportData = {
        show_advance_id,
        venue_capability_summary: intel.venue_capability_summary || null,
        comparison_results: [],
        green_lights: intel.green_lights || [],
        yellow_flags: intel.yellow_flags || [],
        red_flags: intel.red_flags || [],
        missing_unknown: intel.missing_unknown || [],
        draft_advance_questions: intel.draft_advance_questions || [],
        draft_internal_notes: intel.draft_internal_notes || [],
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        generated_by: userId,
      };

      if (existingReport?.length) {
        // Preserve human edits
        await adminClient.from("advance_intelligence_reports")
          .update(reportData)
          .eq("id", existingReport[0].id);
      } else {
        await adminClient.from("advance_intelligence_reports")
          .insert(reportData);
      }
    }

    /* ── 7. Log to decision log ── */
    await adminClient.from("advance_decision_log").insert({
      show_advance_id,
      tai_d: `TAID-VENUE-${Date.now()}`,
      action_type: "source_added",
      field_key: null,
      prior_value: null,
      new_value: `Venue analysis: ${docsProcessed} docs processed`,
      rationale: `TELA venue packet analysis run by user`,
      created_by: userId,
      owner_operator: "TELA",
    });

    /* ── 8. Propagate to sibling show advances at same venue ── */
    if (showAdv.venue_name) {
      try {
        const { data: siblings } = await adminClient
          .from("show_advances")
          .select("id, event_date")
          .eq("tour_id", showAdv.tour_id)
          .eq("venue_name", showAdv.venue_name)
          .neq("id", show_advance_id);

        if (siblings?.length) {
          console.log(`Propagating venue data to ${siblings.length} sibling show(s) at ${showAdv.venue_name}`);

          // Load source show's current advance_fields (the ones we just updated)
          const { data: sourceFields } = await adminClient
            .from("advance_fields")
            .select("field_key, section_key, current_value, status, confidence_score, flag_level, canonical_label, section_criticality, field_criticality, money_sensitive_boolean")
            .eq("show_advance_id", show_advance_id);

          // Only propagate fields that have values
          const populatedSourceFields = (sourceFields || []).filter(
            (f: any) => f.current_value != null && f.current_value !== ""
          );

          // Load all docs for this show advance (to copy references)
          const { data: sourceDocs } = await adminClient
            .from("advance_venue_docs")
            .select("*")
            .eq("show_advance_id", show_advance_id)
            .eq("processing_status", "complete");

          // Load all extractions for this show advance
          const { data: sourceExtractions } = await adminClient
            .from("advance_venue_extractions")
            .select("*")
            .eq("show_advance_id", show_advance_id);

          // Load source intelligence report
          const { data: sourceIntel } = await adminClient
            .from("advance_intelligence_reports")
            .select("*")
            .eq("show_advance_id", show_advance_id)
            .limit(1);

          const sourceEvent = showAdv.event_date || "source show";

          for (const sibling of siblings) {
            // 8a. Copy field values — only fill not_provided, non-locked fields
            if (populatedSourceFields.length) {
              const { data: siblingFields } = await adminClient
                .from("advance_fields")
                .select("id, field_key, current_value, status, locked_boolean")
                .eq("show_advance_id", sibling.id);

              if (siblingFields?.length) {
                const siblingMap = new Map(siblingFields.map((f: any) => [f.field_key, f]));
                let sibFieldsUpdated = 0;

                for (const src of populatedSourceFields) {
                  const sib = siblingMap.get(src.field_key);
                  if (!sib) continue;
                  // Skip if sibling field is already populated, confirmed, or locked
                  if (sib.current_value != null && sib.current_value !== "") continue;
                  if (sib.status === "confirmed" || sib.locked_boolean) continue;

                  await adminClient.from("advance_fields")
                    .update({
                      current_value: src.current_value,
                      status: src.status,
                      confidence_score: src.confidence_score,
                      flag_level: src.flag_level,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", sib.id);
                  sibFieldsUpdated++;
                }
                console.log(`Propagated ${sibFieldsUpdated} field values to sibling ${sibling.id}`);
              }
            }

            // 8b. Copy venue doc references (same file_path, different show_advance_id)
            if (sourceDocs?.length) {
              for (const srcDoc of sourceDocs) {
                // Check if this file_path already exists for this sibling
                const { data: existingDoc } = await adminClient
                  .from("advance_venue_docs")
                  .select("id")
                  .eq("show_advance_id", sibling.id)
                  .eq("file_path", srcDoc.file_path)
                  .limit(1);

                if (!existingDoc?.length) {
                  const { data: newDoc } = await adminClient
                    .from("advance_venue_docs")
                    .insert({
                      show_advance_id: sibling.id,
                      file_name: srcDoc.file_name,
                      file_path: srcDoc.file_path,
                      file_type: srcDoc.file_type,
                      document_category: srcDoc.document_category,
                      processing_status: "complete",
                      processed_at: srcDoc.processed_at,
                      uploaded_by: srcDoc.uploaded_by,
                    })
                    .select("id")
                    .single();

                  // 8c. Copy extractions for this doc
                  if (newDoc && sourceExtractions?.length) {
                    const matchingExtractions = sourceExtractions.filter(
                      (e: any) => e.document_id === srcDoc.id
                    );
                    for (const ext of matchingExtractions) {
                      await adminClient.from("advance_venue_extractions").insert({
                        show_advance_id: sibling.id,
                        document_id: newDoc.id,
                        extracted_data: ext.extracted_data,
                        extraction_confidence: ext.extraction_confidence,
                      });
                    }
                  }
                }
              }
            }

            // 8d. Copy intelligence report (preserve sibling's edited_* columns)
            if (sourceIntel?.length) {
              const src = sourceIntel[0];
              const { data: existingSibIntel } = await adminClient
                .from("advance_intelligence_reports")
                .select("id, edited_questions, edited_internal_notes")
                .eq("show_advance_id", sibling.id)
                .limit(1);

              const intelPayload = {
                show_advance_id: sibling.id,
                venue_capability_summary: src.venue_capability_summary,
                comparison_results: src.comparison_results,
                green_lights: src.green_lights,
                yellow_flags: src.yellow_flags,
                red_flags: src.red_flags,
                missing_unknown: src.missing_unknown,
                draft_advance_questions: src.draft_advance_questions,
                draft_internal_notes: src.draft_internal_notes,
                generated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                generated_by: userId,
              };

              if (existingSibIntel?.length) {
                await adminClient.from("advance_intelligence_reports")
                  .update(intelPayload)
                  .eq("id", existingSibIntel[0].id);
              } else {
                await adminClient.from("advance_intelligence_reports")
                  .insert(intelPayload);
              }
            }

            // 8e. Log propagation in sibling's decision log
            await adminClient.from("advance_decision_log").insert({
              show_advance_id: sibling.id,
              tai_d: `TAID-PROP-${Date.now()}`,
              action_type: "source_added",
              field_key: null,
              prior_value: null,
              new_value: `Venue data propagated from ${sourceEvent}`,
              rationale: `Same venue (${showAdv.venue_name}) — tech pack data shared across performances`,
              created_by: userId,
              owner_operator: "TELA",
            });
          }
        }
      } catch (propErr: any) {
        console.error("Venue propagation error (non-fatal):", propErr?.message);
        // Non-fatal — the source show still succeeded
      }
    }

    return new Response(JSON.stringify({
      docs_processed: docsProcessed,
      docs_failed: docsFailed,
      intelligence_generated: true,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("advance-venue-analyze error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
