import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import { format } from "date-fns";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import AkbEditSignoff, { type SignoffData } from "./AkbEditSignoff";

interface AddEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  onCreated?: () => void;
}

const AddEventDialog = ({ open, onOpenChange, defaultDate, onCreated }: AddEventDialogProps) => {
  const { user } = useAuth();
  const { tours, selectedTourId } = useTour();
  const [saving, setSaving] = useState(false);
  const [showSignoff, setShowSignoff] = useState(false);

  const [tourId, setTourId] = useState(selectedTourId);
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("");
  const [eventDate, setEventDate] = useState(defaultDate || format(new Date(), "yyyy-MM-dd"));
  const [showTime, setShowTime] = useState("");
  const [loadIn, setLoadIn] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setVenue("");
    setCity("");
    setEventDate(defaultDate || format(new Date(), "yyyy-MM-dd"));
    setShowTime("");
    setLoadIn("");
    setNotes("");
  };

  const toTimestamp = (date: string, time: string): string | null => {
    if (!time) return null;
    return `${date}T${time}:00Z`;
  };

  const handleRequestSave = () => {
    if (!venue.trim()) {
      toast({ title: "Venue required", variant: "destructive" });
      return;
    }
    if (!tourId) {
      toast({ title: "Select a tour", variant: "destructive" });
      return;
    }
    setShowSignoff(true);
  };

  const handleCommit = async (signoff: SignoffData) => {
    setSaving(true);

    const { data: event, error } = await supabase.from("schedule_events").insert({
      tour_id: tourId!,
      venue: venue.trim(),
      city: city.trim() || null,
      event_date: eventDate,
      show_time: toTimestamp(eventDate, showTime),
      load_in: toTimestamp(eventDate, loadIn),
      notes: notes.trim() || null,
      created_by: user?.id,
      updated_by: user?.id,
    }).select("id").single();

    if (error) {
      toast({ title: "Failed to add event", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    const severity = (signoff.affectsSafety || signoff.affectsMoney) ? "CRITICAL" : signoff.affectsTime ? "IMPORTANT" : "INFO";
    await supabase.from("akb_change_log").insert({
      tour_id: tourId!,
      user_id: user!.id,
      entity_type: "schedule_event",
      entity_id: event.id,
      action: "CREATE",
      change_summary: `Added show: ${venue.trim()}${city ? `, ${city}` : ""} on ${eventDate}`,
      change_reason: signoff.reason,
      severity,
      affects_safety: signoff.affectsSafety,
      affects_time: signoff.affectsTime,
      affects_money: signoff.affectsMoney,
      event_date: eventDate,
    } as any);

    try {
      await supabase.functions.invoke("process-akb-notifications", {
        body: { change_log_id: event.id, tour_id: tourId },
      });
    } catch {}

    toast({ title: "Event added" });
    reset();
    setSaving(false);
    setShowSignoff(false);
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="text-base">Add Event</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <div className="space-y-3">
          {tours.length > 1 && (
            <div className="space-y-1">
              <Label className="text-xs font-mono">Tour</Label>
              <Select value={tourId} onValueChange={setTourId}>
                <SelectTrigger className="h-8 text-xs font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tours.map(t => (
                    <SelectItem key={t.id} value={t.id} className="text-xs font-mono">{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-mono">Venue *</Label>
              <Input className="h-8 text-sm" value={venue} onChange={e => setVenue(e.target.value)} placeholder="Venue name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono">City</Label>
              <Input className="h-8 text-sm" value={city} onChange={e => setCity(e.target.value)} placeholder="City, State" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-mono">Date *</Label>
              <Input className="h-8 text-sm font-mono" type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono">Show Time</Label>
              <Input className="h-8 text-sm font-mono" type="time" value={showTime} onChange={e => setShowTime(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono">Load-in</Label>
              <Input className="h-8 text-sm font-mono" type="time" value={loadIn} onChange={e => setLoadIn(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-mono">Notes</Label>
            <Textarea className="text-sm min-h-[60px]" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Address, details..." />
          </div>
        </div>

        <ResponsiveDialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleRequestSave} disabled={saving}>
            {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Add Event
          </Button>
        </ResponsiveDialogFooter>

        <AkbEditSignoff
          open={showSignoff}
          onOpenChange={setShowSignoff}
          changeSummary={`Add new show: ${venue.trim()}${city ? `, ${city}` : ""} on ${eventDate}`}
          onCommit={handleCommit}
          loading={saving}
        />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
};

export default AddEventDialog;
