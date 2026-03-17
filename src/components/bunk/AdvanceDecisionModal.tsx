import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Evidence {
  id: string;
  extracted_value: string | null;
  confidence_score: number | null;
  source_snippet: string | null;
  speaker_name: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: {
    id: string;
    show_advance_id: string;
    field_key: string;
    canonical_label: string;
    current_value: string | null;
    field_criticality: string;
    money_sensitive_boolean: boolean;
  };
  evidence: Evidence[];
}

export default function AdvanceDecisionModal({ open, onOpenChange, field, evidence }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rationale, setRationale] = useState("");
  const [selectedValue, setSelectedValue] = useState<string | null>(null);

  const isMoneySensitive = field.money_sensitive_boolean;
  const isCritical = field.field_criticality === "critical";
  const canResolve = !isMoneySensitive || rationale.trim().length > 0;

  // Deduplicate evidence values
  const uniqueValues = Array.from(new Set(evidence.map(e => e.extracted_value).filter(Boolean))) as string[];
  const allValues = field.current_value ? [field.current_value, ...uniqueValues.filter(v => v !== field.current_value)] : uniqueValues;

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedValue) throw new Error("Select a value");
      if (isMoneySensitive && !rationale.trim()) throw new Error("Rationale required for money-sensitive fields");

      // Update field
      await supabase.from("advance_fields").update({
        current_value: selectedValue,
        status: "confirmed",
        locked_boolean: isCritical,
        flag_level: "none",
        updated_by: "conflict_resolver",
        updated_at: new Date().toISOString(),
      }).eq("id", field.id);

      // Resolve related flags
      await supabase.from("advance_flags").update({
        status: "resolved",
        resolution_note: rationale || `Resolved: kept "${selectedValue}"`,
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id,
      }).eq("show_advance_id", field.show_advance_id)
        .eq("linked_field_key", field.field_key)
        .eq("status", "open");

      // Insert decision log
      await supabase.from("advance_decision_log").insert({
        show_advance_id: field.show_advance_id,
        tai_d: `TAI-D-RESOLVE-${Date.now()}`,
        action_type: "conflict_resolved",
        field_key: field.field_key,
        prior_value: field.current_value,
        new_value: selectedValue,
        rationale: rationale || `Chose "${selectedValue}"`,
        created_by: user?.id,
        owner_operator: "conflict_resolver",
      });

      if (isCritical) {
        await supabase.from("advance_decision_log").insert({
          show_advance_id: field.show_advance_id,
          tai_d: `TAI-D-LOCK-${Date.now()}`,
          action_type: "field_locked",
          field_key: field.field_key,
          new_value: selectedValue,
          rationale: "Auto-locked on critical conflict resolution",
          created_by: user?.id,
          owner_operator: "conflict_resolver",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advance-fields", field.show_advance_id] });
      queryClient.invalidateQueries({ queryKey: ["advance-flags", field.show_advance_id] });
      queryClient.invalidateQueries({ queryKey: ["advance-readiness-single", field.show_advance_id] });
      toast.success("Conflict resolved");
      setRationale("");
      setSelectedValue(null);
      onOpenChange(false);
    },
    onError: (err: any) => toast.error("Failed", { description: err.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Resolve Conflict
            {isMoneySensitive && <Badge variant="outline" className="text-[9px] bg-warning/15 text-warning">$</Badge>}
            {isCritical && <Badge variant="outline" className="text-[9px] bg-destructive/15 text-destructive">Critical</Badge>}
          </DialogTitle>
          <DialogDescription>{field.canonical_label}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Value options */}
          <div className="space-y-2">
            <Label className="text-xs font-mono text-muted-foreground">SELECT VALUE</Label>
            {allValues.map((val, i) => {
              const isCurrentValue = val === field.current_value;
              const matchingEvidence = evidence.filter(e => e.extracted_value === val);
              return (
                <button
                  key={i}
                  onClick={() => setSelectedValue(val)}
                  className={`w-full text-left p-3 rounded-md border transition-colors ${
                    selectedValue === val
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{val}</span>
                    {isCurrentValue && <Badge variant="outline" className="text-[9px]">Current</Badge>}
                  </div>
                  {matchingEvidence.map((e, j) => (
                    <div key={j} className="mt-1.5 text-[10px] text-muted-foreground">
                      {e.source_snippet && <p className="italic">"{e.source_snippet}"</p>}
                      <p className="font-mono">
                        conf: {((e.confidence_score || 0) * 100).toFixed(0)}%
                        {e.speaker_name && ` · ${e.speaker_name}`}
                      </p>
                    </div>
                  ))}
                </button>
              );
            })}
          </div>

          {/* Rationale */}
          {isMoneySensitive && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <AlertTriangle className="h-3 w-3 text-warning" />
                Rationale required (money-sensitive)
              </Label>
              <Textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Explain your decision..."
                className="text-xs min-h-[80px]"
              />
            </div>
          )}

          {!isMoneySensitive && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Rationale (optional)</Label>
              <Textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Optional notes..."
                className="text-xs min-h-[60px]"
              />
            </div>
          )}

          {isCritical && (
            <p className="text-[10px] text-muted-foreground bg-muted/50 p-2 rounded">
              This is a critical field — it will be automatically locked after resolution.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => resolveMutation.mutate()}
            disabled={!selectedValue || !canResolve || resolveMutation.isPending}
          >
            {resolveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Resolve{isCritical ? " & Lock" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
