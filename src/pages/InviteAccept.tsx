import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { Radio, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type InviteData = {
  id: string;
  tour_id: string;
  email: string;
  role: string;
  used_at: string | null;
  expires_at: string;
  tour_name: string | null;
};

const InviteAccept = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [invite, setInvite] = useState<InviteData | null>(null);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const fetchInvite = async () => {
      if (!token) { setInviteError("Invalid invite link."); setInviteLoading(false); return; }
      const { data, error } = await supabase
        .from("tour_invites")
        .select("id, tour_id, email, role, used_at, expires_at, tour_name")
        .eq("token", token)
        .maybeSingle();

      if (error || !data) {
        setInviteError("Invite not found or already used.");
      } else if (data.used_at) {
        setInviteError("This invite has already been used.");
      } else if (new Date(data.expires_at) < new Date()) {
        setInviteError("This invite has expired. Ask your Tour Admin for a new one.");
      } else {
        setInvite(data as InviteData);
      }
      setInviteLoading(false);
    };
    fetchInvite();
  }, [token]);

  // Auto-accept if user is already logged in and invite is valid
  useEffect(() => {
    if (!authLoading && user && invite && !accepted && !accepting) {
      acceptInvite(user.id);
    }
  }, [authLoading, user, invite]);

  const acceptInvite = async (userId: string) => {
    if (!invite) return;
    setAccepting(true);
    try {
      const { data: existing } = await supabase
        .from("tour_members")
        .select("id")
        .eq("tour_id", invite.tour_id)
        .eq("user_id", userId)
        .maybeSingle();

      if (!existing) {
        const { error: memberError } = await supabase.from("tour_members").insert({
          tour_id: invite.tour_id,
          user_id: userId,
          role: invite.role as "TA" | "MGMT" | "CREW",
        } as any);
        if (memberError) throw memberError;
      }

      await supabase
        .from("tour_invites")
        .update({ used_by: userId, used_at: new Date().toISOString() })
        .eq("id", invite.id);

      setAccepted(true);
      setTimeout(() => navigate("/bunk", { replace: true }), 1200);
    } catch (err: any) {
      toast.error(err.message || "Failed to accept invite");
      setAccepting(false);
    }
  };

  if (inviteLoading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (inviteError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-4 px-6 max-w-sm">
          <XCircle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-bold font-mono">Invite Invalid</h2>
          <p className="text-sm text-muted-foreground">{inviteError}</p>
          <Button variant="outline" onClick={() => navigate("/login")} className="font-mono">Go to Login</Button>
        </motion.div>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4 px-6 max-w-sm">
          <CheckCircle className="h-12 w-12 text-primary mx-auto" />
          <h2 className="text-xl font-bold font-mono">Welcome to the Bunk!</h2>
          <p className="text-sm text-muted-foreground">
            You've joined <strong>{invite?.tour_name}</strong>. Redirecting…
          </p>
        </motion.div>
      </div>
    );
  }

  if (accepting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="font-mono text-sm text-muted-foreground tracking-wider">JOINING TOUR…</span>
        </div>
      </div>
    );
  }

  // Not logged in — show Google sign-in only
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md space-y-6 px-6"
      >
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="relative">
              <Radio className="h-8 w-8 text-primary" />
              <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary animate-pulse" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">CONDO BUNK</h1>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <p className="text-sm font-mono text-primary">You've been invited to join</p>
            <p className="text-lg font-bold mt-0.5">{invite?.tour_name}</p>
            <p className="text-xs font-mono text-muted-foreground mt-1">
              Role: <span className="text-foreground">{invite?.role}</span>
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-lg">
          <Button
            type="button"
            disabled={accepting}
            onClick={async () => {
              try {
                if (token) localStorage.setItem("pending_invite_token", token);
                const { error } = await lovable.auth.signInWithOAuth("google", {
                  redirect_uri: `${window.location.origin}/login`,
                });
                if (error) throw error;
              } catch (err: any) {
                toast.error(err.message);
              }
            }}
            className="w-full font-mono tracking-wider h-12 text-base"
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            SIGN IN WITH GOOGLE & JOIN
          </Button>

          <p className="text-[10px] font-mono text-muted-foreground/60 text-center mt-4">
            Sign in to accept your invite and open your workspace
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default InviteAccept;
