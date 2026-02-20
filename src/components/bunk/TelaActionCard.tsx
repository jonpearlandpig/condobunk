import { useState } from "react";
import { CheckCircle, Loader2, Zap } from "lucide-react";
import { TelaAction, getActionLabel, useTelaActions } from "@/hooks/useTelaActions";

interface TelaActionCardProps {
  action: TelaAction;
}

const TelaActionCard = ({ action }: TelaActionCardProps) => {
  const { executeAction } = useTelaActions();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  const handleApply = async () => {
    setState("loading");
    const ok = await executeAction(action);
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
    <button
      onClick={handleApply}
      disabled={state === "loading"}
      className="flex items-center gap-2 mt-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
    >
      {state === "loading" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Zap className="h-4 w-4" />
      )}
      {getActionLabel(action)}
    </button>
  );
};

export default TelaActionCard;
