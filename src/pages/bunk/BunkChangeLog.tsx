import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTour } from "@/hooks/useTour";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ShieldCheck, Clock, DollarSign, AlertTriangle } from "lucide-react";

const BunkChangeLog = () => {
  const { tours, selectedTourId } = useTour();
  const tourId = selectedTourId || tours[0]?.id;

  const { data: entries, isLoading } = useQuery({
    queryKey: ["akb-change-log", tourId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("akb_change_log")
        .select("*")
        .eq("tour_id", tourId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      // Fetch profile info for all unique user_ids
      const userIds = [...new Set((data || []).map((e) => e.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, telauthorium_id")
        .in("id", userIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.id, p])
      );

      return (data || []).map((entry) => ({
        ...entry,
        profile: profileMap.get(entry.user_id),
      }));
    },
    enabled: !!tourId,
    refetchInterval: 30000,
  });

  const severityColor = (s: string) => {
    switch (s) {
      case "CRITICAL": return "bg-destructive/20 text-destructive border-destructive/30";
      case "IMPORTANT": return "bg-amber-500/20 text-amber-600 border-amber-500/30";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-mono font-semibold tracking-tight">AKB Change Log</h1>
      </div>
      <p className="text-xs font-mono text-muted-foreground">
        Every edit to the AKB is signed, justified, and permanently recorded.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !entries?.length ? (
        <p className="text-sm text-muted-foreground font-mono py-8 text-center">No changes recorded yet</p>
      ) : (
        <ScrollArea className="h-[calc(100dvh-200px)]">
          <div className="space-y-3 pr-4">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {(entry.profile as any)?.display_name || "Unknown"}
                    </span>
                    {(entry.profile as any)?.telauthorium_id && (
                      <Badge variant="outline" className="font-mono text-[9px] tracking-wider shrink-0">
                        {(entry.profile as any).telauthorium_id}
                      </Badge>
                    )}
                  </div>
                  <Badge className={`font-mono text-[9px] shrink-0 ${severityColor(entry.severity)}`}>
                    {entry.severity}
                  </Badge>
                </div>

                {/* Summary */}
                <p className="text-sm text-foreground/80">{entry.change_summary}</p>

                {/* Reason */}
                {(entry as any).change_reason && (
                  <div className="bg-muted/40 rounded-lg p-2.5">
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Why</p>
                    <p className="text-xs text-foreground/70">{(entry as any).change_reason}</p>
                  </div>
                )}

                {/* Impact + timestamp */}
                <div className="flex items-center gap-2 flex-wrap">
                  {entry.affects_safety && (
                    <Badge variant="outline" className="text-[9px] gap-1 font-mono text-destructive border-destructive/30">
                      <AlertTriangle className="h-2.5 w-2.5" /> Safety
                    </Badge>
                  )}
                  {entry.affects_time && (
                    <Badge variant="outline" className="text-[9px] gap-1 font-mono text-amber-600 border-amber-500/30">
                      <Clock className="h-2.5 w-2.5" /> Time
                    </Badge>
                  )}
                  {entry.affects_money && (
                    <Badge variant="outline" className="text-[9px] gap-1 font-mono text-emerald-600 border-emerald-500/30">
                      <DollarSign className="h-2.5 w-2.5" /> Money
                    </Badge>
                  )}
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                    {entry.action} • {entry.entity_type} •{" "}
                    {new Date(entry.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default BunkChangeLog;
