import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ChevronDown,
  Building2,
  Ruler,
  Anchor,
  Truck,
  Zap,
  Lightbulb,
  Shirt,
  HardHat,
  Columns3,
  Wrench,
  Users,
  ShieldAlert,
} from "lucide-react";

interface TechPackReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  tourId: string;
  techSpecId: string | null;
  riskFlags: Array<{
    category: string;
    severity: string;
    title: string;
    detail: string;
  }>;
  venueName: string;
  contactCount: number;
  onApproved: () => void;
}

interface TechSpec {
  id: string;
  venue_name: string;
  venue_identity: Record<string, unknown>;
  stage_specs: Record<string, unknown>;
  rigging_system: Record<string, unknown>;
  dock_load_in: Record<string, unknown>;
  power: Record<string, unknown>;
  lighting_audio: Record<string, unknown>;
  wardrobe_laundry: Record<string, unknown>;
  labor_union: Record<string, unknown>;
  permanent_installations: Record<string, unknown>;
  production_compatibility: Record<string, unknown>;
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-destructive/20 text-destructive border-destructive/30",
  HIGH: "bg-destructive/15 text-destructive border-destructive/25",
  MEDIUM: "bg-warning/20 text-warning border-warning/30",
  LOW: "bg-muted/30 text-muted-foreground border-border",
};

const SEVERITY_ICON_COLORS: Record<string, string> = {
  CRITICAL: "text-destructive",
  HIGH: "text-destructive",
  MEDIUM: "text-warning",
  LOW: "text-muted-foreground",
};

const SECTION_META: Array<{
  key: string;
  label: string;
  icon: typeof Building2;
}> = [
  { key: "venue_identity", label: "Venue Identity", icon: Building2 },
  { key: "stage_specs", label: "Stage Specs", icon: Ruler },
  { key: "rigging_system", label: "Rigging System", icon: Anchor },
  { key: "dock_load_in", label: "Dock & Load-In", icon: Truck },
  { key: "power", label: "Power", icon: Zap },
  { key: "lighting_audio", label: "Lighting / Audio", icon: Lightbulb },
  { key: "wardrobe_laundry", label: "Wardrobe / Laundry", icon: Shirt },
  { key: "labor_union", label: "Labor / Union", icon: HardHat },
  { key: "permanent_installations", label: "Permanent Installations", icon: Columns3 },
  { key: "production_compatibility", label: "Production Compatibility", icon: Wrench },
];

function renderSpecValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value || "—";
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === "object" && v !== null) {
          return Object.entries(v)
            .filter(([, val]) => val)
            .map(([k, val]) => `${k}: ${val}`)
            .join(", ");
        }
        return String(v);
      })
      .join(" · ");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${formatLabel(k)}: ${renderSpecValue(v)}`)
      .join(" · ");
  }
  return String(value);
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/Foh/g, "FOH")
    .replace(/Sr/g, "SR")
    .replace(/Sl/g, "SL")
    .replace(/Iatse/g, "IATSE")
    .replace(/Co2/g, "CO₂")
    .replace(/Hvac/g, "HVAC")
    .replace(/Led/g, "LED");
}

const TechPackReviewDialog = ({
  open,
  onOpenChange,
  documentId,
  tourId,
  techSpecId,
  riskFlags,
  venueName,
  contactCount,
  onApproved,
}: TechPackReviewDialogProps) => {
  const { toast } = useToast();
  const [techSpec, setTechSpec] = useState<TechSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && techSpecId) loadTechSpec();
  }, [open, techSpecId]);

  const loadTechSpec = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("venue_tech_specs")
      .select("*")
      .eq("id", techSpecId)
      .single();
    if (data) setTechSpec(data as unknown as TechSpec);
    setLoading(false);
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      // Activate the document
      await supabase
        .from("documents")
        .update({ is_active: true })
        .eq("id", documentId);

      toast({
        title: "Tech pack approved into AKB",
        description: `${venueName} specs and ${riskFlags.length} risk flags added.`,
      });
      onApproved();
      onOpenChange(false);
    } catch (err: unknown) {
      toast({
        title: "Approval failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setApproving(false);
    }
  };

  const criticalCount = riskFlags.filter((f) => f.severity === "CRITICAL").length;
  const highCount = riskFlags.filter((f) => f.severity === "HIGH").length;

  const getSectionData = (key: string): Record<string, unknown> => {
    if (!techSpec) return {};
    return (techSpec as unknown as Record<string, Record<string, unknown>>)[key] || {};
  };

  const getSectionFieldCount = (key: string): number => {
    const data = getSectionData(key);
    return Object.values(data).filter(
      (v) => v !== null && v !== undefined && v !== "" && v !== "{}"
    ).length;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-mono tracking-tight flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Tech Pack Review — {venueName}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Review extracted venue specifications and operational risk flags before
            approving into the AKB.
          </DialogDescription>
          <div className="flex gap-2 flex-wrap pt-2">
            <Badge variant="outline" className="font-mono text-[10px]">
              TECH PACK
            </Badge>
            {contactCount > 0 && (
              <Badge variant="outline" className="font-mono text-[10px] gap-1">
                <Users className="h-3 w-3" />
                {contactCount} contacts
              </Badge>
            )}
            {riskFlags.length > 0 && (
              <Badge
                variant="outline"
                className={`font-mono text-[10px] gap-1 ${
                  criticalCount > 0
                    ? "bg-destructive/15 text-destructive border-destructive/30"
                    : highCount > 0
                    ? "bg-destructive/10 text-destructive border-destructive/20"
                    : "bg-warning/15 text-warning border-warning/30"
                }`}
              >
                <AlertTriangle className="h-3 w-3" />
                {riskFlags.length} risks
              </Badge>
            )}
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1" style={{ maxHeight: "60vh" }}>
            <div className="space-y-3 pr-4">
              {/* Risk Flags Section */}
              {riskFlags.length > 0 && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                    <span className="font-mono text-xs font-semibold tracking-wider text-destructive">
                      OPERATIONAL RISK FLAGS ({riskFlags.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {riskFlags
                      .sort((a, b) => {
                        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
                        return (
                          (order[a.severity as keyof typeof order] ?? 4) -
                          (order[b.severity as keyof typeof order] ?? 4)
                        );
                      })
                      .map((flag, i) => (
                        <div
                          key={i}
                          className={`rounded-md border px-3 py-2 ${
                            SEVERITY_COLORS[flag.severity] || SEVERITY_COLORS.MEDIUM
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <AlertTriangle
                              className={`h-3.5 w-3.5 shrink-0 ${
                                SEVERITY_ICON_COLORS[flag.severity] || ""
                              }`}
                            />
                            <span className="font-mono text-xs font-medium">
                              {flag.severity}
                            </span>
                            <span className="text-xs font-medium">{flag.title}</span>
                            <Badge
                              variant="outline"
                              className="font-mono text-[9px] ml-auto"
                            >
                              {flag.category}
                            </Badge>
                          </div>
                          {flag.detail && (
                            <p className="text-xs text-muted-foreground mt-1 ml-6 font-mono">
                              {flag.detail}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Spec Sections */}
              {SECTION_META.map(({ key, label, icon: Icon }) => {
                const data = getSectionData(key);
                const fieldCount = getSectionFieldCount(key);
                const isOpen = expandedSections.has(key);
                const entries = Object.entries(data).filter(
                  ([k, v]) =>
                    v !== null &&
                    v !== undefined &&
                    v !== "" &&
                    k !== "notes" &&
                    k !== "production_contacts"
                );
                const notes = data.notes as string | undefined;

                if (fieldCount === 0) return null;

                return (
                  <Collapsible
                    key={key}
                    open={isOpen}
                    onOpenChange={() => toggleSection(key)}
                  >
                    <div className="rounded-lg border border-border bg-card">
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/30 transition-colors text-left">
                          <div className="flex items-center gap-2.5">
                            <Icon className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">{label}</span>
                            <Badge
                              variant="outline"
                              className="font-mono text-[9px]"
                            >
                              {fieldCount} specs
                            </Badge>
                          </div>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t border-border px-4 py-3">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                            {entries.map(([k, v]) => (
                              <div key={k} className="flex justify-between gap-2">
                                <span className="text-[11px] font-mono text-muted-foreground truncate">
                                  {formatLabel(k)}
                                </span>
                                <span className="text-[11px] font-mono font-medium text-right shrink-0 max-w-[60%] truncate">
                                  {renderSpecValue(v)}
                                </span>
                              </div>
                            ))}
                          </div>
                          {notes && (
                            <p className="text-[10px] font-mono text-muted-foreground mt-2 bg-muted/50 rounded p-2">
                              {notes}
                            </p>
                          )}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="pt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="font-mono text-xs"
          >
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            disabled={approving || loading}
            className="font-mono text-xs gap-1.5"
          >
            {approving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            Approve into AKB
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TechPackReviewDialog;
