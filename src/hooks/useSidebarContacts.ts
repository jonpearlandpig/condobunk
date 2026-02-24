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

export interface VenueGroup {
  venue: string;
  city: string | null;
  earliestDate: string; // YYYY-MM-DD for sorting
  contacts: SidebarContact[];
}

export interface TourTeamGroup {
  tourId: string;
  tourName: string;
  contacts: SidebarContact[];
}

export interface TourVenueGroup {
  tourId: string;
  tourName: string;
  venueGroups: VenueGroup[];
  totalContacts: number;
}

export const useSidebarContacts = () => {
  const { tours } = useTour();
  const tourId = tours[0]?.id;
  const [tourContacts, setTourContacts] = useState<SidebarContact[]>([]);
  const [tourTeamGroups, setTourTeamGroups] = useState<TourTeamGroup[]>([]);
  const [venueGroups, setVenueGroups] = useState<VenueGroup[]>([]);
  const [tourVenueGroups, setTourVenueGroups] = useState<TourVenueGroup[]>([]);
  const [venueContacts, setVenueContacts] = useState<SidebarContact[]>([]);
  const [venueLabel, setVenueLabel] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const fetchContacts = useCallback(async () => {
    if (!tourId) return;
    setLoading(true);

    // Fetch TOUR contacts for ALL tours the user belongs to
    const tourIds = tours.map(t => t.id);
    
    const [tourDataRes, membersRes] = await Promise.all([
      supabase
        .from("contacts")
        .select("id, name, role, phone, email, scope, venue, tour_id")
        .in("tour_id", tourIds)
        .eq("scope", "TOUR")
        .order("name"),
      supabase
        .from("tour_members")
        .select("user_id")
        .in("tour_id", tourIds),
    ]);

    const memberIds = (membersRes.data || []).map(m => m.user_id);
    let profileMap: Record<string, string> = {};

    if (memberIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", memberIds);
      (profiles || []).forEach(p => {
        if (p.email) profileMap[p.email.toLowerCase()] = p.id;
      });
    }

    const allTourContacts: SidebarContact[] = ((tourDataRes.data || []) as any[]).map(c => ({
      ...c,
      appUserId: c.email ? profileMap[c.email.toLowerCase()] : undefined,
    }));

    // Build groups per tour
    const groups: TourTeamGroup[] = tours.map(t => ({
      tourId: t.id,
      tourName: t.name,
      contacts: allTourContacts.filter(c => (c as any).tour_id === t.id),
    }));
    setTourTeamGroups(groups);

    // Keep flat list for the active tour (used by venue window etc.)
    const activeTourContacts = allTourContacts.filter(c => (c as any).tour_id === tourId);
    setTourContacts(activeTourContacts);

    // Venue contacts for ALL tours (all dates)
    const todayStr = new Date().toISOString().split("T")[0];

    const { data: allEvents } = await supabase
      .from("schedule_events")
      .select("venue, city, event_date, tour_id")
      .in("tour_id", tourIds)
      .gte("event_date", todayStr)
      .order("event_date");

    // Build per-tour venue maps
    const tourVenueMap = new Map<string, Map<string, { city: string | null; earliestDate: string }>>();
    for (const e of (allEvents || [])) {
      if (!e.venue) continue;
      if (!tourVenueMap.has(e.tour_id)) tourVenueMap.set(e.tour_id, new Map());
      const venueMap = tourVenueMap.get(e.tour_id)!;
      if (!venueMap.has(e.venue)) {
        venueMap.set(e.venue, { city: e.city, earliestDate: e.event_date || todayStr });
      }
    }

    // Fetch ALL venue contacts for these tours (no exact venue filter — fuzzy match below)
    let allVenueContacts: (SidebarContact & { tour_id: string })[] = [];
    {
      const { data: venueData } = await supabase
        .from("contacts")
        .select("id, name, role, phone, email, scope, venue, tour_id")
        .in("tour_id", tourIds)
        .eq("scope", "VENUE")
        .order("venue")
        .order("name");
      allVenueContacts = (venueData as any[]) || [];
    }

    // Fuzzy venue matcher: handles "Charleston Coliseum" vs "Charleston Coliseum & Convention Center"
    const venueMatches = (contactVenue: string | null, eventVenue: string): boolean => {
      if (!contactVenue) return false;
      const a = contactVenue.toLowerCase().trim();
      const b = eventVenue.toLowerCase().trim();
      return a === b || b.includes(a) || a.includes(b);
    };

    // Build per-tour venue groups
    const tvGroups: TourVenueGroup[] = [];
    for (const t of tours) {
      const venueMap = tourVenueMap.get(t.id);
      const tourVenues: VenueGroup[] = [];
      const matchedContactIds = new Set<string>();

      // Event-based venue groups (chronological)
      if (venueMap && venueMap.size > 0) {
        for (const [venue, meta] of venueMap) {
          const contacts = allVenueContacts.filter(c => c.tour_id === t.id && venueMatches(c.venue, venue));
          contacts.forEach(c => matchedContactIds.add(c.id));
          tourVenues.push({ venue, city: meta.city, earliestDate: meta.earliestDate, contacts });
        }
      }

      // Fallback: orphan contacts not matched to any event venue
      const orphans = allVenueContacts.filter(c => c.tour_id === t.id && !matchedContactIds.has(c.id) && c.venue);
      const orphanMap = new Map<string, SidebarContact[]>();
      for (const c of orphans) {
        const key = c.venue!;
        if (!orphanMap.has(key)) orphanMap.set(key, []);
        orphanMap.get(key)!.push(c);
      }
      const sortedOrphanVenues = [...orphanMap.keys()].sort((a, b) => a.localeCompare(b));
      for (const venueName of sortedOrphanVenues) {
        tourVenues.push({ venue: venueName, city: null, earliestDate: "9999-12-31", contacts: orphanMap.get(venueName)! });
      }

      if (tourVenues.length === 0) continue;

      tvGroups.push({
        tourId: t.id,
        tourName: t.name,
        venueGroups: tourVenues,
        totalContacts: tourVenues.reduce((sum, vg) => sum + vg.contacts.length, 0),
      });
    }
    setTourVenueGroups(tvGroups);

    // Keep flat lists for backward compat (active tour only)
    const activeVenueMap = tourVenueMap.get(tourId);
    const activeVenueNames = activeVenueMap ? [...activeVenueMap.keys()] : [];
    const activeVenueContacts = allVenueContacts.filter(c => c.tour_id === tourId);
    setVenueContacts(activeVenueContacts);
    setVenueLabel(activeVenueNames.length === 1 ? activeVenueNames[0] : activeVenueNames.length > 0 ? `${activeVenueNames.length} Venues` : "");

    // Build grouped structure for active tour
    const venueGroupList: VenueGroup[] = [];
    if (activeVenueMap) {
      for (const [venue, meta] of activeVenueMap) {
        venueGroupList.push({
          venue,
          city: meta.city,
          earliestDate: meta.earliestDate,
          contacts: activeVenueContacts.filter(c => venueMatches(c.venue, venue)),
        });
      }
    }
    setVenueGroups(venueGroupList);

    setLoading(false);
  }, [tourId, tours]);

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
    // Enforce: email must have a name
    if (updates.email && !updates.name?.trim()) {
      throw new Error("A name is required when an email address is provided");
    }
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

  return { tourContacts, tourTeamGroups, tourVenueGroups, venueContacts, venueGroups, venueLabel, loading, updateContact, deleteContact, refetch: fetchContacts };
};
