import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck } from "lucide-react";

export interface SignoffData {
  reason: string;
  affectsSafety: boolean;
  affectsTime: boolean;
  affectsMoney: boolean;
}

interface AkbEditSignoffProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Auto-filled description of what's changing */
  changeSummary: string;
  /** Called with sign-off data when user commits */
  onCommit: (data: SignoffData) => void | Promise<void>;
  /** Loading state from parent */
  loading?: boolean;
}

const AkbEditSignoff = ({
  open,
  onOpenChange,
  changeSummary,
  onCommit,
  loading = false,
}: AkbEditSignoffProps) => {
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [affectsSafety, setAffectsSafety] = useState(false);
  const [affectsTime, setAffectsTime] = useState(false);
  const [affectsMoney, setAffectsMoney] = useState(false);
  const [committing, setCommitting] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile-tid", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, telauthorium_id")
        .eq("id", user!.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
  });

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    profile?.display_name ||
    user?.email;

  const tid = (profile as any)?.telauthorium_id || "";

  const isValid = reason.trim().length >= 10;

  const handleCommit = async () => {
    if (!isValid) return;
    setCommitting(true);
    try {
      await onCommit({ reason: reason.trim(), affectsSafety, affectsTime, affectsMoney });
    } finally {
      setCommitting(false);
      setReason("");
      setAffectsSafety(false);
      setAffectsTime(false);
      setAffectsMoney(false);
    }
  };

  const isLoading = loading || committing;

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => { if (!isLoading) onOpenChange(o); }}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2 text-base font-mono">
            <ShieldCheck className="h-4 w-4 text-primary" />
            AKB Edit Sign-off
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <div className="space-y-4">
          {/* What changed */}
          <div className="space-y-1">
            <p className="text-[10px] font-mono text-muted-foreground tracking-wider uppercase">What</p>
            <p className="text-sm text-foreground/80 bg-muted/40 rounded-lg p-2.5 font-mono">
              {changeSummary}
            </p>
          </div>

          {/* Why */}
          <div className="space-y-1">
            <p className="text-[10px] font-mono text-muted-foreground tracking-wider uppercase">
              Why <span className="text-destructive">*</span>
            </p>
            <Textarea
              className="text-sm min-h-[70px] font-mono"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this change is being made (min 10 chars)..."
            />
            {reason.length > 0 && reason.trim().length < 10 && (
              <p className="text-[10px] text-destructive font-mono">
                {10 - reason.trim().length} more characters needed
              </p>
            )}
          </div>

          {/* Impact flags */}
          <div className="space-y-2">
            <p className="text-[10px] font-mono text-muted-foreground tracking-wider uppercase">Impact</p>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs font-mono cursor-pointer">
                <Checkbox checked={affectsSafety} onCheckedChange={(v) => setAffectsSafety(!!v)} />
                Safety
              </label>
              <label className="flex items-center gap-1.5 text-xs font-mono cursor-pointer">
                <Checkbox checked={affectsTime} onCheckedChange={(v) => setAffectsTime(!!v)} />
                Time
              </label>
              <label className="flex items-center gap-1.5 text-xs font-mono cursor-pointer">
                <Checkbox checked={affectsMoney} onCheckedChange={(v) => setAffectsMoney(!!v)} />
                Money
              </label>
            </div>
          </div>

          {/* Signature */}
          <div className="border-t border-border pt-3 space-y-1">
            <p className="text-[10px] font-mono text-muted-foreground tracking-wider uppercase">Signed by</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">{displayName}</p>
              {tid && (
                <Badge variant="outline" className="font-mono text-[10px] tracking-wider">
                  {tid}
                </Badge>
              )}
            </div>
            <p className="text-[10px] font-mono text-muted-foreground">
              {new Date().toLocaleString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>

        <ResponsiveDialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCommit} disabled={!isValid || isLoading} className="gap-1.5">
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
            Commit Change
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
};

export default AkbEditSignoff;
