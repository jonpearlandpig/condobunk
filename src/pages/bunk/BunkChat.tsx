import { useState } from "react";
import { MessageSquare, ArrowLeft, Plus, Mic, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";

const BunkChat = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] -m-6">
      {/* ChatGPT-style top bar */}
      <div className="flex items-center justify-between px-4 h-11 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/bunk")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-base font-semibold text-foreground tracking-tight">
            Condo Bunk Chat
          </span>
        </div>
        <SidebarTrigger className="text-muted-foreground" />
      </div>

      {/* Message area */}
      <div className="flex-1 overflow-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Empty state */}
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-1">
              Internal Chat
            </h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground max-w-md">
              Management-only communications. Messages here are visible to all tour managers and admins.
            </p>
            <p className="text-sm text-muted-foreground/60 mt-4 font-mono">
              Coming in Phase 2
            </p>
          </div>
        </div>
      </div>

      {/* ChatGPT-style input bar */}
      <div className="shrink-0 border-t border-border bg-background px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-2 bg-card rounded-2xl border border-border px-3 py-2">
            <button className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="h-4 w-4" />
            </button>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message Condo Bunk"
              rows={1}
              className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/50 resize-none outline-none py-1.5 min-h-[28px] max-h-32 leading-snug"
              style={{ fontFamily: "var(--font-display)" }}
            />
            <button className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors">
              <Mic className="h-4 w-4" />
            </button>
            <button
              className={`shrink-0 h-8 w-8 flex items-center justify-center rounded-full transition-colors ${
                message.trim()
                  ? "bg-foreground text-background"
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
