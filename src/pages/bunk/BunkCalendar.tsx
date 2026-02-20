import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTour } from "@/hooks/useTour";
import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  eachDayOfInterval,
  isToday,
  isSameMonth,
} from "date-fns";
import { motion } from "framer-motion";
import {
  MapPin,
  Clock,
  Plane,
  Hotel,
  Bus,
  Music,
  Calendar as CalendarIcon,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type EventCategory = "SHOW" | "TRAVEL";
type ViewMode = "week" | "month";

interface CalendarEntry {
  id: string;
  date: string;
  category: EventCategory;
  title: string;
  subtitle?: string;
  address?: string;
  notes?: string;
  details: string[];
  confidence?: number;
  travelType?: string;
}

const TRAVEL_ICONS: Record<string, typeof Plane> = {
  FLIGHT: Plane,
  BUS: Bus,
  VAN: Bus,
  HOTEL: Hotel,
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const BunkCalendar = () => {
  const { selectedTourId } = useTour();
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null);

  useEffect(() => {
    if (selectedTourId) loadCalendar();
  }, [selectedTourId]);

  // Auto-resync: listen for changes to schedule_events and knowledge_gaps
  useEffect(() => {
    if (!selectedTourId) return;

    const channel = supabase
      .channel(`calendar-sync-${selectedTourId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedule_events", filter: `tour_id=eq.${selectedTourId}` },
        () => loadCalendar()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "knowledge_gaps", filter: `tour_id=eq.${selectedTourId}` },
        () => loadCalendar()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTourId]);

  // Always start on today — no auto-jump to first event date

  const loadCalendar = async () => {
    setLoading(true);
    const merged: CalendarEntry[] = [];

    const { data: shows } = await supabase
      .from("schedule_events")
      .select("*")
      .eq("tour_id", selectedTourId)
      .order("event_date", { ascending: true });

    if (shows) {
      for (const s of shows) {
        const details: string[] = [];
        if (s.load_in) {
          try { details.push(`Load-in: ${format(new Date(s.load_in), "h:mm a")}`); } catch {}
        }
        if (s.show_time) {
          try { details.push(`Show: ${format(new Date(s.show_time), "h:mm a")}`); } catch {}
        }
        if (s.end_time) {
          try { details.push(`End: ${format(new Date(s.end_time), "h:mm a")}`); } catch {}
        }
        // Parse notes for address and other info
        const notes = (s as any).notes as string | null;
        let address: string | undefined;
        const noteLines: string[] = [];
        if (notes) {
          for (const line of notes.split("\n").filter(Boolean)) {
            const trimmed = line.trim();
            if (trimmed.toLowerCase().startsWith("address:")) {
              address = trimmed.replace(/^address:\s*/i, "");
            } else {
              noteLines.push(trimmed);
            }
          }
        }
        merged.push({
          id: s.id,
          date: s.event_date || "9999-12-31",
          category: "SHOW",
          title: s.venue || "TBD Venue",
          subtitle: s.city || undefined,
          address,
          notes: noteLines.length > 0 ? noteLines.join("\n") : undefined,
          details,
          confidence: s.confidence_score ?? undefined,
        });
      }
    }

    const { data: travelGaps } = await supabase
      .from("knowledge_gaps")
      .select("*")
      .eq("tour_id", selectedTourId)
      .eq("domain", "TRAVEL")
      .eq("resolved", true);

    if (travelGaps) {
      for (const t of travelGaps) {
        const q = t.question || "";
        const dateMatch = q.match(/\[TRAVEL\s*(\d{4}-\d{2}-\d{2})?\]/);
        const travelDate = dateMatch?.[1] || "9999-12-31";
        const payload = q.replace(/\[TRAVEL[^\]]*\]\s*/, "");
        const parts = payload.split(" | ").filter(Boolean);
        const travelType = parts[0] || "OTHER";
        const detailParts = parts.slice(1);

        merged.push({
          id: t.id,
          date: travelDate,
          category: "TRAVEL",
          title: detailParts[0] || travelType,
          subtitle: travelType !== detailParts[0] ? travelType : undefined,
          details: detailParts.slice(1),
          travelType,
        });
      }
    }

    merged.sort((a, b) => a.date.localeCompare(b.date));
    setEntries(merged);
    setLoading(false);
  };

  const entriesByDate = useMemo(() => {
    const map: Record<string, CalendarEntry[]> = {};
    for (const e of entries) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [entries]);

  // Compute visible days
  const visibleDays = useMemo(() => {
    if (viewMode === "week") {
      const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
      const we = endOfWeek(currentDate, { weekStartsOn: 0 });
      return eachDayOfInterval({ start: ws, end: we });
    } else {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      const gridStart = startOfWeek(ms, { weekStartsOn: 0 });
      const gridEnd = endOfWeek(me, { weekStartsOn: 0 });
      return eachDayOfInterval({ start: gridStart, end: gridEnd });
    }
  }, [currentDate, viewMode]);

  const navigate = (dir: -1 | 1) => {
    if (viewMode === "week") {
      setCurrentDate(dir === 1 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    } else {
      setCurrentDate(dir === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    }
  };

  const headerLabel =
    viewMode === "week"
      ? `${format(visibleDays[0], "MMM d")} – ${format(visibleDays[6], "MMM d, yyyy")}`
      : format(currentDate, "MMMM yyyy");

  const visibleEventCount = visibleDays.reduce((sum, day) => {
    const key = format(day, "yyyy-MM-dd");
    return sum + (entriesByDate[key]?.length || 0);
  }, 0);

  const isMonthView = viewMode === "month";
  const cellMinH = isMonthView ? "min-h-[90px]" : "min-h-[140px]";

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            {headerLabel}
            {visibleEventCount > 0 && (
              <span className="ml-2 text-primary">· {visibleEventCount} events</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-1.5 text-[11px] font-mono tracking-wider transition-colors ${
                viewMode === "week"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              WEEK
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-1.5 text-[11px] font-mono tracking-wider transition-colors ${
                viewMode === "month"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              MONTH
            </button>
          </div>
          {/* Nav */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs h-8"
            onClick={() => setCurrentDate(new Date())}
          >
            Today
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed bg-card/50 p-12 text-center">
          <CalendarIcon className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-mono">
            No events yet. Upload documents to auto-populate the calendar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border border-border">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="bg-muted/50 px-2 py-2 text-center text-[11px] font-mono tracking-wider text-muted-foreground uppercase"
            >
              {day}
            </div>
          ))}

          {visibleDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEntries = entriesByDate[key] || [];
            const today = isToday(day);
            const dimmed = isMonthView && !isSameMonth(day, currentDate);
            const maxVisible = isMonthView ? 2 : 4;
            const overflow = dayEntries.length - maxVisible;

            return (
              <div
                key={key}
                className={`bg-card ${cellMinH} p-1.5 flex flex-col ${
                  today ? "ring-1 ring-inset ring-primary/40" : ""
                } ${dimmed ? "opacity-40" : ""}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-mono ${
                      today
                        ? "bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold"
                        : "text-muted-foreground"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                <div className="flex-1 space-y-0.5 overflow-hidden">
                  {dayEntries.slice(0, maxVisible).map((entry, i) => {
                    const Icon =
                      entry.category === "SHOW"
                        ? Music
                        : TRAVEL_ICONS[entry.travelType || ""] || Plane;

                    return (
                      <motion.button
                        key={entry.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                        onClick={() => setSelectedEntry(entry)}
                        className={`w-full text-left rounded px-1.5 py-0.5 text-[10px] leading-tight transition-colors ${
                          entry.category === "SHOW"
                            ? "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                            : "bg-accent/60 text-accent-foreground border border-accent hover:bg-accent/80"
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <Icon className="h-2.5 w-2.5 shrink-0" />
                          <span className="font-medium truncate">{entry.title}</span>
                        </div>
                        {entry.subtitle && (
                          <div className="text-[9px] opacity-70 truncate pl-3.5">{entry.subtitle}</div>
                        )}
                      </motion.button>
                    );
                  })}
                  {overflow > 0 && (
                    <p className="text-[9px] font-mono text-muted-foreground pl-1">
                      +{overflow} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Event Detail Dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="sm:max-w-md">
          {selectedEntry && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  {selectedEntry.category === "SHOW" ? (
                    <div className="rounded-md p-1.5 bg-primary/10 text-primary">
                      <Music className="h-4 w-4" />
                    </div>
                  ) : (
                    <div className="rounded-md p-1.5 bg-accent/60 text-accent-foreground">
                      {(() => {
                        const TIcon = TRAVEL_ICONS[selectedEntry.travelType || ""] || Plane;
                        return <TIcon className="h-4 w-4" />;
                      })()}
                    </div>
                  )}
                  <div>
                    <DialogTitle className="text-base">{selectedEntry.title}</DialogTitle>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      {(() => {
                        try {
                          return format(parseISO(selectedEntry.date), "EEEE, MMM d, yyyy");
                        } catch {
                          return "TBD";
                        }
                      })()}
                    </p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px] tracking-wider">
                    {selectedEntry.category}
                  </Badge>
                  {selectedEntry.confidence !== undefined && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {(selectedEntry.confidence * 100).toFixed(0)}% confidence
                    </span>
                  )}
                </div>

                {selectedEntry.subtitle && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span>{selectedEntry.subtitle}</span>
                  </div>
                )}

                {selectedEntry.address && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{selectedEntry.address}</span>
                  </div>
                )}

                {selectedEntry.notes && (
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-[11px] font-mono tracking-wider text-muted-foreground uppercase mb-1.5">Notes</p>
                    <p className="text-sm text-foreground whitespace-pre-line">{selectedEntry.notes}</p>
                  </div>
                )}

                {selectedEntry.details.length > 0 && (
                  <div className="space-y-1.5 rounded-md bg-muted/50 p-3">
                    {selectedEntry.details.map((d, j) => (
                      <div key={j} className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>{d}</span>
                      </div>
                    ))}
                  </div>
                )}

                {selectedEntry.details.length === 0 && !selectedEntry.subtitle && (
                  <p className="text-sm text-muted-foreground font-mono italic">
                    No additional details available.
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BunkCalendar;
