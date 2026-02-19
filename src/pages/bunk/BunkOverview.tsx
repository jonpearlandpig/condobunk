import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  HelpCircle,
  BarChart3,
  Radio,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface Tour {
  id: string;
  name: string;
  akb_state: string;
  status: string;
}

const stateColors: Record<string, string> = {
  BUILDING: "text-info",
  SOVEREIGN: "text-success",
  CONFLICT: "text-destructive",
};

const stateLabels: Record<string, string> = {
  BUILDING: "BUILDING",
  SOVEREIGN: "SOVEREIGN",
  CONFLICT: "CONFLICT",
};

const BunkOverview = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tours, setTours] = useState<Tour[]>([]);
  const [gapCount, setGapCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const [newTourName, setNewTourName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    const { data: tourData } = await supabase
      .from("tours")
      .select("*")
      .eq("status", "ACTIVE");
    if (tourData) setTours(tourData as Tour[]);

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

  const createTour = async () => {
    if (!newTourName.trim() || !user) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("tours").insert({
        name: newTourName.trim(),
        owner_id: user.id,
      });
      if (error) throw error;
      toast({ title: "Tour created" });
      setNewTourName("");
      setDialogOpen(false);
      loadData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const cards = [
    {
      label: "ACTIVE TOURS",
      value: tours.length,
      icon: Radio,
      color: "text-primary",
    },
    {
      label: "SCHEDULE EVENTS",
      value: eventCount,
      icon: BarChart3,
      color: "text-info",
    },
    {
      label: "OPEN GAPS",
      value: gapCount,
      icon: HelpCircle,
      color: "text-warning",
    },
    {
      label: "CONFLICTS",
      value: conflictCount,
      icon: AlertTriangle,
      color: "text-destructive",
    },
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="font-mono text-xs tracking-wider">
              <Plus className="mr-2 h-3 w-3" />
              NEW TOUR
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-mono tracking-wider">CREATE TOUR</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="font-mono text-xs text-muted-foreground">TOUR NAME</Label>
                <Input
                  value={newTourName}
                  onChange={(e) => setNewTourName(e.target.value)}
                  placeholder="Summer 2026 World Tour"
                  className="bg-muted font-mono text-sm"
                />
              </div>
              <Button
                onClick={createTour}
                disabled={creating || !newTourName.trim()}
                className="w-full font-mono text-xs tracking-wider"
              >
                {creating ? "CREATING..." : "LAUNCH TOUR"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
          ACTIVE TOURS
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
              <motion.div
                key={tour.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4"
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
                    {stateLabels[tour.akb_state] ?? tour.akb_state}
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
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BunkOverview;
