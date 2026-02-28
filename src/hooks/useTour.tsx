import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Tour {
  id: string;
  name: string;
  akb_state: string;
  status: string;
  owner_id: string;
}

interface TourContextType {
  tours: Tour[];
  selectedTourId: string;
  setSelectedTourId: (id: string) => void;
  selectedTour: Tour | undefined;
  loading: boolean;
  reload: () => void;
  isDemoMode: boolean;
  demoExpiresAt: string | null;
  exitDemo: () => Promise<void>;
  activateDemo: () => Promise<boolean>;
  requestUpgrade: () => Promise<boolean>;
  upgradeRequested: boolean;
}

const TourContext = createContext<TourContextType>({
  tours: [],
  selectedTourId: "",
  setSelectedTourId: () => {},
  selectedTour: undefined,
  loading: true,
  reload: () => {},
  isDemoMode: false,
  demoExpiresAt: null,
  exitDemo: async () => {},
  activateDemo: async () => false,
  requestUpgrade: async () => false,
  upgradeRequested: false,
});

export const useTour = () => useContext(TourContext);

export const TourProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [tours, setTours] = useState<Tour[]>([]);
  const [selectedTourId, setSelectedTourId] = useState("");
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoExpiresAt, setDemoExpiresAt] = useState<string | null>(null);
  const [upgradeRequested, setUpgradeRequested] = useState(false);

  const autoMatchContacts = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc("claim_contact_tours" as any);
      if (error) {
        console.error("claim_contact_tours failed:", error);
        return;
      }
      if (data) {
        console.log("Auto-matched tours:", data);
      }
    } catch (err) {
      console.error("Unexpected error in autoMatchContacts:", err);
    }
  };

  const checkDemoMode = async (tourIds: string[]) => {
    if (!user || tourIds.length === 0) {
      setIsDemoMode(false);
      setDemoExpiresAt(null);
      return;
    }
    const { data: memberships } = await supabase
      .from("tour_members")
      .select("role")
      .eq("user_id", user.id)
      .in("tour_id", tourIds);
    if (memberships && memberships.length > 0) {
      const allDemo = memberships.every(m => m.role === "DEMO");
      setIsDemoMode(allDemo);
      if (allDemo) {
        // Fetch expiry from demo_activations
        const { data: activation } = await supabase
          .from("demo_activations" as any)
          .select("expires_at")
          .eq("user_id", user.id)
          .is("deactivated_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("activated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setDemoExpiresAt((activation as any)?.expires_at || null);
      } else {
        setDemoExpiresAt(null);
      }
    } else {
      setIsDemoMode(false);
      setDemoExpiresAt(null);
    }
  };

  const loadTours = async () => {
    if (!user) return;
    setLoading(true);

    await autoMatchContacts();

    const { data } = await supabase
      .from("tours")
      .select("*")
      .eq("status", "ACTIVE");
    if (data) {
      setTours(data as Tour[]);
      const ids = data.map(t => t.id);
      if (!selectedTourId || !ids.includes(selectedTourId)) {
        setSelectedTourId(data.length > 0 ? data[0].id : "");
      }
      await checkDemoMode(ids);
    }
    setLoading(false);
  };

  const activateDemo = async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc("activate_demo_mode" as any);
      if (error) throw error;
      const result = data as any;

      // Send notification to jonathan (fire-and-forget)
      if (!result.already_active) {
        supabase.functions.invoke("notify-demo-activation", {
          body: {
            user_email: result.user_email || user?.email,
            user_name: result.user_name || user?.user_metadata?.full_name,
            expires_at: result.expires_at,
          },
        }).catch(console.error);
      }

      await loadTours();
      return true;
    } catch (err) {
      console.error("Failed to activate demo:", err);
      return false;
    }
  };

  const requestUpgrade = async (): Promise<boolean> => {
    if (!user || !isDemoMode) return false;
    try {
      // Check if already requested
      const { data: existing } = await supabase
        .from("upgrade_requests" as any)
        .select("id, status")
        .eq("user_id", user.id)
        .eq("status", "PENDING")
        .maybeSingle();
      if (existing) {
        setUpgradeRequested(true);
        return true; // already pending
      }

      // Get user profile info
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("id", user.id)
        .single();

      // Insert request for each demo tour
      const tourIds = tours.map(t => t.id);
      for (const tourId of tourIds) {
        await supabase.from("upgrade_requests" as any).insert({
          user_id: user.id,
          user_email: profile?.email || user.email,
          user_name: profile?.display_name || user.user_metadata?.full_name,
          tour_id: tourId,
        });
      }

      // Notify via edge function (fire-and-forget)
      supabase.functions.invoke("notify-demo-activation", {
        body: {
          type: "upgrade_request",
          user_email: profile?.email || user.email,
          user_name: profile?.display_name || user.user_metadata?.full_name,
        },
      }).catch(console.error);

      setUpgradeRequested(true);
      return true;
    } catch (err) {
      console.error("Failed to request upgrade:", err);
      return false;
    }
  };

  // Check if user already has a pending upgrade request
  const checkUpgradeStatus = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("upgrade_requests" as any)
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "PENDING")
      .limit(1);
    setUpgradeRequested(!!(data && data.length > 0));
  };

  const exitDemo = async () => {
    try {
      await supabase.rpc("deactivate_demo_mode" as any);
      setIsDemoMode(false);
      setDemoExpiresAt(null);
      setTours([]);
      setSelectedTourId("");
      await loadTours();
    } catch (err) {
      console.error("Failed to exit demo:", err);
    }
  };

  useEffect(() => {
    if (user) {
      loadTours();
      checkUpgradeStatus();
    }
  }, [user]);

  const selectedTour = tours.find((t) => t.id === selectedTourId);

  return (
    <TourContext.Provider
      value={{
        tours,
        selectedTourId,
        setSelectedTourId,
        selectedTour,
        loading,
        reload: loadTours,
        isDemoMode,
        demoExpiresAt,
        exitDemo,
        activateDemo,
        requestUpgrade,
        upgradeRequested,
      }}
    >
      {children}
    </TourContext.Provider>
  );
};
