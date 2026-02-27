import { useState, useEffect, useCallback, useRef } from "react";
import { Inbox, Clock, TrendingUp, Filter, MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type InboundMsg = {
  id: string;
  from_phone: string;
  sender_name: string | null;
  message_text: string;
  category: string;
  created_at: string;
  tour_id: string | null;
};

type OutboundMsg = {
  id: string;
  to_phone: string;
  message_text: string;
  created_at: string;
};

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "schedule", label: "Schedule" },
  { key: "venue_tech", label: "Venue Tech" },
  { key: "logistics", label: "Logistics" },
  { key: "contacts", label: "Contacts" },
  { key: "guest_list", label: "Guest List" },
  { key: "catering", label: "Catering" },
  { key: "general", label: "General" },
] as const;

const TIME_RANGES = [
  { value: 1, label: "1h" },
  { value: 6, label: "6h" },
  { value: 12, label: "12h" },
  { value: 24, label: "24h" },
  { value: 48, label: "48h" },
  { value: 168, label: "7d" },
];

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  return `•••${digits.slice(-4)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const TourTextInbox = ({ tourId }: { tourId: string }) => {
  const [messages, setMessages] = useState<InboundMsg[]>([]);
  const [outbounds, setOutbounds] = useState<OutboundMsg[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const newMsgIds = useRef<Set<string>>(new Set());

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - hours * 3600000).toISOString();

    const [inRes, outRes] = await Promise.all([
      supabase
        .from("sms_inbound")
        .select("id, from_phone, sender_name, message_text, category, created_at, tour_id")
        .eq("tour_id", tourId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("sms_outbound")
        .select("id, to_phone, message_text, created_at")
        .eq("tour_id", tourId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    if (inRes.data) setMessages(inRes.data as unknown as InboundMsg[]);
    if (outRes.data) setOutbounds(outRes.data as OutboundMsg[]);
    setLoading(false);
  }, [tourId, hours]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`tourtext-inbox-${tourId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sms_inbound",
          filter: `tour_id=eq.${tourId}`,
        },
        (payload) => {
          const newMsg = payload.new as InboundMsg;
          newMsgIds.current.add(newMsg.id);
          setMessages((prev) => [newMsg, ...prev]);
          // Clear animation after 3s
          setTimeout(() => {
            newMsgIds.current.delete(newMsg.id);
          }, 3000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tourId]);

  // Filter by category
  const filtered = activeCategory === "all"
    ? messages
    : messages.filter((m) => m.category === activeCategory);

  // Category counts
  const categoryCounts: Record<string, number> = {};
  for (const m of messages) {
    categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1;
  }

  // Stats
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const msgsToday = messages.filter((m) => new Date(m.created_at) >= todayStart).length;
  const msgsLastHour = messages.filter((m) => now - new Date(m.created_at).getTime() < 3600000).length;
  const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];

  // Find paired outbound reply for a message
  const findReply = (msg: InboundMsg): OutboundMsg | null => {
    const phone = msg.from_phone.replace(/\D/g, "").slice(-10);
    const msgTime = new Date(msg.created_at).getTime();
    return outbounds.find((o) => {
      const oPhone = o.to_phone.replace(/\D/g, "").slice(-10);
      const oTime = new Date(o.created_at).getTime();
      return oPhone === phone && oTime > msgTime && oTime - msgTime < 300000; // within 5 min
    }) || null;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">TourText Inbox</h2>
          <Badge variant="secondary" className="font-mono text-xs">{messages.length}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            className="text-xs font-mono border rounded px-2 py-1 bg-background text-foreground"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            {TIME_RANGES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <MessageSquareText className="h-4 w-4 mx-auto text-primary mb-1" />
          <p className="text-2xl font-bold font-mono">{msgsToday}</p>
          <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Today</p>
        </Card>
        <Card className="p-3 text-center">
          <Clock className="h-4 w-4 mx-auto text-primary mb-1" />
          <p className="text-2xl font-bold font-mono">{msgsLastHour}</p>
          <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Last Hour</p>
        </Card>
        <Card className="p-3 text-center">
          <TrendingUp className="h-4 w-4 mx-auto text-primary mb-1" />
          <p className="text-sm font-bold font-mono truncate">
            {topCategory ? topCategory[0].replace("_", " ") : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Top Category</p>
        </Card>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => {
          const count = cat.key === "all" ? messages.length : (categoryCounts[cat.key] || 0);
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono whitespace-nowrap transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {cat.label}
              {count > 0 && (
                <span className={cn(
                  "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                  isActive ? "bg-primary-foreground/20" : "bg-background"
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Message List */}
      {loading ? (
        <Card className="p-8 text-center border-dashed">
          <p className="text-sm text-muted-foreground font-mono">Loading messages…</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <Inbox className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-mono">No messages in this view.</p>
        </Card>
      ) : (
        <ScrollArea className="h-[500px]">
          <div className="space-y-2 pr-2">
            {filtered.map((msg) => {
              const reply = findReply(msg);
              const isNew = newMsgIds.current.has(msg.id);
              return (
                <Card
                  key={msg.id}
                  className={cn(
                    "p-3 transition-all duration-500",
                    isNew && "ring-2 ring-primary/50 bg-primary/5"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {msg.sender_name || "Unknown"}
                        </span>
                        <a
                          href={`tel:${msg.from_phone}`}
                          className="text-xs font-mono text-muted-foreground/70 hover:text-foreground hover:underline transition-colors"
                        >
                          {maskPhone(msg.from_phone)}
                        </a>
                        <a
                          href={`sms:${msg.from_phone}`}
                          className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground transition-colors"
                          aria-label="Reply via SMS"
                        >
                          <MessageSquareText className="h-3 w-3" />
                        </a>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {msg.category.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-sm mt-1">{msg.message_text}</p>

                      {/* Paired reply */}
                      {reply && (
                        <div className="mt-2 pl-3 border-l-2 border-primary/30">
                          <p className="text-xs text-muted-foreground font-mono mb-0.5">TELA replied:</p>
                          <p className="text-xs text-muted-foreground line-clamp-3">{reply.message_text}</p>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap shrink-0">
                      {timeAgo(msg.created_at)}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default TourTextInbox;
