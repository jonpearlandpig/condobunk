import { useState } from "react";
import { Phone, Mail, MessageSquare, Pencil, Check, X, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { SidebarContact } from "@/hooks/useSidebarContacts";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

interface SidebarContactListProps {
  contacts: SidebarContact[];
  onNavigate?: () => void;
  onUpdate?: (id: string, updates: Partial<Pick<SidebarContact, "name" | "role" | "phone" | "email">>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

const SidebarContactList = ({ contacts, onNavigate, onUpdate, onDelete }: SidebarContactListProps) => {
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "", phone: "", email: "" });

  const handleChat = (contact: SidebarContact) => {
    const q = `What do we have on file for ${contact.name}${contact.role ? ` (${contact.role})` : ""}?`;
    navigate(`/bunk/chat?q=${encodeURIComponent(q)}`);
    onNavigate?.();
  };

  const startEdit = (c: SidebarContact) => {
    setEditingId(c.id);
    setEditForm({
      name: c.name,
      role: c.role || "",
      phone: c.phone || "",
      email: c.email || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async () => {
    if (!editingId || !onUpdate) return;
    try {
      await onUpdate(editingId, {
        name: editForm.name,
        role: editForm.role || null,
        phone: editForm.phone || null,
        email: editForm.email || null,
      });
      toast.success("Contact updated");
      setEditingId(null);
    } catch {
      toast.error("Failed to update contact");
    }
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
        {contacts.map((c) =>
          editingId === c.id ? (
            <div key={c.id} className="px-3 py-2 space-y-1.5 bg-sidebar-accent/30 rounded-md mx-1">
              <input
                value={editForm.name}
                onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Name"
                className="w-full bg-background/80 border border-border rounded px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
                autoFocus
              />
              <input
                value={editForm.role}
                onChange={(e) => setEditForm(p => ({ ...p, role: e.target.value }))}
                placeholder="Role"
                className="w-full bg-background/80 border border-border rounded px-2 py-1 text-xs text-foreground outline-none focus:border-primary font-mono"
              />
              <input
                value={editForm.phone}
                onChange={(e) => setEditForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="Phone"
                className="w-full bg-background/80 border border-border rounded px-2 py-1 text-xs text-foreground outline-none focus:border-primary font-mono"
              />
              <input
                value={editForm.email}
                onChange={(e) => setEditForm(p => ({ ...p, email: e.target.value }))}
                placeholder="Email"
                className="w-full bg-background/80 border border-border rounded px-2 py-1 text-xs text-foreground outline-none focus:border-primary font-mono"
              />
              <div className="flex items-center justify-between pt-0.5">
                {onDelete && (
                  <button
                    onClick={async () => {
                      try {
                        await onDelete(c.id);
                        toast.success("Contact deleted");
                        setEditingId(null);
                      } catch { toast.error("Failed to delete"); }
                    }}
                    className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <button
                    onClick={cancelEdit}
                    className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={!editForm.name.trim()}
                    className="p-1 rounded text-muted-foreground hover:text-primary transition-colors disabled:opacity-30"
                    aria-label="Save"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
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
                {onUpdate && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => startEdit(c)}
                        className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Edit</TooltipContent>
                  </Tooltip>
                )}
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
          )
        )}
      </div>
    </TooltipProvider>
  );
};

export default SidebarContactList;
