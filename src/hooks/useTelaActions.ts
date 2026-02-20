import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type TelaActionType =
  | "resolve_conflict"
  | "resolve_gap"
  | "update_event"
  | "update_contact";

export interface TelaAction {
  type: TelaActionType;
  id: string;
  fields?: Record<string, string | number | boolean | null>;
}

/**
 * Parse <<ACTION:{...}>> blocks from TELA's response text.
 * Returns { cleanText, actions } where cleanText has action markers removed.
 */
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
    default:
      return "Apply Fix";
  }
}

export function useTelaActions() {
  const { toast } = useToast();

  const executeAction = useCallback(async (action: TelaAction): Promise<boolean> => {
    try {
      switch (action.type) {
        case "resolve_conflict": {
          const { error } = await supabase
            .from("calendar_conflicts")
            .update({ resolved: true })
            .eq("id", action.id);
          if (error) throw error;
          toast({ title: "Conflict resolved", description: "TELA marked this conflict as resolved." });
          return true;
        }
        case "resolve_gap": {
          const { error } = await supabase
            .from("knowledge_gaps")
            .update({ resolved: true })
            .eq("id", action.id);
          if (error) throw error;
          toast({ title: "Gap resolved", description: "TELA marked this knowledge gap as resolved." });
          return true;
        }
        case "update_event": {
          if (!action.fields) throw new Error("No fields to update");
          const { error } = await supabase
            .from("schedule_events")
            .update(action.fields)
            .eq("id", action.id);
          if (error) throw error;
          toast({ title: "Event updated", description: "TELA updated the schedule event." });
          return true;
        }
        case "update_contact": {
          if (!action.fields) throw new Error("No fields to update");
          // Only allow valid contact columns
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
          toast({ title: "Contact updated", description: "TELA updated the contact info." });
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
  }, [toast]);

  return { executeAction };
}
