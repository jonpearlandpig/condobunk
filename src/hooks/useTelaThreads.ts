import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";

export interface TelaThread {
  id: string;
  tour_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export function useTelaThreads() {
  const { user } = useAuth();
  const { tours } = useTour();
  const [threads, setThreads] = useState<TelaThread[]>([]);
  const [loading, setLoading] = useState(false);

  // Stable string for dependency tracking
  const tourIdsStr = useMemo(() => tours.map((t) => t.id).sort().join(","), [tours]);

  const fetchThreads = useCallback(async () => {
    if (!user || !tourIdsStr) return;
    const ids = tourIdsStr.split(",");
    setLoading(true);
    const { data, error } = await supabase
      .from("tela_threads" as any)
      .select("*")
      .eq("user_id", user.id)
      .in("tour_id", ids)
      .order("updated_at", { ascending: false })
      .limit(10);
    if (error) console.error("[tela_threads] fetch error:", error);
    setThreads((data as any as TelaThread[]) || []);
    setLoading(false);
  }, [user, tourIdsStr]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("tela-threads-sidebar")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tela_threads", filter: `user_id=eq.${user.id}` },
        () => fetchThreads()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchThreads]);

  const createThread = useCallback(
    async (tourId: string, title: string): Promise<string | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("tela_threads" as any)
        .insert({ tour_id: tourId, user_id: user.id, title } as any)
        .select("id")
        .single();
      if (error) { console.error("[tela_threads] create error:", error); return null; }
      return (data as any).id;
    },
    [user]
  );

  const renameThread = useCallback(
    async (threadId: string, title: string) => {
      await supabase
        .from("tela_threads" as any)
        .update({ title } as any)
        .eq("id", threadId);
    },
    []
  );

  const deleteThread = useCallback(
    async (threadId: string) => {
      await supabase
        .from("tela_threads" as any)
        .delete()
        .eq("id", threadId);
    },
    []
  );

  const touchThread = useCallback(
    async (threadId: string) => {
      await supabase
        .from("tela_threads" as any)
        .update({ updated_at: new Date().toISOString() } as any)
        .eq("id", threadId);
    },
    []
  );

  return { threads, loading, createThread, renameThread, deleteThread, touchThread, refetch: fetchThreads };
}
