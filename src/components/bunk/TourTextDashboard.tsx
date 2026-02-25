import { useState, useCallback } from "react";
import { MessageSquareText, RefreshCw, Users, Clock, ArrowDownUp, AlertTriangle, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Stats = {
  total_inbound: number;
  total_outbound: number;
  unique_senders: number;
  avg_response_seconds: number;
};

type Cluster = {
  topic: string;
  count: number;
  severity: "info" | "warning" | "critical";
  sample_questions: string[];
  suggested_fix: string;
  related_entity: string;
};

type Message = {
  direction: "inbound" | "outbound";
  phone: string;
  sender_name: string | null;
  text: string;
  created_at: string;
};

type InsightsData = {
  stats: Stats;
  clusters: Cluster[];
  messages: Message[];
};

const severityConfig = {
  info: { color: "bg-muted text-muted-foreground", label: "Info", border: "border-muted" },
  warning: { color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400", label: "Warning", border: "border-yellow-500/30" },
  critical: { color: "bg-destructive/15 text-destructive", label: "Critical", border: "border-destructive/30" },
};

const formatResponseTime = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
};

export const TourTextDashboard = ({ tourId }: { tourId: string }) => {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hours, setHours] = useState(24);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const { data: fnData, error } = await supabase.functions.invoke("tourtext-insights", {
        body: { tour_id: tourId, hours },
      });
      if (error) throw error;
      setData(fnData as InsightsData);
      setLoaded(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to load TourText insights");
    }
    setLoading(false);
  }, [tourId, hours]);

  const alerts = data?.clusters?.filter((c) => c.severity === "warning" || c.severity === "critical") || [];

  if (!loaded) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">TourText Intelligence</h2>
        </div>
        <Card className="p-6 text-center border-dashed">
          <MessageSquareText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-mono mb-4">
            Analyze crew SMS inquiries for patterns and gaps
          </p>
          <Button onClick={fetchInsights} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
            Run TELA Analysis
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">TourText Intelligence</h2>
          {alerts.length > 0 && (
            <Badge variant="destructive" className="font-mono text-xs">
              {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            className="text-xs font-mono border rounded px-2 py-1 bg-background text-foreground"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            <option value={12}>12h</option>
            <option value={24}>24h</option>
            <option value={48}>48h</option>
            <option value={72}>72h</option>
          </select>
          <Button size="sm" variant="outline" onClick={fetchInsights} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {data && (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-3 text-center">
              <ArrowDownUp className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold font-mono">{data.stats.total_inbound}</p>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Inbound</p>
            </Card>
            <Card className="p-3 text-center">
              <MessageSquareText className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold font-mono">{data.stats.total_outbound}</p>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Replies</p>
            </Card>
            <Card className="p-3 text-center">
              <Users className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold font-mono">{data.stats.unique_senders}</p>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Unique Senders</p>
            </Card>
            <Card className="p-3 text-center">
              <Clock className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold font-mono">{formatResponseTime(data.stats.avg_response_seconds)}</p>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Avg Response</p>
            </Card>
          </div>

          {/* Pattern Alerts */}
          {alerts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                TELA Pattern Alerts
              </h3>
              {alerts.map((cluster, i) => {
                const config = severityConfig[cluster.severity];
                return (
                  <Card key={i} className={`p-4 border-l-4 ${config.border}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={config.color}>{config.label}</Badge>
                          <span className="text-sm font-semibold">
                            {cluster.count} of {data.stats.total_inbound} TourTexts about{" "}
                            <span className="uppercase">{cluster.topic}</span>
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          {cluster.sample_questions.slice(0, 3).map((q, j) => (
                            <p key={j} className="font-mono">"{q}"</p>
                          ))}
                        </div>
                        <div className="text-sm mt-2 p-2 rounded bg-muted/50">
                          <p className="font-medium text-xs text-muted-foreground mb-1">Suggested fix:</p>
                          <p className="text-sm">{cluster.suggested_fix}</p>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Info-level clusters (if any, shown collapsed) */}
          {data.clusters.filter((c) => c.severity === "info").length > 0 && (
            <details className="text-xs">
              <summary className="text-muted-foreground cursor-pointer font-mono tracking-wider">
                {data.clusters.filter((c) => c.severity === "info").length} topic cluster(s) below alert threshold
              </summary>
              <div className="mt-2 space-y-2">
                {data.clusters
                  .filter((c) => c.severity === "info")
                  .map((cluster, i) => (
                    <Card key={i} className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px]">{cluster.count}×</Badge>
                        <span className="text-sm font-medium">{cluster.topic}</span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">
                        {cluster.sample_questions[0]}
                      </p>
                    </Card>
                  ))}
              </div>
            </details>
          )}

          <Separator />

          {/* Message Log */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Message Log</h3>
            {data.messages.length === 0 ? (
              <p className="text-sm text-muted-foreground font-mono py-4">No messages in this time window.</p>
            ) : (
              <div className="max-h-[400px] overflow-y-auto rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[70px]">Dir</TableHead>
                      <TableHead className="w-[100px]">From/To</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead className="w-[130px]">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.messages.map((msg, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge variant={msg.direction === "inbound" ? "default" : "outline"} className="text-[10px] font-mono">
                            {msg.direction === "inbound" ? "IN" : "OUT"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {msg.sender_name ? (
                            <span>{msg.sender_name}<br /><span className="text-muted-foreground">{msg.phone}</span></span>
                          ) : (
                            msg.phone
                          )}
                        </TableCell>
                        <TableCell className="text-xs max-w-[300px] truncate">{msg.text}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground font-mono">
                          {new Date(msg.created_at).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TourTextDashboard;
