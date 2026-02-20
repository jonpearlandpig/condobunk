import { useEffect, useState } from "react";
import { BarChart3, CheckCircle2, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTour } from "@/hooks/useTour";

const docTypes = [
  "SCHEDULE",
  "CONTACTS",
  "RUN_OF_SHOW",
  "TECH",
  "FINANCE",
  "TRAVEL",
  "LOGISTICS",
  "HOSPITALITY",
  "CAST",
  "VENUE",
];

const BunkCoverage = () => {
  const { tours, selectedTourId } = useTour();
  const [coveredTypes, setCoveredTypes] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!selectedTourId) return;
    const load = async () => {
      const { data } = await supabase
        .from("documents")
        .select("doc_type")
        .eq("tour_id", selectedTourId)
        .eq("is_active", true)
        .is("archived_at", null);

      const counts: Record<string, number> = {};
      (data || []).forEach((d) => {
        counts[d.doc_type] = (counts[d.doc_type] || 0) + 1;
      });
      setCoveredTypes(counts);
    };
    load();
  }, [selectedTourId]);

  const coveredCount = docTypes.filter((t) => (coveredTypes[t] || 0) > 0).length;
  const pct = Math.round((coveredCount / docTypes.length) * 100);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AKB Coverage</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          {coveredCount}/{docTypes.length} domains covered — {pct}%
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="space-y-2">
        {docTypes.map((type) => {
          const count = coveredTypes[type] || 0;
          const covered = count > 0;
          return (
            <div
              key={type}
              className={`flex items-center justify-between rounded-lg border bg-card px-5 py-3 ${
                covered ? "border-success/30" : "border-border"
              }`}
            >
              <div className="flex items-center gap-3">
                {covered ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/30" />
                )}
                <span className="font-mono text-sm">{type}</span>
              </div>
              <span
                className={`font-mono text-[10px] tracking-wider font-semibold ${
                  covered ? "text-success" : "text-muted-foreground"
                }`}
              >
                {covered ? `${count} ARTIFACT${count > 1 ? "S" : ""}` : "NOT COVERED"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BunkCoverage;
