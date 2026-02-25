import { useState, useEffect, useCallback } from "react";
import { Ticket, Plus, CheckCircle, XCircle, Clock, Loader2, ChevronDown, Sparkles, Edit2, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Allotment = {
  id: string;
  tour_id: string;
  event_id: string | null;
  event_date: string;
  venue: string;
  city: string | null;
  total_tickets: number;
  per_person_max: number;
  pickup_instructions: string | null;
  deadline: string | null;
  created_by: string;
  created_at: string;
  box_office_email: string | null;
  box_office_phone: string | null;
  auto_notify_box_office: boolean;
};

type GuestRequest = {
  id: string;
  tour_id: string;
  allotment_id: string | null;
  requester_phone: string | null;
  requester_name: string | null;
  requester_user_id: string | null;
  guest_names: string;
  ticket_count: number;
  status: string;
  status_reason: string | null;
  pickup_info_sent: boolean;
  approved_by: string | null;
  created_at: string;
  resolved_at: string | null;
};

interface GuestListManagerProps {
  tourId: string;
}

export const GuestListManager = ({ tourId }: GuestListManagerProps) => {
  const { user } = useAuth();
  const [allotments, setAllotments] = useState<Allotment[]>([]);
  const [requests, setRequests] = useState<GuestRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editAllotment, setEditAllotment] = useState<Partial<Allotment> | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [approvedOpen, setApprovedOpen] = useState(false);
  const [autoCreating, setAutoCreating] = useState(false);

  const load = useCallback(async () => {
    if (!tourId) return;
    setLoading(true);
    const [allotRes, reqRes] = await Promise.all([
      supabase
        .from("guest_list_allotments" as any)
        .select("*")
        .eq("tour_id", tourId)
        .order("event_date", { ascending: true }),
      supabase
        .from("guest_list_requests" as any)
        .select("*")
        .eq("tour_id", tourId)
        .order("created_at", { ascending: false }),
    ]);
    setAllotments((allotRes.data as any[]) || []);
    setRequests((reqRes.data as any[]) || []);
    setLoading(false);
  }, [tourId]);

  useEffect(() => { load(); }, [load]);

  const ticketsUsed = (allotmentId: string) => {
    return requests
      .filter(r => r.allotment_id === allotmentId && r.status === "APPROVED")
      .reduce((sum, r) => sum + r.ticket_count, 0);
  };

  const pendingRequests = requests.filter(r => r.status === "PENDING");
  const approvedRequests = requests.filter(r => r.status === "APPROVED");

  const handleSaveAllotment = async () => {
    if (!editAllotment || !user) return;
    setSaving(true);
    const payload = {
      tour_id: tourId,
      event_date: editAllotment.event_date,
      venue: editAllotment.venue,
      city: editAllotment.city || null,
      total_tickets: editAllotment.total_tickets || 20,
      per_person_max: editAllotment.per_person_max || 4,
      pickup_instructions: editAllotment.pickup_instructions || null,
      deadline: editAllotment.deadline || null,
      created_by: user.id,
      box_office_email: editAllotment.box_office_email || null,
      box_office_phone: editAllotment.box_office_phone || null,
      auto_notify_box_office: editAllotment.auto_notify_box_office || false,
    };

    if (editAllotment.id) {
      const { error } = await supabase
        .from("guest_list_allotments" as any)
        .update(payload as any)
        .eq("id", editAllotment.id);
      if (error) toast.error(error.message);
      else toast.success("Allotment updated");
    } else {
      const { error } = await supabase
        .from("guest_list_allotments" as any)
        .insert(payload as any);
      if (error) toast.error(error.message);
      else toast.success("Allotment created");
    }
    setSaving(false);
    setEditOpen(false);
    setEditAllotment(null);
    load();
  };

  const handleDeleteAllotment = async (id: string) => {
    const { error } = await supabase.from("guest_list_allotments" as any).delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Allotment deleted"); load(); }
  };

  const handleAction = async (requestId: string, action: "approve" | "deny" | "next_time") => {
    setActionLoading(requestId);
    try {
      const { data, error } = await supabase.functions.invoke("guest-list-request", {
        body: { action, request_id: requestId },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(action === "approve" ? "Request approved — crew notified" : action === "next_time" ? "Crew notified — next time" : "Request denied");
      } else {
        toast.error(data?.error || "Action failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to process action");
    }
    setActionLoading(null);
    load();
  };

  const handleAutoCreate = async () => {
    if (!user) return;
    setAutoCreating(true);
    // Get upcoming events
    const today = new Date().toISOString().split("T")[0];
    const { data: events } = await supabase
      .from("schedule_events")
      .select("id, event_date, venue, city")
      .eq("tour_id", tourId)
      .gte("event_date", today)
      .order("event_date");

    if (!events || events.length === 0) {
      toast.error("No upcoming shows found");
      setAutoCreating(false);
      return;
    }

    // Filter out events that already have allotments
    const existingDates = new Set(allotments.map(a => a.event_date));
    const newEvents = events.filter(e => e.event_date && !existingDates.has(e.event_date));

    if (newEvents.length === 0) {
      toast.info("All upcoming shows already have allotments");
      setAutoCreating(false);
      return;
    }

    const inserts = newEvents.map(e => ({
      tour_id: tourId,
      event_id: e.id,
      event_date: e.event_date!,
      venue: e.venue || "TBD",
      city: e.city || null,
      total_tickets: 20,
      per_person_max: 4,
      pickup_instructions: null,
      deadline: null,
      created_by: user.id,
    }));

    const { error } = await supabase.from("guest_list_allotments" as any).insert(inserts as any);
    if (error) toast.error(error.message);
    else toast.success(`Created ${inserts.length} allotment${inserts.length !== 1 ? "s" : ""}`);
    setAutoCreating(false);
    load();
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Ticket className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Guest List</h2>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ticket className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Guest List</h2>
          {pendingRequests.length > 0 && (
            <Badge variant="destructive" className="font-mono text-xs">{pendingRequests.length} pending</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleAutoCreate}
            disabled={autoCreating}
          >
            {autoCreating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Auto-Create
          </Button>
          <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditAllotment(null); }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" onClick={() => setEditAllotment({ total_tickets: 20, per_person_max: 4, auto_notify_box_office: false })}>
                <Plus className="h-4 w-4 mr-1" /> Add Allotment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editAllotment?.id ? "Edit Allotment" : "New Allotment"}</DialogTitle>
              </DialogHeader>
              {editAllotment && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Show Date</Label>
                      <Input
                        type="date"
                        value={editAllotment.event_date || ""}
                        onChange={(e) => setEditAllotment({ ...editAllotment, event_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Venue</Label>
                      <Input
                        value={editAllotment.venue || ""}
                        onChange={(e) => setEditAllotment({ ...editAllotment, venue: e.target.value })}
                        placeholder="Bridgestone Arena"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input
                      value={editAllotment.city || ""}
                      onChange={(e) => setEditAllotment({ ...editAllotment, city: e.target.value })}
                      placeholder="Nashville"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Total Comp Tickets</Label>
                      <Input
                        type="number"
                        value={editAllotment.total_tickets || 20}
                        onChange={(e) => setEditAllotment({ ...editAllotment, total_tickets: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <Label>Per-Person Max</Label>
                      <Input
                        type="number"
                        value={editAllotment.per_person_max || 4}
                        onChange={(e) => setEditAllotment({ ...editAllotment, per_person_max: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Pickup Instructions</Label>
                    <Textarea
                      value={editAllotment.pickup_instructions || ""}
                      onChange={(e) => setEditAllotment({ ...editAllotment, pickup_instructions: e.target.value })}
                      placeholder="Will Call under tour name, bring photo ID"
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label>Request Deadline (optional)</Label>
                    <Input
                      type="datetime-local"
                      value={editAllotment.deadline ? editAllotment.deadline.slice(0, 16) : ""}
                      onChange={(e) => setEditAllotment({ ...editAllotment, deadline: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    />
                  </div>
                  <Separator />
                  <div className="space-y-3">
                    <Label className="text-xs font-mono tracking-wider text-muted-foreground">BOX OFFICE CONTACT</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={editAllotment.box_office_email || ""}
                          onChange={(e) => {
                            const email = e.target.value;
                            setEditAllotment({
                              ...editAllotment,
                              box_office_email: email,
                              auto_notify_box_office: (email || editAllotment.box_office_phone) ? true : editAllotment.auto_notify_box_office,
                            });
                          }}
                          placeholder="boxoffice@venue.com"
                        />
                      </div>
                      <div>
                        <Label>Phone</Label>
                        <Input
                          type="tel"
                          value={editAllotment.box_office_phone || ""}
                          onChange={(e) => {
                            const phone = e.target.value;
                            setEditAllotment({
                              ...editAllotment,
                              box_office_phone: phone,
                              auto_notify_box_office: (phone || editAllotment.box_office_email) ? true : editAllotment.auto_notify_box_office,
                            });
                          }}
                          placeholder="+1 615-555-0100"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm">Auto-Notify Box Office</Label>
                        <p className="text-xs text-muted-foreground">Send updated guest list on every approval</p>
                      </div>
                      <Switch
                        checked={editAllotment.auto_notify_box_office || false}
                        onCheckedChange={(checked) => setEditAllotment({ ...editAllotment, auto_notify_box_office: checked })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleSaveAllotment} disabled={saving || !editAllotment.event_date || !editAllotment.venue}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                      {editAllotment.id ? "Update" : "Create"}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Allotment Cards */}
      {allotments.length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <Ticket className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-mono">No allotments set up. Add one per show or use Auto-Create.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {allotments.map((a) => {
            const used = ticketsUsed(a.id);
            const pct = a.total_tickets > 0 ? Math.round((used / a.total_tickets) * 100) : 0;
            return (
              <Card key={a.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium">{a.venue}</p>
                      {a.auto_notify_box_office && (
                        <span title="Box office auto-notify enabled">
                          <Bell className="h-3.5 w-3.5 text-primary" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">
                      {a.city ? `${a.city} · ` : ""}{new Date(a.event_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      {a.deadline && ` · Deadline: ${new Date(a.deadline).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-mono">
                        <span className="font-bold">{used}</span>/{a.total_tickets}
                      </p>
                      <p className="text-[10px] text-muted-foreground">max {a.per_person_max}/person</p>
                    </div>
                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct >= 90 ? "bg-destructive" : pct >= 60 ? "bg-yellow-500" : "bg-primary"}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setEditAllotment(a); setEditOpen(true); }}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {a.pickup_instructions && (
                  <p className="text-xs text-muted-foreground mt-1 italic">📋 {a.pickup_instructions}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-mono text-muted-foreground tracking-wider">PENDING REQUESTS</h3>
          {pendingRequests.map((r) => {
            const allotment = allotments.find(a => a.id === r.allotment_id);
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{r.requester_name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {r.guest_names} ({r.ticket_count} ticket{r.ticket_count !== 1 ? "s" : ""})
                    </p>
                    {allotment && (
                      <p className="text-xs text-muted-foreground">
                        {allotment.venue} · {new Date(allotment.event_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </p>
                    )}
                    {r.status_reason && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">Reason: {r.status_reason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleAction(r.id, "approve")}
                      disabled={actionLoading === r.id}
                    >
                      {actionLoading === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5 mr-1" />}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(r.id, "next_time")}
                      disabled={actionLoading === r.id}
                    >
                      <Clock className="h-3.5 w-3.5 mr-1" /> Next Time
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleAction(r.id, "deny")}
                      disabled={actionLoading === r.id}
                    >
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Approved List (collapsible) */}
      {approvedRequests.length > 0 && (
        <Collapsible open={approvedOpen} onOpenChange={setApprovedOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-sm font-mono text-muted-foreground tracking-wider hover:text-foreground transition-colors w-full">
              <ChevronDown className={`h-4 w-4 transition-transform ${approvedOpen ? "rotate-0" : "-rotate-90"}`} />
              APPROVED ({approvedRequests.length})
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 mt-2">
            {approvedRequests.map((r) => {
              const allotment = allotments.find(a => a.id === r.allotment_id);
              return (
                <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded bg-muted/30 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="font-medium truncate">{r.requester_name || "Unknown"}</span>
                    <span className="text-muted-foreground truncate">{r.guest_names} ({r.ticket_count})</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {allotment && (
                      <span className="text-muted-foreground font-mono">
                        {new Date(allotment.event_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {r.status_reason === "Auto-approved" ? "Auto" : "Manual"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
