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
  exitDemo: () => Promise<void>;
}

const TourContext = createContext<TourContextType>({
  tours: [],
  selectedTourId: "",
  setSelectedTourId: () => {},
  selectedTour: undefined,
  loading: true,
  reload: () => {},
  isDemoMode: false,
  exitDemo: async () => {},
});

export const useTour = () => useContext(TourContext);

export const TourProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [tours, setTours] = useState<Tour[]>([]);
  const [selectedTourId, setSelectedTourId] = useState("");
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const autoMatchContacts = async () => {
    if (!user?.email) return;
    const { data: matches } = await supabase
      .rpc("match_contact_tours", { _email: user.email });
    if (!matches || matches.length === 0) return;

    const { data: existing } = await supabase
      .from("tour_members")
      .select("tour_id")
      .eq("user_id", user.id);
    const existingTourIds = new Set((existing || []).map(m => m.tour_id));

    const toInsert = (matches || [])
      .filter((tourId: string) => !existingTourIds.has(tourId))
      .map((tourId: string) => ({ tour_id: tourId, user_id: user.id, role: "CREW" as const }));
    if (toInsert.length > 0) {
      await supabase.from("tour_members").insert(toInsert);
    }
  };

  const checkDemoMode = async (tourIds: string[]) => {
    if (!user || tourIds.length === 0) {
      setIsDemoMode(false);
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
    } else {
      setIsDemoMode(false);
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
      if (!selectedTourId && data.length > 0) {
        setSelectedTourId(data[0].id);
      }
      await checkDemoMode(data.map(t => t.id));
    }
    setLoading(false);
  };

  const exitDemo = async () => {
    try {
      await supabase.rpc("deactivate_demo_mode" as any);
      setIsDemoMode(false);
      setTours([]);
      setSelectedTourId("");
      await loadTours();
    } catch (err) {
      console.error("Failed to exit demo:", err);
    }
  };

  useEffect(() => {
    if (user) loadTours();
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
        exitDemo,
      }}
    >
      {children}
    </TourContext.Provider>
  );
};
