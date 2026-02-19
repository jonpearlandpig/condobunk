import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTour } from "@/hooks/useTour";
import { format, parseISO } from "date-fns";
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type EventCategory = "SHOW" | "TRAVEL";

interface CalendarEntry {
  id: string;
  date: string; // YYYY-MM-DD
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

const BunkCalendar = () => {
  const { selectedTourId } = useTour();
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (selectedTourId) loadCalendar();
  }, [selectedTourId]);

  const loadCalendar = async () => {
    setLoading(true);
    const merged: CalendarEntry[] = [];

    // 1) SHOW events from schedule_events
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

    // 2) TRAVEL entries from knowledge_gaps (domain = 'TRAVEL')
    const { data: travelGaps } = await supabase
      .from("knowledge_gaps")
      .select("*")
      .eq("tour_id", selectedTourId)
      .eq("domain", "TRAVEL")
      .eq("resolved", true);

    if (travelGaps) {
      for (const t of travelGaps) {
        // Parse the encoded question: [TRAVEL YYYY-MM-DD] TYPE | details...
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

    // Sort by date
    merged.sort((a, b) => a.date.localeCompare(b.date));
    setEntries(merged);
    setLoading(false);
  };

  // Group entries by date
  const grouped: Record<string, CalendarEntry[]> = {};
  for (const e of entries) {
    if (!grouped[e.date]) grouped[e.date] = [];
    grouped[e.date].push(e);
  }

  const categoryColor = (cat: EventCategory) =>
    cat === "SHOW"
      ? "bg-primary/10 text-primary border-primary/20"
      : "bg-accent/60 text-accent-foreground border-accent";

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          Auto-populated from AKB — shows & travel
        </p>
      </div>

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
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, dayEntries]) => {
            let formattedDate = "TBD";
            try {
              formattedDate = format(parseISO(date), "EEEE, MMM d, yyyy");
            } catch {}

            return (
              <div key={date}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <h3 className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
                    {formattedDate}
                  </h3>
                </div>
                <div className="space-y-2 ml-4 border-l border-border pl-4">
                  {dayEntries.map((entry, i) => {
                    const Icon =
                      entry.category === "SHOW"
                        ? Music
                        : TRAVEL_ICONS[entry.travelType || ""] || Plane;

                    return (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
                      >
                        <div className={`mt-0.5 rounded-md p-1.5 ${categoryColor(entry.category)}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">
                              {entry.title}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] font-mono shrink-0"
                            >
                              {entry.category}
                            </Badge>
                          </div>
                          {entry.subtitle && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {entry.subtitle}
                              </span>
                            </div>
                          )}
                          {entry.details.length > 0 && (
                            <div className="flex flex-wrap gap-3 mt-1.5 font-mono text-[11px] text-muted-foreground">
                              {entry.details.map((d, j) => (
                                <span key={j} className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {d}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {entry.confidence !== undefined && (
                          <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0">
                            {(entry.confidence * 100).toFixed(0)}%
                          </span>
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
    </div>
  );
};

export default BunkCalendar;
