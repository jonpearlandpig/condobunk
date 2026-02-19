import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { HelpCircle, Check, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Gap {
  id: string;
  question: string;
  domain: string | null;
  resolved: boolean;
  created_at: string;
}

const BunkGaps = () => {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadGaps();
  }, []);

  const loadGaps = async () => {
    const { data } = await supabase
      .from("knowledge_gaps")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setGaps(data as Gap[]);
  };

  const resolveGap = async (id: string) => {
    const { error } = await supabase
      .from("knowledge_gaps")
      .update({ resolved: true })
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      loadGaps();
    }
  };

  const openGaps = gaps.filter((g) => !g.resolved);
  const resolvedGaps = gaps.filter((g) => g.resolved);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Knowledge Gaps</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          Escalated crew questions awaiting resolution
        </p>
      </div>

      <div className="space-y-2">
        <h2 className="font-mono text-xs text-muted-foreground tracking-wider">
          OPEN ({openGaps.length})
        </h2>
        {openGaps.length === 0 ? (
          <div className="rounded-lg border border-border border-dashed bg-card/50 p-8 text-center">
            <HelpCircle className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground font-mono">
              No open knowledge gaps
            </p>
          </div>
        ) : (
          openGaps.map((gap, i) => (
            <motion.div
              key={gap.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="h-3 w-3 text-warning" />
                  {gap.domain && (
                    <span className="font-mono text-[10px] tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                      {gap.domain}
                    </span>
                  )}
                </div>
                <p className="text-sm">{gap.question}</p>
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  {new Date(gap.created_at).toLocaleDateString()}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => resolveGap(gap.id)}
                className="font-mono text-[10px] tracking-wider shrink-0"
              >
                <Check className="mr-1 h-3 w-3" />
                RESOLVE
              </Button>
            </motion.div>
          ))
        )}
      </div>

      {resolvedGaps.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-mono text-xs text-muted-foreground tracking-wider">
            RESOLVED ({resolvedGaps.length})
          </h2>
          {resolvedGaps.map((gap) => (
            <div
              key={gap.id}
              className="rounded-lg border border-border/50 bg-card/30 p-4 opacity-60"
            >
              <p className="text-sm line-through">{gap.question}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BunkGaps;
