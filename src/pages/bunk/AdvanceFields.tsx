import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { AdvanceField, AdvanceFlag } from "@/stores/advanceStore";
import { ArrowLeft, Lock, Unlock, Eye, Pencil, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { useState } from "react";

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

const statusChip: Record<string, { label: string; className: string }> = {
  confirmed: { label: "Confirmed", className: "bg-success/15 text-success border-success/30" },
  needs_confirmation: { label: "Needs Confirm", className: "bg-warning/15 text-warning border-warning/30" },
  conflict: { label: "Conflict", className: "bg-destructive/15 text-destructive border-destructive/30" },
  not_provided: { label: "Not Provided", className: "bg-muted text-muted-foreground" },
  not_applicable: { label: "N/A", className: "bg-muted text-muted-foreground/50" },
};

export default function AdvanceFields() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data: fields, isLoading } = useQuery({
    queryKey: ["advance-fields", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("advance_fields").select("*").eq("show_advance_id", id!).order("section_key").order("field_key");
      if (error) throw error;
      return data as AdvanceField[];
    },
    enabled: !!id,
  });

  const { data: flags } = useQuery({
    queryKey: ["advance-flags", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("advance_flags").select("*").eq("show_advance_id", id!).eq("status", "open");
      if (error) throw error;
      return data as AdvanceFlag[];
    },
    enabled: !!id,
  });

  const lockMutation = useMutation({
    mutationFn: async ({ fieldId, locked, fieldKey, currentValue }: { fieldId: string; locked: boolean; fieldKey: string; currentValue: string | null }) => {
      const { error } = await supabase.from("advance_fields").update({
        locked_boolean: locked,
        status: locked ? "confirmed" : "needs_confirmation",
        updated_by: user?.id,
      }).eq("id", fieldId);
      if (error) throw error;
      // Decision log
      await supabase.from("advance_decision_log").insert({
        show_advance_id: id!,
        tai_d: `TAI-D-LOCK-${Date.now()}`,
        action_type: "field_locked",
        field_key: fieldKey,
        prior_value: currentValue,
        new_value: currentValue,
        rationale: locked ? "Manually locked" : "Manually unlocked",
        created_by: user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advance-fields", id] });
      queryClient.invalidateQueries({ queryKey: ["advance-readiness"] });
    },
    onError: (err: any) => toast.error("Failed", { description: err.message }),
  });

  const editMutation = useMutation({
    mutationFn: async ({ fieldId, fieldKey, oldValue, newValue }: { fieldId: string; fieldKey: string; oldValue: string | null; newValue: string }) => {
      const { error } = await supabase.from("advance_fields").update({
        current_value: newValue,
        status: "needs_confirmation",
        updated_by: user?.id,
      }).eq("id", fieldId);
      if (error) throw error;
      await supabase.from("advance_decision_log").insert({
        show_advance_id: id!,
        tai_d: `TAI-D-EDIT-${Date.now()}`,
        action_type: "field_updated",
        field_key: fieldKey,
        prior_value: oldValue,
        new_value: newValue,
        rationale: "Manual edit",
        created_by: user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advance-fields", id] });
      setEditingField(null);
      setEditValue("");
    },
    onError: (err: any) => toast.error("Failed", { description: err.message }),
  });

  const openFlags = flags || [];
  const missingRequired = fields?.filter((f) => f.status === "not_provided" && f.field_criticality === "critical") || [];

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/bunk/advance/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">Parsed Advance Fields</h1>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        {/* Main: Accordion */}
        <div className="md:col-span-3">
          <Accordion type="multiple" defaultValue={SECTION_ORDER} className="space-y-2">
            {SECTION_ORDER.map((sk) => {
              const sectionFields = fields?.filter((f) => f.section_key === sk) || [];
              if (!sectionFields.length) return null;
              return (
                <AccordionItem key={sk} value={sk} className="border rounded-lg bg-card">
                  <AccordionTrigger className="px-4 py-2.5 text-sm font-medium hover:no-underline">
                    <div className="flex items-center gap-2">
                      {SECTION_LABELS[sk]}
                      <span className="text-[10px] font-mono text-muted-foreground/50">
                        {sectionFields.filter((f) => f.current_value != null && f.current_value !== "").length}/{sectionFields.length} captured
                      </span>
                      {sectionFields.filter((f) => f.status === "confirmed" && f.locked_boolean).length > 0 && (
                        <span className="text-[10px] font-mono text-success flex items-center gap-0.5">
                          <Lock className="h-2.5 w-2.5" />
                          {sectionFields.filter((f) => f.status === "confirmed" && f.locked_boolean).length}
                        </span>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-3 space-y-1">
                    {sectionFields.map((f) => {
                      const sc = statusChip[f.status];
                      const isEditing = editingField === f.id;
                      const isCritical = f.field_criticality === "critical";
                      const isMoney = f.money_sensitive_boolean;
                      return (
                        <div
                          key={f.id}
                          className={`flex items-center gap-2 py-1.5 px-2 rounded text-sm ${
                            f.status === "conflict" ? "bg-destructive/5 border border-destructive/20" :
                            f.status === "not_provided" && isCritical ? "border border-dashed border-destructive/30" :
                            ""
                          }`}
                        >
                          {/* Criticality indicator */}
                          <div className={`w-1 h-6 rounded-full shrink-0 ${
                            isCritical ? "bg-destructive" : isMoney ? "bg-warning" : "bg-muted-foreground/20"
                          }`} />

                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-muted-foreground">{f.canonical_label}</span>
                            {isEditing ? (
                              <div className="flex items-center gap-1 mt-0.5">
                                <Input
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="h-6 text-xs"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") editMutation.mutate({ fieldId: f.id, fieldKey: f.field_key, oldValue: f.current_value, newValue: editValue });
                                    if (e.key === "Escape") setEditingField(null);
                                  }}
                                />
                                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => editMutation.mutate({ fieldId: f.id, fieldKey: f.field_key, oldValue: f.current_value, newValue: editValue })}>Save</Button>
                              </div>
                            ) : (
                              <p className={`text-sm ${f.current_value ? "" : "text-muted-foreground/40 italic"}`}>
                                {f.current_value || "—"}
                              </p>
                            )}
                          </div>

                          <Badge variant="outline" className={`text-[9px] shrink-0 ${sc.className}`}>{sc.label}</Badge>

                          {f.confidence_score != null && (
                            <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">
                              {Math.round(f.confidence_score * 100)}%
                            </span>
                          )}

                          {/* Flag dot */}
                          {f.flag_level !== "none" && (
                            <span className={`h-2 w-2 rounded-full shrink-0 ${
                              f.flag_level === "red" ? "bg-destructive" : f.flag_level === "yellow" ? "bg-warning" : "bg-success"
                            }`} />
                          )}

                          {/* Lock toggle */}
                          <Button
                            variant="ghost" size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => lockMutation.mutate({ fieldId: f.id, locked: !f.locked_boolean, fieldKey: f.field_key, currentValue: f.current_value })}
                          >
                            {f.locked_boolean ? <Lock className="h-3 w-3 text-success" /> : <Unlock className="h-3 w-3 text-muted-foreground/40" />}
                          </Button>

                          {/* Edit */}
                          <Button
                            variant="ghost" size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => { setEditingField(f.id); setEditValue(f.current_value || ""); }}
                          >
                            <Pencil className="h-3 w-3 text-muted-foreground/40" />
                          </Button>
                        </div>
                      );
                    })}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>

        {/* Right: Sidebar */}
        <div className="space-y-3">
          {missingRequired.length > 0 && (
            <Card>
              <CardContent className="py-3 px-4">
                <p className="text-[10px] font-mono tracking-wider text-muted-foreground/60 mb-2">MISSING CRITICAL</p>
                {missingRequired.map((f) => (
                  <div key={f.id} className="flex items-center gap-1.5 text-xs text-destructive py-0.5">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span className="truncate">{f.canonical_label}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {openFlags.length > 0 && (
            <Card>
              <CardContent className="py-3 px-4">
                <p className="text-[10px] font-mono tracking-wider text-muted-foreground/60 mb-2">OPEN FLAGS</p>
                {openFlags.slice(0, 8).map((f) => (
                  <div key={f.id} className="flex items-center gap-1.5 text-xs py-0.5">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${f.severity === "red" ? "bg-destructive" : "bg-warning"}`} />
                    <span className="truncate">{f.title}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
