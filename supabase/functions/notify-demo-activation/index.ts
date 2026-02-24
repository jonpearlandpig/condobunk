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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_email, user_name, expires_at } = await req.json();

    // Use service role to insert DM to jonathan
    const adminClient = createClient(supabaseUrl, serviceKey);
    const jonathanId = "1385f11a-1337-4ef7-83ac-1bbd62af4781";

    // Find a tour to attach the DM to (any of jonathan's active tours)
    const { data: tours } = await adminClient
      .from("tours")
      .select("id")
      .eq("owner_id", jonathanId)
      .eq("status", "ACTIVE")
      .limit(1);

    if (!tours || tours.length === 0) {
      return new Response(JSON.stringify({ error: "No tour found for notification" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tourId = tours[0].id;
    const expiresFormatted = new Date(expires_at).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });

    const messageText = `🔔 New demo activation: ${user_name || "Unknown"} (${user_email || "no email"}) — expires ${expiresFormatted}`;

    // Insert as a DM from the demo user to jonathan
    await adminClient.from("direct_messages").insert({
      sender_id: user.id,
      recipient_id: jonathanId,
      tour_id: tourId,
      message_text: messageText,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-demo-activation error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
