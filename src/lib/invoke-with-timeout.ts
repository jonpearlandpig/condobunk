import { supabase } from "@/integrations/supabase/client";

export interface InvokeError extends Error {
  status?: number;
  code?: string;
}

/**
 * Invoke a Supabase edge function with a custom timeout (default 5 minutes).
 * supabase.functions.invoke() uses the browser's default fetch timeout (~2min)
 * which is too short for heavy extraction tasks.
 */
export async function invokeWithTimeout(
  functionName: string,
  body: Record<string, unknown>,
  timeoutMs = 300_000
): Promise<{ data: any; error: InvokeError | null }> {
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
      // Try to parse structured error from backend
      let parsed: { error?: string; code?: string } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // not JSON
      }

      const err = new Error(
        parsed?.error || text || `HTTP ${resp.status}`
      ) as InvokeError;
      err.status = resp.status;
      err.code = parsed?.code || undefined;
      return { data: null, error: err };
    }

    const data = await resp.json();
    return { data, error: null };
  } catch (err: any) {
    if (err.name === "AbortError") {
      const timeoutErr = new Error("Request timed out (5 minutes). The extraction may still be running — try refreshing.") as InvokeError;
      timeoutErr.code = "TIMEOUT";
      return { data: null, error: timeoutErr };
    }
    return { data: null, error: err };
  } finally {
    clearTimeout(timer);
  }
}
