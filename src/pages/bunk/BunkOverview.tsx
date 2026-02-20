import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Radio,
  Plus,
  ChevronRight,
  Pencil,
  Trash2,
  Check,
  X,
  Zap,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const stateColors: Record<string, string> = {
  BUILDING: "text-info",
  SOVEREIGN: "text-success",
  CONFLICT: "text-destructive",
};

const BunkOverview = () => {
  const { user } = useAuth();
  const { tours, setSelectedTourId, reload } = useTour();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tourEventCounts, setTourEventCounts] = useState<Record<string, number>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingTour, setDeletingTour] = useState<{ id: string; name: string } | null>(null);
  const [tldr, setTldr] = useState<Array<{ text: string; actionable: boolean }>>([]);
  const [tldrLoading, setTldrLoading] = useState(false);

  useEffect(() => {
    if (!user || tours.length === 0) return;
    loadCounts();
  }, [user, tours]);

  useEffect(() => {
    if (tours.length > 0) {
      generateTldr();
    }
  }, [tours, tourEventCounts]);

  const loadCounts = async () => {
    const tourIds = tours.map(t => t.id);
    if (tourIds.length === 0) {
      setTourEventCounts({});
      return;
    }

    const results = await Promise.all(
      tourIds.map(tid =>
        supabase
          .from("schedule_events")
          .select("*", { count: "exact", head: true })
          .eq("tour_id", tid)
      )
    );

    const counts: Record<string, number> = {};
    tourIds.forEach((tid, i) => {
      counts[tid] = results[i].count ?? 0;
    });
    setTourEventCounts(counts);
  };

  const generateTldr = async () => {
    setTldrLoading(true);
    try {
      // Gather data for the briefing
      const today = new Date().toISOString().split("T")[0];
      const tourIds = tours.map(t => t.id);

      const [eventsRes, gapsRes, conflictsRes] = await Promise.all([
        supabase
          .from("schedule_events")
          .select("event_date, venue, city, notes")
          .in("tour_id", tourIds)
          .gte("event_date", today)
          .order("event_date", { ascending: true })
          .limit(15),
        supabase
          .from("knowledge_gaps")
          .select("question, domain")
          .in("tour_id", tourIds)
          .eq("resolved", false)
          .limit(10),
        supabase
          .from("calendar_conflicts")
          .select("conflict_type, severity")
          .in("tour_id", tourIds)
          .eq("resolved", false)
          .limit(10),
      ]);

      const upcomingEvents = eventsRes.data || [];
      const openGaps = gapsRes.data || [];
      const openConflicts = conflictsRes.data || [];

      // If AKB is completely empty, show "Begin Tour Build"
      if (upcomingEvents.length === 0 && openGaps.length === 0 && openConflicts.length === 0) {
        setTldr([{ text: "Begin Tour Build", actionable: false }]);
        setTldrLoading(false);
        return;
      }

      // Bucket events by time horizon: 1 day, 3 days, 7 days
      const todayDate = new Date(today);
      const day1 = new Date(todayDate); day1.setDate(day1.getDate() + 1);
      const day3 = new Date(todayDate); day3.setDate(day3.getDate() + 3);
      const day7 = new Date(todayDate); day7.setDate(day7.getDate() + 7);
      const fmt = (d: Date) => d.toISOString().split("T")[0];

      const within1 = upcomingEvents.filter(e => e.event_date && e.event_date <= fmt(day1));
      const within3 = upcomingEvents.filter(e => e.event_date && e.event_date > fmt(day1) && e.event_date <= fmt(day3));
      const within7 = upcomingEvents.filter(e => e.event_date && e.event_date > fmt(day3) && e.event_date <= fmt(day7));

      const context = JSON.stringify({
        today,
        tours: tours.map(t => ({ name: t.name, state: t.akb_state })),
        time_horizons: {
          next_24h: within1.map(e => ({ date: e.event_date, venue: e.venue, city: e.city, day_title: e.notes?.split("\n")[0] || null })),
          next_3_days: within3.map(e => ({ date: e.event_date, venue: e.venue, city: e.city, day_title: e.notes?.split("\n")[0] || null })),
          next_7_days: within7.map(e => ({ date: e.event_date, venue: e.venue, city: e.city, day_title: e.notes?.split("\n")[0] || null })),
        },
        upcoming_events: upcomingEvents.map(e => ({
          date: e.event_date,
          venue: e.venue,
          city: e.city,
          day_title: e.notes?.split("\n")[0] || null,
        })),
        open_gaps: openGaps.map(g => ({ question: g.question?.substring(0, 80), domain: g.domain })),
        open_conflicts: openConflicts.map(c => ({ type: c.conflict_type, severity: c.severity })),
      });

      const resp = await supabase.functions.invoke("generate-tldr", {
        body: { context },
      });

      if (resp.data?.lines) {
        // Handle both formats: structured {text, actionable} or plain strings
        const items = resp.data.lines.map((item: any) => {
          if (typeof item === "string") {
            return {
              text: item,
              actionable: /conflict|duplicate|missing|unresolved|issue|problem|error|gap|block/i.test(item),
            };
          }
          return item;
        });
        setTldr(items);
      } else {
        const lines: Array<{ text: string; actionable: boolean }> = [];
        if (upcomingEvents.length > 0) {
          const next = upcomingEvents[0];
          lines.push({ text: `Next up: ${next.notes?.split("\n")[0] || next.venue || "Event"} on ${next.event_date}${next.city ? ` in ${next.city}` : ""}.`, actionable: false });
        }
        if (openConflicts.length > 0) {
          lines.push({ text: `⚠ ${openConflicts.length} unresolved conflict${openConflicts.length > 1 ? "s" : ""} need attention.`, actionable: true });
        }
        if (openGaps.length > 0) {
          lines.push({ text: `${openGaps.length} open knowledge gap${openGaps.length > 1 ? "s" : ""} — missing info that could block advance.`, actionable: true });
        }
        if (upcomingEvents.length > 1) {
          lines.push({ text: `${upcomingEvents.length} events on the horizon across ${tours.length} tour${tours.length > 1 ? "s" : ""}.`, actionable: false });
        }
        if (lines.length === 0) lines.push({ text: "All clear — no urgent items right now.", actionable: false });
        setTldr(lines);
      }
    } catch (err) {
      console.error("TLDR generation failed:", err);
      setTldr([{ text: "Unable to generate briefing. Check back shortly.", actionable: false }]);
    }
    setTldrLoading(false);
  };

  const handleTourClick = (tourId: string) => {
    if (editingId) return;
    setSelectedTourId(tourId);
    navigate("/bunk/documents");
  };

  const startRename = (e: React.MouseEvent, tour: { id: string; name: string }) => {
    e.stopPropagation();
    setEditingId(tour.id);
    setEditName(tour.name);
  };

  const saveRename = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!editingId || !editName.trim()) return;
    const { error } = await supabase
      .from("tours")
      .update({ name: editName.trim() })
      .eq("id", editingId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Tour renamed" });
      reload();
    }
    setEditingId(null);
  };

  const cancelRename = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(null);
  };

  const confirmDelete = async () => {
    if (!deletingTour) return;
    const { error } = await supabase.from("tours").delete().eq("id", deletingTour.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Tour deleted" });
      reload();
    }
    setDeletingTour(null);
  };

  const totalEvents = Object.values(tourEventCounts).reduce((s, n) => s + n, 0);

  // Assign each tour a distinct accent color
  const tourColors = ["hsl(var(--primary))", "hsl(var(--info))", "hsl(var(--warning))", "hsl(var(--success))", "hsl(var(--destructive))"];

  const cards = [
    { label: "ACTIVE TOURS", value: tours.length, icon: Radio, color: "text-primary", link: null },
    { label: "SCHEDULE EVENTS", value: totalEvents, icon: BarChart3, color: "text-info", link: "/bunk/calendar" },
  ];

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Operations Overview</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Real-time tour intelligence
          </p>
        </div>
        <Button size="sm" className="font-mono text-xs tracking-wider" onClick={() => navigate("/bunk/setup")}>
          <Plus className="mr-2 h-3 w-3" />
          NEW TOUR
        </Button>
      </div>

      {/* TLDR Briefing */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-lg border border-primary/20 bg-primary/5 p-5"
      >
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-primary" />
          <span className="font-mono text-[10px] tracking-[0.15em] text-primary font-semibold">
            DAILY BRIEFING
          </span>
        </div>
        {tldrLoading ? (
          <div className="flex items-center gap-2 py-2">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-mono">Generating briefing...</span>
          </div>
        ) : (
          <div className="space-y-2.5">
            {tldr.map((item, i) => (
              <div key={i} className="flex items-start gap-2 group">
                <span className="text-primary/60 mt-0.5 shrink-0">▸</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground/90 leading-relaxed font-mono">
                    {item.text}
                  </p>
                  {item.actionable && (
                    <button
                      onClick={() => navigate(`/bunk/chat?q=${encodeURIComponent(item.text)}`)}
                      className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-mono tracking-wider text-primary hover:text-primary/80 transition-colors"
                    >
                      <ChevronRight className="h-3 w-3" />
                      ASK TELA
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            onClick={() => card.link && navigate(card.link)}
            className={`rounded-lg border border-border bg-card p-5 ${card.link ? "cursor-pointer hover:border-primary/50 transition-colors" : ""}`}
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground">
                {card.label}
              </span>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
            <p className="text-3xl font-bold font-mono">{card.value}</p>
            {card.label === "SCHEDULE EVENTS" && tours.length > 1 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {tours.map((tour, ti) => (
                  <span
                    key={tour.id}
                    className="inline-flex items-center gap-1.5 text-[10px] font-mono"
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: tourColors[ti % tourColors.length] }}
                    />
                    <span className="text-muted-foreground truncate max-w-[100px]">{tour.name}</span>
                    <span className="font-semibold text-foreground">{tourEventCounts[tour.id] ?? 0}</span>
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Tour List */}
      <div>
        <h2 className="text-sm font-mono text-muted-foreground tracking-wider mb-4">
          ACTIVE TOURS — click to manage
        </h2>
        {tours.length === 0 ? (
          <div className="rounded-lg border border-border border-dashed bg-card/50 p-8 text-center">
            <Activity className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-mono">
              No active tours. Create one to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tours.map((tour, i) => (
              <motion.div
                key={tour.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => handleTourClick(tour.id)}
                className="w-full flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4 hover:border-primary/50 hover:bg-card/80 transition-colors text-left group cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  {editingId === tour.id ? (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 bg-muted font-mono text-sm max-w-xs"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename();
                          if (e.key === "Escape") cancelRename();
                        }}
                        autoFocus
                      />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={saveRename}>
                        <Check className="h-3 w-3 text-success" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={cancelRename}>
                        <X className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="font-medium">{tour.name}</p>
                      <p className="text-xs font-mono text-muted-foreground mt-1">
                        ID: {tour.id.slice(0, 8)}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`font-mono text-xs tracking-wider font-semibold ${stateColors[tour.akb_state] ?? "text-muted-foreground"}`}
                  >
                    {tour.akb_state}
                  </span>
                  <div
                    className={`h-2 w-2 rounded-full ${
                      tour.akb_state === "SOVEREIGN"
                        ? "bg-success"
                        : tour.akb_state === "CONFLICT"
                        ? "bg-destructive"
                        : "bg-info animate-pulse"
                    }`}
                  />
                  {editingId !== tour.id && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => startRename(e, tour)}
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingTour({ id: tour.id, name: tour.name });
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingTour} onOpenChange={(open) => !open && setDeletingTour(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono tracking-wider">DELETE TOUR</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-xs">
              Permanently delete <strong>{deletingTour?.name}</strong> and all associated data? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-xs">CANCEL</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono text-xs"
            >
              DELETE
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BunkOverview;
