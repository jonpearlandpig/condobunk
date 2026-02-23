import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import logoWhite from "@/assets/WHITE_TEXT_CONDO_BUNK_LOGO.png";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  // Redirect authenticated users away from login
  useEffect(() => {
    if (!authLoading && user) {
      // Check for pending invite token from OAuth flow
      const pendingToken = localStorage.getItem("pending_invite_token");
      if (pendingToken) {
        localStorage.removeItem("pending_invite_token");
        navigate(`/invite/${pendingToken}`, { replace: true });
      } else {
        navigate("/bunk", { replace: true });
      }
    }
  }, [authLoading, user, navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({
          title: "Check your email",
          description: "We sent you a confirmation link.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate("/bunk");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md space-y-8 px-6"
      >
        <div className="text-center space-y-4 mb-2">
          <img src={logoWhite} alt="Condo Bunk" className="h-24 w-auto mx-auto" />
          <p className="text-sm text-muted-foreground tracking-wide">
            Close the curtain. Get schtuff done!
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-lg" style={{ boxShadow: 'var(--shadow-card)' }}>
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-muted-foreground font-mono">
                EMAIL
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-muted border-border font-mono text-sm"
                placeholder="ops@tour.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-muted-foreground font-mono">
                PASSWORD
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="bg-muted border-border font-mono text-sm"
                placeholder="••••••••"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full font-mono tracking-wider"
            >
              <Shield className="mr-2 h-4 w-4" />
              {loading ? "STANDBY..." : isSignUp ? "REQUEST ACCESS" : "ENTER BUNK"}
            </Button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 font-mono text-muted-foreground">OR</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                const { error } = await lovable.auth.signInWithOAuth("google", {
                  redirect_uri: `${window.location.origin}/login`,
                  extraParams: { prompt: "consent" },
                });
                if (error) throw error;
              } catch (error: any) {
                toast({ title: "Error", description: error.message, variant: "destructive" });
                setLoading(false);
              }
            }}
            className="w-full font-mono tracking-wider border-border"
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            SIGN IN WITH GOOGLE
          </Button>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
            >
              {isSignUp ? "ALREADY HAVE ACCESS? SIGN IN" : "REQUEST NEW ACCESS"}
            </button>
          </div>
        </div>

        <p className="text-center text-xs font-mono text-muted-foreground/50">
          TOURTEXT + CONDO BUNK v2.1
        </p>
      </motion.div>
    </div>
  );
};

export default Login;
