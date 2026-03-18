import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import type { ShowAdvance, AdvanceReadiness } from "@/stores/advanceStore";
import { format } from "date-fns";
import {
  Plus, CalendarDays, MapPin, ChevronRight, Loader2, BookOpen,
  Upload, ChevronDown, FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

/* ─── helpers ─── */

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
}

function makeDedupKey(row: { event_date: string; venue_name: string; venue_city?: string | null }) {
  return [row.event_date, normalizeText(row.venue_name), normalizeText(row.venue_city ?? "")].join("|");
}

function parseFlexibleDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  // ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // MM/DD/YYYY or M/D/YYYY
  const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) return `${usMatch[3]}-${usMatch[1].padStart(2, "0")}-${usMatch[2].padStart(2, "0")}`;
  // MM-DD-YYYY
  const dashMatch = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) return `${dashMatch[3]}-${dashMatch[1].padStart(2, "0")}-${dashMatch[2].padStart(2, "0")}`;
  return null; // reject ambiguous
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && inQ && line[i + 1] === '"') { current += '"'; i++; continue; }
    if (c === '"') { inQ = !inQ; continue; }
    if (c === "," && !inQ) { out.push(current.trim()); current = ""; continue; }
    current += c;
  }
  out.push(current.trim());
  return out;
}

function pickHeader(row: Record<string, string>, aliases: string[]): string | null {
  const map = new Map<string, string>();
  Object.keys(row).forEach((k) => map.set(normalizeText(k), k));
  for (const a of aliases) { const f = map.get(normalizeText(a)); if (f) return row[f]; }
  return null;
}

function genTidSuffix() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

/* ─── types ─── */

type PreviewRow = {
  key: string;
  event_date: string;
  venue_name: string;
  venue_city: string | null;
  venue_state: string | null;
  selected: boolean;
  duplicate: boolean;
  valid: boolean;
  error?: string;
};

/* ─── shared data helpers ─── */

async function fetchExistingKeys(tourId: string) {
  const { data, error } = await supabase
    .from("show_advances")
    .select("event_date, venue_name, venue_city")
    .eq("tour_id", tourId);
  if (error) throw error;
  return new Set(
    (data ?? []).map((r) =>
      makeDedupKey({ event_date: r.event_date ?? "", venue_name: r.venue_name ?? "", venue_city: r.venue_city })
    )
  );
}

async function batchInsertAdvances(
  tourId: string,
  userId: string,
  rows: { venue_name: string; venue_city: string | null; venue_state: string | null; event_date: string }[]
) {
  if (!rows.length) return { created: 0, skipped: 0 };
  const existingKeys = await fetchExistingKeys(tourId);
  const deduped = rows.filter((r) => !existingKeys.has(makeDedupKey(r)));
  const skipped = rows.length - deduped.length;
  if (!deduped.length) return { created: 0, skipped };
  const payload = deduped.map((r) => {
    const s = genTidSuffix();
    return {
      tid: `TID-ADV-${s}`,
      taid: `TAID-ADV-${s}`,
      tour_id: tourId,
      venue_name: r.venue_name || null,
      venue_city: r.venue_city || null,
      venue_state: r.venue_state || null,
      event_date: r.event_date || null,
      created_by: userId,
    };
  });
  const { error } = await supabase.from("show_advances").insert(payload);
  if (error) throw error;
  return { created: deduped.length, skipped };
}

/* ─── style maps ─── */

const readinessColor: Record<string, string> = {
  ready: "bg-success/15 text-success border-success/30",
  needs_review: "bg-warning/15 text-warning border-warning/30",
  not_ready: "bg-destructive/15 text-destructive border-destructive/30",
};
const readinessLabel: Record<string, string> = {
  ready: "Ready", needs_review: "Needs Review", not_ready: "Not Ready",
};
const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_review: "bg-info/15 text-info",
  locked: "bg-primary/15 text-primary",
  ready: "bg-success/15 text-success",
};

/* ═══════════════════════════════════════════════
   Import from Schedule Dialog
   ═══════════════════════════════════════════════ */

function ImportScheduleDialog({
  open, onOpenChange, tourId, userId, onCreated,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; tourId: string; userId: string; onCreated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<PreviewRow[]>([]);

  useEffect(() => {
    if (!open) { setRows([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: events, error }, existingKeys] = await Promise.all([
          supabase.from("schedule_events").select("id, event_date, venue, city")
            .eq("tour_id", tourId).order("event_date", { ascending: true }),
          fetchExistingKeys(tourId),
        ]);
        if (error) throw error;
        if (cancelled) return;
        const mapped: PreviewRow[] = (events ?? []).map((e, i) => {
          const date = parseFlexibleDate(e.event_date);
          const venue = (e.venue ?? "").trim();
          const city = (e.city ?? "").trim() || null;
          let err = "";
          if (!date) err = "Missing date";
          else if (!venue) err = "Missing venue";
          const dup = date && venue ? existingKeys.has(makeDedupKey({ event_date: date, venue_name: venue, venue_city: city })) : false;
          return {
            key: e.id ?? `s-${i}`, event_date: date ?? "", venue_name: venue, venue_city: city, venue_state: null,
            selected: !err && !dup, duplicate: dup, valid: !err, error: err || undefined,
          };
        });
        setRows(mapped);
      } catch (e: any) { toast.error(e.message || "Failed to load schedule"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open, tourId]);

  const validSelectable = rows.filter((r) => r.valid && !r.duplicate);
  const selected = rows.filter((r) => r.selected && r.valid && !r.duplicate);
  const dupCount = rows.filter((r) => r.duplicate).length;
  const invalidCount = rows.filter((r) => !r.valid).length;

  const toggleRow = (key: string, checked: boolean) =>
    setRows((p) => p.map((r) => r.key === key ? { ...r, selected: checked } : r));
  const toggleAll = (checked: boolean) =>
    setRows((p) => p.map((r) => r.valid && !r.duplicate ? { ...r, selected: checked } : r));

  async function handleImport() {
    setSubmitting(true);
    try {
      const res = await batchInsertAdvances(tourId, userId,
        selected.map((r) => ({ venue_name: r.venue_name, venue_city: r.venue_city, venue_state: r.venue_state, event_date: r.event_date })));
      toast.success(`${res.created} shows created${res.skipped + dupCount ? `, ${res.skipped + dupCount} skipped` : ""}`);
      onOpenChange(false);
      onCreated();
    } catch (e: any) { toast.error(e.message || "Import failed"); }
    finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" /> Import from Schedule
          </DialogTitle>
          <DialogDescription>Create advances from existing schedule events.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs">
          <Badge variant="secondary">{selected.length} selected</Badge>
          <Badge variant="outline">{dupCount} duplicates</Badge>
          {invalidCount > 0 && <Badge variant="destructive">{invalidCount} invalid</Badge>}
        </div>

        {validSelectable.length > 0 && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={validSelectable.every((r) => r.selected)}
              onCheckedChange={(c) => toggleAll(Boolean(c))}
            />
            Select all valid ({validSelectable.length})
          </label>
        )}

        <ScrollArea className="flex-1 min-h-0 border rounded-md">
          <div className="divide-y divide-border">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : rows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No schedule events found.</p>
            ) : rows.map((r) => (
              <label key={r.key} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-accent/40 transition-colors">
                <Checkbox
                  checked={r.selected}
                  disabled={!r.valid || r.duplicate}
                  onCheckedChange={(c) => toggleRow(r.key, Boolean(c))}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.venue_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.venue_city ?? ""}{r.venue_city ? " · " : ""}{r.event_date || "No date"}
                  </p>
                </div>
                {r.duplicate ? (
                  <Badge variant="outline" className="text-[10px] shrink-0">Duplicate</Badge>
                ) : !r.valid ? (
                  <Badge variant="destructive" className="text-[10px] shrink-0">{r.error}</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] shrink-0">Ready</Badge>
                )}
              </label>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleImport} disabled={submitting || !selected.length}>
            {submitting ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Importing…</> : `Import ${selected.length} Shows`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════
   Upload Tour Dates Dialog
   ═══════════════════════════════════════════════ */

function UploadDatesDialog({
  open, onOpenChange, tourId, userId, onCreated,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; tourId: string; userId: string; onCreated: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (!open) { setCsvText(""); setRows([]); } }, [open]);

  async function buildPreview(text: string) {
    setCsvText(text);
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) { setRows([]); return; }
    const headers = parseCsvLine(lines[0]);
    const parsed = lines.slice(1).map((line) => {
      const vals = parseCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
      return row;
    });

    const existingKeys = await fetchExistingKeys(tourId);

    const mapped: PreviewRow[] = parsed.map((row, i) => {
      const date = parseFlexibleDate(pickHeader(row, ["Date", "Show Date", "Event Date"]));
      const venue = (pickHeader(row, ["Venue", "Venue Name"]) ?? "").trim();
      const city = (pickHeader(row, ["City"]) ?? "").trim() || null;
      const state = (pickHeader(row, ["State", "Province", "Region"]) ?? "").trim() || null;
      let err = "";
      if (!date) err = "Invalid date";
      else if (!venue) err = "Missing venue";
      const dup = date && venue ? existingKeys.has(makeDedupKey({ event_date: date, venue_name: venue, venue_city: city })) : false;
      return {
        key: `csv-${i}`, event_date: date ?? "", venue_name: venue, venue_city: city, venue_state: state,
        selected: !err && !dup, duplicate: dup, valid: !err, error: err || undefined,
      };
    });
    setRows(mapped);
  }

  const selected = rows.filter((r) => r.selected && r.valid && !r.duplicate);
  const dupCount = rows.filter((r) => r.duplicate).length;
  const invalidCount = rows.filter((r) => !r.valid).length;

  async function handleCreate() {
    setSubmitting(true);
    try {
      const res = await batchInsertAdvances(tourId, userId,
        selected.map((r) => ({ venue_name: r.venue_name, venue_city: r.venue_city, venue_state: r.venue_state, event_date: r.event_date })));
      toast.success(`${res.created} shows created${res.skipped + dupCount ? `, ${res.skipped + dupCount} skipped` : ""}`);
      onOpenChange(false);
      onCreated();
    } catch (e: any) { toast.error(e.message || "Upload failed"); }
    finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" /> Upload Tour Dates
          </DialogTitle>
          <DialogDescription>Paste CSV or upload a .csv file. Columns: Date, Venue, City, State.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 flex-1 min-h-0 flex flex-col">
          <Textarea
            value={csvText}
            onChange={async (e) => {
              const v = e.target.value;
              setCsvText(v);
              if (!v.trim()) { setRows([]); return; }
              try { await buildPreview(v); } catch {}
            }}
            placeholder={`Date,Venue,City,State\n2026-04-02,Allen County War Memorial Coliseum,Fort Wayne,IN\n2026-04-04,Rocket Mortgage FieldHouse,Cleveland,OH`}
            className="min-h-[120px] font-mono text-xs"
          />

          <Input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try { await buildPreview(await f.text()); } catch (err: any) { toast.error(err.message); }
            }}
          />

          <div className="flex items-center gap-2 text-xs">
            <Badge variant="secondary">{selected.length} valid</Badge>
            <Badge variant="outline">{dupCount} duplicates</Badge>
            {invalidCount > 0 && <Badge variant="destructive">{invalidCount} invalid</Badge>}
          </div>

          <ScrollArea className="flex-1 min-h-0 border rounded-md">
            <div className="divide-y divide-border">
              {rows.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Parsed rows will appear here.</p>
              ) : rows.map((r) => (
                <div key={r.key} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.venue_name || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {[r.venue_city, r.venue_state].filter(Boolean).join(", ")}{r.venue_city || r.venue_state ? " · " : ""}{r.event_date || "No date"}
                    </p>
                  </div>
                  {!r.valid ? (
                    <Badge variant="destructive" className="text-[10px] shrink-0">{r.error}</Badge>
                  ) : r.duplicate ? (
                    <Badge variant="outline" className="text-[10px] shrink-0">Duplicate</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] shrink-0">Ready</Badge>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={submitting || !selected.length}>
            {submitting ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Creating…</> : `Create ${selected.length} Advances`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════
   Main Ledger Page
   ═══════════════════════════════════════════════ */

export default function AdvanceLedger() {
  const { user } = useAuth();
  const { tours } = useTour();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tourId = tours[0]?.id;

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newVenue, setNewVenue] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newDate, setNewDate] = useState("");

  const { data: advances, isLoading } = useQuery({
    queryKey: ["show-advances", tourId],
    queryFn: async () => {
      if (!tourId) return [];
      const { data, error } = await supabase
        .from("show_advances").select("*").eq("tour_id", tourId)
        .order("event_date", { ascending: true });
      if (error) throw error;
      return data as ShowAdvance[];
    },
    enabled: !!tourId,
  });

  const { data: readiness } = useQuery({
    queryKey: ["advance-readiness", tourId],
    queryFn: async () => {
      if (!tourId) return [];
      const { data, error } = await supabase
        .from("v_show_advance_readiness").select("*").eq("tour_id", tourId);
      if (error) throw error;
      return data as AdvanceReadiness[];
    },
    enabled: !!tourId,
  });

  const readinessMap = new Map(readiness?.map((r) => [r.show_advance_id, r]));

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!tourId || !user) throw new Error("Missing tour or user");
      const s = genTidSuffix();
      const { data, error } = await supabase
        .from("show_advances")
        .insert({ tid: `TID-ADV-${s}`, taid: `TAID-ADV-${s}`, tour_id: tourId, venue_name: newVenue || null, venue_city: newCity || null, event_date: newDate || null, created_by: user.id })
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidateLedger();
      setCreateOpen(false); setNewVenue(""); setNewCity(""); setNewDate("");
      toast.success("Show advance created");
      navigate(`/bunk/advance/${data.id}`);
    },
    onError: (err: any) => toast.error("Failed to create", { description: err.message }),
  });

  function invalidateLedger() {
    queryClient.invalidateQueries({ queryKey: ["show-advances"] });
    queryClient.invalidateQueries({ queryKey: ["advance-readiness"] });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold font-[var(--font-display)]">Advance Ledger</h1>
            <p className="text-xs text-muted-foreground font-mono tracking-wider">SHOW ADVANCE RECORDS</p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Create Show
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setImportOpen(true)}>
              <CalendarDays className="h-3.5 w-3.5 mr-2" /> Import from Schedule
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setUploadOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-2" /> Upload Tour Dates
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-2" /> New Show
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !advances?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No show advances yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create your first show advance to start tracking</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {advances.map((adv) => {
            const r = readinessMap.get(adv.id);
            return (
              <Card key={adv.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/bunk/advance/${adv.id}`)}>
                <CardContent className="flex items-center gap-4 py-3 px-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{adv.venue_name || "Untitled Show"}</span>
                      <Badge variant="outline" className={`text-[10px] ${statusColor[adv.status]}`}>{adv.status.toUpperCase()}</Badge>
                      {r && <Badge variant="outline" className={`text-[10px] ${readinessColor[r.readiness_status]}`}>{readinessLabel[r.readiness_status]}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {adv.event_date && <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{format(new Date(adv.event_date), "MMM d, yyyy")}</span>}
                      {adv.venue_city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{adv.venue_city}</span>}
                      <span className="font-mono text-[10px] text-muted-foreground/50">{adv.tid}</span>
                    </div>
                  </div>
                  {r && (
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      {r.critical_unresolved_count > 0 && <span className="text-destructive font-mono">{r.critical_unresolved_count} critical</span>}
                      {r.red_flag_open_count > 0 && <span className="text-destructive font-mono">{r.red_flag_open_count} 🔴</span>}
                    </div>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Show Dialog (existing single-create) */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Show Advance</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="venue">Venue Name</Label>
              <Input id="venue" value={newVenue} onChange={(e) => setNewVenue(e.target.value)} placeholder="e.g. Madison Square Garden" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={newCity} onChange={(e) => setNewCity(e.target.value)} placeholder="e.g. New York, NY" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Event Date</Label>
              <Input id="date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="w-full">
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Dialogs */}
      {tourId && user && (
        <>
          <ImportScheduleDialog open={importOpen} onOpenChange={setImportOpen} tourId={tourId} userId={user.id} onCreated={invalidateLedger} />
          <UploadDatesDialog open={uploadOpen} onOpenChange={setUploadOpen} tourId={tourId} userId={user.id} onCreated={invalidateLedger} />
        </>
      )}
    </div>
  );
}
