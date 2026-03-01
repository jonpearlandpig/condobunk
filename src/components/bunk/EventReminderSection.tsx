import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Bell, Loader2, Phone } from "lucide-react";

interface EventReminderSectionProps {
  eventId: string;
  tourId: string;
  /** Available time slots from the event — only show remind options for slots with data */
  availableSlots: { key: string; label: string }[];
}

const LEAD_TIMES = [
  { value: "30", label: "30 min before" },
  { value: "60", label: "1 hour before" },
  { value: "120", label: "2 hours before" },
  { value: "1440", label: "Day before" },
];

const EventReminderSection = ({ eventId, tourId, availableSlots }: EventReminderSectionProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [remindType, setRemindType] = useState(availableSlots[0]?.key || "load_in");
  const [leadMinutes, setLeadMinutes] = useState("120");
  const [phone, setPhone] = useState("");
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadReminder();
  }, [user, eventId]);

  const loadReminder = async () => {
    setLoading(true);

    // Load user's phone from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", user!.id)
      .single();

    if (profile?.phone) setPhone(profile.phone);

    // Load existing reminder for this event
    const { data: reminder } = await supabase
      .from("event_reminders")
      .select("*")
      .eq("event_id", eventId)
      .eq("user_id", user!.id)
      .maybeSingle();

    if (reminder) {
      setEnabled((reminder as any).enabled);
      setRemindType((reminder as any).remind_type);
      setLeadMinutes(String((reminder as any).remind_before_minutes));
      setPhone((reminder as any).phone || profile?.phone || "");
      setExistingId((reminder as any).id);
    } else {
      setEnabled(false);
      setExistingId(null);
    }

    setLoading(false);
  };

  const handleSave = async () => {
    if (!phone.trim()) {
      toast({ title: "Phone number required", variant: "destructive" });
      return;
    }

    setSaving(true);

    if (existingId) {
      // Update existing
      const { error } = await supabase
        .from("event_reminders")
        .update({
          enabled,
          remind_type: remindType,
          remind_before_minutes: parseInt(leadMinutes),
          phone: phone.trim(),
        } as any)
        .eq("id", existingId);

      if (error) {
        toast({ title: "Failed to update reminder", description: error.message, variant: "destructive" });
      } else {
        toast({ title: enabled ? "Reminder updated" : "Reminder disabled" });
      }
    } else if (enabled) {
      // Create new
      const { data, error } = await supabase
        .from("event_reminders")
        .insert({
          tour_id: tourId,
          event_id: eventId,
          user_id: user!.id,
          phone: phone.trim(),
          remind_type: remindType,
          remind_before_minutes: parseInt(leadMinutes),
          enabled: true,
        } as any)
        .select("id")
        .single();

      if (error) {
        toast({ title: "Failed to set reminder", description: error.message, variant: "destructive" });
      } else {
        setExistingId((data as any).id);
        toast({ title: "Reminder set!" });
      }
    }

    // Also update profile phone if changed
    if (phone.trim()) {
      await supabase.from("profiles").update({ phone: phone.trim() }).eq("id", user!.id);
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (availableSlots.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-mono font-semibold tracking-wider text-primary uppercase">
            SMS Reminder
          </span>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {enabled && (
        <div className="space-y-2.5">
          {/* Which time slot */}
          <div className="space-y-1">
            <Label className="text-[10px] font-mono text-muted-foreground">Remind about</Label>
            <Select value={remindType} onValueChange={setRemindType}>
              <SelectTrigger className="h-8 text-xs font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableSlots.map((s) => (
                  <SelectItem key={s.key} value={s.key} className="text-xs font-mono">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lead time */}
          <div className="space-y-1">
            <Label className="text-[10px] font-mono text-muted-foreground">How far ahead</Label>
            <Select value={leadMinutes} onValueChange={setLeadMinutes}>
              <SelectTrigger className="h-8 text-xs font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_TIMES.map((lt) => (
                  <SelectItem key={lt.value} value={lt.value} className="text-xs font-mono">
                    {lt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Phone */}
          <div className="space-y-1">
            <Label className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" /> Phone number
            </Label>
            <Input
              className="h-8 text-xs font-mono"
              placeholder="+1 (555) 123-4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <Button size="sm" className="w-full h-8 text-xs font-mono" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            {existingId ? "Update Reminder" : "Set Reminder"}
          </Button>
        </div>
      )}

      {!enabled && existingId && (
        <Button
          size="sm"
          variant="outline"
          className="w-full h-8 text-xs font-mono"
          onClick={handleSave}
          disabled={saving}
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
          Disable Reminder
        </Button>
      )}
    </div>
  );
};

export default EventReminderSection;
