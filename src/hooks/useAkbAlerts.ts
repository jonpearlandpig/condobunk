import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import { useToast } from "@/hooks/use-toast";

/**
 * Subscribes to real-time CRITICAL severity changes on akb_change_log
 * and shows an in-app toast alert to all tour members.
 */
export const useAkbAlerts = () => {
  const { user } = useAuth();
  const { tours } = useTour();
  const { toast } = useToast();

  useEffect(() => {
    if (!user || tours.length === 0) return;

    const tourIds = tours.map((t) => t.id);

    const channel = supabase
      .channel("akb-critical-alerts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "akb_change_log",
        },
        (payload) => {
          const row = payload.new as any;

          // Only alert for CRITICAL severity within user's tours
          if (row.severity !== "CRITICAL") return;
          if (!tourIds.includes(row.tour_id)) return;
          // Don't alert the person who made the change
          if (row.user_id === user.id) return;

          const impactParts: string[] = [];
          if (row.affects_safety) impactParts.push("⚠️ Safety");
          if (row.affects_time) impactParts.push("⏱ Time");
          if (row.affects_money) impactParts.push("💰 Money");

          toast({
            title: "🚨 CRITICAL AKB Change",
            description: `${row.change_summary || "A critical change was made"}${impactParts.length ? ` — ${impactParts.join(", ")}` : ""}`,
            variant: "destructive",
            duration: 10000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, tours, toast]);
};
