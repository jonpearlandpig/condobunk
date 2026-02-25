import { useState } from "react";
import { CheckCircle, Loader2, Radio } from "lucide-react";
import { TelaAction, getActionLabel, useTelaActions } from "@/hooks/useTelaActions";
import AkbEditSignoff, { type SignoffData } from "./AkbEditSignoff";
import { useTour } from "@/hooks/useTour";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface TelaActionCardProps {
  action: TelaAction;
}

const TelaActionCard = ({ action }: TelaActionCardProps) => {
  const { executeAction } = useTelaActions();
  const { selectedTourId } = useTour();
  const { user } = useAuth();
  const [state, setState] = useState<"idle" | "signoff" | "loading" | "done">("idle");

  const logOutcome = async (outcome: "approved" | "dismissed") => {
    if (!user || !selectedTourId) return;
    await supabase.from("tela_action_log" as any).insert({
      tour_id: selectedTourId,
      user_id: user.id,
      action_type: action.type,
      outcome,
    } as any);
  };

  const handleClick = () => {
    setState("signoff");
  };

  const handleCommit = async (signoff: SignoffData) => {
    setState("loading");
    const ok = await executeAction(action, signoff.reason, signoff, selectedTourId);
    if (ok) await logOutcome("approved");
    setState(ok ? "done" : "idle");
  };

  if (state === "done") {
    return (
      <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 text-sm text-primary">
        <CheckCircle className="h-4 w-4 shrink-0" />
        <span className="font-medium">Done — fix applied</span>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={state === "loading"}
        className="flex items-center gap-2 mt-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {state === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Radio className="h-4 w-4" />
        )}
        {getActionLabel(action)}
      </button>

      <AkbEditSignoff
        open={state === "signoff"}
        onOpenChange={(o) => {
          if (!o) {
            logOutcome("dismissed");
            setState("idle");
          }
        }}
        changeSummary={`TELA action: ${getActionLabel(action)}`}
        onCommit={handleCommit}
        loading={state === "loading"}
      />
    </>
  );
};

export default TelaActionCard;
