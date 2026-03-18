import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Tour requirements extraction tool ── */

const extractionTool = {
  type: "function" as const,
  function: {
    name: "extract_tour_requirements",
    description:
      "Extract structured tour production requirements from a Production Rider, Rigging Plot, Input List, or Patch List. Return every requirement you can identify.",
    parameters: {
      type: "object",
      properties: {
        power_requirements: {
          type: "object",
          properties: {
            audio_power: { type: "string" },
            lighting_power: { type: "string" },
            led_video_power: { type: "string" },
            total_power: { type: "string" },
            connection_types: { type: "string" },
            cable_specs: { type: "string" },
            distro_notes: { type: "string" },
            generator_required: { type: "string" },
          },
        },
        rigging_requirements: {
          type: "object",
          properties: {
            total_points: { type: "string" },
            max_point_weight: { type: "string" },
            total_rigging_weight: { type: "string" },
            motor_type: { type: "string" },
            motor_count: { type: "string" },
            trim_height_minimum: { type: "string" },
            bridle_notes: { type: "string" },
            submission_deadline: { type: "string" },
            rigging_call_time: { type: "string" },
            rigging_crew_count: { type: "string" },
          },
        },
        labor_requirements: {
          type: "object",
          properties: {
            load_in_call: { type: "string" },
            load_in_hands: { type: "string" },
            rigger_count: { type: "string" },
            stagehand_count: { type: "string" },
            electrician_count: { type: "string" },
            spot_op_count: { type: "string" },
            fork_op_count: { type: "string" },
            carpenter_count: { type: "string" },
            wardrobe_count: { type: "string" },
            runner_count: { type: "string" },
            load_out_hands: { type: "string" },
            load_out_call: { type: "string" },
            meal_break_notes: { type: "string" },
          },
        },
        staging_requirements: {
          type: "object",
          properties: {
            stage_width: { type: "string" },
            stage_depth: { type: "string" },
            stage_height: { type: "string" },
            riser_specs: { type: "string" },
            runway_specs: { type: "string" },
            b_stage_specs: { type: "string" },
            foh_position: { type: "string" },
            monitor_position: { type: "string" },
            barricade_specs: { type: "string" },
          },
        },
        schedule_template: {
          type: "object",
          properties: {
            rigging_call: { type: "string" },
            load_in: { type: "string" },
            lunch: { type: "string" },
            soundcheck: { type: "string" },
            dinner: { type: "string" },
            doors: { type: "string" },
            show_time: { type: "string" },
            curfew: { type: "string" },
            load_out_start: { type: "string" },
            load_out_end: { type: "string" },
          },
        },
        trucking_logistics: {
          type: "object",
          properties: {
            truck_count: { type: "string" },
            truck_size: { type: "string" },
            bus_count: { type: "string" },
            trailer_specs: { type: "string" },
            dock_requirements: { type: "string" },
            parking_requirements: { type: "string" },
            shore_power_needs: { type: "string" },
          },
        },
        special_effects: {
          type: "object",
          properties: {
            haze_required: { type: "string" },
            co2_required: { type: "string" },
            pyro_required: { type: "string" },
            confetti_required: { type: "string" },
            flame_required: { type: "string" },
            fx_notes: { type: "string" },
          },
        },
        audio_video: {
          type: "object",
          properties: {
            pa_system: { type: "string" },
            console_foh: { type: "string" },
            console_monitors: { type: "string" },
            wireless_channels: { type: "string" },
            wireless_coordination: { type: "string" },
            iem_channels: { type: "string" },
            followspot_count: { type: "string" },
            followspot_type: { type: "string" },
            led_wall_specs: { type: "string" },
            camera_count: { type: "string" },
            imag_output: { type: "string" },
            video_notes: { type: "string" },
          },
        },
        equipment_requests: {
          type: "object",
          properties: {
            forklift_5k: { type: "string" },
            forklift_3k: { type: "string" },
            genie_lift: { type: "string" },
            tables_chairs: { type: "string" },
            pipe_drape: { type: "string" },
            additional_equipment: { type: "string" },
          },
        },
        production_contacts: {
          type: "object",
          properties: {
            production_manager: { type: "string" },
            pm_phone: { type: "string" },
            pm_email: { type: "string" },
            tour_manager: { type: "string" },
            tm_phone: { type: "string" },
            lighting_director: { type: "string" },
            audio_engineer: { type: "string" },
            video_director: { type: "string" },
            rigging_head: { type: "string" },
          },
        },
        hospitality_requirements: {
          type: "object",
          properties: {
            dressing_rooms: { type: "string" },
            showers: { type: "string" },
            laundry: { type: "string" },
            catering_headcount: { type: "string" },
            buyout_amount: { type: "string" },
            hospitality_notes: { type: "string" },
          },
        },
        security_requirements: {
          type: "object",
          properties: {
            security_count: { type: "string" },
            credential_system: { type: "string" },
            restricted_areas: { type: "string" },
            security_notes: { type: "string" },
          },
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
};

/* ── Chunked base64 helper ── */

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { tour_id, document_ids } = await req.json();
    if (!tour_id) {
      return new Response(JSON.stringify({ error: "tour_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify tour membership (TA/MGMT)
    const { data: membership } = await adminClient
      .from("tour_members")
      .select("role")
      .eq("tour_id", tour_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership || !["TA", "MGMT"].includes(membership.role)) {
      return new Response(JSON.stringify({ error: "Not authorized for this tour" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch documents to process
    let query = adminClient
      .from("tour_production_docs")
      .select("*")
      .eq("tour_id", tour_id);

    if (document_ids?.length) {
      query = query.in("id", document_ids);
    }

    const { data: docs, error: docsErr } = await query;
    if (docsErr || !docs?.length) {
      return new Response(JSON.stringify({ error: "No documents found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let docsProcessed = 0;
    let docsFailed = 0;

    for (const doc of docs) {
      try {
        // Mark processing
        await adminClient
          .from("tour_production_docs")
          .update({ processing_status: "processing", processing_error: null })
          .eq("id", doc.id);

        // Download file
        const { data: fileData, error: dlErr } = await adminClient.storage
          .from("document-files")
          .download(doc.file_path);
        if (dlErr || !fileData) throw new Error(`Download failed: ${dlErr?.message}`);

        const fileBytes = new Uint8Array(await fileData.arrayBuffer());
        const ext = (doc.file_type || doc.file_name.split(".").pop() || "").toLowerCase();
        const isPdf = ext === "pdf" || doc.file_name.toLowerCase().endsWith(".pdf");

        // Build AI message
        let userContent: any;

        if (isPdf) {
          const base64 = uint8ArrayToBase64(fileBytes);
          userContent = [
            { type: "text", text: `Document: ${doc.file_name} (${doc.document_category}). Extract ALL tour production requirements.` },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
          ];
        } else {
          const textContent = new TextDecoder("utf-8").decode(fileBytes);
          const truncated = textContent.slice(0, 100_000);
          userContent = `Document: ${doc.file_name} (${doc.document_category}).\n\nContent:\n${truncated}\n\nExtract ALL tour production requirements.`;
        }

        const extractionPrompt = `You are a production rider and rigging plot parser for live touring.
Extract every production requirement from this document into the structured schema.
Be thorough — capture power needs, rigging points/weights, labor calls, staging dimensions,
schedule templates, trucking, special effects, audio/video specs, equipment requests, contacts,
hospitality, and security requirements.
For numeric values, include units (e.g., "400A 3-phase", "79 points", "5,000 lb").
If a value is not found in the document, omit it entirely.`;

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
              { role: "user", content: userContent },
            ],
            tools: [extractionTool],
            tool_choice: { type: "function", function: { name: "extract_tour_requirements" } },
          }),
        });

        if (!aiResp.ok) {
          const errText = await aiResp.text();
          throw new Error(`AI extraction failed (${aiResp.status}): ${errText}`);
        }

        const aiData = await aiResp.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

        if (!toolCall) {
          throw new Error("No tool call in AI response");
        }

        const extracted = JSON.parse(toolCall.function.arguments);

        // Build confidence map
        const confidence: Record<string, string> = {};
        for (const [category, fields] of Object.entries(extracted)) {
          if (fields && typeof fields === "object") {
            for (const [key, val] of Object.entries(fields as Record<string, any>)) {
              if (val !== null && val !== undefined && val !== "") {
                confidence[`${category}.${key}`] = "high";
              }
            }
          }
        }

        // Upsert extraction
        const { data: existing } = await adminClient
          .from("tour_production_extractions")
          .select("id")
          .eq("document_id", doc.id)
          .maybeSingle();

        if (existing) {
          await adminClient
            .from("tour_production_extractions")
            .update({
              extracted_data: extracted,
              extraction_confidence: confidence,
              processed_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await adminClient
            .from("tour_production_extractions")
            .insert({
              tour_id,
              document_id: doc.id,
              extracted_data: extracted,
              extraction_confidence: confidence,
            });
        }

        // Mark complete
        await adminClient
          .from("tour_production_docs")
          .update({
            processing_status: "complete",
            processed_at: new Date().toISOString(),
          })
          .eq("id", doc.id);

        docsProcessed++;
      } catch (err: any) {
        console.error(`Failed to process doc ${doc.id}:`, err);
        await adminClient
          .from("tour_production_docs")
          .update({
            processing_status: "failed",
            processing_error: err?.message?.slice(0, 500) || "Unknown error",
          })
          .eq("id", doc.id);
        docsFailed++;
      }
    }

    return new Response(
      JSON.stringify({ docs_processed: docsProcessed, docs_failed: docsFailed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Rider analyze error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
