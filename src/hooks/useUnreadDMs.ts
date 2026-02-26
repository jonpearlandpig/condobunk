import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Tracks unread direct message counts per sender for the current user.
 * Returns a map of sender_id → unread count, plus a total.
 */
export function useUnreadDMs() {
  const { user } = useAuth();
  const [unreadBySender, setUnreadBySender] = useState<Record<string, number>>({});
  const [totalUnread, setTotalUnread] = useState(0);

  const fetchUnread = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from("direct_messages")
      .select("sender_id")
      .eq("recipient_id", user.id)
      .is("read_at", null);

    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of data || []) {
      counts[row.sender_id] = (counts[row.sender_id] || 0) + 1;
      total++;
    }
    setUnreadBySender(counts);
    setTotalUnread(total);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchUnread();

    // Subscribe to new DMs and read-receipt updates
    const channel = supabase
      .channel("unread-dm-tracker")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_messages",
        },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          // Refetch on any change involving us
          if (row.recipient_id === user.id || row.sender_id === user.id) {
            fetchUnread();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchUnread]);

  // Re-fetch when a tour AKB is deleted
  useEffect(() => {
    const handler = () => fetchUnread();
    window.addEventListener("akb-changed", handler);
    return () => window.removeEventListener("akb-changed", handler);
  }, [fetchUnread]);

  /**
   * Given a contact's appUserId, return how many unread messages they've sent us.
   */
  const unreadFrom = (userId: string | undefined): number => {
    if (!userId) return 0;
    return unreadBySender[userId] || 0;
  };

  return { unreadBySender, totalUnread, unreadFrom, refetch: fetchUnread };
}
