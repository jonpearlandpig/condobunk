import { Plus, RefreshCw, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface DeltaChange {
  type: "added" | "updated" | "removed";
  entity: string;
  detail: string;
}

interface DeltaChangeSummaryProps {
  changes: DeltaChange[];
}

const TYPE_CONFIG = {
  added: {
    icon: Plus,
    label: "Added",
    badgeClass: "bg-green-500/15 text-green-500 border-green-500/30",
    rowClass: "border-green-500/20 bg-green-500/5",
    prefix: "+",
  },
  updated: {
    icon: RefreshCw,
    label: "Updated",
    badgeClass: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
    rowClass: "border-yellow-500/20 bg-yellow-500/5",
    prefix: "~",
  },
  removed: {
    icon: Minus,
    label: "Removed",
    badgeClass: "bg-red-500/15 text-red-500 border-red-500/30",
    rowClass: "border-red-500/20 bg-red-500/5",
    prefix: "−",
  },
} as const;

const DeltaChangeSummary = ({ changes }: DeltaChangeSummaryProps) => {
  if (!changes || changes.length === 0) return null;

  const added = changes.filter((c) => c.type === "added").length;
  const updated = changes.filter((c) => c.type === "updated").length;
  const removed = changes.filter((c) => c.type === "removed").length;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs font-semibold tracking-wider text-primary">
          📋 VERSION CHANGES
        </span>
        {added > 0 && (
          <Badge className="font-mono text-[10px] bg-green-500/15 text-green-500 border-green-500/30">
            +{added}
          </Badge>
        )}
        {updated > 0 && (
          <Badge className="font-mono text-[10px] bg-yellow-500/15 text-yellow-500 border-yellow-500/30">
            ~{updated}
          </Badge>
        )}
        {removed > 0 && (
          <Badge className="font-mono text-[10px] bg-red-500/15 text-red-500 border-red-500/30">
            −{removed}
          </Badge>
        )}
      </div>

      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {changes.map((change, idx) => {
          const config = TYPE_CONFIG[change.type];
          const Icon = config.icon;
          return (
            <div
              key={idx}
              className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 ${config.rowClass}`}
            >
              <Icon className="h-3 w-3 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {change.entity}
                </span>
                <p className="font-mono text-xs text-foreground leading-relaxed">
                  {change.detail}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DeltaChangeSummary;
