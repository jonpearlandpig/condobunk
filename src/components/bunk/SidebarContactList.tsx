import { Phone, Mail, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { SidebarContact } from "@/hooks/useSidebarContacts";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

interface SidebarContactListProps {
  contacts: SidebarContact[];
  onNavigate?: () => void;
}

const SidebarContactList = ({ contacts, onNavigate }: SidebarContactListProps) => {
  const navigate = useNavigate();

  const handleChat = (contact: SidebarContact) => {
    const q = `What do we have on file for ${contact.name}${contact.role ? ` (${contact.role})` : ""}?`;
    navigate(`/bunk/chat?q=${encodeURIComponent(q)}`);
    onNavigate?.();
  };

  if (contacts.length === 0) {
    return (
      <p className="px-4 py-1.5 text-xs text-muted-foreground/50 italic">
        None available
      </p>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-0.5">
        {contacts.map((c) => (
          <div
            key={c.id}
            className="group flex items-center justify-between px-4 py-1.5 hover:bg-sidebar-accent/50 rounded-md transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-sidebar-foreground truncate leading-tight">
                {c.name}
              </p>
              {c.role && (
                <p className="text-[10px] font-mono text-muted-foreground/60 truncate leading-tight">
                  {c.role}
                </p>
              )}
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleChat(c)}
                    className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
                    aria-label="Ask TELA"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Ask TELA</TooltipContent>
              </Tooltip>

              {c.phone && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={`tel:${c.phone}`}
                      className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
                      aria-label="Call"
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">{c.phone}</TooltipContent>
                </Tooltip>
              )}

              {c.email && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={`mailto:${c.email}`}
                      className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
                      aria-label="Email"
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">{c.email}</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
};

export default SidebarContactList;
