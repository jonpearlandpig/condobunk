import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 minute

/**
 * Tracks current user's presence and provides a map of online user IDs.
 * Uses Supabase realtime + last_active_at fallback.
 */
export function usePresence() {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Upsert own presence on mount + heartbeat
  useEffect(() => {
    if (!user) return;

    const upsert = async () => {
      await supabase.from("user_presence").upsert(
        { user_id: user.id, is_online: true, last_active_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    };

    upsert();
    heartbeatRef.current = setInterval(upsert, HEARTBEAT_INTERVAL_MS);

    // Go offline on unmount / tab close
    const goOffline = () => {
      navigator.sendBeacon?.(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_presence?user_id=eq.${user.id}`,
        "" // sendBeacon doesn't support PATCH, so we handle via beforeunload below
      );
      // Best-effort update
      supabase
        .from("user_presence")
        .update({ is_online: false, last_active_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .then(() => {});
    };

    window.addEventListener("beforeunload", goOffline);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      window.removeEventListener("beforeunload", goOffline);
      goOffline();
    };
  }, [user]);

  // Subscribe to presence changes
  useEffect(() => {
    // Initial load
    const loadPresence = async () => {
      const cutoff = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString();
      const { data } = await supabase
        .from("user_presence")
        .select("user_id")
        .or(`is_online.eq.true,last_active_at.gte.${cutoff}`);
      setOnlineUsers(new Set((data || []).map((r) => r.user_id)));
    };

    loadPresence();

    const channel = supabase
      .channel("presence-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_presence" },
        (payload) => {
          const row = payload.new as any;
          if (!row?.user_id) return;

          setOnlineUsers((prev) => {
            const next = new Set(prev);
            const cutoff = Date.now() - ONLINE_THRESHOLD_MS;
            const lastActive = row.last_active_at
              ? new Date(row.last_active_at).getTime()
              : 0;

            if (row.is_online || lastActive > cutoff) {
              next.add(row.user_id);
            } else {
              next.delete(row.user_id);
            }
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const isOnline = (userId: string) => onlineUsers.has(userId);

  return { onlineUsers, isOnline };
}
