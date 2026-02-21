import { useState, useEffect, useCallback } from "react";
import { Settings, RefreshCw, Plus, Trash2, Copy, CheckCircle, XCircle, Clock, Loader2, Users, Mail, Link, UserPlus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { useTour } from "@/hooks/useTour";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Integration = {
  id: string;
  tour_id: string;
  provider: string;
  label: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_status: string;
  webhook_secret: string | null;
  config: Record<string, unknown> | null;
  created_at: string;
};

type SyncLog = {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  events_upserted: number;
  contacts_upserted: number;
  finance_upserted: number;
  error_message: string | null;
};

type TourMember = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profiles: { display_name: string | null; email: string | null } | null;
};

type TourInvite = {
  id: string;
  email: string;
  role: string;
  token: string;
  used_at: string | null;
  expires_at: string;
  created_at: string;
};

const statusIcon = (s: string) => {
  switch (s) {
    case "SUCCESS": return <CheckCircle className="h-4 w-4 text-primary" />;
    case "FAILED": return <XCircle className="h-4 w-4 text-destructive" />;
    case "SYNCING": return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    default: return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
};

const roleBadgeVariant = (role: string) => {
  if (role === "TA") return "default";
  if (role === "MGMT") return "secondary";
  return "outline";
};

const BunkAdmin = () => {
  const { selectedTourId, selectedTour } = useTour();
  const { user } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [members, setMembers] = useState<TourMember[]>([]);
  const [invites, setInvites] = useState<TourInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [newProvider, setNewProvider] = useState<string>("MASTER_TOUR");
  const [newLabel, setNewLabel] = useState("");
  const [mtApiKey, setMtApiKey] = useState("");
  const [mtApiSecret, setMtApiSecret] = useState("");
  const [mtTourId, setMtTourId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("CREW");
  const [invitingLoading, setInvitingLoading] = useState(false);
  const [bulkInviting, setBulkInviting] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [akbContacts, setAkbContacts] = useState<{ name: string; email: string; role: string | null }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const load = useCallback(async () => {
    if (!selectedTourId) return;
    setLoading(true);
    const [intRes, logRes, memberRes, inviteRes, contactRes] = await Promise.all([
      supabase
        .from("tour_integrations")
        .select("*")
        .eq("tour_id", selectedTourId)
        .order("created_at", { ascending: false }),
      supabase
        .from("sync_logs")
        .select("*")
        .eq("tour_id", selectedTourId)
        .order("started_at", { ascending: false })
        .limit(20),
      supabase
        .from("tour_members")
        .select("id, user_id, role, created_at, profiles(display_name, email)")
        .eq("tour_id", selectedTourId)
        .order("created_at", { ascending: true }),
      supabase
        .from("tour_invites")
        .select("id, email, role, token, used_at, expires_at, created_at")
        .eq("tour_id", selectedTourId)
        .order("created_at", { ascending: false }),
      supabase
        .from("contacts")
        .select("name, email, role")
        .eq("tour_id", selectedTourId)
        .eq("scope", "TOUR")
        .not("email", "is", null),
    ]);
    if (intRes.data) setIntegrations(intRes.data as unknown as Integration[]);
    if (logRes.data) setSyncLogs(logRes.data as unknown as SyncLog[]);
    if (memberRes.data) setMembers(memberRes.data as unknown as TourMember[]);
    if (inviteRes.data) setInvites(inviteRes.data as TourInvite[]);
    if (contactRes.data) setAkbContacts(contactRes.data.filter(c => c.email) as { name: string; email: string; role: string | null }[]);
    setLoading(false);
  }, [selectedTourId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!selectedTourId) return;
    const insertData: Record<string, unknown> = {
      tour_id: selectedTourId,
      provider: newProvider,
      label: newLabel || null,
    };
    if (newProvider === "MASTER_TOUR") {
      if (!mtApiKey || !mtApiSecret || !mtTourId) {
        toast.error("All Master Tour fields are required");
        return;
      }
      insertData.api_key_encrypted = mtApiKey;
      insertData.api_secret_encrypted = mtApiSecret;
      insertData.config = { mt_tour_id: mtTourId };
    }
    if (newProvider === "GENERIC_WEBHOOK") {
      const secret = crypto.randomUUID();
      insertData.webhook_secret = secret;
    }
    const { error } = await supabase.from("tour_integrations").insert(insertData as any);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Integration added");
      setAddOpen(false);
      setNewLabel(""); setMtApiKey(""); setMtApiSecret(""); setMtTourId("");
      load();
    }
  };

  const handleSync = async (integration: Integration) => {
    setSyncing(integration.id);
    try {
      const { data, error } = await supabase.functions.invoke("mt-sync", {
        body: { integration_id: integration.id },
      });
      if (error) throw error;
      if (data?.success) toast.success(data.message || "Sync completed");
      else toast.error(data?.error || "Sync failed");
    } catch (err: any) {
      toast.error(err.message || "Sync request failed");
    }
    setSyncing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("tour_integrations").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Integration removed"); load(); }
  };

  const handleRemoveMember = async (memberId: string, userId: string) => {
    if (userId === user?.id) { toast.error("You can't remove yourself"); return; }
    const { error } = await supabase.from("tour_members").delete().eq("id", memberId);
    if (error) toast.error(error.message);
    else { toast.success("Member removed"); load(); }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    const { error } = await supabase.from("tour_members").update({ role: newRole as "TA" | "MGMT" | "CREW" }).eq("id", memberId);
    if (error) toast.error(error.message);
    else { toast.success("Role updated"); load(); }
  };

  const handleCreateInvite = async () => {
    if (!selectedTourId || !inviteEmail || !user) return;
    setInvitingLoading(true);
    const { data, error } = await supabase
      .from("tour_invites")
      .insert({ tour_id: selectedTourId, email: inviteEmail, role: inviteRole as "TA" | "MGMT" | "CREW", created_by: user.id, tour_name: selectedTour?.name || null } as any)
      .select()
      .single();
    if (error) {
      toast.error(error.message);
    } else {
      const inviteUrl = `${window.location.origin}/invite/${data.token}`;
      await navigator.clipboard.writeText(inviteUrl);
      const subject = encodeURIComponent(`You're invited to ${selectedTour?.name || "the tour"}`);
      const body = encodeURIComponent(`Hey — here's your invite link to join the tour:\n\n${inviteUrl}\n\nIt expires ${new Date(data.expires_at).toLocaleDateString()}.`);
      window.open(`mailto:${inviteEmail}?subject=${subject}&body=${body}`, "_blank");
      toast.success("Invite created — email composer opened & link copied!");
      setInviteOpen(false);
      setInviteEmail("");
      setInviteSearch("");
      load();
    }
    setInvitingLoading(false);
  };

  const handleRevokeInvite = async (inviteId: string) => {
    const { error } = await supabase.from("tour_invites").delete().eq("id", inviteId);
    if (error) toast.error(error.message);
    else { toast.success("Invite revoked"); load(); }
  };

  const handleResendInvite = async (oldInvite: TourInvite) => {
    if (!selectedTourId || !user) return;
    // Delete the expired invite
    await supabase.from("tour_invites").delete().eq("id", oldInvite.id);
    // Create a fresh one
    const { data, error } = await supabase
      .from("tour_invites")
      .insert({ tour_id: selectedTourId, email: oldInvite.email, role: oldInvite.role as "TA" | "MGMT" | "CREW", created_by: user.id, tour_name: selectedTour?.name || null } as any)
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    const inviteUrl = `${window.location.origin}/invite/${data.token}`;
    await navigator.clipboard.writeText(inviteUrl);
    const subject = encodeURIComponent(`You're invited to ${selectedTour?.name || "the tour"}`);
    const body = encodeURIComponent(`Hey — here's your invite link to join the tour:\n\n${inviteUrl}\n\nIt expires ${new Date(data.expires_at).toLocaleDateString()}.`);
    window.open(`mailto:${oldInvite.email}?subject=${subject}&body=${body}`, "_blank");
    toast.success("New invite created — email composer opened & link copied!");
    load();
  };

  const copyInviteLink = (token: string) => {
    const inviteUrl = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link copied!");
  };

  const copyWebhookUrl = () => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const url = `https://${projectId}.supabase.co/functions/v1/inbound-sync`;
    navigator.clipboard.writeText(url);
    toast.success("Webhook URL copied to clipboard");
  };

  const copySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    toast.success("Webhook secret copied");
  };

  const isExpired = (expires_at: string) => new Date(expires_at) < new Date();

  // Determine which members already have a pending (non-expired, unused) invite
  const pendingInviteEmails = new Set(
    invites
      .filter(i => !i.used_at && !isExpired(i.expires_at))
      .map(i => i.email.toLowerCase())
  );

  const invitableMembers = members.filter(
    m => m.profiles?.email && !pendingInviteEmails.has(m.profiles.email.toLowerCase()) && m.user_id !== user?.id
  );

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedMemberIds.size === invitableMembers.length) {
      setSelectedMemberIds(new Set());
    } else {
      setSelectedMemberIds(new Set(invitableMembers.map(m => m.id)));
    }
  };

  const handleQuickInvite = async (email: string, role: string) => {
    if (!selectedTourId || !user) return;
    const { data, error } = await supabase
      .from("tour_invites")
      .insert({ tour_id: selectedTourId, email, role: role as "TA" | "MGMT" | "CREW", created_by: user.id, tour_name: selectedTour?.name || null } as any)
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return null;
    }
    return data;
  };

  const handleBulkInvite = async () => {
    if (!selectedTourId || !user || selectedMemberIds.size === 0) return;
    setBulkInviting(true);
    const targets = members.filter(m => selectedMemberIds.has(m.id) && m.profiles?.email);
    let successCount = 0;
    for (const m of targets) {
      const result = await handleQuickInvite(m.profiles!.email!, m.role);
      if (result) successCount++;
    }
    toast.success(`Sent ${successCount} invite${successCount !== 1 ? "s" : ""}`);
    setSelectedMemberIds(new Set());
    setBulkInviting(false);
    load();
  };

  const handleSendSingleInvite = async (member: TourMember) => {
    if (!member.profiles?.email) return;
    const data = await handleQuickInvite(member.profiles.email, member.role);
    if (data) {
      const inviteUrl = `${window.location.origin}/invite/${data.token}`;
      await navigator.clipboard.writeText(inviteUrl);
      toast.success(`Invite link for ${member.profiles.email} copied!`);
      load();
    }
  };

  if (!selectedTourId) {
    return (
      <div className="space-y-6 max-w-4xl">
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground font-mono">Select a tour first</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          Team, integrations & sync management
        </p>
      </div>

      {/* Team Management */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Tour Team</h2>
            <Badge variant="secondary" className="font-mono text-xs">{members.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {selectedMemberIds.size > 0 && (
              <Button size="sm" variant="default" onClick={handleBulkInvite} disabled={bulkInviting}>
                {bulkInviting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                Invite {selectedMemberIds.size} Selected
              </Button>
            )}
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <UserPlus className="h-4 w-4 mr-1" /> Invite New
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Mail className="h-4 w-4" /> Invite to Tour
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Enter their email and role. An invite link will be generated — copy it and send it to them directly (SMS, email, etc.).
                  </p>
                  <div className="relative">
                    <Label>Name or email</Label>
                    <Input
                      value={inviteSearch}
                      onChange={(e) => {
                        const val = e.target.value;
                        setInviteSearch(val);
                        setShowSuggestions(val.length >= 2);
                        // If user clears, also clear email
                        if (!val) setInviteEmail("");
                      }}
                      placeholder="Start typing a name or email…"
                      className="font-mono text-sm"
                      autoComplete="off"
                      onFocus={() => inviteSearch.length >= 2 && setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    />
                    {showSuggestions && (() => {
                      const q = inviteSearch.toLowerCase();
                      const matches = akbContacts.filter(
                        c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
                      ).slice(0, 6);
                      if (matches.length === 0) return null;
                      return (
                        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
                          {matches.map((c, i) => (
                            <button
                              key={i}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex flex-col gap-0.5 border-b border-border last:border-0"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setInviteEmail(c.email);
                                setInviteSearch(`${c.name} (${c.email})`);
                                setShowSuggestions(false);
                              }}
                            >
                              <span className="font-medium">{c.name}</span>
                              <span className="text-xs font-mono text-muted-foreground">{c.email}{c.role ? ` · ${c.role}` : ""}</span>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                    {inviteEmail && (
                      <p className="text-xs font-mono text-primary mt-1">→ {inviteEmail}</p>
                    )}
                    {!inviteEmail && inviteSearch.includes("@") && (
                      <button
                        type="button"
                        className="text-xs font-mono text-muted-foreground mt-1 hover:text-primary"
                        onClick={() => { setInviteEmail(inviteSearch); }}
                      >
                        Use "{inviteSearch}" as email
                      </button>
                    )}
                  </div>
                  <div>
                    <Label>Role</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MGMT">MGMT — Management (can edit tour data)</SelectItem>
                        <SelectItem value="CREW">CREW — Crew (read access)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleCreateInvite}
                    disabled={!inviteEmail || invitingLoading}
                    className="w-full"
                  >
                    {invitingLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Link className="h-4 w-4 mr-2" />
                    )}
                    Generate & Copy Invite Link
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground font-mono">Loading…</p>
        ) : members.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-mono">No team members yet.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {invitableMembers.length > 1 && (
              <div className="flex items-center gap-2 px-1">
                <Checkbox
                  checked={selectedMemberIds.size === invitableMembers.length && invitableMembers.length > 0}
                  onCheckedChange={toggleSelectAll}
                  id="select-all"
                />
                <label htmlFor="select-all" className="text-xs font-mono text-muted-foreground cursor-pointer">
                  Select all for bulk invite
                </label>
              </div>
            )}
            {members.map((m) => {
              const hasPending = m.profiles?.email && pendingInviteEmails.has(m.profiles.email.toLowerCase());
              const isInvitable = invitableMembers.some(im => im.id === m.id);
              return (
                <Card key={m.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {isInvitable && (
                      <Checkbox
                        checked={selectedMemberIds.has(m.id)}
                        onCheckedChange={() => toggleMemberSelection(m.id)}
                      />
                    )}
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-mono font-bold text-primary">
                        {(m.profiles?.display_name || m.profiles?.email || "?")[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {m.profiles?.display_name || m.profiles?.email || "Unknown user"}
                        {m.user_id === user?.id && (
                          <span className="ml-1.5 text-xs text-muted-foreground font-mono">(you)</span>
                        )}
                      </p>
                      {m.profiles?.display_name && m.profiles?.email && (
                        <p className="text-xs text-muted-foreground truncate font-mono">{m.profiles.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasPending && (
                      <Badge variant="outline" className="text-xs font-mono text-muted-foreground">Invited</Badge>
                    )}
                    {isInvitable && (
                      <Button size="sm" variant="ghost" onClick={() => handleSendSingleInvite(m)} title="Generate invite link">
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                    <Select
                      value={m.role}
                      onValueChange={(v) => handleUpdateRole(m.id, v)}
                      disabled={m.user_id === user?.id}
                    >
                      <SelectTrigger className="h-7 text-xs w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TA">TA</SelectItem>
                        <SelectItem value="MGMT">MGMT</SelectItem>
                        <SelectItem value="CREW">CREW</SelectItem>
                      </SelectContent>
                    </Select>
                    {m.user_id !== user?.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveMember(m.id, m.user_id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pending Invites */}
        {invites.filter(i => !i.used_at).length > 0 && (
          <div className="space-y-2 pt-1">
            <h3 className="text-sm font-mono text-muted-foreground tracking-wider">PENDING INVITES</h3>
            {invites.filter(i => !i.used_at).map((inv) => (
              <Card key={inv.id} className={`p-3 flex items-center justify-between gap-3 ${isExpired(inv.expires_at) ? "opacity-50" : ""}`}>
                <div className="min-w-0">
                  <p className="text-sm font-mono truncate">{inv.email}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant={roleBadgeVariant(inv.role)} className="text-xs">{inv.role}</Badge>
                    {isExpired(inv.expires_at) ? (
                      <span className="text-xs text-destructive font-mono">EXPIRED</span>
                    ) : (
                      <span className="text-xs text-muted-foreground font-mono">
                        Expires {new Date(inv.expires_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isExpired(inv.expires_at) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleResendInvite(inv)}
                      title="Resend with fresh invite"
                    >
                      <RefreshCw className="h-4 w-4 mr-1" /> Resend
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const inviteUrl = `${window.location.origin}/invite/${inv.token}`;
                          const subject = encodeURIComponent(`You're invited to ${selectedTour?.name || "the tour"}`);
                          const body = encodeURIComponent(`Hey — here's your invite link to join the tour:\n\n${inviteUrl}\n\nIt expires ${new Date(inv.expires_at).toLocaleDateString()}.`);
                          window.open(`mailto:${inv.email}?subject=${subject}&body=${body}`, "_blank");
                        }}
                        title="Send via email"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => copyInviteLink(inv.token)} title="Copy link">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleRevokeInvite(inv.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Integrations */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Integrations</h2>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" /> Add Integration
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Integration</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Provider</Label>
                  <Select value={newProvider} onValueChange={setNewProvider}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MASTER_TOUR">Master Tour</SelectItem>
                      <SelectItem value="GENERIC_WEBHOOK">Generic Webhook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Label (optional)</Label>
                  <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Artist MT Account" />
                </div>
                {newProvider === "MASTER_TOUR" && (
                  <>
                    <div>
                      <Label>MT API Key</Label>
                      <Input value={mtApiKey} onChange={(e) => setMtApiKey(e.target.value)} type="password" />
                    </div>
                    <div>
                      <Label>MT API Secret</Label>
                      <Input value={mtApiSecret} onChange={(e) => setMtApiSecret(e.target.value)} type="password" />
                    </div>
                    <div>
                      <Label>MT Tour ID</Label>
                      <Input value={mtTourId} onChange={(e) => setMtTourId(e.target.value)} placeholder="From Master Tour" />
                    </div>
                  </>
                )}
                {newProvider === "GENERIC_WEBHOOK" && (
                  <p className="text-sm text-muted-foreground">
                    A webhook secret will be auto-generated. Share the endpoint URL and secret with your external system.
                  </p>
                )}
                <Button onClick={handleAdd} className="w-full">Add</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground font-mono">Loading…</p>
        ) : integrations.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <Settings className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-mono">
              No integrations configured. Add Master Tour or a generic webhook.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {integrations.map((int) => (
              <Card key={int.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">
                      {int.provider.replace("_", " ")}
                    </Badge>
                    {int.label && <span className="text-sm font-medium truncate">{int.label}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground font-mono">
                    {statusIcon(int.last_sync_status)}
                    <span>{int.last_sync_status}</span>
                    {int.last_sync_at && (
                      <span>· {new Date(int.last_sync_at).toLocaleString()}</span>
                    )}
                  </div>
                  {int.provider === "GENERIC_WEBHOOK" && int.webhook_secret && (
                    <div className="flex items-center gap-1 mt-2">
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => copyWebhookUrl()}>
                        <Copy className="h-3 w-3 mr-1" /> URL
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => copySecret(int.webhook_secret!)}>
                        <Copy className="h-3 w-3 mr-1" /> Secret
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {int.provider === "MASTER_TOUR" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSync(int)}
                      disabled={syncing === int.id}
                    >
                      {syncing === int.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      <span className="ml-1">Sync</span>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(int.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Sync History */}
      {syncLogs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Sync History</h2>
          <div className="space-y-1">
            {syncLogs.map((log) => (
              <div key={log.id} className="flex items-center gap-3 text-xs font-mono py-2 border-b border-border last:border-0">
                {statusIcon(log.status)}
                <span className="text-muted-foreground">
                  {new Date(log.started_at).toLocaleString()}
                </span>
                {log.status === "SUCCESS" && (
                  <span className="text-foreground">
                    {log.events_upserted}e · {log.contacts_upserted}c · {log.finance_upserted}f
                  </span>
                )}
                {log.status === "FAILED" && log.error_message && (
                  <span className="text-destructive truncate max-w-[200px]" title={log.error_message}>
                    {log.error_message}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BunkAdmin;
