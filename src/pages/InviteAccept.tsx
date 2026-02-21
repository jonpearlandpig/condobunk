import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { Radio, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  // Auth form state
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);

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
        setIsSignUp(true);
      }
      setInviteLoading(false);
    };
    fetchInvite();
  }, [token]);

  // Auto-accept if user is already logged in and invite is valid
  useEffect(() => {
    if (!authLoading && user && invite && !accepted) {
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
      setTimeout(() => navigate("/bunk?welcome=1"), 1500);
    } catch (err: any) {
      toast.error(err.message || "Failed to accept invite");
    }
    setAccepting(false);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite) return;
    setAuthSubmitting(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: invite.email,
          password,
        });
        if (error) throw error;
        // Check for repeated signup (user already exists) — no session created
        if (data.user && !data.session) {
          // User already exists, try signing in instead
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: invite.email,
            password,
          });
          if (signInError) {
            toast.error("An account already exists for this email. Try signing in, or use Google if that's how you registered.");
            setIsSignUp(false);
          }
          // acceptInvite will fire via useEffect if sign-in succeeded
        }
        // If session exists, auto-confirm worked — acceptInvite fires via useEffect
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: invite.email, password });
        if (error) throw error;
        // acceptInvite will fire via useEffect
      }
    } catch (err: any) {
      toast.error(err.message);
    }
    setAuthSubmitting(false);
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

  // Not logged in — streamlined password-only form
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
          <p className="text-sm font-mono text-muted-foreground mb-4 text-center">
            {isSignUp ? "SET YOUR PASSWORD TO JOIN" : "ENTER YOUR PASSWORD"}
          </p>
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-muted-foreground font-mono">EMAIL</Label>
              <Input
                id="email"
                type="email"
                value={invite?.email || ""}
                disabled
                className="bg-muted/50 border-border font-mono text-sm opacity-70"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-muted-foreground font-mono">
                {isSignUp ? "CREATE PASSWORD" : "PASSWORD"}
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoFocus
                className="bg-muted border-border font-mono text-sm"
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" disabled={authSubmitting} className="w-full font-mono tracking-wider">
              {authSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isSignUp ? "JOIN TOUR →" : "SIGN IN & JOIN →"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
            >
              {isSignUp ? "ALREADY HAVE AN ACCOUNT? SIGN IN" : "NEW USER? CREATE ACCOUNT"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default InviteAccept;
