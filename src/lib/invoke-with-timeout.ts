import { supabase } from "@/integrations/supabase/client";

/**
 * Invoke a Supabase edge function with a custom timeout (default 5 minutes).
 * supabase.functions.invoke() uses the browser's default fetch timeout (~2min)
 * which is too short for heavy extraction tasks.
 */
export async function invokeWithTimeout(
  functionName: string,
  body: Record<string, unknown>,
  timeoutMs = 300_000
): Promise<{ data: any; error: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const session = (await supabase.auth.getSession()).data.session;
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const url = `https://${projectId}.supabase.co/functions/v1/${functionName}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: anonKey,
    };
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = await resp.text();
      return { data: null, error: new Error(text || `HTTP ${resp.status}`) };
    }

    const data = await resp.json();
    return { data, error: null };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { data: null, error: new Error("Request timed out (5 minutes). The extraction may still be running — try refreshing.") };
    }
    return { data: null, error: err };
  } finally {
    clearTimeout(timer);
  }
}
