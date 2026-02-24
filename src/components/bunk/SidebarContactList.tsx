import { useState, useEffect, useRef } from "react";
import { Phone, Mail, MessageSquare, Pencil, Check, X, Trash2, MessageCircle, Send, ChevronRight, UserPlus, UserMinus, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import type { SidebarContact, VenueGroup } from "@/hooks/useSidebarContacts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import { supabase } from "@/integrations/supabase/client";
import { getInviteUrl } from "@/lib/invite-url";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ActiveInvite {
  email: string;
  token: string;
}

interface SidebarContactListProps {
  contacts: SidebarContact[];
  onNavigate?: () => void;
  onUpdate?: (id: string, updates: Partial<Pick<SidebarContact, "name" | "role" | "phone" | "email">>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onlineUserIds?: Set<string>;
  /** Returns unread DM count from a given appUserId */
  unreadFrom?: (userId: string | undefined) => number;
  /** When true, contacts are grouped by venue name with quick-access actions always visible */
  grouped?: boolean;
  /** Pre-built venue groups with calendar ordering + city info */
  venueGroups?: VenueGroup[];
  /** Active invites for this tour (to check for existing ones) */
  activeInvites?: ActiveInvite[];
  /** Callback after an invite is created */
  onInviteCreated?: () => void;
  /** Override mobile tap behavior for DM (used by messaging drawer) */
  onContactTap?: (contact: SidebarContact) => void;
  /** Whether current user is the tour owner */
  isOwner?: boolean;
  /** Callback to remove a member from the tour (owner only) */
  onRemoveMember?: (contact: SidebarContact) => Promise<void>;
  /** Callback to explicitly refetch unread DM counts */
  onUnreadRefetch?: () => void;
  /** When true, hide PII (phone/email) and disable all outbound actions */
  isDemoMode?: boolean;
}

const SidebarContactList = ({ contacts, onNavigate, onUpdate, onDelete, onlineUserIds, unreadFrom, grouped, venueGroups, activeInvites, onInviteCreated, onContactTap, isOwner, onRemoveMember, onUnreadRefetch, isDemoMode }: SidebarContactListProps) => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { tours } = useTour();
  const tourId = tours[0]?.id;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedVenues, setExpandedVenues] = useState<Set<string>>(new Set());
  const [editForm, setEditForm] = useState({ name: "", role: "", phone: "", email: "" });
  const [chattingWith, setChattingWith] = useState<string | null>(null); // contact id
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; sender_id: string; message_text: string; created_at: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [removingContact, setRemovingContact] = useState<SidebarContact | null>(null);
  const handleChat = (contact: SidebarContact) => {
    const q = `What do we have on file for ${contact.name}${contact.role ? ` (${contact.role})` : ""}?`;
    navigate(`/bunk/chat?scope=tour&q=${encodeURIComponent(q)}`);
    onNavigate?.();
  };

  const isContactOnline = (c: SidebarContact) => {
    return c.appUserId && onlineUserIds?.has(c.appUserId);
  };

  const handleMessage = (c: SidebarContact) => {
    // Block all outbound messaging in demo mode
    if (isDemoMode) return;

    // If parent provides a tap handler (e.g. messaging drawer), delegate to it
    if (onContactTap) {
      onContactTap(c);
      return;
    }
    if (isContactOnline(c)) {
      setExpandedId(null);
      setChattingWith(c.id);
      // Mark messages as read
      if (c.appUserId && user) {
        supabase
          .from("direct_messages")
          .update({ read_at: new Date().toISOString() })
          .eq("sender_id", c.appUserId)
          .eq("recipient_id", user.id)
          .is("read_at", null)
          .then(() => { onUnreadRefetch?.(); });
      }
    } else if (c.appUserId) {
      // Has an app account but is offline — block bunk chat
      toast.info(`${c.name} isn't in their Condo Bunk right now`, {
        description: c.phone ? "Sending via SMS instead…" : "No phone number on file to fall back to.",
        duration: 3000,
      });
      if (c.phone) {
        setTimeout(() => window.open(`sms:${c.phone}`, "_self"), 600);
      }
    } else if (c.phone) {
      // No app account, fall back to native SMS
      window.open(`sms:${c.phone}`, "_self");
    } else {
      toast.info("No phone number available for this contact");
    }
  };

  // Load DM history when chat opens
  useEffect(() => {
    if (!chattingWith || !user || !tourId) return;
    const contact = contacts.find(c => c.id === chattingWith);
    if (!contact?.appUserId) return;

    const recipientUserId = contact.appUserId;

    const loadMessages = async () => {
      const { data } = await supabase
        .from("direct_messages")
        .select("id, sender_id, message_text, created_at")
        .eq("tour_id", tourId)
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${recipientUserId}),and(sender_id.eq.${recipientUserId},recipient_id.eq.${user.id})`)
        .order("created_at", { ascending: true })
        .limit(50);
      setChatMessages(data || []);
    };
    loadMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`dm-${chattingWith}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `tour_id=eq.${tourId}`,
        },
        (payload) => {
          const msg = payload.new as any;
          if (
            (msg.sender_id === user.id && msg.recipient_id === recipientUserId) ||
            (msg.sender_id === recipientUserId && msg.recipient_id === user.id)
          ) {
            setChatMessages(prev => [...prev, msg]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chattingWith, user, tourId, contacts]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendMessage = async (contact: SidebarContact) => {
    if (!chatInput.trim() || !user || !tourId || !contact.appUserId) return;
    // Block sending if recipient went offline while chat was open
    if (!isContactOnline(contact)) {
      toast.info(`${contact.name} left their Condo Bunk`, {
        description: "Message not sent. Try SMS instead.",
        duration: 3000,
      });
      setChattingWith(null);
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from("direct_messages").insert({
        tour_id: tourId,
        sender_id: user.id,
        recipient_id: contact.appUserId,
        message_text: chatInput.trim(),
      });
      if (error) throw error;
      setChatInput("");
    } catch (err: any) {
      toast.error("Failed to send: " + err.message);
    }
    setSending(false);
  };

  const handleInviteContact = async (c: SidebarContact) => {
    if (!c.email || !tourId || !user) return;
    const existingInvite = activeInvites?.find(i => i.email.toLowerCase() === c.email!.toLowerCase());
    if (existingInvite) {
      const url = getInviteUrl(existingInvite.token);
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied!", { description: `${c.name} already has a pending invite` });
      return;
    }
    try {
      const tourName = tours.find(t => t.id === tourId)?.name || "";
      const mappedRole = (c.role?.toUpperCase()?.includes("TA") || c.role?.toUpperCase()?.includes("TOUR ACCOUNT"))
        ? "TA" as const
        : (c.role?.toUpperCase()?.includes("MGMT") || c.role?.toUpperCase()?.includes("MANAGER"))
        ? "MGMT" as const
        : "CREW" as const;
      const { data, error } = await supabase
        .from("tour_invites")
        .insert({
          tour_id: tourId,
          email: c.email,
          role: mappedRole,
          created_by: user.id,
          tour_name: tourName,
        })
        .select("token")
        .single();
      if (error) throw error;
      const inviteUrl = getInviteUrl(data.token);
      await navigator.clipboard.writeText(inviteUrl);
      const subject = encodeURIComponent(`You're invited to ${tourName} on Condo Bunk`);
      const body = encodeURIComponent(`Hey ${c.name},\n\nYou've been invited to join ${tourName} on Condo Bunk.\n\nClick here to accept: ${inviteUrl}\n\nThis link expires in 7 days.`);
      window.open(`mailto:${c.email}?subject=${subject}&body=${body}`, "_self");
      toast.success("Invite sent — link copied!", { description: c.email });
      onInviteCreated?.();
      window.dispatchEvent(new Event("contacts-changed"));
    } catch (err: any) {
      toast.error("Failed to create invite", { description: err.message });
    }
  };

  const getExistingInvite = (c: SidebarContact) => {
    if (!c.email || !activeInvites) return null;
    return activeInvites.find(i => i.email.toLowerCase() === c.email!.toLowerCase()) || null;
  };

  const startEdit = (c: SidebarContact) => {
    setEditingId(c.id);
    setExpandedId(null);
    setChattingWith(null);
    setEditForm({ name: c.name, role: c.role || "", phone: c.phone || "", email: c.email || "" });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (!editingId || !onUpdate) return;
    // Enforce: if email is provided, name is required
    if (editForm.email && !editForm.name.trim()) {
      toast.error("A name is required when an email address is provided");
      return;
    }
    try {
      await onUpdate(editingId, {
        name: editForm.name,
        role: editForm.role || null,
        phone: editForm.phone || null,
        email: editForm.email || null,
      });
      toast.success("Contact updated");
      setEditingId(null);
    } catch { toast.error("Failed to update contact"); }
  };

  if (contacts.length === 0) {
    return <p className="px-4 py-1.5 text-xs text-muted-foreground/50 italic">None available</p>;
  }

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
    setChattingWith(null);
    onUnreadRefetch?.();
  };

  // Sort: online first, then offline, then no app user
  const sorted = [...contacts].sort((a, b) => {
    const aOnline = a.appUserId && onlineUserIds?.has(a.appUserId) ? 0 : a.appUserId ? 1 : 2;
    const bOnline = b.appUserId && onlineUserIds?.has(b.appUserId) ? 0 : b.appUserId ? 1 : 2;
    return aOnline - bOnline;
  });

  // Build a contact row renderer (shared between grouped and flat modes)
  const renderContact = (c: SidebarContact, showQuickActions: boolean) => {
    if (editingId === c.id) {
      return (
        <div key={c.id} className="px-3 py-2 space-y-1.5 bg-sidebar-accent/30 rounded-md mx-1">
          <input value={editForm.name} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} placeholder="Name" className="w-full bg-background/80 border border-border rounded px-2 py-1 text-sm text-foreground outline-none focus:border-primary" autoFocus />
          <input value={editForm.role} onChange={(e) => setEditForm(p => ({ ...p, role: e.target.value }))} placeholder="Role" className="w-full bg-background/80 border border-border rounded px-2 py-1 text-xs text-foreground outline-none focus:border-primary font-mono" />
          <input value={editForm.phone} onChange={(e) => setEditForm(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className="w-full bg-background/80 border border-border rounded px-2 py-1 text-xs text-foreground outline-none focus:border-primary font-mono" />
          <input value={editForm.email} onChange={(e) => setEditForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" className="w-full bg-background/80 border border-border rounded px-2 py-1 text-xs text-foreground outline-none focus:border-primary font-mono" />
          <div className="flex items-center justify-between pt-0.5">
            {onDelete && (
              <button onClick={async () => { try { await onDelete(c.id); toast.success("Contact deleted"); setEditingId(null); } catch { toast.error("Failed to delete"); } }} className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors" aria-label="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <div className="flex items-center gap-1">
              <button onClick={cancelEdit} className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors" aria-label="Cancel"><X className="h-3.5 w-3.5" /></button>
              <button onClick={saveEdit} disabled={!editForm.name.trim()} className="p-1 rounded text-muted-foreground hover:text-primary transition-colors disabled:opacity-30" aria-label="Save"><Check className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>
      );
    }

    const isMissingContact = !c.phone && !c.email;
    const telaFixQuery = isDemoMode ? "" : (isMissingContact
      ? showQuickActions
        ? `Find contact details for ${c.name}${c.role ? ` (${c.role})` : ""}${c.venue ? ` at ${c.venue}` : ""}. Check tech packs and advance documents for phone and email. If you find them, update the contact.`
        : `Find contact details for ${c.name}${c.role ? ` (${c.role})` : ""}. Check all tour documents for phone and email. If you find them, update the contact.`
      : "");

    return (
      <div key={c.id}>
        <div
          className="group flex items-center justify-between px-4 py-2 hover:bg-sidebar-accent/50 rounded-md transition-colors cursor-pointer"
          onClick={() => {
            if (isDemoMode) {
              // In demo mode, tapping expands on mobile but does nothing on desktop
              if (isMobile) toggleExpand(c.id);
              return;
            }
            if (isMobile) {
              toggleExpand(c.id);
            } else if (!isMissingContact) {
              handleMessage(c);
            }
          }}
        >
          <div className="min-w-0 flex-1 flex items-center gap-2">
            {c.appUserId && (
              <span className={`h-2 w-2 rounded-full shrink-0 ${isContactOnline(c) ? "bg-success" : "bg-muted-foreground/30"}`} />
            )}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm text-sidebar-foreground truncate leading-tight">{c.name}</p>
                  {(() => {
                    const count = unreadFrom?.(c.appUserId) || 0;
                    if (count === 0) return null;
                    return (
                      <span className="h-4 min-w-4 px-1 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold leading-none shrink-0 animate-in fade-in">
                        {count > 9 ? "9+" : count}
                      </span>
                    );
                  })()}
                  {!c.appUserId && c.email && getExistingInvite(c) && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[8px] font-mono tracking-wider border-primary/30 text-primary/70 shrink-0">
                      INVITED
                    </Badge>
                  )}
                </div>
              {c.role && <p className="text-[10px] font-mono text-muted-foreground/60 truncate leading-tight">{c.role}</p>}
              {!isDemoMode && isMissingContact && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/bunk/chat?scope=tour&q=${encodeURIComponent(telaFixQuery)}`);
                    onNavigate?.();
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-mono tracking-wider text-primary hover:text-primary/80 transition-colors mt-0.5"
                >
                  <MessageSquare className="h-2.5 w-2.5" />
                  ASK TELA FOR DETAILS
                </button>
              )}
            </div>
          </div>

          {/* Desktop actions — hidden in demo mode */}
          {!isMobile && !isDemoMode && !isMissingContact && (
            <>
              {/* Venue contacts: keep minimal inline icons (only 2, they fit) */}
              {showQuickActions ? (
                <div className="flex items-center gap-0.5 shrink-0 ml-2">
                  {c.phone && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a href={`sms:${c.phone}`} className="p-1 rounded text-muted-foreground hover:text-info transition-colors" aria-label="Text">
                          <MessageCircle className="h-3.5 w-3.5" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Text {c.phone}</TooltipContent>
                    </Tooltip>
                  )}
                  {c.email && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a href={`mailto:${c.email}`} className="p-1 rounded text-muted-foreground hover:text-warning transition-colors" aria-label="Email">
                          <Mail className="h-3.5 w-3.5" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">{c.email}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              ) : (
                /* Tour team contacts: single overflow menu */
                <div className={`shrink-0 ml-2 items-center ${openMenuId === c.id ? "flex" : "hidden group-hover:flex"}`}>
                  <DropdownMenu open={openMenuId === c.id} onOpenChange={(open) => setOpenMenuId(open ? c.id : null)} modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" aria-label="Actions" onClick={(e) => e.stopPropagation()}>
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[180px]">
                      {(c.appUserId || c.phone) && (
                        <DropdownMenuItem onClick={() => handleMessage(c)}>
                          <MessageCircle className="h-4 w-4 mr-2" />
                          {isContactOnline(c) ? "Bunk Chat" : "Text"}
                        </DropdownMenuItem>
                      )}
                      {onUpdate && (
                        <DropdownMenuItem onClick={() => startEdit(c)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      {!c.appUserId && c.email && (
                        <DropdownMenuItem onClick={() => handleInviteContact(c)}>
                          <UserPlus className="h-4 w-4 mr-2" />
                          {getExistingInvite(c) ? "Re-copy invite link" : "Invite to Condo Bunk"}
                        </DropdownMenuItem>
                      )}
                      {isOwner && c.appUserId && onRemoveMember && (
                        <DropdownMenuItem onClick={() => setRemovingContact(c)} className="text-destructive focus:text-destructive">
                          <UserMinus className="h-4 w-4 mr-2" />
                          Remove from tour
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleChat(c)}>
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Ask TELA
                      </DropdownMenuItem>
                      {c.phone && (
                        <DropdownMenuItem asChild>
                          <a href={`tel:${c.phone}`}>
                            <Phone className="h-4 w-4 mr-2" />
                            Call {c.phone}
                          </a>
                        </DropdownMenuItem>
                      )}
                      {c.email && (
                        <DropdownMenuItem asChild>
                          <a href={`mailto:${c.email}`}>
                            <Mail className="h-4 w-4 mr-2" />
                            Email
                          </a>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </>
          )}

          {/* Mobile: minimal indicators — tap to expand for actions */}
          {isMobile && !isDemoMode && (
            <div className="flex items-center gap-1 shrink-0 ml-2">
              {isMissingContact ? (
                <MessageSquare className="h-3 w-3 text-primary/60" />
              ) : (
                <>
                  {c.appUserId && (
                    <span className={`h-1.5 w-1.5 rounded-full ${isContactOnline(c) ? "bg-success" : "bg-muted-foreground/30"}`} />
                  )}
                  {c.phone && <Phone className="h-3 w-3 text-muted-foreground/40" />}
                  {c.email && <Mail className="h-3 w-3 text-muted-foreground/40" />}
                </>
              )}
            </div>
          )}
        </div>

        {/* Mobile: expanded action bar */}
        {isMobile && expandedId === c.id && !isDemoMode && (
          <div className="flex items-center gap-1 px-4 py-2 bg-sidebar-accent/30 rounded-b-md mx-1 mb-0.5">
            {!isMissingContact && (c.appUserId || c.phone) && (
              <button
                onClick={() => handleMessage(c)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-mono font-medium transition-colors ${
                  isContactOnline(c)
                    ? "bg-success/10 text-success active:bg-success/20"
                    : "bg-info/10 text-info active:bg-info/20"
                }`}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {isContactOnline(c) ? "BUNK" : "TEXT"}
              </button>
            )}
            <button
              onClick={() => {
                if (isMissingContact) {
                  navigate(`/bunk/chat?scope=tour&q=${encodeURIComponent(telaFixQuery)}`);
                  onNavigate?.();
                } else {
                  handleChat(c);
                }
                setExpandedId(null);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-primary/10 text-primary text-xs font-mono font-medium active:bg-primary/20 transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              TELA
            </button>
            {!isMissingContact && c.phone && (
              <a href={`tel:${c.phone}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-success/10 text-success text-xs font-mono font-medium active:bg-success/20 transition-colors">
                <Phone className="h-3.5 w-3.5" />
                CALL
              </a>
            )}
            {!isMissingContact && c.email && (
              <a href={`mailto:${c.email}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-warning/10 text-warning text-xs font-mono font-medium active:bg-warning/20 transition-colors">
                <Mail className="h-3.5 w-3.5" />
                EMAIL
              </a>
            )}
            {/* Invite button for non-user contacts with email */}
            {!c.appUserId && c.email && (
              <button
                onClick={(e) => { e.stopPropagation(); handleInviteContact(c); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-primary/10 text-primary text-xs font-mono font-medium active:bg-primary/20 transition-colors"
                aria-label="Invite to Condo Bunk"
              >
                <UserPlus className="h-3.5 w-3.5" />
                INVITE
              </button>
            )}
            {onUpdate && (
              <button onClick={() => startEdit(c)} className="p-2 rounded-md bg-muted/50 text-muted-foreground active:bg-muted transition-colors" aria-label="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {/* Remove from tour (owner only, app users only) */}
            {isOwner && c.appUserId && onRemoveMember && (
              <button
                onClick={(e) => { e.stopPropagation(); setRemovingContact(c); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-destructive/10 text-destructive text-xs font-mono font-medium active:bg-destructive/20 transition-colors"
                aria-label="Remove from tour"
              >
                <UserMinus className="h-3.5 w-3.5" />
                REMOVE
              </button>
            )}
          </div>
        )}
        {/* Mobile: demo mode expanded — only TELA button */}
        {isMobile && expandedId === c.id && isDemoMode && (
          <div className="flex items-center gap-1 px-4 py-2 bg-sidebar-accent/30 rounded-b-md mx-1 mb-0.5">
            <button
              onClick={() => {
                handleChat(c);
                setExpandedId(null);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-primary/10 text-primary text-xs font-mono font-medium active:bg-primary/20 transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              TELA
            </button>
          </div>
        )}

        {/* Inline Bunk Chat */}
        {!isDemoMode && chattingWith === c.id && c.appUserId && (
          <div className="mx-1 mb-1 rounded-md border border-border bg-background/80 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground tracking-wider">BUNK CHAT</span>
              <button onClick={() => { setChattingWith(null); onUnreadRefetch?.(); }} className="p-0.5 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
            </div>
            <div className="max-h-40 overflow-y-auto px-3 py-2 space-y-1.5">
              {chatMessages.length === 0 && (
                <p className="text-[10px] text-muted-foreground/50 italic text-center py-2">No messages yet</p>
              )}
              {chatMessages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] px-2.5 py-1.5 rounded-lg text-xs ${
                    msg.sender_id === user?.id
                      ? "bg-primary/15 text-foreground"
                      : "bg-muted text-foreground"
                  }`}>
                    {msg.message_text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-border">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(c); } }}
                placeholder="Message..."
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/40"
                autoFocus
              />
              <button
                onClick={() => sendMessage(c)}
                disabled={!chatInput.trim() || sending}
                className="p-1 text-primary hover:text-primary/80 disabled:opacity-30 transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const confirmDialog = (
    <AlertDialog open={!!removingContact} onOpenChange={(open) => { if (!open) setRemovingContact(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {removingContact?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will immediately revoke their access to this tour, remove them from the AKB, and cancel any pending invites. They will need a new invite to rejoin.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (removingContact && onRemoveMember) {
                onRemoveMember(removingContact);
              }
              setRemovingContact(null);
            }}
          >
            Remove from Tour
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (grouped && venueGroups) {
    const toggleVenue = (venue: string) => {
      setExpandedVenues(prev => {
        const next = new Set(prev);
        if (next.has(venue)) next.delete(venue);
        else next.add(venue);
        return next;
      });
    };

    const formatDate = (d: string) => {
      const date = new Date(d + "T00:00:00");
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    };

    return (
      <TooltipProvider delayDuration={300}>
        <div className="space-y-0.5">
          {venueGroups.map((group) => {
            const isExpanded = expandedVenues.has(group.venue);
            const hasContacts = group.contacts.length > 0;

            return (
              <div key={group.venue}>
                <button
                  onClick={() => toggleVenue(group.venue)}
                  className="w-full flex items-center gap-2 px-4 py-2 hover:bg-sidebar-accent/50 rounded-md transition-colors text-left group"
                >
                  <ChevronRight className={`h-3 w-3 text-muted-foreground/50 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-sidebar-foreground truncate leading-tight">
                      {group.venue}
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground/50 truncate leading-tight">
                      {group.city || "Location TBD"} · {formatDate(group.earliestDate)}
                    </p>
                  </div>
                  {!hasContacts && (
                    <span className="text-[9px] font-mono tracking-wider text-warning/70 shrink-0">NO CONTACTS</span>
                  )}
                  {hasContacts && (
                    <span className="text-[10px] font-mono text-muted-foreground/40 shrink-0">{group.contacts.length}</span>
                  )}
                </button>

                {isExpanded && (
                  <div className="ml-2 border-l border-border/30 pl-1">
                    {hasContacts ? (
                      <div className="space-y-0.5">
                        {group.contacts.map((c) => renderContact(c, true))}
                      </div>
                    ) : (
                      <div className="px-4 py-2.5 space-y-1.5">
                        <p className="text-[10px] text-muted-foreground/50 italic">
                          No venue contacts in AKB for {group.venue}
                        </p>
                        <button
                          onClick={() => {
                            const q = `We need venue contacts for ${group.venue}${group.city ? ` in ${group.city}` : ""}. What do we need to cover?`;
                            navigate(`/bunk/chat?scope=tour&q=${encodeURIComponent(q)}`);
                            onNavigate?.();
                          }}
                          className="inline-flex items-center gap-1.5 text-[10px] font-mono tracking-wider text-primary hover:text-primary/80 transition-colors"
                        >
                          <MessageSquare className="h-3 w-3" />
                          ASK TELA
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {confirmDialog}
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-0.5">
        {sorted.map((c) => renderContact(c, false))}
      </div>
      {confirmDialog}
    </TooltipProvider>
  );
};

export default SidebarContactList;
