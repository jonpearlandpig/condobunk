import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTour } from "@/hooks/useTour";

export interface SidebarContact {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  scope: "TOUR" | "VENUE";
  venue: string | null;
}

export const useSidebarContacts = () => {
  const { tours } = useTour();
  const tourId = tours[0]?.id;
  const [tourContacts, setTourContacts] = useState<SidebarContact[]>([]);
  const [venueContacts, setVenueContacts] = useState<SidebarContact[]>([]);
  const [venueLabel, setVenueLabel] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const fetchContacts = useCallback(async () => {
    if (!tourId) return;
    setLoading(true);

    const { data: tourData } = await supabase
      .from("contacts")
      .select("id, name, role, phone, email, scope, venue")
      .eq("tour_id", tourId)
      .eq("scope", "TOUR")
      .order("name");

    setTourContacts((tourData as SidebarContact[]) || []);

    const today = new Date();
    const weekAhead = new Date();
    weekAhead.setDate(today.getDate() + 7);
    const todayStr = today.toISOString().split("T")[0];
    const weekAheadStr = weekAhead.toISOString().split("T")[0];

    const { data: events } = await supabase
      .from("schedule_events")
      .select("venue, event_date")
      .eq("tour_id", tourId)
      .gte("event_date", todayStr)
      .lte("event_date", weekAheadStr)
      .order("event_date");

    const venueNames = [...new Set((events || []).map(e => e.venue).filter(Boolean))] as string[];

    if (venueNames.length > 0) {
      setVenueLabel(venueNames.length === 1 ? venueNames[0] : `${venueNames.length} Venues`);
      const { data: venueData } = await supabase
        .from("contacts")
        .select("id, name, role, phone, email, scope, venue")
        .eq("tour_id", tourId)
        .eq("scope", "VENUE")
        .in("venue", venueNames)
        .order("venue")
        .order("name");
      setVenueContacts((venueData as SidebarContact[]) || []);
    } else {
      setVenueLabel("");
      setVenueContacts([]);
    }

    setLoading(false);
  }, [tourId]);

  useEffect(() => {
    if (!tourId) {
      setLoading(false);
      return;
    }
    fetchContacts();
  }, [tourId, fetchContacts]);

  const updateContact = useCallback(async (id: string, updates: Partial<Pick<SidebarContact, "name" | "role" | "phone" | "email">>) => {
    const { error } = await supabase
      .from("contacts")
      .update(updates)
      .eq("id", id);
    if (error) throw error;
    // Optimistically update local state
    const updater = (prev: SidebarContact[]) =>
      prev.map(c => c.id === id ? { ...c, ...updates } : c);
    setTourContacts(updater);
    setVenueContacts(updater);
  }, []);

  return { tourContacts, venueContacts, venueLabel, loading, updateContact, refetch: fetchContacts };
};
