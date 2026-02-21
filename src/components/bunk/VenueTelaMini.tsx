import { useState, useRef, useCallback } from "react";
import { Send, Loader2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { parseTelaActions } from "@/hooks/useTelaActions";
import TelaActionCard from "@/components/bunk/TelaActionCard";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };

const AKB_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/akb-chat`;

const QUICK_PROMPTS = [
  "What's the full venue rundown?",
  "Who are my venue contacts?",
  "Any risks or flags here?",
];

interface VenueTelaMiniProps {
  tourId: string;
  venueName: string;
  eventDate: string;
  city?: string;
}

const VenueTelaMini = ({ tourId, venueName, eventDate, city }: VenueTelaMiniProps) => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const contextPrefix = `[Context: Venue "${venueName}", ${city || ""}, Date ${eventDate}] `;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const apiMsg: Msg = { role: "user", content: contextPrefix + text.trim() };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);
    scrollToBottom();

    let assistantSoFar = "";

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resp = await fetch(AKB_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [...messages.map((m, i) => i === messages.length ? apiMsg : m), apiMsg],
          tour_id: tourId,
        }),
      });

      if (!resp.ok || !resp.body) throw new Error("Stream failed");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
              scrollToBottom();
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error("[VenueTela]", err);
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't connect. Try again." }]);
    } finally {
      setIsStreaming(false);
    }
  }, [messages, isStreaming, tourId, venueName, eventDate, city]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/10">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-mono font-semibold tracking-wider text-primary uppercase">Ask TELA about this venue</span>
      </div>

      {/* Messages */}
      {messages.length > 0 && (
        <div ref={scrollRef} className="max-h-52 overflow-y-auto px-3 py-2 space-y-2">
          {messages.map((m, i) => {
            if (m.role === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="bg-primary text-primary-foreground rounded-xl rounded-br-sm px-3 py-1.5 text-xs max-w-[85%]">
                    {m.content}
                  </div>
                </div>
              );
            }
            const { cleanText, actions } = parseTelaActions(m.content);
            return (
              <div key={i} className="flex justify-start">
                <div className="bg-muted rounded-xl rounded-bl-sm px-3 py-1.5 text-xs max-w-[95%] prose prose-xs prose-invert">
                  <ReactMarkdown>{cleanText}</ReactMarkdown>
                  {actions.map((a, j) => <TelaActionCard key={j} action={a} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick prompts when empty */}
      {messages.length === 0 && (
        <div className="px-3 py-2 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              className="text-[10px] font-mono px-2.5 py-1.5 rounded-full border border-primary/20 text-primary hover:bg-primary/10 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-primary/10">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this venue..."
          disabled={isStreaming}
          className="flex-1 bg-transparent text-xs placeholder:text-muted-foreground outline-none"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isStreaming}
          className="text-primary disabled:opacity-30 transition-opacity"
        >
          {isStreaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
};

export default VenueTelaMini;
