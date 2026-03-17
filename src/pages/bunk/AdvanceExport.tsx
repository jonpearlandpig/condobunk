import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ShowAdvance, AdvanceField, AdvanceFlag } from "@/stores/advanceStore";
import { format } from "date-fns";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SECTION_ORDER = [
  "EVENT_DETAILS", "PRODUCTION_CONTACT", "HOUSE_RIGGER_CONTACT", "SUMMARY",
  "SCHEDULE", "PLANT_EQUIPMENT", "LABOR", "SETTLEMENT_AND_COST",
];
const SECTION_LABELS: Record<string, string> = {
  EVENT_DETAILS: "Event Details", PRODUCTION_CONTACT: "Production Contact",
  HOUSE_RIGGER_CONTACT: "House Rigger Contact", SUMMARY: "Summary",
  SCHEDULE: "Schedule", PLANT_EQUIPMENT: "Plant Equipment",
  LABOR: "Labor", SETTLEMENT_AND_COST: "Settlement & Cost",
};

export default function AdvanceExport() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: show } = useQuery({
    queryKey: ["show-advance", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("show_advances").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as ShowAdvance;
    },
    enabled: !!id,
  });

  const { data: fields, isLoading } = useQuery({
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

  const { data: decisionLog } = useQuery({
    queryKey: ["advance-decision-log", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("advance_decision_log").select("*").eq("show_advance_id", id!).order("created_at", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!id,
  });

  if (isLoading || !show) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const openFlags = flags?.filter((f) => f.status === "open") || [];
  const redFlags = openFlags.filter((f) => f.severity === "red");

  const renderFieldSection = (sectionKey: string, filterFn?: (f: AdvanceField) => boolean) => {
    const sectionFields = (fields || []).filter((f) => f.section_key === sectionKey && (filterFn ? filterFn(f) : true));
    if (!sectionFields.length) return null;
    return (
      <div key={sectionKey} className="mb-4">
        <h3 className="text-xs font-mono tracking-wider text-muted-foreground/60 mb-1.5">{SECTION_LABELS[sectionKey]}</h3>
        <div className="space-y-0.5">
          {sectionFields.map((f) => (
            <div key={f.id} className="flex items-center gap-2 text-xs py-0.5">
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                f.status === "confirmed" && f.locked_boolean ? "bg-success" :
                f.status === "conflict" ? "bg-destructive" :
                f.status === "not_provided" ? "bg-muted-foreground/30" :
                "bg-warning"
              }`} />
              <span className="text-muted-foreground w-40 shrink-0 truncate">{f.canonical_label}</span>
              <span className={f.current_value ? "" : "text-muted-foreground/40 italic"}>{f.current_value || "—"}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/bunk/advance/${id}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">Export Summary</h1>
        </div>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5 mr-1.5" />Print
        </Button>
      </div>

      {/* Export header */}
      <Card className="print:shadow-none print:border-0">
        <CardContent className="py-4">
          <h2 className="text-base font-semibold">{show.venue_name || "Untitled Show"}</h2>
          <p className="text-xs text-muted-foreground">
            {show.event_date && format(new Date(show.event_date), "EEEE, MMMM d, yyyy")}
            {show.venue_city && ` · ${show.venue_city}${show.venue_state ? `, ${show.venue_state}` : ""}`}
          </p>
          <div className="flex gap-2 mt-2 text-[10px] font-mono text-muted-foreground/50">
            <span>{show.tid}</span>
            <span>{show.taid}</span>
            <Badge variant="outline" className="text-[9px]">{show.status.toUpperCase()}</Badge>
          </div>
          {redFlags.length > 0 && (
            <div className="mt-3 p-2 bg-destructive/10 rounded text-xs text-destructive">
              ⚠ {redFlags.length} open red flag{redFlags.length !== 1 ? "s" : ""}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="internal" className="print:block">
        <TabsList className="print:hidden">
          <TabsTrigger value="internal">Internal Summary</TabsTrigger>
          <TabsTrigger value="production">Production Recap</TabsTrigger>
          <TabsTrigger value="tour">Tour Recap</TabsTrigger>
          <TabsTrigger value="accountability">Accountability</TabsTrigger>
        </TabsList>

        <TabsContent value="internal" className="mt-4 space-y-2">
          <Card><CardContent className="py-4">
            {SECTION_ORDER.map((sk) => renderFieldSection(sk))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="production" className="mt-4 space-y-2">
          <Card><CardContent className="py-4">
            <h3 className="text-xs font-mono tracking-wider text-muted-foreground/60 mb-3">CONFIRMED ITEMS</h3>
            {SECTION_ORDER.map((sk) => renderFieldSection(sk, (f) => f.status === "confirmed" && f.locked_boolean))}
            <h3 className="text-xs font-mono tracking-wider text-muted-foreground/60 mb-3 mt-6">OPEN FOLLOW-UPS</h3>
            {(fields || []).filter((f) => f.status === "needs_confirmation" || f.status === "not_provided").map((f) => (
              <div key={f.id} className="flex items-center gap-2 text-xs py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-warning shrink-0" />
                <span>{f.canonical_label}: {f.current_value || "Not provided"}</span>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="tour" className="mt-4 space-y-2">
          <Card><CardContent className="py-4">
            {["EVENT_DETAILS", "SCHEDULE", "LABOR"].map((sk) => renderFieldSection(sk))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="accountability" className="mt-4 space-y-2">
          <Card><CardContent className="py-4">
            <h3 className="text-xs font-mono tracking-wider text-muted-foreground/60 mb-3">DECISION LOG</h3>
            {!decisionLog?.length ? (
              <p className="text-xs text-muted-foreground italic">No decisions logged yet</p>
            ) : (
              <div className="space-y-1">
                {decisionLog.map((d) => (
                  <div key={d.id} className="text-xs py-1 border-b border-border/50 last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px]">{d.action_type}</Badge>
                      {d.field_key && <span className="font-mono text-muted-foreground">{d.field_key}</span>}
                      <span className="text-[10px] text-muted-foreground/50 ml-auto">
                        {format(new Date(d.created_at), "MMM d h:mm a")}
                      </span>
                    </div>
                    {d.prior_value && <p className="text-muted-foreground/60 mt-0.5">From: {d.prior_value}</p>}
                    {d.new_value && <p className="mt-0.5">To: {d.new_value}</p>}
                    {d.rationale && <p className="text-muted-foreground/60 italic mt-0.5">{d.rationale}</p>}
                    <p className="text-[10px] font-mono text-muted-foreground/40 mt-0.5">{d.tai_d}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
