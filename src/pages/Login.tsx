import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Radio, Shield } from "lucide-react";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

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
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="relative">
              <Radio className="h-8 w-8 text-primary" />
              <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary animate-pulse-slow" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              CONDO BUNK
            </h1>
          </div>
          <p className="text-sm text-muted-foreground tracking-wide">
            Hide out. Get schtuff done!
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
