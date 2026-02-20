import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTour } from "@/hooks/useTour";
import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isSameDay,
  isToday,
} from "date-fns";
import { motion } from "framer-motion";
import {
  MapPin,
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

type EventCategory = "SHOW" | "TRAVEL";

interface CalendarEntry {
  id: string;
  date: string;
  category: EventCategory;
  title: string;
  subtitle?: string;
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
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );

  useEffect(() => {
    if (selectedTourId) loadCalendar();
  }, [selectedTourId]);

  // Jump to first event week when data loads
  useEffect(() => {
    if (entries.length > 0) {
      const firstDate = parseISO(entries[0].date);
      if (!isNaN(firstDate.getTime())) {
        setCurrentWeekStart(startOfWeek(firstDate, { weekStartsOn: 0 }));
      }
    }
  }, [entries]);

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
        merged.push({
          id: s.id,
          date: s.event_date || "9999-12-31",
          category: "SHOW",
          title: s.venue || "TBD Venue",
          subtitle: s.city || undefined,
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

  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: currentWeekStart, end: weekEnd });

  const entriesByDate = useMemo(() => {
    const map: Record<string, CalendarEntry[]> = {};
    for (const e of entries) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [entries]);

  // Count events in current week
  const weekEventCount = weekDays.reduce((sum, day) => {
    const key = format(day, "yyyy-MM-dd");
    return sum + (entriesByDate[key]?.length || 0);
  }, 0);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            {format(currentWeekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
            {weekEventCount > 0 && (
              <span className="ml-2 text-primary">· {weekEventCount} events</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs h-8"
            onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border border-border">
          {/* Header row */}
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="bg-muted/50 px-2 py-2 text-center text-[11px] font-mono tracking-wider text-muted-foreground uppercase"
            >
              {day}
            </div>
          ))}

          {/* Day cells */}
          {weekDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEntries = entriesByDate[key] || [];
            const today = isToday(day);

            return (
              <div
                key={key}
                className={`bg-card min-h-[140px] p-2 flex flex-col ${
                  today ? "ring-1 ring-inset ring-primary/40" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`text-xs font-mono ${
                      today
                        ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center font-bold"
                        : "text-muted-foreground"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                <div className="flex-1 space-y-1 overflow-y-auto">
                  {dayEntries.map((entry, i) => {
                    const Icon =
                      entry.category === "SHOW"
                        ? Music
                        : TRAVEL_ICONS[entry.travelType || ""] || Plane;

                    return (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className={`rounded px-1.5 py-1 text-[10px] leading-tight cursor-default ${
                          entry.category === "SHOW"
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-accent/60 text-accent-foreground border border-accent"
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <Icon className="h-2.5 w-2.5 shrink-0" />
                          <span className="font-medium truncate">
                            {entry.title}
                          </span>
                        </div>
                        {entry.subtitle && (
                          <div className="flex items-center gap-0.5 mt-0.5 text-muted-foreground">
                            <MapPin className="h-2 w-2 shrink-0" />
                            <span className="truncate">{entry.subtitle}</span>
                          </div>
                        )}
                        {entry.details.length > 0 && (
                          <p className="text-muted-foreground mt-0.5 truncate">
                            {entry.details[0]}
                          </p>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="rounded-lg border border-border border-dashed bg-card/50 p-12 text-center">
          <CalendarIcon className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-mono">
            No events yet. Upload documents to auto-populate the calendar.
          </p>
        </div>
      )}
    </div>
  );
};

export default BunkCalendar;
