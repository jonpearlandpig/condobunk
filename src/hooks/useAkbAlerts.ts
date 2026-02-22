import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import { useToast } from "@/hooks/use-toast";

const SEVERITY_RANK: Record<string, number> = { INFO: 0, IMPORTANT: 1, CRITICAL: 2 };

interface Prefs {
  min_severity: string;
  safety_always: boolean;
  time_always: boolean;
  money_always: boolean;
  day_window: number;
  notify_schedule_changes: boolean;
  notify_contact_changes: boolean;
  notify_venue_changes: boolean;
  notify_finance_changes: boolean;
}

const DEFAULTS: Prefs = {
  min_severity: "CRITICAL",
  safety_always: true,
  time_always: true,
  money_always: true,
  day_window: 3,
  notify_schedule_changes: true,
  notify_contact_changes: false,
  notify_venue_changes: true,
  notify_finance_changes: false,
};

/**
 * Subscribes to real-time AKB changes and shows toast alerts
 * filtered by user notification preferences.
 */
export const useAkbAlerts = () => {
  const { user } = useAuth();
  const { tours } = useTour();
  const { toast } = useToast();
  const [prefsMap, setPrefsMap] = useState<Record<string, Prefs>>({});

  // Load notification preferences for all user tours
  useEffect(() => {
    if (!user || tours.length === 0) return;

    const loadPrefs = async () => {
      const { data } = await supabase
        .from("notification_preferences")
        .select("tour_id, min_severity, safety_always, time_always, money_always, day_window, notify_schedule_changes, notify_contact_changes, notify_venue_changes, notify_finance_changes")
        .eq("user_id", user.id)
        .in("tour_id", tours.map((t) => t.id));

      const map: Record<string, Prefs> = {};
      for (const row of data || []) {
        map[row.tour_id] = row as Prefs;
      }
      setPrefsMap(map);
    };

    loadPrefs();
  }, [user, tours]);

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

          // Must be in user's tours and not self-authored
          if (!tourIds.includes(row.tour_id)) return;
          if (row.user_id === user.id) return;

          const prefs = prefsMap[row.tour_id] || DEFAULTS;
          const rowRank = SEVERITY_RANK[row.severity] ?? 0;
          const minRank = SEVERITY_RANK[prefs.min_severity] ?? 2;

          // Check impact-flag overrides (bypass severity)
          const impactOverride =
            (prefs.safety_always && row.affects_safety) ||
            (prefs.time_always && row.affects_time) ||
            (prefs.money_always && row.affects_money);

          // If no impact override, check severity threshold
          if (!impactOverride && rowRank < minRank) return;

          // Day window check — if event_date exists, only alert within window
          if (row.event_date && prefs.day_window > 0) {
            const eventDate = new Date(row.event_date);
            const now = new Date();
            const diffDays = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
            if (diffDays > prefs.day_window) return;
          }

          const impactParts: string[] = [];
          if (row.affects_safety) impactParts.push("⚠️ Safety");
          if (row.affects_time) impactParts.push("⏱ Time");
          if (row.affects_money) impactParts.push("💰 Money");

          const isCritical = row.severity === "CRITICAL";

          toast({
            title: isCritical ? "🚨 CRITICAL AKB Change" : `📋 AKB Change (${row.severity})`,
            description: `${row.change_summary || "A change was made"}${impactParts.length ? ` — ${impactParts.join(", ")}` : ""}`,
            variant: isCritical ? "destructive" : "default",
            duration: isCritical ? 10000 : 5000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, tours, toast, prefsMap]);
};
