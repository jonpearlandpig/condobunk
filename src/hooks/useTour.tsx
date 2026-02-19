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

  const loadTours = async () => {
    if (!user) return;
    setLoading(true);
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
