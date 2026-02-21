import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Tour {
  id: string;
  name: string;
  akb_state: string;
  status: string;
}

interface TourContextType {
  tours: Tour[];
  selectedTourId: string;
  setSelectedTourId: (id: string) => void;
  selectedTour: Tour | undefined;
  loading: boolean;
  reload: () => void;
}

const TourContext = createContext<TourContextType>({
  tours: [],
  selectedTourId: "",
  setSelectedTourId: () => {},
  selectedTour: undefined,
  loading: true,
  reload: () => {},
});

export const useTour = () => useContext(TourContext);

export const TourProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [tours, setTours] = useState<Tour[]>([]);
  const [selectedTourId, setSelectedTourId] = useState("");
  const [loading, setLoading] = useState(true);

  const autoMatchContacts = async () => {
    if (!user?.email) return;
    // Use security definer function to bypass RLS chicken-and-egg
    const { data: matches } = await supabase
      .rpc("match_contact_tours", { _email: user.email });
    if (!matches || matches.length === 0) return;

    // Check existing memberships
    const { data: existing } = await supabase
      .from("tour_members")
      .select("tour_id")
      .eq("user_id", user.id);
    const existingTourIds = new Set((existing || []).map(m => m.tour_id));

    // Add missing memberships — matches is uuid[] from RPC
    const toInsert = (matches || [])
      .filter((tourId: string) => !existingTourIds.has(tourId))
      .map((tourId: string) => ({ tour_id: tourId, user_id: user.id, role: "MGMT" as const }));
    if (toInsert.length > 0) {
      await supabase.from("tour_members").insert(toInsert);
    }
  };

  const loadTours = async () => {
    if (!user) return;
    setLoading(true);

    // Auto-match on every load (idempotent)
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
    }
    setLoading(false);
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
      }}
    >
      {children}
    </TourContext.Provider>
  );
};
