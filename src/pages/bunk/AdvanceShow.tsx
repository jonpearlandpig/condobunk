import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ShowAdvance, AdvanceField, AdvanceFlag, AdvanceSource, AdvanceReadiness, AdvanceVenueDoc, AdvanceIntelligenceReport } from "@/stores/advanceStore";
import { format } from "date-fns";
import {
  ArrowLeft, FileText, AlertTriangle, CheckCircle2, Upload,
  Zap, ShieldAlert, FileOutput, Loader2, Lock, BookOpen, PackageOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import VenuePacketSection from "@/components/bunk/VenuePacketSection";
import AdvanceIntelligenceSection from "@/components/bunk/AdvanceIntelligenceSection";

const SECTION_ORDER = [
  "EVENT_DETAILS", "PRODUCTION_CONTACT", "HOUSE_RIGGER_CONTACT", "SUMMARY",
  "SCHEDULE", "PLANT_EQUIPMENT", "LABOR", "SETTLEMENT_AND_COST",
];

const SECTION_LABELS: Record<string, string> = {
  EVENT_DETAILS: "Event Details",
  PRODUCTION_CONTACT: "Production Contact",
  HOUSE_RIGGER_CONTACT: "House Rigger Contact",
  SUMMARY: "Summary",
  SCHEDULE: "Schedule",
  PLANT_EQUIPMENT: "Plant Equipment",
  LABOR: "Labor",
  SETTLEMENT_AND_COST: "Settlement & Cost",
};

const readinessConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  ready: { label: "READY", color: "text-success", icon: CheckCircle2 },
  needs_review: { label: "NEEDS REVIEW", color: "text-warning", icon: AlertTriangle },
  not_ready: { label: "NOT READY", color: "text-destructive", icon: ShieldAlert },
};

export default function AdvanceShow() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [parseOpen, setParseOpen] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  const { data: show, isLoading } = useQuery({
    queryKey: ["show-advance", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("show_advances").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as ShowAdvance;
    },
    enabled: !!id,
  });

  const { data: fields } = useQuery({
    queryKey: ["advance-fields", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("advance_fields").select("*").eq("show_advance_id", id!);
      if (error) throw error;
      return data as AdvanceField[];
    },
    enabled: !!id,
  });

  const { data: flags } = useQuery({
    queryKey: ["advance-flags", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("advance_flags").select("*").eq("show_advance_id", id!);
      if (error) throw error;
      return data as AdvanceFlag[];
    },
    enabled: !!id,
  });

  const { data: sources } = useQuery({
    queryKey: ["advance-sources", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("advance_sources").select("*").eq("show_advance_id", id!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as AdvanceSource[];
    },
    enabled: !!id,
  });

  const { data: readiness } = useQuery({
    queryKey: ["advance-readiness-single", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_show_advance_readiness").select("*").eq("show_advance_id", id!).single();
      if (error) throw error;
      return data as AdvanceReadiness;
    },
    enabled: !!id,
  });

  // Venue packet status for banner
  const { data: venueDocs } = useQuery({
    queryKey: ["advance-venue-docs", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("advance_venue_docs").select("processing_status").eq("show_advance_id", id!);
      if (error) throw error;
      return data as { processing_status: string }[];
    },
    enabled: !!id,
  });

  const { data: intelReport } = useQuery({
    queryKey: ["advance-intelligence", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advance_intelligence_reports")
        .select("red_flags, missing_unknown")
        .eq("show_advance_id", id!)
        .order("generated_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] as { red_flags: any[]; missing_unknown: any[] } | undefined;
    },
    enabled: !!id,
  });

  const parseMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const { data, error } = await supabase.functions.invoke("advance-parse", {
        body: { show_advance_id: id, source_id: sourceId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["advance-fields", id] });
      queryClient.invalidateQueries({ queryKey: ["advance-flags", id] });
      queryClient.invalidateQueries({ queryKey: ["advance-readiness-single", id] });
      queryClient.invalidateQueries({ queryKey: ["advance-decision-log", id] });
      setParseOpen(false);
      setSelectedSourceId(null);
      toast.success("Parse complete", {
        description: `${data.fields_updated} updated, ${data.conflicts_detected} conflicts, ${data.flags_generated} flags`,
      });
    },
    onError: (err: any) => {
      const msg = err?.message || "Parse failed";
      toast.error("Parse failed", { description: msg });
    },
  });

  if (isLoading || !show) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalFields = fields?.length || 0;
  const confirmedLocked = fields?.filter((f) => f.status === "confirmed" && f.locked_boolean).length || 0;
  const confirmedPct = totalFields > 0 ? Math.round((confirmedLocked / totalFields) * 100) : 0;

  const openFlags = flags?.filter((f) => f.status === "open") || [];
  const redCount = openFlags.filter((f) => f.severity === "red").length;
  const yellowCount = openFlags.filter((f) => f.severity === "yellow").length;

  const criticalMissing = fields?.filter((f) => f.field_criticality === "critical" && f.status === "not_provided").length || 0;
  const conflicts = fields?.filter((f) => f.status === "conflict").length || 0;
  const lockedCritical = fields?.filter((f) => f.field_criticality === "critical" && f.locked_boolean && f.status === "confirmed").length || 0;
  const totalCritical = fields?.filter((f) => f.field_criticality === "critical").length || 0;

  const rCfg = readinessConfig[readiness?.readiness_status || "not_ready"];
  const ReadinessIcon = rCfg.icon;

  const sectionProgress = SECTION_ORDER.map((sk) => {
    const sectionFields = fields?.filter((f) => f.section_key === sk) || [];
    const confirmed = sectionFields.filter((f) => f.status === "confirmed" && f.locked_boolean).length;
    return { key: sk, label: SECTION_LABELS[sk], total: sectionFields.length, confirmed };
  });

  // Status banner logic
  const noPackets = !venueDocs?.length;
  const hasProcessing = venueDocs?.some(d => d.processing_status === "processing");
  const hasRedFlags = (intelReport?.red_flags as any[])?.length > 0;
  const hasMissing = (intelReport?.missing_unknown as any[])?.length > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Status Banners */}
      {noPackets && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border border-border/50">
          <PackageOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">No venue packet uploaded — upload a tech packet to unlock TELA analysis</span>
        </div>
      )}
      {hasProcessing && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/5 border border-primary/20">
          <Loader2 className="h-4 w-4 text-primary animate-spin" />
          <span className="text-xs text-primary">Analysis in progress...</span>
        </div>
      )}
      {hasRedFlags && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/5 border border-destructive/20">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          <span className="text-xs text-destructive">Red flags detected — review advance intelligence below</span>
        </div>
      )}
      {hasMissing && !hasRedFlags && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-warning/5 border border-warning/20">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <span className="text-xs text-warning">Missing critical data — check advance intelligence for unknowns</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => navigate("/bunk/advance")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold truncate">{show.venue_name || "Untitled Show"}</h1>
            <Badge variant="outline" className="text-[10px] uppercase">{show.status}</Badge>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            {show.event_date && <span>{format(new Date(show.event_date), "EEEE, MMM d, yyyy")}</span>}
            {show.venue_city && <span>· {show.venue_city}{show.venue_state ? `, ${show.venue_state}` : ""}</span>}
            <span className="font-mono text-[10px] text-muted-foreground/40">{show.tid}</span>
          </div>
        </div>
      </div>

      {/* Readiness Card */}
      <Card className={`border ${rCfg.color === "text-success" ? "border-success/30" : rCfg.color === "text-warning" ? "border-warning/30" : "border-destructive/30"}`}>
        <CardContent className="flex items-center gap-4 py-4">
          <ReadinessIcon className={`h-8 w-8 ${rCfg.color}`} />
          <div className="flex-1">
            <p className={`text-sm font-bold font-mono tracking-wider ${rCfg.color}`}>{rCfg.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {readiness?.critical_unresolved_count || 0} critical unresolved · {readiness?.red_flag_open_count || 0} red flags open
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold font-mono">{confirmedPct}%</p>
            <p className="text-[10px] text-muted-foreground">fields locked</p>
          </div>
        </CardContent>
      </Card>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="py-3 px-4 text-center">
          <p className="text-2xl font-bold font-mono text-destructive">{redCount}</p>
          <p className="text-[10px] text-muted-foreground font-mono tracking-wider">RED FLAGS</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4 text-center">
          <p className="text-2xl font-bold font-mono text-warning">{yellowCount}</p>
          <p className="text-[10px] text-muted-foreground font-mono tracking-wider">YELLOW FLAGS</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4 text-center">
          <p className="text-2xl font-bold font-mono text-success">{lockedCritical}/{totalCritical}</p>
          <p className="text-[10px] text-muted-foreground font-mono tracking-wider">CRITICAL LOCKED</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4 text-center">
          <p className="text-2xl font-bold font-mono">{sources?.length || 0}</p>
          <p className="text-[10px] text-muted-foreground font-mono tracking-wider">SOURCES</p>
        </CardContent></Card>
      </div>

      {/* Two Column Layout */}
      <div className="grid md:grid-cols-5 gap-4">
        {/* Left: Section Progress */}
        <div className="md:col-span-3 space-y-2">
          <h2 className="text-xs font-mono tracking-wider text-muted-foreground/60 uppercase px-1">Section Progress</h2>
          {sectionProgress.map((s) => (
            <Card key={s.key} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/bunk/advance/${id}/fields`)}>
              <CardContent className="flex items-center gap-3 py-2.5 px-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{s.label}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={s.total > 0 ? (s.confirmed / s.total) * 100 : 0} className="h-1.5 flex-1" />
                    <span className="text-[10px] font-mono text-muted-foreground">{s.confirmed}/{s.total}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Right: Activity Panel */}
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader className="py-2.5 px-4">
              <CardTitle className="text-xs font-mono tracking-wider text-muted-foreground/60">OPERATIONAL METRICS</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Critical missing</span>
                <span className="font-mono text-destructive">{criticalMissing}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Conflicts</span>
                <span className="font-mono text-warning">{conflicts}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Red flags</span>
                <span className="font-mono text-destructive">{redCount}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Locked critical</span>
                <span className="font-mono text-success">{lockedCritical}</span>
              </div>
            </CardContent>
          </Card>

          {openFlags.length > 0 && (
            <Card>
              <CardHeader className="py-2.5 px-4">
                <CardTitle className="text-xs font-mono tracking-wider text-muted-foreground/60">OPEN FLAGS</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-1.5">
                {openFlags.slice(0, 5).map((f) => (
                  <div key={f.id} className="flex items-center gap-2 text-xs">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${f.severity === "red" ? "bg-destructive" : "bg-warning"}`} />
                    <span className="truncate">{f.title}</span>
                  </div>
                ))}
                {openFlags.length > 5 && (
                  <p className="text-[10px] text-muted-foreground">+{openFlags.length - 5} more</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Venue Packets */}
      <VenuePacketSection
        showAdvanceId={id!}
        onAnalysisComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["advance-intelligence", id] });
          queryClient.invalidateQueries({ queryKey: ["advance-venue-docs", id] });
        }}
      />

      {/* CTA Bar */}
      <Separator />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to={`/bunk/advance/${id}/sources`}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />Add Source
          </Link>
        </Button>
        <Button
          variant="default"
          size="sm"
          className="gap-1.5"
          onClick={() => setParseOpen(true)}
          disabled={!sources?.length}
        >
          <Zap className="h-3.5 w-3.5" />Run Parse
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/bunk/advance/${id}/fields`}>
            <FileText className="h-3.5 w-3.5 mr-1.5" />Review Fields
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/bunk/advance/${id}/conflicts`}>
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />Conflicts ({conflicts})
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/bunk/advance/${id}/export`}>
            <FileOutput className="h-3.5 w-3.5 mr-1.5" />Export Summary
          </Link>
        </Button>
      </div>

      {/* Advance Intelligence */}
      <AdvanceIntelligenceSection showAdvanceId={id!} />

      {/* Parse Source Selection Dialog */}
      <Dialog open={parseOpen} onOpenChange={setParseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Run Parse</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Select a source to extract fields from:</p>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {sources?.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSourceId(s.id)}
                className={`w-full text-left p-3 rounded-md border transition-colors ${
                  selectedSourceId === s.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <p className="text-sm font-medium">{s.source_title || s.source_type}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {s.source_type} · {format(new Date(s.created_at), "MMM d, h:mm a")}
                </p>
              </button>
            ))}
          </div>
          <Button
            className="w-full gap-1.5"
            disabled={!selectedSourceId || parseMutation.isPending}
            onClick={() => selectedSourceId && parseMutation.mutate(selectedSourceId)}
          >
            {parseMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Parsing...</>
            ) : (
              <><Zap className="h-4 w-4" />Parse Selected Source</>
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
