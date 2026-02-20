import { useEffect } from "react";
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
import SidebarContactList from "@/components/bunk/SidebarContactList";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { title: "TL;DR", url: "/bunk", icon: LayoutDashboard },
  { title: "Calendar", url: "/bunk/calendar", icon: CalendarDays },
  { title: "TELA", url: "/bunk/chat", icon: MessageSquare },
  { title: "AKB Builder", url: "/bunk/documents", icon: FileText },
  { title: "Coverage", url: "/bunk/coverage", icon: BarChart3 },
  { title: "Admin", url: "/bunk/admin", icon: Settings },
];

const BunkSidebar = () => {
  const { setOpenMobile, setOpen } = useSidebar();
  const isMobile = useIsMobile();
  const { tourContacts, venueContacts, venueGroups, venueLabel, loading, updateContact, deleteContact } = useSidebarContacts();
  const { onlineUsers } = usePresence();

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
          <SidebarGroupLabel className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase px-4 flex items-center gap-2">
            <Users className="h-3 w-3" />
            Tour Team
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {loading ? (
              <div className="px-4 py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
              </div>
            ) : (
              <SidebarContactList contacts={tourContacts} onNavigate={handleNavClick} onUpdate={updateContact} onDelete={deleteContact} onlineUserIds={onlineUsers} />
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase px-4 flex items-center gap-2">
            <Building2 className="h-3 w-3" />
            Venue Partners
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {loading ? (
              <div className="px-4 py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
              </div>
            ) : (
              <SidebarContactList contacts={venueContacts} onNavigate={handleNavClick} onUpdate={updateContact} onDelete={deleteContact} onlineUserIds={onlineUsers} grouped venueGroups={venueGroups} />
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};

export default BunkSidebar;
