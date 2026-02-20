import { useState } from "react";
import { Copy, Check, Share2, Mail, MessageSquare, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface MessageActionsProps {
  content: string;
  role: "user" | "assistant";
}

const MessageActions = ({ content, role }: MessageActionsProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleEmail = () => {
    const subject = encodeURIComponent("From TELA");
    const body = encodeURIComponent(content);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  const handleSMS = () => {
    const body = encodeURIComponent(content);
    // sms: with body works on iOS & Android
    window.open(`sms:?body=${body}`, "_blank");
  };

  const handleBunkChat = () => {
    // Copy to clipboard with a note that it's for internal sharing
    navigator.clipboard.writeText(content).then(() => {
      toast.success("Copied — paste into your tour group chat");
    }).catch(() => {
      toast.error("Failed to copy");
    });
  };

  const isUser = role === "user";
  const iconColor = isUser ? "text-primary-foreground/60 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground";

  return (
    <div className={`flex items-center gap-0.5 mt-1.5 ${isUser ? "justify-end" : "justify-start"}`}>
      {/* Copy */}
      <button
        onClick={handleCopy}
        className={`p-1 rounded transition-colors ${iconColor}`}
        aria-label="Copy message"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>

      {/* Share dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`p-1 rounded transition-colors ${iconColor}`}
            aria-label="Share message"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isUser ? "end" : "start"} className="min-w-[180px]">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Send via</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleEmail} className="gap-2">
            <Mail className="h-4 w-4" />
            Email
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleSMS} className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Text Message
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleBunkChat} className="gap-2">
            <Users className="h-4 w-4" />
            Tour Staff
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default MessageActions;
