import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!tourId) {
      setLoading(false);
      return;
    }

    const fetchContacts = async () => {
      setLoading(true);

      // 1. Fetch all TOUR-scoped contacts
      const { data: tourData } = await supabase
        .from("contacts")
        .select("id, name, role, phone, email, scope, venue")
        .eq("tour_id", tourId)
        .eq("scope", "TOUR")
        .order("name");

      setTourContacts((tourData as SidebarContact[]) || []);

      // 2. Find this week's venues from schedule_events (today through +7 days)
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

        // 3. Fetch VENUE-scoped contacts matching those venue names
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
    };

    fetchContacts();
  }, [tourId]);

  return { tourContacts, venueContacts, venueLabel, loading };
};
