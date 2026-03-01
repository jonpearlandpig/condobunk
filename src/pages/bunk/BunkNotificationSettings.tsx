import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Bell, Shield, Clock, DollarSign, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";

interface NotifPrefs {
  notify_schedule_changes: boolean;
  notify_contact_changes: boolean;
  notify_venue_changes: boolean;
  notify_finance_changes: boolean;
  day_window: number;
  min_severity: string;
  safety_always: boolean;
  time_always: boolean;
  money_always: boolean;
}

const DEFAULTS: NotifPrefs = {
  notify_schedule_changes: true,
  notify_contact_changes: false,
  notify_venue_changes: true,
  notify_finance_changes: false,
  day_window: 3,
  min_severity: "IMPORTANT",
  safety_always: true,
  time_always: true,
  money_always: true,
};

const BunkNotificationSettings = () => {
  const { user } = useAuth();
  const { selectedTourId, selectedTour } = useTour();
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || !selectedTourId) return;
    loadPrefs();
  }, [user, selectedTourId]);

  const loadPrefs = async () => {
    setLoading(true);
    // Load user prefs, fallback to tour defaults, fallback to system defaults
    const { data: userPrefs } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user!.id)
      .eq("tour_id", selectedTourId)
      .maybeSingle();

    if (userPrefs) {
      setPrefs({
        notify_schedule_changes: userPrefs.notify_schedule_changes,
        notify_contact_changes: userPrefs.notify_contact_changes,
        notify_venue_changes: userPrefs.notify_venue_changes,
        notify_finance_changes: userPrefs.notify_finance_changes,
        day_window: userPrefs.day_window,
        min_severity: userPrefs.min_severity,
        safety_always: userPrefs.safety_always,
        time_always: userPrefs.time_always,
        money_always: userPrefs.money_always,
      });
    } else {
      const { data: tourDefaults } = await supabase
        .from("tour_notification_defaults")
        .select("*")
        .eq("tour_id", selectedTourId)
        .maybeSingle();

      if (tourDefaults) {
        setPrefs({
          notify_schedule_changes: tourDefaults.notify_schedule_changes,
          notify_contact_changes: tourDefaults.notify_contact_changes,
          notify_venue_changes: tourDefaults.notify_venue_changes,
          notify_finance_changes: tourDefaults.notify_finance_changes,
          day_window: tourDefaults.day_window,
          min_severity: tourDefaults.min_severity,
          safety_always: true,
          time_always: true,
          money_always: true,
        });
      } else {
        setPrefs(DEFAULTS);
      }
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("notification_preferences").upsert({
      user_id: user!.id,
      tour_id: selectedTourId,
      ...prefs,
    }, { onConflict: "user_id,tour_id" });

    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Notification preferences saved" });
    }
    setSaving(false);
  };

  const update = <K extends keyof NotifPrefs>(key: K, val: NotifPrefs[K]) => {
    setPrefs(p => ({ ...p, [key]: val }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Settings
        </h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          {selectedTour?.name || "Tour"} — Control what changes trigger Bunk Chat alerts
        </p>
      </div>

      {/* What to notify */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-xs font-mono tracking-wider text-muted-foreground uppercase">Change Types</h2>
        <div className="space-y-2">
          {([
            ["notify_schedule_changes", "Schedule Changes", "Show dates, times, venues"] as const,
            ["notify_venue_changes", "Venue Changes", "Tech specs, advance notes"] as const,
            ["notify_contact_changes", "Contact Changes", "New or updated contacts"] as const,
            ["notify_finance_changes", "Finance Changes", "Budget line updates"] as const,
          ]).map(([key, label, desc]) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch checked={prefs[key]} onCheckedChange={(v) => update(key, v)} />
            </div>
          ))}
        </div>
      </div>

      {/* Sensitivity */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-xs font-mono tracking-wider text-muted-foreground uppercase">Sensitivity</h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Day Window</p>
            <p className="text-xs text-muted-foreground">Only alert for shows within this many days</p>
          </div>
          <Select value={String(prefs.day_window)} onValueChange={v => update("day_window", Number(v))}>
            <SelectTrigger className="w-20 h-8 text-xs font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 1, 2, 3, 5, 7, 14, 30].map(d => (
                <SelectItem key={d} value={String(d)} className="text-xs font-mono">{d} day{d !== 1 ? "s" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Minimum Severity</p>
            <p className="text-xs text-muted-foreground">Only alert for changes at this level or above</p>
          </div>
          <Select value={prefs.min_severity} onValueChange={v => update("min_severity", v)}>
            <SelectTrigger className="w-32 h-8 text-xs font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INFO" className="text-xs font-mono">All (Info+)</SelectItem>
              <SelectItem value="IMPORTANT" className="text-xs font-mono">Important+</SelectItem>
              <SelectItem value="CRITICAL" className="text-xs font-mono">Critical Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Always-on overrides */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-xs font-mono tracking-wider text-muted-foreground uppercase">Always Alert (Overrides)</h2>
        <p className="text-xs text-muted-foreground">These bypass your sensitivity settings — entire tour team gets notified</p>

        <div className="space-y-2">
          {([
            ["safety_always", "Safety Impact", Shield, "text-destructive"] as const,
            ["time_always", "Time Impact", Clock, "text-warning"] as const,
            ["money_always", "Money Impact", DollarSign, "text-success"] as const,
          ]).map(([key, label, Icon, color]) => (
            <div key={key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <p className="text-sm font-medium">{label}</p>
              </div>
              <Switch checked={prefs[key]} onCheckedChange={(v) => update(key, v)} />
            </div>
          ))}
        </div>
      </div>

      {/* SMS Reminders */}
      <ReminderSettingsCard userId={user!.id} />

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        Save Preferences
      </Button>
    </div>
  );
};

/* ---------- Reminder Settings Card ---------- */
const ReminderSettingsCard = ({ userId }: { userId: string }) => {
  const [phone, setPhone] = useState("");
  const [defaultLead, setDefaultLead] = useState("120");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("phone").eq("id", userId).single().then(({ data }) => {
      if (data?.phone) setPhone(data.phone);
      setLoaded(true);
    });
  }, [userId]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ phone: phone.trim() }).eq("id", userId);
    if (error) {
      toast({ title: "Failed to save phone", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Reminder settings saved" });
    }
    setSaving(false);
  };

  if (!loaded) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 className="text-xs font-mono tracking-wider text-muted-foreground uppercase flex items-center gap-2">
        <Bell className="h-3.5 w-3.5 text-primary" />
        SMS Event Reminders
      </h2>
      <p className="text-xs text-muted-foreground">
        Set per-event SMS reminders from the Calendar. Your phone number is used for all reminders.
      </p>

      <div className="space-y-1">
        <Label className="text-xs font-mono flex items-center gap-1">
          <Phone className="h-3 w-3" /> Phone Number
        </Label>
        <Input
          className="h-8 text-sm font-mono"
          placeholder="+1 (555) 123-4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-mono">Default Lead Time</Label>
        <Select value={defaultLead} onValueChange={setDefaultLead}>
          <SelectTrigger className="h-8 text-xs font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30" className="text-xs font-mono">30 min before</SelectItem>
            <SelectItem value="60" className="text-xs font-mono">1 hour before</SelectItem>
            <SelectItem value="120" className="text-xs font-mono">2 hours before</SelectItem>
            <SelectItem value="1440" className="text-xs font-mono">Day before</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button size="sm" variant="outline" className="w-full" onClick={handleSave} disabled={saving}>
        {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
        Save Reminder Settings
      </Button>
    </div>
  );
};

export default BunkNotificationSettings;
