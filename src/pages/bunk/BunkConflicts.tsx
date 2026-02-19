import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Conflict {
  id: string;
  conflict_type: string;
  severity: string;
  resolved: boolean;
  created_at: string;
}

const severityColors: Record<string, string> = {
  HIGH: "text-destructive",
  MEDIUM: "text-warning",
  LOW: "text-muted-foreground",
};

const BunkConflicts = () => {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadConflicts();
  }, []);

  const loadConflicts = async () => {
    const { data } = await supabase
      .from("calendar_conflicts")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setConflicts(data as Conflict[]);
  };

  const resolveConflict = async (id: string) => {
    const { error } = await supabase
      .from("calendar_conflicts")
      .update({ resolved: true })
      .eq("id", id);
    if (!error) loadConflicts();
    else toast({ title: "Error", description: error.message, variant: "destructive" });
  };

  const open = conflicts.filter((c) => !c.resolved);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conflicts</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          Calendar and data conflicts detected by the engine
        </p>
      </div>

      {open.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed bg-card/50 p-12 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-mono">No active conflicts</p>
        </div>
      ) : (
        <div className="space-y-2">
          {open.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-xs font-semibold ${severityColors[c.severity]}`}>
                    {c.severity}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {c.conflict_type.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => resolveConflict(c.id)}
                className="font-mono text-[10px] tracking-wider"
              >
                <Check className="mr-1 h-3 w-3" />
                RESOLVE
              </Button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BunkConflicts;
