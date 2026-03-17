import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ShowAdvance, AdvanceField, AdvanceFlag, AdvanceSource, AdvanceReadiness } from "@/stores/advanceStore";
import { format } from "date-fns";
import {
  ArrowLeft, FileText, AlertTriangle, CheckCircle2, Upload,
  Zap, ShieldAlert, FileOutput, Loader2, Lock, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

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
      const { data, error } = await supabase.from("advance_sources").select("*").eq("show_advance_id", id!);
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
  const greenCount = fields?.filter((f) => f.flag_level === "green").length || 0;

  const criticalMissing = fields?.filter((f) => f.field_criticality === "critical" && f.status === "not_provided").length || 0;
  const conflicts = fields?.filter((f) => f.status === "conflict").length || 0;
  const lockedCritical = fields?.filter((f) => f.field_criticality === "critical" && f.locked_boolean && f.status === "confirmed").length || 0;
  const totalCritical = fields?.filter((f) => f.field_criticality === "critical").length || 0;

  const rCfg = readinessConfig[readiness?.readiness_status || "not_ready"];
  const ReadinessIcon = rCfg.icon;

  // Group fields by section for progress
  const sectionProgress = SECTION_ORDER.map((sk) => {
    const sectionFields = fields?.filter((f) => f.section_key === sk) || [];
    const confirmed = sectionFields.filter((f) => f.status === "confirmed" && f.locked_boolean).length;
    return { key: sk, label: SECTION_LABELS[sk], total: sectionFields.length, confirmed };
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
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
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold font-mono text-destructive">{redCount}</p>
            <p className="text-[10px] text-muted-foreground font-mono tracking-wider">RED FLAGS</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold font-mono text-warning">{yellowCount}</p>
            <p className="text-[10px] text-muted-foreground font-mono tracking-wider">YELLOW FLAGS</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold font-mono text-success">{lockedCritical}/{totalCritical}</p>
            <p className="text-[10px] text-muted-foreground font-mono tracking-wider">CRITICAL LOCKED</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold font-mono">{sources?.length || 0}</p>
            <p className="text-[10px] text-muted-foreground font-mono tracking-wider">SOURCES</p>
          </CardContent>
        </Card>
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
          {/* Metrics */}
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

          {/* Open Flags */}
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

      {/* CTA Bar */}
      <Separator />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to={`/bunk/advance/${id}/sources`}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />Add Source
          </Link>
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
    </div>
  );
}
