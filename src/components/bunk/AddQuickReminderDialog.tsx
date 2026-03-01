import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Send, Bell, Loader2 } from "lucide-react";

interface AddQuickReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const E164_RE = /^\+[1-9]\d{1,14}$/;

const normalizePhone = (raw: string): string => {
  // If already E.164, return as-is
  if (raw.startsWith("+")) return raw.replace(/[^\d+]/g, "");
  // Strip everything except digits
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`; // fallback — will fail E.164 check if truly invalid
};

const AddQuickReminderDialog = ({ open, onOpenChange }: AddQuickReminderDialogProps) => {
  const { user } = useAuth();
  const { selectedTourId } = useTour();
  const { toast } = useToast();

  const [isSelf, setIsSelf] = useState(true);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sendAt, setSendAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [userPhone, setUserPhone] = useState("");

  // Load user's phone from profile
  useEffect(() => {
    if (!user?.id || !open) return;
    supabase
      .from("profiles")
      .select("phone")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const p = data?.phone || "";
        setUserPhone(p);
        if (isSelf) setPhone(p);
      });
  }, [user?.id, open]);

  // Reset form when opened
  useEffect(() => {
    if (open) {
      setIsSelf(true);
      setMessage("");
      // Default to 1 hour from now
      const d = new Date(Date.now() + 60 * 60 * 1000);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setSendAt(local);
    }
  }, [open]);

  // Sync phone when toggling isSelf
  useEffect(() => {
    if (isSelf) setPhone(userPhone);
    else setPhone("");
  }, [isSelf, userPhone]);

  const handleSubmit = async () => {
    if (!selectedTourId) {
      toast({ title: "No tour selected", variant: "destructive" });
      return;
    }
    const normalized = normalizePhone(phone);
    if (!normalized || !E164_RE.test(normalized)) {
      toast({ title: "Could not parse phone number", description: "Try a format like 615-788-4644", variant: "destructive" });
      return;
    }
    if (!message.trim()) {
      toast({ title: "Message required", variant: "destructive" });
      return;
    }
    if (message.length > 1500) {
      toast({ title: "Message too long", description: "Max 1500 characters", variant: "destructive" });
      return;
    }
    const sendAtDate = new Date(sendAt);
    if (isNaN(sendAtDate.getTime()) || sendAtDate <= new Date()) {
      toast({ title: "Invalid time", description: "Send time must be in the future", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("scheduled_messages" as any).insert({
      user_id: user!.id,
      tour_id: selectedTourId,
      to_phone: normalizePhone(phone),
      message_text: message.trim(),
      send_at: sendAtDate.toISOString(),
      is_self: isSelf,
    } as any);

    setSaving(false);
    if (error) {
      toast({ title: "Failed to schedule", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: isSelf ? "Reminder set" : "Message scheduled", description: `Will send at ${sendAtDate.toLocaleString()}` });
    onOpenChange(false);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2 font-mono text-sm">
            {isSelf ? <Bell className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {isSelf ? "Quick Reminder" : "Schedule Text"}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <div className="space-y-4 py-2">
          {/* Remind Me toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="self-toggle" className="text-xs font-mono">Remind Me</Label>
            <Switch id="self-toggle" checked={isSelf} onCheckedChange={setIsSelf} />
          </div>

          {/* Phone */}
          <div className="space-y-1">
            <Label className="text-xs font-mono">
              {isSelf ? "My Phone" : "Recipient Phone"}
            </Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="615-788-4644"
              className="font-mono text-sm"
              disabled={isSelf && !!userPhone}
            />
            {isSelf && !userPhone && (
              <p className="text-[10px] text-warning">No phone on profile — enter one above</p>
            )}
          </div>

          {/* Message */}
          <div className="space-y-1">
            <Label className="text-xs font-mono">Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={isSelf ? "Call the runner for groceries" : "Pick up groceries from the store"}
              className="font-mono text-sm min-h-[80px]"
              maxLength={1500}
            />
            <p className="text-[10px] text-muted-foreground text-right">{message.length}/1500</p>
          </div>

          {/* When */}
          <div className="space-y-1">
            <Label className="text-xs font-mono">Send At</Label>
            <Input
              type="datetime-local"
              value={sendAt}
              onChange={(e) => setSendAt(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <Button onClick={handleSubmit} disabled={saving} className="w-full font-mono text-xs gap-2">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isSelf ? <Bell className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {saving ? "Scheduling…" : isSelf ? "Set Reminder" : "Schedule Text"}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
};

export default AddQuickReminderDialog;
