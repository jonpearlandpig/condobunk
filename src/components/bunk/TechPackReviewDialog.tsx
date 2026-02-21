import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
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
  Shield,
  Lock,
  UserCheck,
  Coffee,
  Radio,
  Wifi,
  Thermometer,
  Gavel,
  DollarSign,
  History,
  MapPin,
  Accessibility,
  Camera,
  LogOut,
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
  contact_chain_of_command: Record<string, unknown>;
  insurance_liability: Record<string, unknown>;
  safety_compliance: Record<string, unknown>;
  security_crowd_control: Record<string, unknown>;
  hospitality_catering: Record<string, unknown>;
  comms_infrastructure: Record<string, unknown>;
  it_network: Record<string, unknown>;
  environmental_conditions: Record<string, unknown>;
  local_ordinances: Record<string, unknown>;
  financial_settlement: Record<string, unknown>;
  venue_history: Record<string, unknown>;
  transportation_logistics: Record<string, unknown>;
  ada_accessibility: Record<string, unknown>;
  content_media_policy: Record<string, unknown>;
  load_out_constraints: Record<string, unknown>;
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

// Grouped domain structure
const DOMAIN_GROUPS: Array<{
  domain: string;
  label: string;
  sections: Array<{ key: string; label: string; icon: typeof Building2 }>;
}> = [
  {
    domain: "structural",
    label: "Structural & Production",
    sections: [
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
    ],
  },
  {
    domain: "operations",
    label: "Operations & Safety",
    sections: [
      { key: "contact_chain_of_command", label: "Chain of Command", icon: UserCheck },
      { key: "safety_compliance", label: "Safety & Compliance", icon: Shield },
      { key: "security_crowd_control", label: "Security & Crowd", icon: Lock },
      { key: "hospitality_catering", label: "Hospitality & Catering", icon: Coffee },
      { key: "load_out_constraints", label: "Load-Out Constraints", icon: LogOut },
    ],
  },
  {
    domain: "risk_financial",
    label: "Risk & Financial",
    sections: [
      { key: "insurance_liability", label: "Insurance & Liability", icon: ShieldAlert },
      { key: "local_ordinances", label: "Local Ordinances", icon: Gavel },
      { key: "financial_settlement", label: "Financial & Settlement", icon: DollarSign },
      { key: "venue_history", label: "Venue History", icon: History },
    ],
  },
  {
    domain: "infrastructure",
    label: "Infrastructure & Logistics",
    sections: [
      { key: "comms_infrastructure", label: "Communications", icon: Radio },
      { key: "it_network", label: "IT / Network", icon: Wifi },
      { key: "environmental_conditions", label: "Environmental", icon: Thermometer },
      { key: "transportation_logistics", label: "Transportation", icon: MapPin },
      { key: "ada_accessibility", label: "ADA & Accessibility", icon: Accessibility },
      { key: "content_media_policy", label: "Content & Media", icon: Camera },
    ],
  },
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
    .replace(/Led/g, "LED")
    .replace(/Asl/g, "ASL")
    .replace(/Ada/g, "ADA")
    .replace(/Osha/g, "OSHA")
    .replace(/Ppe/g, "PPE")
    .replace(/Coi/g, "COI")
    .replace(/Rf/g, "RF")
    .replace(/Das/g, "DAS")
    .replace(/Vlan/g, "VLAN")
    .replace(/Ip\b/g, "IP");
}

function getSectionFieldCount(data: Record<string, unknown>): number {
  return Object.values(data).filter(
    (v) => v !== null && v !== undefined && v !== "" && v !== "{}" && JSON.stringify(v) !== "{}"
  ).length;
}

function getDomainFillPercent(
  techSpec: TechSpec,
  sections: Array<{ key: string }>
): number {
  let totalFields = 0;
  let filledFields = 0;
  for (const { key } of sections) {
    const data = (techSpec as unknown as Record<string, Record<string, unknown>>)[key] || {};
    const entries = Object.entries(data).filter(([k]) => k !== "notes" && k !== "production_contacts");
    totalFields += Math.max(entries.length, 1);
    filledFields += entries.filter(
      ([, v]) => v !== null && v !== undefined && v !== "" && JSON.stringify(v) !== "{}"
    ).length;
  }
  return totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
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
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set(["structural"]));
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

  const toggleDomain = (domain: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      next.has(domain) ? next.delete(domain) : next.add(domain);
      return next;
    });
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

  const getFillColor = (pct: number): string => {
    if (pct >= 70) return "bg-success";
    if (pct >= 40) return "bg-warning";
    if (pct > 0) return "bg-destructive/60";
    return "bg-muted-foreground/20";
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-3xl h-[95dvh] sm:max-h-[90vh] sm:h-auto flex flex-col p-4 sm:p-6">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="font-mono tracking-tight flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Tech Pack Review — {venueName}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="font-mono text-xs">
            Review extracted venue specifications across 25 categories and operational
            risk flags before approving into the AKB.
          </ResponsiveDialogDescription>
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
        </ResponsiveDialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-3 pr-4">
              {/* Domain Status Bar Overview */}
              {techSpec && (
                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
                    EXTRACTION COVERAGE
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {DOMAIN_GROUPS.map((group) => {
                      const pct = getDomainFillPercent(techSpec, group.sections);
                      return (
                        <div key={group.domain} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-medium truncate">
                              {group.label}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {pct}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${getFillColor(pct)}`}
                              style={{ width: `${Math.max(pct, 2)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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

              {/* Domain Groups */}
              {DOMAIN_GROUPS.map((group) => {
                const domainOpen = expandedDomains.has(group.domain);
                const nonEmptySections = group.sections.filter(
                  (s) => getSectionFieldCount(getSectionData(s.key)) > 0
                );
                if (nonEmptySections.length === 0) return null;

                const pct = techSpec
                  ? getDomainFillPercent(techSpec, group.sections)
                  : 0;

                return (
                  <Collapsible
                    key={group.domain}
                    open={domainOpen}
                    onOpenChange={() => toggleDomain(group.domain)}
                  >
                    <div className="rounded-lg border border-border bg-card">
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/30 transition-colors text-left">
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-semibold">{group.label}</span>
                            <Badge variant="outline" className="font-mono text-[9px]">
                              {nonEmptySections.length}/{group.sections.length}
                            </Badge>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {pct}%
                            </span>
                          </div>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                              domainOpen ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t border-border px-2 py-2 space-y-1">
                          {nonEmptySections.map(({ key, label, icon: Icon }) => {
                            const data = getSectionData(key);
                            const fieldCount = getSectionFieldCount(data);
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

                            return (
                              <Collapsible
                                key={key}
                                open={isOpen}
                                onOpenChange={() => toggleSection(key)}
                              >
                                <div className="rounded-md border border-border/50 bg-background">
                                  <CollapsibleTrigger asChild>
                                    <button className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted/20 transition-colors text-left">
                                      <div className="flex items-center gap-2">
                                        <Icon className="h-3.5 w-3.5 text-primary" />
                                        <span className="text-xs font-medium">{label}</span>
                                        <Badge
                                          variant="outline"
                                          className="font-mono text-[9px]"
                                        >
                                          {fieldCount}
                                        </Badge>
                                      </div>
                                      <ChevronDown
                                        className={`h-3 w-3 text-muted-foreground transition-transform ${
                                          isOpen ? "rotate-180" : ""
                                        }`}
                                      />
                                    </button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    <div className="border-t border-border/50 px-3 py-2">
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
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <ResponsiveDialogFooter className="pt-3 border-t border-border flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="font-mono text-xs w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            disabled={approving || loading}
            className="font-mono text-xs gap-1.5 w-full sm:w-auto"
          >
            {approving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            Approve into AKB
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
};

export default TechPackReviewDialog;
