import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AdvanceField, AdvanceFlag } from "@/stores/advanceStore";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AdvanceConflicts() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

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
          {conflictFields.map((f) => (
            <Card key={f.id} className={f.money_sensitive_boolean ? "border-warning/30" : ""}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{f.canonical_label}</span>
                  <Badge variant="outline" className="text-[9px] bg-destructive/15 text-destructive">Conflict</Badge>
                  {f.money_sensitive_boolean && <Badge variant="outline" className="text-[9px] bg-warning/15 text-warning">$</Badge>}
                  {f.field_criticality === "critical" && <Badge variant="outline" className="text-[9px] bg-destructive/15 text-destructive">Critical</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">Current: {f.current_value || "—"}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  Review evidence in the Fields view to resolve this conflict.
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
