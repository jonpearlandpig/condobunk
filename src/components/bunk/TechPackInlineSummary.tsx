import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  MapPin,
  Ruler,
  Anchor,
  Zap,
  Truck,
  Coffee,
  Shirt,
  HardHat,
  Shield,
  AlertTriangle,
  Users,
} from "lucide-react";

interface TechPackInlineSummaryProps {
  docId: string;
}

interface SummaryRow {
  label: string;
  value: string | null;
  icon: typeof MapPin;
}

const TechPackInlineSummary = ({ docId }: TechPackInlineSummaryProps) => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [riskCount, setRiskCount] = useState(0);
  const [contactCount, setContactCount] = useState(0);
  const [venueName, setVenueName] = useState("");

  useEffect(() => {
    load();
  }, [docId]);

  const load = async () => {
    setLoading(true);
    const { data: spec } = await supabase
      .from("venue_tech_specs")
      .select("*")
      .eq("source_doc_id", docId)
      .limit(1)
      .single();

    if (!spec) {
      setLoading(false);
      return;
    }

    setVenueName(spec.venue_name);

    // Count risks and contacts
    const [{ count: risks }, { count: contacts }] = await Promise.all([
      supabase
        .from("venue_risk_flags")
        .select("*", { count: "exact", head: true })
        .eq("tech_spec_id", spec.id),
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("source_doc_id", docId),
    ]);
    setRiskCount(risks || 0);
    setContactCount(contacts || 0);

    const identity = (spec.venue_identity || {}) as Record<string, unknown>;
    const stage = (spec.stage_specs || {}) as Record<string, unknown>;
    const rigging = (spec.rigging_system || {}) as Record<string, unknown>;
    const power = (spec.power || {}) as Record<string, unknown>;
    const dock = (spec.dock_load_in || {}) as Record<string, unknown>;
    const hospitality = (spec.hospitality_catering || {}) as Record<string, unknown>;
    const wardrobe = (spec.wardrobe_laundry || {}) as Record<string, unknown>;
    const labor = (spec.labor_union || {}) as Record<string, unknown>;
    const safety = (spec.safety_compliance || {}) as Record<string, unknown>;

    const extract = (obj: Record<string, unknown>, ...keys: string[]): string | null => {
      for (const k of keys) {
        const v = obj[k];
        if (v && typeof v === "string") return v;
        if (typeof v === "number") return String(v);
        if (typeof v === "boolean") return v ? "Yes" : "No";
      }
      return null;
    };

    // Build dressing room summary from hospitality notes
    const dressingRooms = extractDressingRooms(hospitality);

    const summary: SummaryRow[] = [
      { label: "Address", value: extract(identity, "address"), icon: MapPin },
      { label: "Stage", value: extractStage(stage), icon: Ruler },
      { label: "Grid Height", value: extract(rigging, "grid_height") || extractFromNotes(rigging, /(\d+['']?\s*(to\s+)?(low\s+steel|high\s+steel|grid|ft))/i), icon: Anchor },
      { label: "Power", value: extractPowerSummary(power), icon: Zap },
      { label: "Dock", value: extractDock(dock), icon: Truck },
      { label: "Dressing Rooms", value: dressingRooms, icon: Coffee },
      { label: "Wardrobe / Laundry", value: extractWardrobe(wardrobe), icon: Shirt },
      { label: "Labor / Union", value: extractLabor(labor), icon: HardHat },
      { label: "Safety", value: hasData(safety) ? "Documented" : null, icon: Shield },
    ];

    setRows(summary);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!venueName) {
    return (
      <p className="text-xs font-mono text-muted-foreground py-4 text-center">
        No tech spec found for this document.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
          EXTRACTED — {venueName.toUpperCase()}
        </span>
        <div className="flex items-center gap-3">
          {contactCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
              <Users className="h-3 w-3" /> {contactCount} contacts
            </span>
          )}
          {riskCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-warning">
              <AlertTriangle className="h-3 w-3" /> {riskCount} risks
            </span>
          )}
        </div>
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {rows.map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex items-start gap-2 py-1">
            {value ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
              <p className="text-xs font-mono font-medium truncate max-w-[280px]">
                {value || "—"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper functions

function hasData(obj: Record<string, unknown>): boolean {
  return Object.values(obj).some(
    (v) => v !== null && v !== undefined && v !== "" && v !== "{}" && JSON.stringify(v) !== "{}"
  );
}

function extractStage(stage: Record<string, unknown>): string | null {
  const notes = stage.notes as string | undefined;
  const depth = stage.stage_depth_pl_to_back as string | undefined;
  const width = stage.stage_width_wall_to_wall as string | undefined;
  if (depth && width) return `${width} × ${depth}`;
  if (notes) {
    const match = notes.match(/(\d+['']?\s*[x×]\s*\d+['']?)/i);
    if (match) return match[1];
    const dimMatch = notes.match(/End Stage:\s*(\d+['']?\s*[x×]\s*\d+['']?)/i);
    if (dimMatch) return `End Stage: ${dimMatch[1]}`;
  }
  if (hasData(stage)) return "Documented";
  return null;
}

function extractFromNotes(obj: Record<string, unknown>, regex: RegExp): string | null {
  const notes = obj.notes as string | undefined;
  if (!notes) return null;
  const match = notes.match(regex);
  return match ? match[0] : null;
}

function extractPowerSummary(power: Record<string, unknown>): string | null {
  const foh = power.foh_power as string | undefined;
  const notes = power.notes as string | undefined;
  if (foh) return foh.slice(0, 60);
  if (notes) {
    const match = notes.match(/(\d+\s*amp)/i);
    return match ? `${match[0]} available` : "Documented";
  }
  if (hasData(power)) return "Documented";
  return null;
}

function extractDock(dock: Record<string, unknown>): string | null {
  const push = dock.push_distance_ft;
  const door = dock.dock_door_height as string | undefined;
  const parts: string[] = [];
  if (push) parts.push(`${push}ft push`);
  if (door) parts.push(`${door} door`);
  if (parts.length) return parts.join(" · ");
  if (hasData(dock)) return "Documented";
  return null;
}

function extractDressingRooms(hospitality: Record<string, unknown>): string | null {
  const notes = hospitality.notes as string | undefined;
  const greenRoom = hospitality.green_room_size as string | undefined;
  if (notes) {
    const roomMatches = notes.match(/(?:locker room|dressing room|star room)/gi);
    if (roomMatches) return `${roomMatches.length} rooms documented`;
  }
  if (greenRoom) return `Green Room: ${greenRoom.slice(0, 40)}`;
  if (hasData(hospitality)) return "Documented";
  return null;
}

function extractWardrobe(wardrobe: Record<string, unknown>): string | null {
  const washers = wardrobe.washer_count;
  const dryers = wardrobe.dryer_count;
  if (washers || dryers) {
    return `${washers || "?"} washers · ${dryers || "?"} dryers`;
  }
  if (hasData(wardrobe)) return "Documented";
  return null;
}

function extractLabor(labor: Record<string, unknown>): string | null {
  const notes = labor.notes as string | undefined;
  if (notes) {
    const match = notes.match(/(IATSE|IA|Teamster|union)/i);
    return match ? `Union: ${match[0]}` : "Documented";
  }
  if (hasData(labor)) return "Documented";
  return null;
}

export default TechPackInlineSummary;
