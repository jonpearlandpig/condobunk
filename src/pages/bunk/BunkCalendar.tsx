import { useEffect, useState, useMemo, useCallback } from "react";
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
  Globe,
  Copy,
  MessageSquare,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import VenueTelaMini from "@/components/bunk/VenueTelaMini";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  loadIn?: string;
  showTime?: string;
  endTime?: string;
  capacity?: string;
  details: string[];
  confidence?: number;
  travelType?: string;
  tourId: string;
  tourName: string;
}

const TRAVEL_ICONS: Record<string, typeof Plane> = {
  FLIGHT: Plane,
  BUS: Bus,
  VAN: Bus,
  HOTEL: Hotel,
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TOUR_COLORS = [
  { bg: "bg-primary/10", text: "text-primary", border: "border-primary/20", hover: "hover:bg-primary/20", dot: "bg-primary", bar: "bg-primary" },
  { bg: "bg-info/10", text: "text-info", border: "border-info/20", hover: "hover:bg-info/20", dot: "bg-info", bar: "bg-info" },
  { bg: "bg-success/10", text: "text-success", border: "border-success/20", hover: "hover:bg-success/20", dot: "bg-success", bar: "bg-success" },
  { bg: "bg-warning/10", text: "text-warning", border: "border-warning/20", hover: "hover:bg-warning/20", dot: "bg-warning", bar: "bg-warning" },
];

const formatStoredTime = (ts: string): string => {
  const d = new Date(ts);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
};

const buildShareText = (entry: CalendarEntry): string => {
  const lines: string[] = [];
  lines.push(`📍 ${entry.title}${entry.subtitle ? `, ${entry.subtitle}` : ""}`);
  try { lines.push(`📅 ${format(parseISO(entry.date), "EEEE, MMM d, yyyy")}`); } catch {}
  if (entry.address) lines.push(`🗺 ${entry.address}`);
  if (entry.capacity) lines.push(`🏟 Cap: ${entry.capacity}`);
  if (entry.loadIn) lines.push(`🚪 Load-in: ${entry.loadIn}`);
  if (entry.showTime) lines.push(`🎤 Show: ${entry.showTime}`);
  if (entry.endTime) lines.push(`🏁 End: ${entry.endTime}`);
  if (entry.notes) lines.push(`📝 ${entry.notes}`);
  lines.push(`— ${entry.tourName}`);
  return lines.join("\n");
};

const BunkCalendar = () => {
  const { tours } = useTour();
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null);
  const [tourFilter, setTourFilter] = useState<string>("all");
  const [copied, setCopied] = useState(false);

  const tourColorMap = useMemo(() => {
    const map: Record<string, number> = {};
    tours.forEach((t, i) => { map[t.id] = i % TOUR_COLORS.length; });
    return map;
  }, [tours]);

  const activeTourIds = useMemo(() => tours.map(t => t.id), [tours]);

  useEffect(() => {
    if (activeTourIds.length > 0) loadCalendar();
  }, [activeTourIds, tourFilter]);

  useEffect(() => {
    if (activeTourIds.length === 0) return;
    const channels = activeTourIds.map(tid =>
      supabase
        .channel(`calendar-sync-${tid}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "schedule_events", filter: `tour_id=eq.${tid}` }, () => loadCalendar())
        .on("postgres_changes", { event: "*", schema: "public", table: "knowledge_gaps", filter: `tour_id=eq.${tid}` }, () => loadCalendar())
        .subscribe()
    );
    return () => { channels.forEach(c => supabase.removeChannel(c)); };
  }, [activeTourIds]);

  const loadCalendar = async () => {
    setLoading(true);
    const merged: CalendarEntry[] = [];
    const tourIds = tourFilter === "all" ? activeTourIds : [tourFilter];
    if (tourIds.length === 0) { setEntries([]); setLoading(false); return; }

    const tourNameMap: Record<string, string> = {};
    tours.forEach(t => { tourNameMap[t.id] = t.name; });

    // Fetch schedule events + venue tech specs in parallel
    const [{ data: shows }, { data: techSpecs }] = await Promise.all([
      supabase.from("schedule_events").select("*").in("tour_id", tourIds).order("event_date", { ascending: true }),
      supabase.from("venue_tech_specs").select("normalized_venue_name, venue_name, venue_identity, dock_load_in, stage_specs, hospitality_catering, transportation_logistics, tour_id").in("tour_id", tourIds),
    ]);

    // Build a lookup: normalized venue name → tech spec data
    const specMap: Record<string, Record<string, unknown>> = {};
    if (techSpecs) {
      for (const spec of techSpecs) {
        const key = (spec.normalized_venue_name || spec.venue_name || "").toLowerCase().trim();
        if (key) specMap[key] = spec as Record<string, unknown>;
      }
    }

    const normalize = (s: string | null | undefined) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "");

    if (shows) {
      for (const s of shows) {
        let loadIn: string | undefined;
        let showTime: string | undefined;
        let endTime: string | undefined;
        const details: string[] = [];

        if (s.load_in) { try { loadIn = formatStoredTime(s.load_in); details.push(`Load-in: ${loadIn}`); } catch {} }
        if (s.show_time) { try { showTime = formatStoredTime(s.show_time); details.push(`Show: ${showTime}`); } catch {} }
        if (s.end_time) { try { endTime = formatStoredTime(s.end_time); details.push(`End: ${endTime}`); } catch {} }

        // Parse address from schedule notes
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

        // Enrich from venue tech spec if available
        const venueKey = normalize(s.venue);
        const spec = venueKey ? Object.entries(specMap).find(([k]) => normalize(k) === venueKey || k.includes(venueKey) || venueKey.includes(k))?.[1] : undefined;

        if (spec) {
          const identity = spec.venue_identity as Record<string, unknown> | null;
          const dockLoadIn = spec.dock_load_in as Record<string, unknown> | null;
          const hospitality = spec.hospitality_catering as Record<string, unknown> | null;
          const transport = spec.transportation_logistics as Record<string, unknown> | null;

          // Address from venue_identity
          if (!address && identity) {
            const addr = identity.address || identity.full_address || identity.street_address;
            if (addr) address = String(addr);
          }

          // Capacity
          if (identity?.capacity) details.push(`Capacity: ${identity.capacity}`);

          // Dock / load-in notes from tech spec
          if (dockLoadIn?.notes || dockLoadIn?.access) {
            const dockNote = dockLoadIn.notes || dockLoadIn.access;
            if (dockNote) noteLines.push(`🚛 ${dockNote}`);
          }

          // Parking / transport note
          if (transport?.parking || transport?.notes) {
            const tNote = transport.parking || transport.notes;
            if (tNote) noteLines.push(`🅿️ ${tNote}`);
          }

          // Hospitality note
          if (hospitality?.catering || hospitality?.notes) {
            const hNote = hospitality.catering || hospitality.notes;
            if (hNote) noteLines.push(`🍽 ${hNote}`);
          }
        }

        // Extract capacity for the entry
        let capacity: string | undefined;
        if (spec) {
          const identity = spec.venue_identity as Record<string, unknown> | null;
          if (identity?.capacity) capacity = String(identity.capacity);
        }

        merged.push({
          id: s.id,
          date: s.event_date || "9999-12-31",
          category: "SHOW",
          title: s.venue || "TBD Venue",
          subtitle: s.city || undefined,
          address,
          notes: noteLines.length > 0 ? noteLines.join("\n") : undefined,
          loadIn,
          showTime,
          endTime,
          capacity,
          details,
          confidence: s.confidence_score ?? undefined,
          tourId: s.tour_id,
          tourName: tourNameMap[s.tour_id] || "Unknown Tour",
        });
      }
    }

    const { data: travelGaps } = await supabase
      .from("knowledge_gaps")
      .select("*")
      .in("tour_id", tourIds)
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
          tourId: t.tour_id,
          tourName: tourNameMap[t.tour_id] || "Unknown Tour",
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

  const visibleDays = useMemo(() => {
    if (viewMode === "week") {
      return eachDayOfInterval({ start: startOfWeek(currentDate, { weekStartsOn: 0 }), end: endOfWeek(currentDate, { weekStartsOn: 0 }) });
    }
    const ms = startOfMonth(currentDate);
    const me = endOfMonth(currentDate);
    return eachDayOfInterval({ start: startOfWeek(ms, { weekStartsOn: 0 }), end: endOfWeek(me, { weekStartsOn: 0 }) });
  }, [currentDate, viewMode]);

  const nav = (dir: -1 | 1) => {
    if (viewMode === "week") setCurrentDate(dir === 1 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else setCurrentDate(dir === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
  };

  const handleCopy = useCallback((entry: CalendarEntry) => {
    navigator.clipboard.writeText(buildShareText(entry));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleSMS = useCallback((entry: CalendarEntry) => {
    const text = encodeURIComponent(buildShareText(entry));
    window.open(`sms:?body=${text}`, "_blank");
  }, []);

  const headerLabel =
    viewMode === "week"
      ? `${format(visibleDays[0], "MMM d")} – ${format(visibleDays[6], "MMM d, yyyy")}`
      : format(currentDate, "MMMM yyyy");

  const visibleEventCount = visibleDays.reduce((sum, day) => {
    const key = format(day, "yyyy-MM-dd");
    return sum + (entriesByDate[key]?.length || 0);
  }, 0);

  const isMonthView = viewMode === "month";
  const isGlobal = tourFilter === "all";

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            {headerLabel}
            {visibleEventCount > 0 && <span className="ml-2 text-primary">· {visibleEventCount} events</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {tours.length > 1 && (
            <Select value={tourFilter} onValueChange={setTourFilter}>
              <SelectTrigger className="w-44 font-mono text-xs bg-muted h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-mono text-xs">
                  <span className="flex items-center gap-1.5"><Globe className="h-3 w-3" /> All Tours</span>
                </SelectItem>
                {tours.map(t => (
                  <SelectItem key={t.id} value={t.id} className="font-mono text-xs">{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex rounded-md border border-border overflow-hidden">
            <button onClick={() => setViewMode("week")} className={`px-3 py-1.5 text-[11px] font-mono tracking-wider transition-colors ${viewMode === "week" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}>WEEK</button>
            <button onClick={() => setViewMode("month")} className={`px-3 py-1.5 text-[11px] font-mono tracking-wider transition-colors ${viewMode === "month" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}>MONTH</button>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="font-mono text-xs h-8" onClick={() => setCurrentDate(new Date())}>Today</Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Tour legend */}
      {isGlobal && tours.length > 1 && (
        <div className="flex items-center gap-3 flex-wrap">
          {tours.map((t, i) => {
            const colors = TOUR_COLORS[i % TOUR_COLORS.length];
            return (
              <button key={t.id} onClick={() => setTourFilter(t.id)} className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors">
                <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
                {t.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed bg-card/50 p-12 text-center">
          <CalendarIcon className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-mono">No events yet. Upload documents to auto-populate the calendar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border border-border">
          {WEEKDAYS.map((day) => (
            <div key={day} className="bg-muted/50 px-1 py-2 text-center text-[10px] font-mono tracking-wider text-muted-foreground uppercase">{day}</div>
          ))}

          {visibleDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEntries = entriesByDate[key] || [];
            const today = isToday(day);
            const dimmed = isMonthView && !isSameMonth(day, currentDate);
            const maxVisible = isMonthView ? 2 : 3;
            const overflow = dayEntries.length - maxVisible;

            return (
              <div
                key={key}
                className={`bg-card ${isMonthView ? "min-h-[90px]" : "min-h-[120px]"} p-1 flex flex-col ${today ? "ring-1 ring-inset ring-primary/40" : ""} ${dimmed ? "opacity-40" : ""}`}
              >
                <span className={`text-[10px] font-mono mb-1 self-start ${today ? "bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center font-bold" : "text-muted-foreground"}`}>
                  {format(day, "d")}
                </span>

                <div className="flex-1 space-y-px overflow-hidden">
                  {dayEntries.slice(0, maxVisible).map((entry, i) => {
                    const colorIdx = tourColorMap[entry.tourId] ?? 0;
                    const colors = TOUR_COLORS[colorIdx];
                    const Icon = entry.category === "SHOW" ? Music : (TRAVEL_ICONS[entry.travelType || ""] || Plane);

                    return (
                      <motion.button
                        key={entry.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                        onClick={() => setSelectedEntry(entry)}
                        className={`w-full text-left rounded px-1.5 py-1 text-[10px] leading-tight transition-colors border ${colors.bg} ${colors.text} ${colors.border} ${colors.hover}`}
                      >
                        {/* Venue / title */}
                        <div className="flex items-center gap-1">
                          <Icon className="h-2.5 w-2.5 shrink-0" />
                          <span className="font-semibold truncate">{entry.title}</span>
                        </div>
                        {/* City */}
                        {entry.subtitle && (
                          <div className="truncate opacity-70 pl-3.5 text-[9px]">{entry.subtitle}</div>
                        )}
                        {/* Show time — most critical field */}
                        {entry.showTime && (
                          <div className="truncate opacity-80 pl-3.5 text-[9px] font-mono">🎤 {entry.showTime}</div>
                        )}
                        {/* Load-in if no show time */}
                        {!entry.showTime && entry.loadIn && (
                          <div className="truncate opacity-70 pl-3.5 text-[9px] font-mono">🚪 {entry.loadIn}</div>
                        )}
                        {/* Tour name in global multi-tour mode */}
                        {isGlobal && tours.length > 1 && (
                          <div className="truncate opacity-50 pl-3.5 text-[9px] font-mono">{entry.tourName}</div>
                        )}
                      </motion.button>
                    );
                  })}
                  {overflow > 0 && (
                    <p className="text-[9px] font-mono text-muted-foreground pl-1">+{overflow} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Event Detail Dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={(open) => { if (!open) { setSelectedEntry(null); setCopied(false); } }}>
        <DialogContent className="sm:max-w-md">
          {selectedEntry && (() => {
            const colorIdx = tourColorMap[selectedEntry.tourId] ?? 0;
            const colors = TOUR_COLORS[colorIdx];
            return (
              <>
                <DialogHeader>
                  <div className="flex items-start gap-3">
                    <div className={`rounded-lg p-2 shrink-0 ${colors.bg} ${colors.text}`}>
                      {selectedEntry.category === "SHOW"
                        ? <Music className="h-5 w-5" />
                        : (() => { const TIcon = TRAVEL_ICONS[selectedEntry.travelType || ""] || Plane; return <TIcon className="h-5 w-5" />; })()
                      }
                    </div>
                    <div className="min-w-0">
                      <DialogTitle className="text-base leading-tight">{selectedEntry.title}</DialogTitle>
                      {selectedEntry.subtitle && (
                        <p className="text-sm text-muted-foreground mt-0.5">{selectedEntry.subtitle}</p>
                      )}
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        {(() => { try { return format(parseISO(selectedEntry.date), "EEEE, MMM d, yyyy"); } catch { return "TBD"; } })()}
                      </p>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-3 pt-1">
                  {/* Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="font-mono text-[10px] tracking-wider">{selectedEntry.category}</Badge>
                    {isGlobal && tours.length > 1 && (
                      <Badge variant="outline" className={`font-mono text-[10px] tracking-wider ${colors.text}`}>{selectedEntry.tourName}</Badge>
                    )}
                    {selectedEntry.confidence !== undefined && (
                      <span className="font-mono text-[10px] text-muted-foreground">{(selectedEntry.confidence * 100).toFixed(0)}% confidence</span>
                    )}
                  </div>

                  {/* Key info card */}
                  {(selectedEntry.address || selectedEntry.loadIn || selectedEntry.showTime || selectedEntry.endTime || selectedEntry.capacity) && (
                    <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border">
                      {selectedEntry.address && (
                        <div className="flex items-start gap-2.5 px-3 py-2.5">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-0.5">Address</p>
                            <p className="text-sm text-foreground">{selectedEntry.address}</p>
                          </div>
                        </div>
                      )}
                      {selectedEntry.capacity && (
                        <div className="flex items-center gap-2.5 px-3 py-2.5">
                          <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-0.5">Capacity</p>
                            <p className="text-sm font-mono text-foreground">{selectedEntry.capacity}</p>
                          </div>
                        </div>
                      )}
                      {selectedEntry.loadIn && (
                        <div className="flex items-center gap-2.5 px-3 py-2.5">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-0.5">Load-in</p>
                            <p className="text-sm font-mono text-foreground">{selectedEntry.loadIn}</p>
                          </div>
                        </div>
                      )}
                      {selectedEntry.showTime && (
                        <div className="flex items-center gap-2.5 px-3 py-2.5">
                          <Music className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-0.5">Show Time</p>
                            <p className="text-sm font-mono text-foreground font-semibold">{selectedEntry.showTime}</p>
                          </div>
                        </div>
                      )}
                      {selectedEntry.endTime && (
                        <div className="flex items-center gap-2.5 px-3 py-2.5">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-0.5">End</p>
                            <p className="text-sm font-mono text-foreground">{selectedEntry.endTime}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {selectedEntry.notes && (
                    <div className="rounded-lg bg-muted/30 border border-border px-3 py-2.5">
                      <p className="text-[10px] font-mono tracking-wider text-muted-foreground uppercase mb-1.5">Notes</p>
                      <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{selectedEntry.notes}</p>
                    </div>
                  )}

                  {!selectedEntry.address && !selectedEntry.capacity && !selectedEntry.loadIn && !selectedEntry.showTime && !selectedEntry.notes && !selectedEntry.subtitle && (
                    <p className="text-sm text-muted-foreground font-mono italic">No additional details in AKB.</p>
                  )}

                  {/* Share actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-border">
                    <p className="text-[10px] font-mono text-muted-foreground tracking-wider flex-1">SHARE</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 font-mono text-[10px] tracking-wider"
                      onClick={() => handleCopy(selectedEntry)}
                    >
                      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                      {copied ? "COPIED" : "COPY"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 font-mono text-[10px] tracking-wider"
                      onClick={() => handleSMS(selectedEntry)}
                    >
                      <MessageSquare className="h-3 w-3" />
                      SMS
                    </Button>
                  </div>

                  {/* Inline TELA for venue questions */}
                  {selectedEntry.category === "SHOW" && (
                    <VenueTelaMini
                      tourId={selectedEntry.tourId}
                      venueName={selectedEntry.title}
                      eventDate={selectedEntry.date}
                      city={selectedEntry.subtitle}
                    />
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BunkCalendar;
