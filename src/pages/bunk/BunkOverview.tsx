import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import { useIsMobile } from "@/hooks/use-mobile";
import PullToRefresh from "@/components/ui/pull-to-refresh";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  isToday,
  format,
} from "date-fns";
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
  CalendarDays,
  MapPin,
  Clock,
  Sparkles,
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
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const isWelcome = searchParams.get("welcome") === "1";
  const [tourEventCounts, setTourEventCounts] = useState<Record<string, number>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingTour, setDeletingTour] = useState<{ id: string; name: string } | null>(null);
  const [tldr, setTldr] = useState<Array<{ text: string; actionable: boolean }>>([]);
  const [tldrLoading, setTldrLoading] = useState(false);
  const [eventDates, setEventDates] = useState<Array<{ id: string; event_date: string; tour_id: string; venue: string | null; city: string | null; show_time: string | null; load_in: string | null; notes: string | null }>>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Clear welcome param after initial render so it doesn't persist on refresh
  useEffect(() => {
    if (isWelcome) {
      const timeout = setTimeout(() => {
        setSearchParams({}, { replace: true });
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [isWelcome]);

  useEffect(() => {
    if (!user || tours.length === 0) return;
    loadCounts();
    loadEventDates();
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

  const loadEventDates = async () => {
    const tourIds = tours.map(t => t.id);
    if (tourIds.length === 0) return;
    const { data } = await supabase
      .from("schedule_events")
      .select("id, event_date, tour_id, venue, city, show_time, load_in, notes")
      .in("tour_id", tourIds)
      .not("event_date", "is", null)
      .order("event_date");
    setEventDates((data || []).filter(d => d.event_date) as typeof eventDates);
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
        setTldr([
          { text: "Ready to build a new tour.", actionable: false },
          { text: "Upload your Contacts and Advance Master documents to get started.", actionable: false },
        ]);
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
  const tourColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    tours.forEach((t, i) => { m[t.id] = tourColors[i % tourColors.length]; });
    return m;
  }, [tours]);

  // Build event lookup: dateStr -> tour_ids[]
  const eventsByDate = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const e of eventDates) {
      if (!map[e.event_date]) map[e.event_date] = new Set();
      map[e.event_date].add(e.tour_id);
    }
    return map;
  }, [eventDates]);

  // Events for selected date
  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    return eventDates.filter(e => e.event_date === selectedDate);
  }, [selectedDate, eventDates]);

  // Tour name lookup
  const tourNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    tours.forEach(t => { m[t.id] = t.name; });
    return m;
  }, [tours]);

  // Calendar grid days
  const calendarDays = useMemo(() => {
    const today = new Date();
    if (isMobile) {
      // 2-week rolling from today
      return Array.from({ length: 14 }, (_, i) => addDays(today, i));
    }
    // Full month grid
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    const gridStart = startOfWeek(monthStart);
    const gridEnd = endOfWeek(monthEnd);
    const days: Date[] = [];
    let d = gridStart;
    while (d <= gridEnd) {
      days.push(d);
      d = addDays(d, 1);
    }
    return days;
  }, [isMobile]);

  const cards = [
    { label: "ACTIVE TOURS", value: tours.length, icon: Radio, color: "text-primary", link: null },
    { label: "SCHEDULE EVENTS", value: totalEvents, icon: BarChart3, color: "text-info", link: "/bunk/calendar" },
  ];

  const handleRefresh = useCallback(async () => {
    await Promise.all([loadCounts(), loadEventDates(), generateTldr()]);
  }, [tours]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="space-y-5 sm:space-y-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">TELA TL;DR</h1>
          <p className="text-xs sm:text-sm text-muted-foreground font-mono mt-0.5 sm:mt-1">
            Real-time tour intelligence
          </p>
        </div>
        <Button size="sm" className="font-mono text-xs tracking-wider" onClick={() => navigate("/bunk/setup")}>
          <Plus className="mr-1 sm:mr-2 h-3 w-3" />
          <span className="hidden sm:inline">NEW TOUR</span>
          <span className="sm:hidden">NEW</span>
        </Button>
      </div>

      {/* TLDR Briefing */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-lg border border-primary/20 bg-primary/5 p-3 sm:p-5"
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
                      className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-mono tracking-wider text-primary hover:text-primary/80 transition-colors min-h-[44px] sm:min-h-0 px-2 -mx-2 sm:px-0 sm:mx-0"
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

      {/* Welcome Quick Actions for new invitees */}
      {isWelcome && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-lg border border-primary/30 bg-primary/5 p-5"
        >
          <p className="font-mono text-[10px] tracking-[0.15em] text-primary font-semibold mb-3">
            👋 YOU'RE IN — HERE'S WHERE TO START
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => navigate("/bunk/chat?scope=tour")}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left hover:border-primary/50 transition-colors group"
            >
              <Zap className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-semibold">Ask TELA anything</p>
                <p className="text-xs text-muted-foreground mt-0.5">Get up to speed on your tour</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <button
              onClick={() => navigate("/bunk/calendar")}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left hover:border-primary/50 transition-colors group"
            >
              <BarChart3 className="h-5 w-5 text-info shrink-0" />
              <div>
                <p className="text-sm font-semibold">View the schedule</p>
                <p className="text-xs text-muted-foreground mt-0.5">See what's coming up</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Calendar Widget */}
      {eventDates.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-lg border border-border bg-card p-3 sm:p-5"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground font-semibold">
                {isMobile ? "NEXT 2 WEEKS" : format(new Date(), "MMMM yyyy").toUpperCase()}
              </span>
            </div>
            <button
              onClick={() => navigate("/bunk/calendar")}
              className="font-mono text-[10px] text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
            >
              FULL CALENDAR <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {/* Day-of-week headers */}
          {!isMobile && (
            <div className="grid grid-cols-7 mb-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                <div key={d} className="text-center font-mono text-[9px] text-muted-foreground uppercase tracking-wider py-1">
                  {d}
                </div>
              ))}
            </div>
          )}

          <div className={isMobile
            ? "grid grid-cols-7 gap-0.5"
            : "grid grid-cols-7 gap-0.5"
          }>
            {calendarDays.map((day, i) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const tourIdsForDay = eventsByDate[dateStr];
              const hasEvents = !!tourIdsForDay;
              const today = isToday(day);
              const outsideMonth = !isMobile && !isSameMonth(day, new Date());

              return (
                <button
                  key={i}
                  onClick={() => hasEvents && setSelectedDate(dateStr)}
                  className={`relative flex flex-col items-center justify-center rounded-md transition-all py-1.5 sm:py-2 min-h-[36px] sm:min-h-[44px] ${
                    today
                      ? "bg-primary/15 border border-primary/30"
                      : hasEvents
                      ? "hover:bg-muted/50 cursor-pointer"
                      : "cursor-default"
                  } ${outsideMonth ? "opacity-30" : ""}`}
                >
                  <span className={`font-mono text-[11px] sm:text-xs leading-none ${
                    today ? "font-bold text-primary" : "text-foreground"
                  }`}>
                    {format(day, "d")}
                  </span>
                  {isMobile && (
                    <span className="font-mono text-[8px] text-muted-foreground leading-none mt-0.5">
                      {format(day, "EEE")}
                    </span>
                  )}
                  {hasEvents && (
                    <div className="flex gap-0.5 mt-1">
                      {Array.from(tourIdsForDay).slice(0, 3).map(tid => (
                        <span
                          key={tid}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: tourColorMap[tid] || "hsl(var(--primary))" }}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tour legend */}
          {tours.length > 1 && (
            <div className="flex flex-wrap gap-3 mt-3 pt-2 border-t border-border">
              {tours.map((tour, ti) => (
                <span key={tour.id} className="inline-flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tourColors[ti % tourColors.length] }} />
                  {tour.name}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Inline Event Card Dialog */}
      <ResponsiveDialog open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <ResponsiveDialogContent className="sm:max-w-md">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle className="font-mono tracking-wider text-sm">
              {selectedDate ? format(new Date(selectedDate + "T12:00:00"), "EEEE, MMM d, yyyy").toUpperCase() : ""}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="text-xs font-mono text-muted-foreground">
              {selectedDateEvents.length} event{selectedDateEvents.length !== 1 ? "s" : ""}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ScrollArea className="max-h-[60dvh] overflow-y-auto">
            <div className="space-y-3 px-1 pb-2">
              {selectedDateEvents.map((evt) => {
                const tourName = tourNameMap[evt.tour_id] || "Tour";
                const color = tourColorMap[evt.tour_id] || "hsl(var(--primary))";
                return (
                  <div
                    key={evt.id}
                    className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase truncate">
                        {tourName}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight truncate">
                          {evt.venue || "Venue TBD"}
                        </p>
                        {evt.city && (
                          <p className="text-xs text-muted-foreground">{evt.city}</p>
                        )}
                      </div>
                    </div>
                    {(evt.show_time || evt.load_in) && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div className="flex gap-3 text-xs font-mono text-muted-foreground">
                          {evt.show_time && (
                            <span>Show: {format(new Date(evt.show_time), "h:mm a")}</span>
                          )}
                          {evt.load_in && (
                            <span>Load-in: {format(new Date(evt.load_in), "h:mm a")}</span>
                          )}
                        </div>
                      </div>
                    )}
                    {evt.notes && (
                      <p className="text-xs text-muted-foreground/80 font-mono line-clamp-2 pl-5">
                        {evt.notes}
                      </p>
                    )}
                    <button
                      onClick={() => {
                        const q = `What's the full rundown for ${evt.venue || "the venue"} in ${evt.city || "the city"} on ${selectedDate ? format(new Date(selectedDate + "T12:00:00"), "MMM d") : "that date"}?`;
                        setSelectedTourId(evt.tour_id);
                        setSelectedDate(null);
                        navigate(`/bunk/chat?q=${encodeURIComponent(q)}&scope=tour`);
                      }}
                      className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-mono tracking-wider text-primary hover:text-primary/80 transition-colors min-h-[44px] sm:min-h-0 px-2 -mx-2 sm:px-0 sm:mx-0"
                    >
                      <Sparkles className="h-3 w-3" />
                      ASK TELA
                    </button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <button
              onClick={() => { setSelectedDate(null); navigate("/bunk/calendar"); }}
              className="font-mono text-[11px] text-primary hover:text-primary/80 transition-colors flex items-center gap-1 min-h-[44px] sm:min-h-0"
            >
              VIEW FULL CALENDAR <ChevronRight className="h-3 w-3" />
            </button>
            <button
              onClick={() => {
                const q = `What's happening on ${selectedDate ? format(new Date(selectedDate + "T12:00:00"), "MMM d") : "that date"}?`;
                setSelectedDate(null);
                navigate(`/bunk/chat?q=${encodeURIComponent(q)}&scope=tour`);
              }}
              className="font-mono text-[11px] text-primary hover:text-primary/80 transition-colors flex items-center gap-1 min-h-[44px] sm:min-h-0"
            >
              <Sparkles className="h-3 w-3" />
              ASK TELA
            </button>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>


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
    </PullToRefresh>
  );
};

export default BunkOverview;
