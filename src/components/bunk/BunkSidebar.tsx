import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  MessageSquare,
  FileText,
  BarChart3,
  Settings,
  Users,
  Building2,
  Loader2,
  ChevronRight,
  StickyNote,
  Bell,
  UserPlus,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebarContacts } from "@/hooks/useSidebarContacts";
import { usePresence } from "@/hooks/usePresence";
import { useUnreadDMs } from "@/hooks/useUnreadDMs";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import { supabase } from "@/integrations/supabase/client";
import SidebarContactList, { type ActiveInvite } from "@/components/bunk/SidebarContactList";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

const navItems = [
  { title: "TL;DR", url: "/bunk", icon: LayoutDashboard },
  { title: "Calendar", url: "/bunk/calendar", icon: CalendarDays },
  { title: "TELA", url: "/bunk/chat", icon: MessageSquare },
  { title: "AKB Builder", url: "/bunk/documents", icon: FileText },
  { title: "My Artifacts", url: "/bunk/artifacts", icon: StickyNote },
  { title: "Coverage", url: "/bunk/coverage", icon: BarChart3 },
  { title: "Notifications", url: "/bunk/notifications", icon: Bell },
  { title: "Admin", url: "/bunk/admin", icon: Settings },
];

const BunkSidebar = () => {
  const { setOpenMobile, setOpen } = useSidebar();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { tours } = useTour();
  const tourId = tours[0]?.id;
  const { tourContacts, tourTeamGroups, venueContacts, venueGroups, venueLabel, loading, updateContact, deleteContact } = useSidebarContacts();
  const { onlineUsers } = usePresence();
  const { totalUnread, unreadFrom } = useUnreadDMs();
  const [tourTeamOpen, setTourTeamOpen] = useState(true);
  const [venuePartnersOpen, setVenuePartnersOpen] = useState(true);
  const [expandedTours, setExpandedTours] = useState<Set<string>>(new Set());
  const [activeInvites, setActiveInvites] = useState<ActiveInvite[]>([]);
  const [bulkInviting, setBulkInviting] = useState(false);

  const fetchInvites = useCallback(async () => {
    if (!tourId) return;
    const { data } = await supabase
      .from("tour_invites")
      .select("email, token")
      .eq("tour_id", tourId)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString());
    setActiveInvites((data || []).map(d => ({ email: d.email, token: d.token })));
  }, [tourId]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  // Get all uninvited contacts with emails across all tour groups
  const getUninvitedContacts = () => {
    const allContacts = tourTeamGroups.flatMap(g => g.contacts);
    return allContacts.filter(c =>
      !c.appUserId && c.email &&
      !activeInvites.some(i => i.email.toLowerCase() === c.email!.toLowerCase())
    );
  };

  const handleBulkInvite = async () => {
    if (!tourId || !user) return;
    const eligible = getUninvitedContacts();
    if (eligible.length === 0) return;
    setBulkInviting(true);
    const tourName = tours.find(t => t.id === tourId)?.name || "";
    let created = 0;
    const newInvites: Array<{ name: string; email: string; token: string }> = [];
    for (const c of eligible) {
      try {
        const mappedRole = (c.role?.toUpperCase()?.includes("TA") || c.role?.toUpperCase()?.includes("TOUR ACCOUNT"))
          ? "TA" as const
          : (c.role?.toUpperCase()?.includes("MGMT") || c.role?.toUpperCase()?.includes("MANAGER"))
          ? "MGMT" as const
          : "CREW" as const;
        const { data } = await supabase.from("tour_invites").insert({
          tour_id: tourId,
          email: c.email!,
          role: mappedRole,
          created_by: user.id,
          tour_name: tourName,
        }).select("token").single();
        if (data) {
          created++;
          newInvites.push({ name: c.name, email: c.email!, token: data.token });
        }
      } catch { /* skip failures */ }
    }
    await fetchInvites();
    setBulkInviting(false);
    if (created > 0) {
      // Compose a single mailto with all invites listed in the body
      const subject = encodeURIComponent(`You're invited to ${tourName} on Condo Bunk`);
      const bodyLines = newInvites.map(inv =>
        `${inv.name}: ${window.location.origin}/invite/${inv.token}`
      ).join("\n");
      const body = encodeURIComponent(`Hey team,\n\nYou've been invited to join ${tourName} on Condo Bunk. Click your personal link below to sign in and join:\n\n${bodyLines}\n\nEach link expires in 7 days.`);
      const allEmails = newInvites.map(i => i.email).join(",");
      window.open(`mailto:${allEmails}?subject=${subject}&body=${body}`, "_self");
      toast.success(`${created} invite${created !== 1 ? "s" : ""} created`, {
        description: "Email draft opened with all invite links",
      });
    }
  };

  useEffect(() => {
    if (isMobile) return;
    const handler = () => setOpen(true);
    window.addEventListener("sidebar-hover-open", handler);
    return () => window.removeEventListener("sidebar-hover-open", handler);
  }, [isMobile, setOpen]);

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    } else {
      setOpen(false);
    }
  };

  return (
    <Sidebar
      className="border-r border-border"
      onMouseLeave={() => { if (!isMobile) setOpen(false); }}
    >
      <SidebarContent className="pt-4">
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase px-4">
            Operations
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/bunk"}
                      onClick={handleNavClick}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors rounded-md"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="mx-4 w-auto" />

        <SidebarGroup>
          <button
            onClick={() => setTourTeamOpen(!tourTeamOpen)}
            className="w-full font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase px-4 py-1.5 flex items-center gap-2 hover:text-muted-foreground transition-colors"
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${tourTeamOpen ? "rotate-90" : ""}`} />
            <Users className="h-3 w-3" />
            Tour Team
            {totalUnread > 0 && (
              <span className="h-4 min-w-4 px-1 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold leading-none">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
            <span className="ml-auto text-muted-foreground/40 normal-case tracking-normal">{tourTeamGroups.reduce((sum, g) => sum + g.contacts.length, 0)}</span>
          </button>
          {tourTeamOpen && (
            <SidebarGroupContent>
              {/* Bulk invite button */}
              {!loading && getUninvitedContacts().length > 0 && (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleBulkInvite}
                        disabled={bulkInviting}
                        className="mx-4 mb-1.5 flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono tracking-wider text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                      >
                        <UserPlus className="h-3 w-3" />
                        {bulkInviting ? "INVITING..." : `INVITE ALL (${getUninvitedContacts().length})`}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      Create invites for all team members not yet on Condo Bunk
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {loading ? (
                <div className="px-4 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
                </div>
              ) : tourTeamGroups.length <= 1 ? (
                <SidebarContactList contacts={tourTeamGroups[0]?.contacts || []} onNavigate={handleNavClick} onUpdate={updateContact} onDelete={deleteContact} onlineUserIds={onlineUsers} unreadFrom={unreadFrom} activeInvites={activeInvites} onInviteCreated={fetchInvites} />
              ) : (
                <div className="space-y-0.5">
                  {tourTeamGroups.map((group) => {
                    const isExpanded = expandedTours.has(group.tourId);
                    const toggleTour = () => {
                      setExpandedTours(prev => {
                        const next = new Set(prev);
                        if (next.has(group.tourId)) next.delete(group.tourId);
                        else next.add(group.tourId);
                        return next;
                      });
                    };
                    return (
                      <div key={group.tourId}>
                        <button
                          onClick={toggleTour}
                          className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-sidebar-accent/50 rounded-md transition-colors text-left"
                        >
                          <ChevronRight className={`h-3 w-3 text-muted-foreground/50 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          <span className="text-xs font-medium text-sidebar-foreground truncate">{group.tourName}</span>
                          <span className="ml-auto text-[10px] font-mono text-muted-foreground/40">{group.contacts.length}</span>
                        </button>
                        {isExpanded && (
                          <div className="ml-2 border-l border-border/30 pl-1">
                            <SidebarContactList contacts={group.contacts} onNavigate={handleNavClick} onUpdate={updateContact} onDelete={deleteContact} onlineUserIds={onlineUsers} unreadFrom={unreadFrom} activeInvites={activeInvites} onInviteCreated={fetchInvites} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarGroup>
          <button
            onClick={() => setVenuePartnersOpen(!venuePartnersOpen)}
            className="w-full font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase px-4 py-1.5 flex items-center gap-2 hover:text-muted-foreground transition-colors"
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${venuePartnersOpen ? "rotate-90" : ""}`} />
            <Building2 className="h-3 w-3" />
            Venue Partners
            <span className="ml-auto text-muted-foreground/40 normal-case tracking-normal">{venueGroups.length}</span>
          </button>
          {venuePartnersOpen && (
            <SidebarGroupContent>
              {loading ? (
                <div className="px-4 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
                </div>
              ) : (
                <SidebarContactList contacts={venueContacts} onNavigate={handleNavClick} onUpdate={updateContact} onDelete={deleteContact} onlineUserIds={onlineUsers} grouped venueGroups={venueGroups} />
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};

export default BunkSidebar;
