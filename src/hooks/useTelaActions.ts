import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TelaActionType =
  | "resolve_conflict"
  | "resolve_gap"
  | "update_event"
  | "update_contact"
  | "create_contact"
  | "update_van"
  | "delete_event"
  | "delete_contact"
  | "create_event";

export interface TelaAction {
  type: TelaActionType;
  id: string;
  fields?: Record<string, string | number | boolean | null>;
  tour_id?: string;
  tour_name?: string;
}

export function parseTelaActions(text: string): {
  cleanText: string;
  actions: TelaAction[];
} {
  const actionRegex = /<<ACTION:(.*?)>>/g;
  const actions: TelaAction[] = [];
  let match;

  while ((match = actionRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.type && parsed.id) {
        actions.push(parsed as TelaAction);
      }
    } catch {
      // skip malformed
    }
  }

  const cleanText = text.replace(/<<ACTION:.*?>>/g, "").trim();
  return { cleanText, actions };
}

export function getActionLabel(action: TelaAction): string {
  switch (action.type) {
    case "resolve_conflict":
      return "Mark Conflict Resolved";
    case "resolve_gap":
      return "Mark Gap Resolved";
    case "update_event":
      return "Update Event";
    case "update_contact":
      return "Update Contact";
    case "create_contact":
      return "Add Contact";
    case "update_van":
      return "Update Advance Notes";
    case "delete_event":
      return "Remove Event";
    case "delete_contact":
      return "Remove Contact";
    case "create_event":
      return "Add Event";
    default:
      return "Apply Fix";
  }
}

interface SignoffImpact {
  affectsSafety: boolean;
  affectsTime: boolean;
  affectsMoney: boolean;
}

export function useTelaActions() {
  const { toast } = useToast();
  const { user } = useAuth();

  /** Resolve the target tour_id deterministically — never fall back to "first row" */
  const resolveTourId = useCallback(async (
    action: TelaAction,
    callerTourId?: string,
  ): Promise<string> => {
    // 1. Explicit UUID on the action itself
    if (action.tour_id && UUID_RE.test(action.tour_id)) return action.tour_id;
    // 2. Caller-provided tourId (from useTour context)
    if (callerTourId && UUID_RE.test(callerTourId)) return callerTourId;
    // 3. tour_name → resolve against user's accessible tours
    if (action.tour_name) {
      const { data } = await supabase
        .from("tours")
        .select("id")
        .ilike("name", action.tour_name)
        .limit(1);
      if (data?.[0]) return data[0].id;
    }
    throw new Error("Cannot determine target tour. Please select a tour first.");
  }, []);

  const logChange = useCallback(async (
    tourId: string,
    entityType: string,
    entityId: string,
    action: string,
    summary: string,
    reason: string,
    impact: SignoffImpact,
  ) => {
    const severity = (impact.affectsSafety || impact.affectsMoney) ? "CRITICAL" : impact.affectsTime ? "IMPORTANT" : "INFO";
    await supabase.from("akb_change_log").insert({
      tour_id: tourId,
      user_id: user!.id,
      entity_type: entityType,
      entity_id: entityId,
      action,
      change_summary: summary,
      change_reason: reason,
      severity,
      affects_safety: impact.affectsSafety,
      affects_time: impact.affectsTime,
      affects_money: impact.affectsMoney,
    } as any);
  }, [user]);

  /** Look up the tour name for toast messages */
  const getTourName = useCallback(async (tourId: string): Promise<string> => {
    const { data } = await supabase.from("tours").select("name").eq("id", tourId).maybeSingle();
    return data?.name || "tour";
  }, []);

  const executeAction = useCallback(async (
    action: TelaAction,
    reason: string,
    impact: SignoffImpact,
    callerTourId?: string,
  ): Promise<boolean> => {
    try {
      switch (action.type) {
        case "resolve_conflict": {
          const { error } = await supabase
            .from("calendar_conflicts")
            .update({ resolved: true })
            .eq("id", action.id);
          if (error) throw error;
          const { data: conflict } = await supabase.from("calendar_conflicts").select("tour_id").eq("id", action.id).maybeSingle();
          if (conflict) await logChange(conflict.tour_id, "calendar_conflict", action.id, "UPDATE", "Resolved conflict via TELA", reason, impact);
          window.dispatchEvent(new Event("akb-changed"));
          const conflictTourName = conflict ? await getTourName(conflict.tour_id) : "tour";
          toast({ title: "Conflict resolved", description: `Marked resolved in ${conflictTourName}.` });
          return true;
        }
        case "resolve_gap": {
          const { error } = await supabase
            .from("knowledge_gaps")
            .update({ resolved: true })
            .eq("id", action.id);
          if (error) throw error;
          const { data: gap } = await supabase.from("knowledge_gaps").select("tour_id").eq("id", action.id).maybeSingle();
          if (gap) await logChange(gap.tour_id, "knowledge_gap", action.id, "UPDATE", "Resolved knowledge gap via TELA", reason, impact);
          window.dispatchEvent(new Event("akb-changed"));
          const gapTourName = gap ? await getTourName(gap.tour_id) : "tour";
          toast({ title: "Gap resolved", description: `Marked resolved in ${gapTourName}.` });
          return true;
        }
        case "update_event": {
          if (!action.fields) throw new Error("No fields to update");
          const { error } = await supabase
            .from("schedule_events")
            .update(action.fields)
            .eq("id", action.id);
          if (error) throw error;
          const { data: evt } = await supabase.from("schedule_events").select("tour_id, venue").eq("id", action.id).maybeSingle();
          if (evt) await logChange(evt.tour_id, "schedule_event", action.id, "UPDATE", `TELA updated ${evt.venue || "event"}`, reason, impact);
          window.dispatchEvent(new Event("akb-changed"));
          const evtTourName = evt ? await getTourName(evt.tour_id) : "tour";
          toast({ title: "Event updated", description: `Updated ${evt?.venue || "event"} in ${evtTourName}.` });
          return true;
        }
        case "update_contact": {
          if (!action.fields) throw new Error("No fields to update");
          if (!UUID_RE.test(action.id)) throw new Error("Invalid contact ID — use 'Add Contact' for new contacts");
          const validContactFields = ["name", "role", "phone", "email", "scope", "venue"];
          const sanitized: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(action.fields)) {
            if (validContactFields.includes(k)) sanitized[k] = v;
          }
          if (Object.keys(sanitized).length === 0) throw new Error("No valid fields to update");
          const { error } = await supabase
            .from("contacts")
            .update(sanitized)
            .eq("id", action.id);
          if (error) throw error;
          const { data: contact } = await supabase.from("contacts").select("tour_id, name").eq("id", action.id).maybeSingle();
          if (contact) await logChange(contact.tour_id, "contact", action.id, "UPDATE", `TELA updated contact: ${contact.name}`, reason, impact);
          window.dispatchEvent(new Event("contacts-changed"));
          window.dispatchEvent(new Event("akb-changed"));
          const contactTourName = contact ? await getTourName(contact.tour_id) : "tour";
          toast({ title: "Contact updated", description: `${contact?.name || "Contact"} updated in ${contactTourName}.` });
          return true;
        }
        case "create_contact": {
          if (!action.fields || !action.fields.name) throw new Error("Contact name is required");
          const resolvedTourId = await resolveTourId(action, callerTourId);
          const validFields = ["name", "role", "phone", "email", "scope", "venue"];
          const insert: Record<string, unknown> = { tour_id: resolvedTourId };
          for (const [k, v] of Object.entries(action.fields)) {
            if (validFields.includes(k)) insert[k] = v;
          }
          if (!insert.scope) insert.scope = "TOUR";
          const { data: newContact, error } = await supabase
            .from("contacts")
            .insert(insert as any)
            .select("id")
            .maybeSingle();
          if (error) throw error;
          if (newContact) await logChange(resolvedTourId, "contact", newContact.id, "CREATE", `TELA added contact: ${action.fields.name}`, reason, impact);
          window.dispatchEvent(new Event("contacts-changed"));
          window.dispatchEvent(new Event("akb-changed"));
          const createTourName = await getTourName(resolvedTourId);
          toast({ title: "Contact added", description: `${action.fields.name} added to ${createTourName}.` });
          return true;
        }
        case "update_van": {
          if (!action.fields) throw new Error("No fields to update");
          const vanTourId = await resolveTourId(action, callerTourId);
          
          // Step 1: Try lookup by ID
          let existingVan: { van_data: unknown; tour_id: string; venue_name: string; id: string } | null = null;
          if (UUID_RE.test(action.id)) {
            const { data, error: fetchErr } = await supabase
              .from("venue_advance_notes")
              .select("id, van_data, tour_id, venue_name")
              .eq("id", action.id)
              .maybeSingle();
            if (fetchErr) throw fetchErr;
            existingVan = data;
          }

          // Step 2: Fallback lookup by venue_name + city + tour_id
          if (!existingVan && action.fields.venue_name) {
            let citySearch = action.fields.city ? String(action.fields.city) : null;
            if (citySearch) {
              citySearch = citySearch.replace(/\bFt\b/gi, "Fort").replace(/\bSt\b/gi, "Saint").replace(/\bMt\b/gi, "Mount");
              citySearch = citySearch.replace(/,?\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)$/i, "").trim();
            }
            let query = supabase
              .from("venue_advance_notes")
              .select("id, van_data, tour_id, venue_name")
              .eq("tour_id", vanTourId)
              .ilike("venue_name", `%${String(action.fields.venue_name)}%`);
            if (citySearch) query = query.ilike("city", `%${citySearch}%`);
            const { data } = await query.maybeSingle();
            existingVan = data;
          }

          // Step 3: If found, merge and update
          if (existingVan) {
            const currentData = (existingVan.van_data as Record<string, unknown>) || {};
            const mergedData = { ...currentData };
            for (const [k, v] of Object.entries(action.fields)) {
              if (k === "venue_name" || k === "city") continue;
              if (typeof v === "object" && v !== null && !Array.isArray(v)) {
                mergedData[k] = { ...(mergedData[k] as Record<string, unknown> || {}), ...(v as Record<string, unknown>) };
              } else {
                mergedData[k] = v;
              }
            }
            const { error } = await supabase
              .from("venue_advance_notes")
              .update({ van_data: mergedData as any })
              .eq("id", existingVan.id);
            if (error) throw error;
            await logChange(existingVan.tour_id, "venue_advance_note", existingVan.id, "UPDATE", `TELA updated advance notes for ${existingVan.venue_name}`, reason, impact);
            window.dispatchEvent(new Event("van-changed"));
            window.dispatchEvent(new Event("akb-changed"));
            const vanUpdateTourName = await getTourName(existingVan.tour_id);
            toast({ title: "Advance notes updated", description: `${existingVan.venue_name} updated in ${vanUpdateTourName}.` });
            return true;
          }

          // Step 4: Create new VAN record
          if (!action.fields.venue_name) throw new Error("venue_name is required to create a VAN record");

          const venueName = String(action.fields.venue_name);
          const normalizedName = venueName.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
          const vanData: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(action.fields)) {
            if (k === "venue_name" || k === "city") continue;
            vanData[k] = v;
          }

          const { data: newVan, error: insertErr } = await supabase
            .from("venue_advance_notes")
            .insert({
              tour_id: vanTourId,
              venue_name: venueName,
              normalized_venue_name: normalizedName,
              city: action.fields.city ? String(action.fields.city) : null,
              van_data: vanData as any,
            } as any)
            .select("id")
            .maybeSingle();
          if (insertErr) throw insertErr;
          const vanCreateTourName = await getTourName(vanTourId);
          if (newVan) await logChange(vanTourId, "venue_advance_note", newVan.id, "CREATE", `TELA created advance notes for ${venueName}`, reason, impact);
          window.dispatchEvent(new Event("van-changed"));
          window.dispatchEvent(new Event("akb-changed"));
          toast({ title: "Advance notes created", description: `${venueName} created in ${vanCreateTourName}.` });
          return true;
        }
        case "delete_event": {
          if (!UUID_RE.test(action.id)) throw new Error("Invalid event ID");
          // Fetch event details before deleting for the log
          const { data: evtToDelete } = await supabase
            .from("schedule_events")
            .select("tour_id, venue, city, event_date")
            .eq("id", action.id)
            .maybeSingle();
          if (!evtToDelete) throw new Error("Event not found");
          const { error } = await supabase
            .from("schedule_events")
            .delete()
            .eq("id", action.id);
          if (error) throw error;
          await logChange(evtToDelete.tour_id, "schedule_event", action.id, "DELETE", `TELA removed ${evtToDelete.venue || "event"} on ${evtToDelete.event_date || "unknown date"}`, reason, impact);
          window.dispatchEvent(new Event("akb-changed"));
          const delEvtTourName = await getTourName(evtToDelete.tour_id);
          toast({ title: "Event removed", description: `${evtToDelete.venue || "Event"} removed from ${delEvtTourName}.` });
          return true;
        }
        case "delete_contact": {
          if (!UUID_RE.test(action.id)) throw new Error("Invalid contact ID");
          const { data: contactToDelete } = await supabase
            .from("contacts")
            .select("tour_id, name")
            .eq("id", action.id)
            .maybeSingle();
          if (!contactToDelete) throw new Error("Contact not found");
          const { error } = await supabase
            .from("contacts")
            .delete()
            .eq("id", action.id);
          if (error) throw error;
          await logChange(contactToDelete.tour_id, "contact", action.id, "DELETE", `TELA removed contact: ${contactToDelete.name}`, reason, impact);
          window.dispatchEvent(new Event("contacts-changed"));
          window.dispatchEvent(new Event("akb-changed"));
          const delContactTourName = await getTourName(contactToDelete.tour_id);
          toast({ title: "Contact removed", description: `${contactToDelete.name} removed from ${delContactTourName}.` });
          return true;
        }
        case "create_event": {
          if (!action.fields || !action.fields.event_date) throw new Error("event_date is required");
          const createEvtTourId = await resolveTourId(action, callerTourId);
          const validEventFields = ["venue", "city", "event_date", "notes", "load_in", "show_time", "end_time"];
          const evtInsert: Record<string, unknown> = {
            tour_id: createEvtTourId,
            created_by: user!.id,
          };
          for (const [k, v] of Object.entries(action.fields)) {
            if (validEventFields.includes(k)) evtInsert[k] = v;
          }
          const { data: newEvt, error } = await supabase
            .from("schedule_events")
            .insert(evtInsert as any)
            .select("id")
            .maybeSingle();
          if (error) throw error;
          if (newEvt) await logChange(createEvtTourId, "schedule_event", newEvt.id, "CREATE", `TELA added ${action.fields.venue || "event"} on ${action.fields.event_date}`, reason, impact);
          window.dispatchEvent(new Event("akb-changed"));
          const createEvtTourName = await getTourName(createEvtTourId);
          toast({ title: "Event added", description: `${action.fields.venue || "Event"} added to ${createEvtTourName}.` });
          return true;
        }
        default:
          toast({ title: "Unknown action", description: "TELA proposed an action I don't recognize.", variant: "destructive" });
          return false;
      }
    } catch (err) {
      console.error("[TELA action] Error:", err);
      toast({ title: "Action failed", description: (err as Error).message, variant: "destructive" });
      return false;
    }
  }, [toast, logChange, resolveTourId, getTourName]);

  return { executeAction };
}
