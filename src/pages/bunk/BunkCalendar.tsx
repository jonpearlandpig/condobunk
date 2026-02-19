import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { MapPin, Clock } from "lucide-react";

interface ScheduleEvent {
  id: string;
  city: string | null;
  venue: string | null;
  event_date: string | null;
  load_in: string | null;
  show_time: string | null;
  end_time: string | null;
  confidence_score: number;
}

const BunkCalendar = () => {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    const { data } = await supabase
      .from("schedule_events")
      .select("*")
      .order("event_date", { ascending: true });
    if (data) setEvents(data as ScheduleEvent[]);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          Chronological schedule view
        </p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed bg-card/50 p-12 text-center">
          <Clock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-mono">
            No schedule events yet. Upload a schedule document to populate.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-start gap-4 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-[80px] font-mono text-xs text-muted-foreground">
                {event.event_date
                  ? format(new Date(event.event_date), "MMM dd")
                  : "TBD"}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3 w-3 text-primary" />
                  <span className="font-medium text-sm">
                    {event.venue || event.city || "Unknown Venue"}
                  </span>
                </div>
                {event.city && event.venue && (
                  <p className="text-xs text-muted-foreground mt-1">{event.city}</p>
                )}
                <div className="flex gap-4 mt-2 font-mono text-xs text-muted-foreground">
                  {event.load_in && (
                    <span>Load-in: {format(new Date(event.load_in), "HH:mm")}</span>
                  )}
                  {event.show_time && (
                    <span>Show: {format(new Date(event.show_time), "HH:mm")}</span>
                  )}
                  {event.end_time && (
                    <span>End: {format(new Date(event.end_time), "HH:mm")}</span>
                  )}
                </div>
              </div>
              <div className="font-mono text-[10px] text-muted-foreground/60">
                {(event.confidence_score * 100).toFixed(0)}%
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BunkCalendar;
