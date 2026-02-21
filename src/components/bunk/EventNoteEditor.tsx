import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Loader2, Pencil, Save, X } from "lucide-react";

interface EventNoteEditorProps {
  eventId: string;
  tourId: string;
  currentNotes: string | undefined;
  eventDate: string;
  venueName: string;
  onUpdated?: () => void;
}

const EventNoteEditor = ({ eventId, tourId, currentNotes, eventDate, venueName, onUpdated }: EventNoteEditorProps) => {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(currentNotes || "");
  const [saving, setSaving] = useState(false);
  const [affectsSafety, setAffectsSafety] = useState(false);
  const [affectsTime, setAffectsTime] = useState(false);
  const [affectsMoney, setAffectsMoney] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("schedule_events")
      .update({ notes: notes.trim() || null, updated_by: user?.id })
      .eq("id", eventId);

    if (error) {
      toast({ title: "Failed to save notes", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Log the change
    const severity = (affectsSafety || affectsMoney) ? "CRITICAL" : affectsTime ? "IMPORTANT" : "INFO";
    await supabase.from("akb_change_log").insert({
      tour_id: tourId,
      user_id: user!.id,
      entity_type: "schedule_event",
      entity_id: eventId,
      action: "UPDATE",
      change_summary: `Updated notes for ${venueName} on ${eventDate}`,
      change_detail: { field: "notes", old: currentNotes || "", new: notes.trim() },
      severity,
      affects_safety: affectsSafety,
      affects_time: affectsTime,
      affects_money: affectsMoney,
      event_date: eventDate,
    });

    // Trigger notification processing
    try {
      await supabase.functions.invoke("process-akb-notifications", {
        body: { change_log_id: eventId, tour_id: tourId },
      });
    } catch {}

    toast({ title: "Notes updated" });
    setSaving(false);
    setEditing(false);
    setAffectsSafety(false);
    setAffectsTime(false);
    setAffectsMoney(false);
    onUpdated?.();
  };

  if (!editing) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-mono text-muted-foreground tracking-wider uppercase">Notes</p>
          <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px] font-mono" onClick={() => { setNotes(currentNotes || ""); setEditing(true); }}>
            <Pencil className="h-2.5 w-2.5" />
            Edit
          </Button>
        </div>
        {currentNotes ? (
          <p className="text-xs text-foreground/80 whitespace-pre-wrap">{currentNotes}</p>
        ) : (
          <p className="text-xs text-muted-foreground italic">No notes yet</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono text-muted-foreground tracking-wider uppercase">Edit Notes</p>
        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setEditing(false)}>
          <X className="h-2.5 w-2.5" />
        </Button>
      </div>
      <Textarea className="text-xs min-h-[60px]" value={notes} onChange={e => setNotes(e.target.value)} />

      <div className="flex items-center gap-3">
        <p className="text-[10px] font-mono text-muted-foreground">Impact:</p>
        <label className="flex items-center gap-1 text-[10px]">
          <Checkbox checked={affectsSafety} onCheckedChange={(v) => setAffectsSafety(!!v)} className="h-3 w-3" />
          Safety
        </label>
        <label className="flex items-center gap-1 text-[10px]">
          <Checkbox checked={affectsTime} onCheckedChange={(v) => setAffectsTime(!!v)} className="h-3 w-3" />
          Time
        </label>
        <label className="flex items-center gap-1 text-[10px]">
          <Checkbox checked={affectsMoney} onCheckedChange={(v) => setAffectsMoney(!!v)} className="h-3 w-3" />
          Money
        </label>
      </div>

      <Button size="sm" className="h-7 gap-1 text-xs w-full" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        Save Notes
      </Button>
    </div>
  );
};

export default EventNoteEditor;
