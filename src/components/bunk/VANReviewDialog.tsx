import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import {
  CheckCircle2,
  Loader2,
  ChevronDown,
  MapPin,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface VANReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  tourId: string;
  extractionSummary: {
    doc_type: string;
    extracted_count: number;
    venue_count?: number;
  } | null;
  onApproved: () => void;
}

interface VanRow {
  id: string;
  venue_name: string;
  city: string | null;
  event_date: string | null;
  van_data: Record<string, Record<string, any>>;
}

// The 14 categories from the Advance Master, in order
const VAN_CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: "event_details", label: "Event Details", icon: "📅" },
  { key: "production_contact", label: "Production Contact", icon: "🎬" },
  { key: "house_rigger_contact", label: "Rigger Contact", icon: "🔗" },
  { key: "summary", label: "Summary", icon: "📋" },
  { key: "venue_schedule", label: "Venue Schedule", icon: "🕐" },
  { key: "plant_equipment", label: "Equipment", icon: "🏗️" },
  { key: "labour", label: "Labour", icon: "👷" },
  { key: "dock_and_logistics", label: "Dock & Logistics", icon: "🚛" },
  { key: "power", label: "Power", icon: "⚡" },
  { key: "staging", label: "Staging", icon: "🎭" },
  { key: "misc", label: "Misc", icon: "📝" },
  { key: "lighting", label: "Lighting", icon: "💡" },
  { key: "video", label: "Video", icon: "📺" },
  { key: "risk_flags", label: "Risk Flags", icon: "⚠️" },
];

// Human-readable field labels
const FIELD_LABELS: Record<string, string> = {
  day_and_date: "Day & Date",
  venue: "Venue",
  bus_arrival_time: "Bus Arrival",
  onsale_capacity: "Onsale Capacity",
  production_rider_sent: "Rider Sent",
  name: "Name",
  phone: "Phone",
  email: "Email",
  notes: "Notes",
  cad_received: "CAD Received",
  distance_to_low_steel: "Distance to Low Steel",
  rigging_overlay_done: "Rigging Overlay Done",
  chair_set: "Chair Set",
  show_times: "Show Times",
  forklifts: "Forklifts",
  co2_confirmed: "CO2 Confirmed",
  union_venue: "Union Venue",
  labor_notes: "Labor Notes",
  labor_call: "Labor Call",
  labor_estimate_received: "Labor Estimate",
  number_to_feed: "Number to Feed",
  house_electrician_catering: "House Electrician (Catering)",
  follow_spots: "Follow Spots",
  loading_dock: "Loading Dock",
  distance_dock_to_stage: "Dock → Stage Distance",
  trucks_parked: "Trucks Parked",
  bus_trailer_unload: "Bus/Trailer Unload",
  parking_situation: "Parking",
  catering_truck: "Catering Truck",
  merch_truck: "Merch Truck",
  vom_entry: "Vom Entry",
  height_to_seating: "Height to Seating",
  power_available: "Power Available",
  catering_power: "Catering Power",
  foh_vip_risers: "FOH VIP Risers",
  vip_riser_height: "VIP Riser Height",
  handrails: "Handrails",
  foh_lighting_riser: "FOH Lighting Riser",
  camera_risers: "Camera Risers",
  preset_in_place: "Preset In Place",
  end_stage_curtain: "End Stage Curtain",
  bike_rack: "Bike Rack",
  curfew: "Curfew",
  dead_case_storage: "Dead Case Storage",
  haze_restrictions: "Haze Restrictions",
  audio_spl_restrictions: "Audio SPL Restrictions",
  houselight_control: "Houselight Control",
  flypack_location: "Flypack Location",
  hardline_internet: "Hardline Internet",
  house_tv_patch: "House TV Patch",
  led_ribbon: "LED Ribbon",
  video_village: "Video Village",
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function countFilled(data: Record<string, any> | undefined | null): { filled: number; total: number } {
  if (!data || typeof data !== "object") return { filled: 0, total: 0 };
  const entries = Object.entries(data);
  const total = entries.length;
  const filled = entries.filter(([, v]) => v !== null && v !== undefined && v !== "").length;
  return { filled, total };
}

function formatDate(d: string | null) {
  if (!d) return "No date";
  try {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return d;
  }
}

const VANReviewDialog = ({
  open,
  onOpenChange,
  documentId,
  tourId,
  extractionSummary,
  onApproved,
}: VANReviewDialogProps) => {
  const { toast } = useToast();
  const [vans, setVans] = useState<VanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [selectedVenueIdx, setSelectedVenueIdx] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["event_details"]));

  useEffect(() => {
    if (open && documentId) {
      loadVANs();
    }
  }, [open, documentId]);

  const loadVANs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("venue_advance_notes")
      .select("id, venue_name, city, event_date, van_data")
      .eq("source_doc_id", documentId)
      .order("event_date");
    setVans((data as VanRow[]) || []);
    setSelectedVenueIdx(0);
    setExpandedCategories(new Set(["event_details"]));
    setLoading(false);
  };

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      // Deactivate previous docs of same type
      const docType = extractionSummary?.doc_type;
      if (docType) {
        await supabase
          .from("documents")
          .update({ is_active: false })
          .eq("tour_id", tourId)
          .eq("doc_type", docType as any)
          .neq("id", documentId);
      }
      await supabase
        .from("documents")
        .update({ is_active: true })
        .eq("id", documentId);

      toast({ title: "Advance Master approved", description: `${vans.length} venues activated in AKB.` });
      onApproved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Approval failed", description: err.message, variant: "destructive" });
    } finally {
      setApproving(false);
    }
  };

  const selectedVan = vans[selectedVenueIdx];

  // Compute overall coverage for venue selector
  const venueCoverage = (van: VanRow) => {
    let filled = 0, total = 0;
    for (const cat of VAN_CATEGORIES) {
      if (cat.key === "risk_flags") continue;
      const stats = countFilled(van.van_data?.[cat.key]);
      filled += stats.filled;
      total += stats.total;
    }
    return total > 0 ? Math.round((filled / total) * 100) : 0;
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[95dvh] flex flex-col">
        <DrawerHeader className="pb-3 border-b border-border shrink-0">
          <DrawerTitle className="font-mono tracking-tight text-lg">
            ★ Advance Master Review
          </DrawerTitle>
          <DrawerDescription className="font-mono text-xs text-muted-foreground">
            Review extracted venue data across all categories
          </DrawerDescription>
          {extractionSummary && (
            <div className="flex gap-2 flex-wrap pt-1">
              <Badge className="font-mono text-[11px] bg-primary/20 text-primary border-primary/30">
                {extractionSummary.venue_count || vans.length} VENUES
              </Badge>
              <Badge variant="outline" className="font-mono text-[11px]">
                {extractionSummary.extracted_count} items
              </Badge>
            </div>
          )}
        </DrawerHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : vans.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground font-mono">No venue advance notes found</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Venue selector - horizontal scroll */}
            <div className="shrink-0 px-4 pt-3 pb-2">
              <ScrollArea className="w-full">
                <div className="flex gap-2 pb-1">
                  {vans.map((van, idx) => {
                    const coverage = venueCoverage(van);
                    const riskFlags = Array.isArray(van.van_data?.risk_flags) ? van.van_data.risk_flags : [];
                    return (
                      <button
                        key={van.id}
                        onClick={() => {
                          setSelectedVenueIdx(idx);
                          setExpandedCategories(new Set(["event_details"]));
                        }}
                        className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-all min-w-[160px] ${
                          idx === selectedVenueIdx
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card hover:border-primary/40"
                        }`}
                      >
                        <p className="font-mono text-xs font-semibold truncate max-w-[140px]">
                          {van.venue_name}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                          {formatDate(van.event_date)} · {van.city || "—"}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                coverage >= 80 ? "bg-green-500" : coverage >= 50 ? "bg-yellow-500" : "bg-red-500"
                              }`}
                              style={{ width: `${coverage}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-muted-foreground">{coverage}%</span>
                          {riskFlags.length > 0 && (
                            <Badge variant="destructive" className="font-mono text-[9px] h-4 px-1">
                              {riskFlags.length}⚠
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Category accordion */}
            <ScrollArea className="flex-1 px-4">
              <div className="space-y-2 pb-4">
                {VAN_CATEGORIES.map((cat) => {
                  const catData = selectedVan?.van_data?.[cat.key];
                  const isRiskFlags = cat.key === "risk_flags";
                  const riskFlags = isRiskFlags && Array.isArray(catData) ? catData : [];
                  const stats = isRiskFlags ? { filled: riskFlags.length, total: riskFlags.length } : countFilled(catData);
                  const isExpanded = expandedCategories.has(cat.key);
                  const allEmpty = !isRiskFlags && stats.filled === 0;

                  return (
                    <Collapsible
                      key={cat.key}
                      open={isExpanded}
                      onOpenChange={() => toggleCategory(cat.key)}
                    >
                      <CollapsibleTrigger className="w-full">
                        <div
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all ${
                            isExpanded ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                          }`}
                        >
                          <span className="text-base">{cat.icon}</span>
                          <span className="font-mono text-sm font-medium flex-1 text-left">
                            {cat.label}
                          </span>
                          {isRiskFlags ? (
                            riskFlags.length > 0 ? (
                              <Badge variant="destructive" className="font-mono text-[10px]">
                                {riskFlags.length} risks
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="font-mono text-[10px] text-green-600">
                                Clear
                              </Badge>
                            )
                          ) : (
                            <Badge
                              variant="outline"
                              className={`font-mono text-[10px] ${
                                allEmpty
                                  ? "text-red-500 border-red-500/30"
                                  : stats.filled === stats.total
                                  ? "text-green-600 border-green-500/30"
                                  : "text-yellow-600 border-yellow-500/30"
                              }`}
                            >
                              {stats.filled}/{stats.total}
                            </Badge>
                          )}
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-1 rounded-lg border border-border bg-card/50 p-3">
                          {isRiskFlags ? (
                            riskFlags.length === 0 ? (
                              <p className="text-xs font-mono text-muted-foreground text-center py-2">
                                No risk flags for this venue
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {riskFlags.map((flag: any, i: number) => (
                                  <div
                                    key={i}
                                    className={`rounded-lg border p-2.5 ${
                                      flag.severity === "CRITICAL"
                                        ? "border-red-500/40 bg-red-500/5"
                                        : flag.severity === "HIGH"
                                        ? "border-orange-500/30 bg-orange-500/5"
                                        : "border-border"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      <Badge
                                        variant={flag.severity === "CRITICAL" || flag.severity === "HIGH" ? "destructive" : "outline"}
                                        className="font-mono text-[9px]"
                                      >
                                        {flag.severity}
                                      </Badge>
                                      <span className="font-mono text-[10px] text-muted-foreground uppercase">
                                        {flag.category}
                                      </span>
                                    </div>
                                    <p className="font-mono text-xs font-medium">{flag.title}</p>
                                    {flag.detail && (
                                      <p className="font-mono text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                        {flag.detail}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )
                          ) : (
                            <div className="space-y-2">
                              {catData && typeof catData === "object" ? (
                                Object.entries(catData).map(([fieldKey, value]) => {
                                  const hasValue = value !== null && value !== undefined && value !== "";
                                  return (
                                    <div
                                      key={fieldKey}
                                      className="flex items-start gap-2"
                                    >
                                      {hasValue ? (
                                        <Check className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                                      ) : (
                                        <X className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                          {fieldLabel(fieldKey)}
                                        </p>
                                        {hasValue ? (
                                          <p className="font-mono text-xs text-foreground mt-0.5 leading-relaxed whitespace-pre-wrap">
                                            {String(value)}
                                          </p>
                                        ) : (
                                          <p className="font-mono text-[11px] text-red-400 italic mt-0.5">
                                            Missing
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <p className="text-xs font-mono text-muted-foreground text-center py-2">
                                  No data in this category
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        <DrawerFooter className="shrink-0 border-t border-border pt-3 pb-6 flex-row gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="font-mono text-sm flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            disabled={approving || loading}
            className="font-mono text-sm gap-2 flex-1"
          >
            {approving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Approve All ({vans.length} venues)
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default VANReviewDialog;
