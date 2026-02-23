import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Send, X } from "lucide-react";
import type { SidebarContact } from "@/hooks/useSidebarContacts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DMChatScreenProps {
  contact: SidebarContact;
  tourId: string;
  userId: string;
  isContactOnline: boolean;
  onClose: () => void;
}

const DMChatScreen = ({ contact, tourId, userId, isContactOnline, onClose }: DMChatScreenProps) => {
  const [messages, setMessages] = useState<Array<{ id: string; sender_id: string; message_text: string; created_at: string }>>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Load messages + subscribe
  useEffect(() => {
    if (!contact.appUserId) return;
    const recipientUserId = contact.appUserId;

    const loadAndMarkRead = async () => {
      const { data } = await supabase
        .from("direct_messages")
        .select("id, sender_id, message_text, created_at")
        .eq("tour_id", tourId)
        .or(`and(sender_id.eq.${userId},recipient_id.eq.${recipientUserId}),and(sender_id.eq.${recipientUserId},recipient_id.eq.${userId})`)
        .order("created_at", { ascending: true })
        .limit(100);
      setMessages(data || []);

      // Mark as read
      await supabase
        .from("direct_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("sender_id", recipientUserId)
        .eq("recipient_id", userId)
        .is("read_at", null);
    };
    loadAndMarkRead();

    const channel = supabase
      .channel(`dm-fullscreen-${contact.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `tour_id=eq.${tourId}` },
        (payload) => {
          const msg = payload.new as any;
          if (
            (msg.sender_id === userId && msg.recipient_id === recipientUserId) ||
            (msg.sender_id === recipientUserId && msg.recipient_id === userId)
          ) {
            setMessages(prev => [...prev, msg]);
            // Auto-mark incoming as read
            if (msg.sender_id === recipientUserId) {
              supabase
                .from("direct_messages")
                .update({ read_at: new Date().toISOString() })
                .eq("id", msg.id)
                .then(() => {});
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [contact, tourId, userId]);

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !contact.appUserId) return;
    if (!isContactOnline) {
      toast.info(`${contact.name} left their Condo Bunk`, { description: "Message not sent. Try SMS instead.", duration: 3000 });
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from("direct_messages").insert({
        tour_id: tourId,
        sender_id: userId,
        recipient_id: contact.appUserId,
        message_text: input.trim(),
      });
      if (error) throw error;
      setInput("");
    } catch (err: any) {
      toast.error("Failed to send: " + err.message);
    }
    setSending(false);
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={onClose} className="p-1 -ml-1 rounded-md hover:bg-accent transition-colors" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{contact.name}</p>
            <span className={`h-2 w-2 rounded-full shrink-0 ${isContactOnline ? "bg-success" : "bg-muted-foreground/30"}`} />
          </div>
          {contact.role && <p className="text-[10px] font-mono text-muted-foreground/60 truncate">{contact.role}</p>}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground/50 italic text-center py-8">No messages yet — say hello!</p>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_id === userId;
          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
                isMe
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted text-foreground rounded-bl-md"
              }`}>
                <p>{msg.message_text}</p>
                <p className={`text-[9px] mt-0.5 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground/50"}`}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-border bg-card px-4 py-3" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}>
        <div className="flex items-center gap-2 bg-muted/50 rounded-full px-4 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Message..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
            autoFocus
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="p-1.5 rounded-full bg-primary text-primary-foreground disabled:opacity-30 transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DMChatScreen;
