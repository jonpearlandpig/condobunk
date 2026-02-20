import { useState, useEffect, useCallback } from "react";
import { Settings, RefreshCw, Plus, Trash2, Copy, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useTour } from "@/hooks/useTour";
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

const statusIcon = (s: string) => {
  switch (s) {
    case "SUCCESS": return <CheckCircle className="h-4 w-4 text-primary" />;
    case "FAILED": return <XCircle className="h-4 w-4 text-destructive" />;
    case "SYNCING": return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    default: return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
};

const BunkAdmin = () => {
  const { selectedTourId } = useTour();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newProvider, setNewProvider] = useState<string>("MASTER_TOUR");
  const [newLabel, setNewLabel] = useState("");
  const [mtApiKey, setMtApiKey] = useState("");
  const [mtApiSecret, setMtApiSecret] = useState("");
  const [mtTourId, setMtTourId] = useState("");

  const load = useCallback(async () => {
    if (!selectedTourId) return;
    setLoading(true);
    const [intRes, logRes] = await Promise.all([
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
    ]);
    if (intRes.data) setIntegrations(intRes.data as unknown as Integration[]);
    if (logRes.data) setSyncLogs(logRes.data as unknown as SyncLog[]);
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
      // Generate a random webhook secret
      const secret = crypto.randomUUID();
      insertData.webhook_secret = secret;
    }

    const { error } = await supabase.from("tour_integrations").insert(insertData as any);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Integration added");
      setAddOpen(false);
      setNewLabel("");
      setMtApiKey("");
      setMtApiSecret("");
      setMtTourId("");
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
      if (data?.success) {
        toast.success(data.message || "Sync completed");
      } else {
        toast.error(data?.error || "Sync failed");
      }
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

  const copyWebhookUrl = (secret: string) => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const url = `https://${projectId}.supabase.co/functions/v1/inbound-sync`;
    navigator.clipboard.writeText(url);
    toast.success("Webhook URL copied to clipboard");
  };

  const copySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    toast.success("Webhook secret copied");
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
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          Integrations & sync management
        </p>
      </div>

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
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => copyWebhookUrl(int.webhook_secret!)}>
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
