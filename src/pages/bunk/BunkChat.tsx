import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Send, Loader2, Zap, Globe, Target } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useTour } from "@/hooks/useTour";
import ReactMarkdown from "react-markdown";
import { parseTelaActions } from "@/hooks/useTelaActions";
import TelaActionCard from "@/components/bunk/TelaActionCard";
import TelaSuggestionChips from "@/components/bunk/TelaSuggestionChips";
import MessageActions from "@/components/bunk/MessageActions";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };

const AKB_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/akb-chat`;

const BunkChat = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tours, selectedTourId, selectedTour } = useTour();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasAutoSent = useRef(false);

  // Determine scope: ?scope=tour locks to selectedTourId, otherwise global
  const scopeParam = searchParams.get("scope");
  const isScoped = scopeParam === "tour" && !!selectedTourId;
  const scopedTourName = isScoped ? selectedTour?.name : null;

  // Get the tour IDs to send to the edge function
  const getPayloadTourIds = useCallback(() => {
    if (isScoped && selectedTourId) {
      return { tour_id: selectedTourId };
    }
    // Global mode: send all active tour IDs
    const allIds = tours.map((t) => t.id);
    if (allIds.length === 1) {
      return { tour_id: allIds[0] };
    }
    return { tour_ids: allIds };
  }, [isScoped, selectedTourId, tours]);

  const hasTours = tours.length > 0;

  // Auto-send if launched with ?q= query from TLDR
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && hasTours && !hasAutoSent.current && messages.length === 0) {
      hasAutoSent.current = true;
      // Clear the q param but keep scope
      const newParams: Record<string, string> = {};
      if (scopeParam) newParams.scope = scopeParam;
      setSearchParams(newParams, { replace: true });
      sendMessage(`I need help with this issue from my daily briefing: "${q}". What does the tour data show, and what should I do?`);
    }
  }, [searchParams, hasTours]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !hasTours || isStreaming) return;

    const userMsg: Msg = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);

    let assistantSoFar = "";
    const allMessages = [...messages, userMsg];

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
          messages: allMessages.map(m => ({ role: m.role, content: m.content })),
          ...getPayloadTourIds(),
        }),
      });

      if (!resp.ok || !resp.body) {
        const errData = await resp.json().catch(() => ({ error: "Unknown error" }));
        setMessages(prev => [...prev, { role: "assistant", content: `⚠ ${errData.error || "Failed to connect to AKB."}` }]);
        setIsStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.error("[chat] stream error:", err);
      setMessages(prev => [...prev, { role: "assistant", content: "⚠ Connection error. Please try again." }]);
    }

    setIsStreaming(false);
  }, [messages, hasTours, isStreaming, getPayloadTourIds]);

  const handleSubmit = () => {
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + "px";
    }
  }, [input]);

  return (
    <div className="flex flex-col h-[calc(100dvh-2.5rem)] md:h-[calc(100vh-3rem)] -m-3 sm:-m-6">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 md:px-4 h-10 md:h-11 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={() => navigate("/bunk")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm md:text-base font-semibold text-foreground tracking-tight">
              TELA
            </span>
          </div>
          {/* Scope badge */}
          {hasTours && (
            <div className={`flex items-center gap-1 md:gap-1.5 px-2 md:px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider uppercase ${
              isScoped
                ? "bg-primary/10 text-primary border border-primary/20"
                : "bg-muted text-muted-foreground border border-border"
            }`}>
              {isScoped ? (
                <>
                  <Target className="h-3 w-3" />
                  <span className="hidden sm:inline">{scopedTourName || "Tour"}</span>
                </>
              ) : (
                <>
                  <Globe className="h-3 w-3" />
                  <span className="hidden sm:inline">All Tours</span>
                </>
              )}
            </div>
          )}
        </div>
        <SidebarTrigger className="text-muted-foreground" />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 md:px-8 py-6">
        <div className="max-w-2xl md:max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center pt-16 text-center">
             <Zap className="h-10 w-10 text-primary/30 mb-4" />
               <h2 className="text-xl font-semibold text-foreground mb-1">
                TELA
               </h2>
               <p className="text-[15px] leading-relaxed text-muted-foreground max-w-md">
                 Tour Efficiency Liaison Assistant
              </p>
              <p className="text-xs text-muted-foreground/60 mt-2 font-mono">
                {isScoped
                  ? `Locked to: ${scopedTourName || "selected tour"}`
                  : `Searching across ${tours.length} Tour AKB${tours.length !== 1 ? "s" : ""}`}
              </p>
              {!hasTours && (
                <p className="text-sm text-destructive mt-3 font-mono">
                  No active tour found. Create one first.
                </p>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-card border border-border rounded-bl-md"
                }`}
              >
                {msg.role === "assistant" ? (
                  (() => {
                    const { cleanText, actions } = parseTelaActions(msg.content);
                    const isLatestAssistant = !isStreaming && i === messages.length - 1;
                    return (
                      <>
                        <div className="prose prose-sm md:prose-base prose-invert max-w-none text-[14px] md:text-[15px] leading-relaxed md:leading-7 [&_p]:mb-2 md:[&_p]:mb-3 [&_li]:mb-1 md:[&_li]:mb-2 [&_strong]:text-foreground [&_a]:text-primary [&_a]:underline">
                          <ReactMarkdown
                            components={{
                              a: ({ href, children }) => (
                                <a href={href} target="_blank" rel="noopener noreferrer">
                                  {children}
                                </a>
                              ),
                            }}
                          >{cleanText}</ReactMarkdown>
                        </div>
                        {actions.map((action, ai) => (
                          <TelaActionCard key={ai} action={action} />
                        ))}
                        <TelaSuggestionChips
                          content={cleanText}
                          onFollowUp={sendMessage}
                          isLatest={isLatestAssistant}
                        />
                      </>
                    );
                  })()
                ) : (
                  <p className="text-[14px] md:text-[15px] leading-relaxed md:leading-7">{msg.content}</p>
                )}
                <MessageActions content={msg.content} role={msg.role} />
              </div>
            </div>
          ))}

          {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex justify-start">
              <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-border bg-background px-3 md:px-4 py-2 md:py-3 pb-safe">
        <div className="max-w-2xl md:max-w-3xl mx-auto">
          <div className="flex items-end gap-2 bg-card rounded-2xl border border-border px-3 py-2 md:px-4 md:py-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasTours ? "Ask TELA..." : "No active tour"}
              disabled={!hasTours || isStreaming}
              rows={1}
              className="flex-1 bg-transparent text-[15px] md:text-base text-foreground placeholder:text-muted-foreground/50 resize-none outline-none py-1.5 min-h-[28px] max-h-32 leading-snug disabled:opacity-50"
              style={{ fontFamily: "var(--font-display)" }}
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || !hasTours || isStreaming}
              className={`shrink-0 h-9 w-9 md:h-8 md:w-8 flex items-center justify-center rounded-full transition-colors ${
                input.trim() && hasTours && !isStreaming
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BunkChat;
