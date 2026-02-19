import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  HelpCircle,
  BarChart3,
  Radio,
  Plus,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const stateColors: Record<string, string> = {
  BUILDING: "text-info",
  SOVEREIGN: "text-success",
  CONFLICT: "text-destructive",
};

const BunkOverview = () => {
  const { user } = useAuth();
  const { tours, setSelectedTourId } = useTour();
  const navigate = useNavigate();
  const [gapCount, setGapCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    loadCounts();
  }, [user]);

  const loadCounts = async () => {
    const { count: gaps } = await supabase
      .from("knowledge_gaps")
      .select("*", { count: "exact", head: true })
      .eq("resolved", false);
    setGapCount(gaps ?? 0);

    const { count: conflicts } = await supabase
      .from("calendar_conflicts")
      .select("*", { count: "exact", head: true })
      .eq("resolved", false);
    setConflictCount(conflicts ?? 0);

    const { count: events } = await supabase
      .from("schedule_events")
      .select("*", { count: "exact", head: true });
    setEventCount(events ?? 0);
  };


  const handleTourClick = (tourId: string) => {
    setSelectedTourId(tourId);
    navigate("/bunk/documents");
  };

  const cards = [
    { label: "ACTIVE TOURS", value: tours.length, icon: Radio, color: "text-primary" },
    { label: "SCHEDULE EVENTS", value: eventCount, icon: BarChart3, color: "text-info" },
    { label: "OPEN GAPS", value: gapCount, icon: HelpCircle, color: "text-warning" },
    { label: "CONFLICTS", value: conflictCount, icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Operations Overview</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Real-time tour intelligence
          </p>
        </div>
        <Button size="sm" className="font-mono text-xs tracking-wider" onClick={() => navigate("/bunk/setup")}>
              <Plus className="mr-2 h-3 w-3" />
              NEW TOUR
            </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-lg border border-border bg-card p-5"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground">
                {card.label}
              </span>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
            <p className="text-3xl font-bold font-mono">{card.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Tour List */}
      <div>
        <h2 className="text-sm font-mono text-muted-foreground tracking-wider mb-4">
          ACTIVE TOURS — click to manage
        </h2>
        {tours.length === 0 ? (
          <div className="rounded-lg border border-border border-dashed bg-card/50 p-8 text-center">
            <Activity className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-mono">
              No active tours. Create one to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tours.map((tour, i) => (
              <motion.button
                key={tour.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => handleTourClick(tour.id)}
                className="w-full flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4 hover:border-primary/50 hover:bg-card/80 transition-colors text-left group cursor-pointer"
              >
                <div>
                  <p className="font-medium">{tour.name}</p>
                  <p className="text-xs font-mono text-muted-foreground mt-1">
                    ID: {tour.id.slice(0, 8)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`font-mono text-xs tracking-wider font-semibold ${stateColors[tour.akb_state] ?? "text-muted-foreground"}`}
                  >
                    {tour.akb_state}
                  </span>
                  <div
                    className={`h-2 w-2 rounded-full ${
                      tour.akb_state === "SOVEREIGN"
                        ? "bg-success"
                        : tour.akb_state === "CONFLICT"
                        ? "bg-destructive"
                        : "bg-info animate-pulse"
                    }`}
                  />
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BunkOverview;
