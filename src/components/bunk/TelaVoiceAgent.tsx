import { useState, useCallback, useEffect } from "react";
import { Mic, MicOff, Phone, Loader2 } from "lucide-react";
import { useConversation } from "@elevenlabs/react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface TelaVoiceAgentProps {
  agentId: string;
  tourId?: string;
  onTranscript?: (role: "user" | "assistant", text: string) => void;
}

type VoiceStatus = "idle" | "connecting" | "connected" | "error";

const TelaVoiceAgent = ({ agentId, tourId, onTranscript }: TelaVoiceAgentProps) => {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [micGranted, setMicGranted] = useState<boolean | null>(null);

  const conversation = useConversation({
    onConnect: () => {
      console.log("[voice] Connected to TELA voice agent");
      setStatus("connected");
    },
    onDisconnect: () => {
      console.log("[voice] Disconnected from TELA voice agent");
      setStatus("idle");
    },
    onError: (error) => {
      console.error("[voice] Error:", error);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    },
    onMessage: (message) => {
      if (!onTranscript) return;
      // MessagePayload has { message, role }
      if (message.role === "user") {
        onTranscript("user", message.message);
      } else if (message.role === "agent") {
        onTranscript("assistant", message.message);
      }
    },
  });

  const startConversation = useCallback(async () => {
    if (status === "connecting" || status === "connected") return;
    setStatus("connecting");

    try {
      // Request mic permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicGranted(true);

      // Get conversation token from our edge function
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        console.error("[voice] No auth token");
        setStatus("error");
        return;
      }

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-conversation-token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ agent_id: agentId, ...(tourId ? { tour_id: tourId } : {}) }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        console.error("[voice] Token error:", err);
        setStatus("error");
        return;
      }

      const { token: conversationToken, system_prompt: systemPrompt } = await resp.json();
      if (!conversationToken) {
        console.error("[voice] No conversation token received");
        setStatus("error");
        return;
      }

      const sessionOpts: any = {
        conversationToken,
        connectionType: "webrtc",
      };

      // Apply AKB context as conversation override if available
      if (systemPrompt) {
        sessionOpts.overrides = {
          agent: {
            prompt: { prompt: systemPrompt },
          },
        };
      }

      await conversation.startSession(sessionOpts);
    } catch (err) {
      console.error("[voice] Failed to start:", err);
      if ((err as any)?.name === "NotAllowedError") {
        setMicGranted(false);
      }
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }, [conversation, agentId, tourId, status]);

  const endConversation = useCallback(async () => {
    await conversation.endSession();
    setStatus("idle");
  }, [conversation]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (conversation.status === "connected") {
        conversation.endSession();
      }
    };
  }, []);

  const isActive = status === "connected";
  const isSpeaking = conversation.isSpeaking;

  if (status === "idle" || status === "error") {
    return (
      <button
        onClick={startConversation}
        className={cn(
          "relative flex items-center justify-center h-8 w-8 md:h-7 md:w-7 rounded-full transition-all",
          status === "error"
            ? "bg-destructive/10 text-destructive"
            : "bg-primary/10 text-primary hover:bg-primary/20"
        )}
        title={
          micGranted === false
            ? "Microphone access denied. Enable it in browser settings."
            : "Talk to TELA"
        }
      >
        <Mic className="h-4 w-4" />
      </button>
    );
  }

  if (status === "connecting") {
    return (
      <button
        disabled
        className="flex items-center justify-center h-8 w-8 md:h-7 md:w-7 rounded-full bg-primary/10 text-primary"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </button>
    );
  }

  // Connected state
  return (
    <button
      onClick={endConversation}
      className={cn(
        "relative flex items-center gap-1.5 h-8 md:h-7 px-3 rounded-full transition-all",
        isSpeaking
          ? "bg-primary text-primary-foreground"
          : "bg-primary/20 text-primary"
      )}
      title="End voice session"
    >
      {/* Pulsing indicator when TELA is speaking */}
      {isSpeaking && (
        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5">
          <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-75" />
          <span className="relative block h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
      )}

      <MicOff className="h-3.5 w-3.5" />
      <span className="text-[10px] font-mono tracking-wider uppercase hidden sm:inline">
        {isSpeaking ? "Speaking" : "Listening"}
      </span>
      <Phone className="h-3 w-3 rotate-[135deg]" />
    </button>
  );
};

export default TelaVoiceAgent;
