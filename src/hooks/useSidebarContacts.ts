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
  /** If this contact matches an app user, their user ID */
  appUserId?: string;
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

    // Fetch contacts, tour members, and profiles in parallel
    const [tourDataRes, membersRes] = await Promise.all([
      supabase
        .from("contacts")
        .select("id, name, role, phone, email, scope, venue")
        .eq("tour_id", tourId)
        .eq("scope", "TOUR")
        .order("name"),
      supabase
        .from("tour_members")
        .select("user_id")
        .eq("tour_id", tourId),
    ]);

    const memberIds = (membersRes.data || []).map(m => m.user_id);
    let profileMap: Record<string, string> = {}; // email -> user_id

    if (memberIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", memberIds);
      (profiles || []).forEach(p => {
        if (p.email) profileMap[p.email.toLowerCase()] = p.id;
      });
    }

    // Map contacts to app user IDs by matching email
    const enriched: SidebarContact[] = ((tourDataRes.data || []) as SidebarContact[]).map(c => ({
      ...c,
      appUserId: c.email ? profileMap[c.email.toLowerCase()] : undefined,
    }));

    setTourContacts(enriched);

    // Venue contacts (rolling weekly)
    const today = new Date();
    const threeWeeks = new Date();
    threeWeeks.setDate(today.getDate() + 21);
    const todayStr = today.toISOString().split("T")[0];
    const threeWeeksStr = threeWeeks.toISOString().split("T")[0];

    const { data: events } = await supabase
      .from("schedule_events")
      .select("venue, event_date")
      .eq("tour_id", tourId)
      .gte("event_date", todayStr)
      .lte("event_date", threeWeeksStr)
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

    const handler = () => fetchContacts();
    window.addEventListener("contacts-changed", handler);
    return () => window.removeEventListener("contacts-changed", handler);
  }, [tourId, fetchContacts]);

  const updateContact = useCallback(async (id: string, updates: Partial<Pick<SidebarContact, "name" | "role" | "phone" | "email">>) => {
    const { error } = await supabase
      .from("contacts")
      .update(updates)
      .eq("id", id);
    if (error) throw error;
    const updater = (prev: SidebarContact[]) =>
      prev.map(c => c.id === id ? { ...c, ...updates } : c);
    setTourContacts(updater);
    setVenueContacts(updater);
  }, []);

  const deleteContact = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", id);
    if (error) throw error;
    const remover = (prev: SidebarContact[]) => prev.filter(c => c.id !== id);
    setTourContacts(remover);
    setVenueContacts(remover);
  }, []);

  return { tourContacts, venueContacts, venueLabel, loading, updateContact, deleteContact, refetch: fetchContacts };
};
