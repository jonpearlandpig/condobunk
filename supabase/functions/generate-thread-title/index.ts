import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { thread_id } = await req.json();
    if (!thread_id) {
      return new Response(JSON.stringify({ error: "thread_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch first 4 messages from the thread
    const { data: messages, error: msgErr } = await supabaseAdmin
      .from("tela_messages")
      .select("role, content")
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: true })
      .limit(4);

    if (msgErr || !messages || messages.length < 2) {
      return new Response(JSON.stringify({ skipped: true, reason: "not enough messages" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const conversationSnippet = messages
      .map((m: any) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join("\n");

    const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
    const aiResp = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "Generate a concise 5-8 word title for this conversation. Return ONLY the title text, no quotes, no punctuation at the end. The title should capture the main topic discussed.",
          },
          {
            role: "user",
            content: conversationSnippet,
          },
        ],
        max_tokens: 30,
        temperature: 0.3,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("[generate-thread-title] AI error:", errText);
      return new Response(JSON.stringify({ error: "AI call failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const title = aiData.choices?.[0]?.message?.content?.trim();

    if (!title) {
      return new Response(JSON.stringify({ skipped: true, reason: "no title generated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update the thread title
    const { error: updateErr } = await supabaseAdmin
      .from("tela_threads")
      .update({ title })
      .eq("id", thread_id);

    if (updateErr) {
      console.error("[generate-thread-title] update error:", updateErr);
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ title }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[generate-thread-title] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
