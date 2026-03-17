import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Precedence helpers ────────────────────────── */

function fieldPrecedence(f: { status: string; locked_boolean: boolean; confidence_score: number | null }): number {
  if (f.locked_boolean) return 5;                                   // locked human
  if (f.status === "confirmed" && !f.locked_boolean) {
    return (f.confidence_score ?? 0) >= 0.8 ? 3 : 2;               // strong / soft
  }
  if (f.status === "needs_confirmation") return 2;                  // soft evidence
  if (f.status === "not_provided" || f.status === "not_applicable") return 1; // null
  if (f.status === "conflict") return 4;                            // resolved-conflict kept value
  return 1;
}

function candidatePrecedence(confidence: number): number {
  return confidence >= 0.8 ? 3 : 2;
}

/* ── AI tool definition ────────────────────────── */

const extractTool = {
  type: "function" as const,
  function: {
    name: "extract_advance_fields",
    description:
      "Extract structured advance fields from the source text. Return every field you can identify with its value and confidence.",
    parameters: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field_key: { type: "string", description: "Canonical field_key from the template" },
              extracted_value: { type: "string", description: "The value found in the source" },
              confidence: { type: "number", description: "0-1 confidence score" },
              source_snippet: { type: "string", description: "Short quote from source supporting this value" },
              speaker_name: { type: "string", description: "Who said it, if identifiable" },
              speaker_role: { type: "string", description: "Their role, if identifiable" },
              parser_notes: { type: "string", description: "Any caveats or notes" },
            },
            required: ["field_key", "extracted_value", "confidence"],
            additionalProperties: false,
          },
        },
        flags: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              severity: { type: "string", enum: ["red", "yellow"] },
              description: { type: "string" },
              linked_field_key: { type: "string" },
              category: { type: "string" },
            },
            required: ["title", "severity"],
            additionalProperties: false,
          },
        },
      },
      required: ["candidates"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    /* ── 1. Auth ──────────────────────────────────── */
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub as string;

    /* ── 2. Parse body ────────────────────────────── */
    const { show_advance_id, source_id } = await req.json();
    if (!show_advance_id || !source_id) {
      return new Response(JSON.stringify({ error: "show_advance_id and source_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── 3. Verify tour membership ────────────────── */
    const adminClient = createClient(supabaseUrl, serviceRole);

    const { data: showAdv, error: showErr } = await adminClient
      .from("show_advances").select("id, tour_id").eq("id", show_advance_id).single();
    if (showErr || !showAdv) {
      return new Response(JSON.stringify({ error: "Show advance not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: membership } = await adminClient
      .from("tour_members").select("id").eq("tour_id", showAdv.tour_id).eq("user_id", userId).limit(1);
    if (!membership?.length) {
      return new Response(JSON.stringify({ error: "Not a tour member" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── 4. Load data ─────────────────────────────── */
    const [sourceRes, fieldsRes, templatesRes] = await Promise.all([
      adminClient.from("advance_sources").select("*").eq("id", source_id).single(),
      adminClient.from("advance_fields").select("*").eq("show_advance_id", show_advance_id),
      adminClient.from("advance_field_templates").select("*"),
    ]);

    if (sourceRes.error || !sourceRes.data?.raw_text) {
      return new Response(JSON.stringify({ error: "Source not found or empty" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const source = sourceRes.data;
    const currentFields: Record<string, any> = {};
    for (const f of fieldsRes.data || []) currentFields[f.field_key] = f;

    const templateList = (templatesRes.data || []).map(
      (t: any) => `${t.field_key} (${t.section_key}): ${t.canonical_label} [${t.field_criticality}${t.money_sensitive_boolean ? ", $" : ""}]`
    ).join("\n");

    /* ── 5. Call Lovable AI ───────────────────────── */
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are an advance-call parser for live event production. Extract structured field values from the provided source text.

CANONICAL FIELDS (field_key, section, label, criticality):
${templateList}

Rules:
- Only extract values you can clearly find in the text
- Assign confidence 0.0-1.0 based on clarity and context
- Flag safety concerns, missing critical items, or contradictions
- If a value is ambiguous, set confidence below 0.5
- For money/cost fields, be extra precise`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Source type: ${source.source_type}\nSource title: ${source.source_title || "N/A"}\n\n---\n\n${source.raw_text}` },
        ],
        tools: [extractTool],
        tool_choice: { type: "function", function: { name: "extract_advance_fields" } },
      }),
    });

    if (!aiResp.ok) {
      const status = aiResp.status;
      const errText = await aiResp.text();
      console.error("AI gateway error:", status, errText);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit exceeded, please try again later", code: "AI_RATE_LIMIT" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted", code: "AI_PAYMENT_REQUIRED" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "No extraction result", code: "EXTRACTION_EMPTY_RESULT" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: { candidates: any[]; flags?: any[] };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI output" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── 6. Process candidates with precedence logic ─ */
    const counters = { candidates_found: 0, fields_updated: 0, conflicts_detected: 0, flags_generated: 0, missing_required: 0 };
    const decisionLogs: any[] = [];
    const evidenceRows: any[] = [];
    const fieldUpdates: any[] = [];
    const flagInserts: any[] = [];

    for (const c of parsed.candidates || []) {
      counters.candidates_found++;
      const existing = currentFields[c.field_key];
      if (!existing) continue; // skip unknown fields

      // Always insert evidence
      evidenceRows.push({
        advance_field_id: existing.id,
        source_id: source_id,
        extracted_value: c.extracted_value,
        confidence_score: c.confidence ?? 0.5,
        source_snippet: c.source_snippet || null,
        speaker_name: c.speaker_name || null,
        speaker_role: c.speaker_role || null,
        parser_notes: c.parser_notes || null,
      });

      const curPrec = fieldPrecedence(existing);
      const candPrec = candidatePrecedence(c.confidence ?? 0.5);

      // Never touch locked fields
      if (existing.locked_boolean) continue;

      // Check material difference
      const materialDiff = existing.current_value != null &&
        existing.current_value !== c.extracted_value &&
        existing.current_value.trim() !== "";

      if (materialDiff && curPrec >= candPrec) {
        // Current is equal or higher precedence → create conflict
        counters.conflicts_detected++;
        fieldUpdates.push({
          id: existing.id,
          status: "conflict",
          flag_level: existing.money_sensitive_boolean ? "red" : "yellow",
        });
        flagInserts.push({
          show_advance_id,
          severity: existing.money_sensitive_boolean ? "red" : "yellow",
          title: `Conflicting value for ${existing.canonical_label}`,
          description: `Current: "${existing.current_value}" vs New: "${c.extracted_value}" (conf: ${c.confidence})`,
          linked_field_key: c.field_key,
          category: "conflict",
          source_ids: [source_id],
        });
        decisionLogs.push({
          show_advance_id,
          tai_d: `TAI-D-PARSE-${Date.now()}-${counters.candidates_found}`,
          action_type: "flag_changed",
          field_key: c.field_key,
          prior_value: existing.current_value,
          new_value: c.extracted_value,
          rationale: `Parser detected conflict (current prec=${curPrec}, candidate prec=${candPrec})`,
          created_by: userId,
          owner_operator: "parser",
        });
        continue;
      }

      if (candPrec > curPrec || existing.current_value == null || existing.current_value.trim() === "") {
        // Promote value — but never auto-lock critical fields
        const newStatus = existing.field_criticality === "critical" ? "needs_confirmation" : "confirmed";
        counters.fields_updated++;
        fieldUpdates.push({
          id: existing.id,
          current_value: c.extracted_value,
          confidence_score: c.confidence,
          status: newStatus,
          flag_level: "none",
          updated_by: "parser",
        });
        decisionLogs.push({
          show_advance_id,
          tai_d: `TAI-D-PARSE-${Date.now()}-${counters.candidates_found}`,
          action_type: "field_updated",
          field_key: c.field_key,
          prior_value: existing.current_value,
          new_value: c.extracted_value,
          rationale: `Parser promoted value (confidence: ${c.confidence})`,
          created_by: userId,
          owner_operator: "parser",
        });
      }
    }

    // AI-generated flags
    for (const flag of parsed.flags || []) {
      counters.flags_generated++;
      flagInserts.push({
        show_advance_id,
        severity: flag.severity || "yellow",
        title: flag.title,
        description: flag.description || null,
        linked_field_key: flag.linked_field_key || null,
        category: flag.category || "parser",
        source_ids: [source_id],
      });
    }

    // Detect missing required critical fields
    for (const f of fieldsRes.data || []) {
      if (f.field_criticality === "critical" && f.status === "not_provided" && !fieldUpdates.find((u: any) => u.id === f.id)) {
        counters.missing_required++;
      }
    }

    /* ── 7. Write results ─────────────────────────── */
    if (evidenceRows.length) {
      await adminClient.from("advance_field_evidence").insert(evidenceRows);
    }
    for (const upd of fieldUpdates) {
      const { id: fieldId, ...rest } = upd;
      await adminClient.from("advance_fields").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", fieldId);
    }
    if (flagInserts.length) {
      await adminClient.from("advance_flags").insert(flagInserts);
    }
    if (decisionLogs.length) {
      await adminClient.from("advance_decision_log").insert(decisionLogs);
    }

    // Also log the source_added event
    await adminClient.from("advance_decision_log").insert({
      show_advance_id,
      tai_d: `TAI-D-PARSE-${Date.now()}-src`,
      action_type: "source_added",
      new_value: source.source_title || source.source_type,
      rationale: `Parsed source ${source_id}`,
      created_by: userId,
      owner_operator: "parser",
    });

    return new Response(JSON.stringify(counters), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("advance-parse error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
