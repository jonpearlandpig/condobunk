import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AdvanceField } from "@/stores/advanceStore";
import { ArrowLeft, Loader2, AlertTriangle, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AdvanceDecisionModal from "@/components/bunk/AdvanceDecisionModal";

interface Evidence {
  id: string;
  extracted_value: string | null;
  confidence_score: number | null;
  source_snippet: string | null;
  speaker_name: string | null;
}

export default function AdvanceConflicts() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [resolveField, setResolveField] = useState<AdvanceField | null>(null);

  const { data: fields, isLoading } = useQuery({
    queryKey: ["advance-fields", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("advance_fields").select("*").eq("show_advance_id", id!);
      if (error) throw error;
      return data as AdvanceField[];
    },
    enabled: !!id,
  });

  const conflictFields = fields?.filter((f) => f.status === "conflict") || [];
  const moneyConflicts = conflictFields.filter((f) => f.money_sensitive_boolean);

  // Load evidence for all conflict fields
  const conflictFieldIds = conflictFields.map((f) => f.id);
  const { data: allEvidence } = useQuery({
    queryKey: ["advance-conflict-evidence", id, conflictFieldIds],
    queryFn: async () => {
      if (!conflictFieldIds.length) return [];
      const { data, error } = await supabase
        .from("advance_field_evidence")
        .select("id, advance_field_id, extracted_value, confidence_score, source_snippet, speaker_name")
        .in("advance_field_id", conflictFieldIds);
      if (error) throw error;
      return data;
    },
    enabled: conflictFieldIds.length > 0,
  });

  const getEvidence = (fieldId: string): Evidence[] =>
    (allEvidence || []).filter((e: any) => e.advance_field_id === fieldId);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/bunk/advance/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">Conflict Review</h1>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="py-3 px-4 text-center">
          <p className="text-xl font-bold font-mono">{conflictFields.length}</p>
          <p className="text-[10px] text-muted-foreground font-mono">TOTAL</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4 text-center">
          <p className="text-xl font-bold font-mono text-warning">{moneyConflicts.length}</p>
          <p className="text-[10px] text-muted-foreground font-mono">MONEY-SENSITIVE</p>
        </CardContent></Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : conflictFields.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No conflicts to resolve</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {conflictFields.map((f) => {
            const evidence = getEvidence(f.id);
            const uniqueVals = Array.from(new Set(evidence.map(e => e.extracted_value).filter(Boolean)));
            return (
              <Card key={f.id} className={f.money_sensitive_boolean ? "border-warning/30" : ""}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-medium">{f.canonical_label}</span>
                        <Badge variant="outline" className="text-[9px] bg-destructive/15 text-destructive">Conflict</Badge>
                        {f.money_sensitive_boolean && <Badge variant="outline" className="text-[9px] bg-warning/15 text-warning">$</Badge>}
                        {f.field_criticality === "critical" && <Badge variant="outline" className="text-[9px] bg-destructive/15 text-destructive">Critical</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">Current: {f.current_value || "—"}</p>
                      {uniqueVals.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {uniqueVals.map((v, i) => {
                            const e = evidence.find(ev => ev.extracted_value === v);
                            return (
                              <p key={i} className="text-[10px] text-muted-foreground/80">
                                Evidence: "{v}" {e?.confidence_score != null && <span className="font-mono">(conf: {(e.confidence_score * 100).toFixed(0)}%)</span>}
                                {e?.speaker_name && <span> · {e.speaker_name}</span>}
                              </p>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => setResolveField(f)}>
                      <Scale className="h-3.5 w-3.5" />Resolve
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {resolveField && (
        <AdvanceDecisionModal
          open={!!resolveField}
          onOpenChange={(o) => !o && setResolveField(null)}
          field={resolveField}
          evidence={getEvidence(resolveField.id)}
        />
      )}
    </div>
  );
}
