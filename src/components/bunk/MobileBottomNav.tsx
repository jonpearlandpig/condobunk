import { useState, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  MessageSquare,
  FileText,
  Settings,
  MessageCircle,
  Camera,
  LogOut,
  HandMetal,
  ChevronRight,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHandPreference } from "@/hooks/useHandPreference";
import { useSidebarContacts, SidebarContact } from "@/hooks/useSidebarContacts";
import { usePresence } from "@/hooks/usePresence";
import { useUnreadDMs } from "@/hooks/useUnreadDMs";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import SidebarContactList from "@/components/bunk/SidebarContactList";
import SidebarTelaThreads from "@/components/bunk/SidebarTelaThreads";
import DMChatScreen from "@/components/bunk/DMChatScreen";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarProvider } from "@/components/ui/sidebar";
import { toast } from "sonner";

const navItems = [
  { title: "TL;DR", url: "/bunk", icon: LayoutDashboard, end: true },
  { title: "Calendar", url: "/bunk/calendar", icon: CalendarDays },
  { title: "Ask Tela", url: "/bunk/chat", icon: MessageSquare },
  { title: "AKB's", url: "/bunk/documents", icon: FileText },
  { title: "Admin", url: "/bunk/admin", icon: Settings },
];

const CollapsibleSection = ({ title, count, children }: { title: string; count?: number; children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase py-1.5 px-1 flex items-center gap-1.5 hover:text-muted-foreground transition-colors"
      >
        <ChevronRight className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-90" : ""}`} />
        {title}
        {count !== undefined && count > 0 && (
          <span className="ml-auto text-muted-foreground/40 normal-case tracking-normal text-[9px]">{count}</span>
        )}
      </button>
      {open && children}
    </div>
  );
};

interface MobileBottomNavProps {
  avatarUrl?: string | null;
  displayName?: string | null;
  user: any;
  signOut: () => Promise<void>;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

const MobileBottomNav = ({ avatarUrl, displayName, user, signOut, fileInputRef }: MobileBottomNavProps) => {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeDMContact, setActiveDMContact] = useState<SidebarContact | null>(null);
  const { handPreference, setHandPreference } = useHandPreference();
  const navigate = useNavigate();
  const location = useLocation();

  const { tourTeamGroups, tourVenueGroups, updateContact, deleteContact } = useSidebarContacts();
  const { onlineUsers } = usePresence();
  const { totalUnread, unreadFrom } = useUnreadDMs();
  const { tours } = useTour();
  const tourId = tours[0]?.id;

  if (!isMobile) return null;

  const isLeft = handPreference === "left";

  const filteredTourTeamGroups = tourTeamGroups.map(g => ({
    ...g,
    contacts: g.contacts.filter(c => c.appUserId !== user?.id),
  }));

  const totalTeamContacts = filteredTourTeamGroups.reduce((sum, g) => sum + g.contacts.length, 0);
  const totalVenueContacts = tourVenueGroups.reduce((sum, g) => sum + g.totalContacts, 0);

  const handleNavClick = (url: string) => {
    navigate(url);
  };

  const isActive = (url: string, end?: boolean) => {
    if (end) return location.pathname === url;
    return location.pathname.startsWith(url);
  };

  const handleContactTap = (c: SidebarContact) => {
    const isOnline = c.appUserId && onlineUsers.has(c.appUserId);
    if (isOnline) {
      setDrawerOpen(false);
      // Small delay to let drawer close animation play
      setTimeout(() => setActiveDMContact(c), 200);
    } else if (c.appUserId) {
      toast.info(`${c.name} isn't in their Condo Bunk right now`, {
        description: c.phone ? "Sending via SMS instead…" : "No phone number on file to fall back to.",
        duration: 3000,
      });
      if (c.phone) {
        setDrawerOpen(false);
        setTimeout(() => window.open(`sms:${c.phone}`, "_self"), 600);
      }
    } else if (c.phone) {
      setDrawerOpen(false);
      window.open(`sms:${c.phone}`, "_self");
    } else {
      toast.info("No phone number available for this contact");
    }
  };

  return (
    <>
      {/* Full-screen DM chat overlay */}
      {activeDMContact && tourId && user && (
        <DMChatScreen
          contact={activeDMContact}
          tourId={tourId}
          userId={user.id}
          isContactOnline={!!activeDMContact.appUserId && onlineUsers.has(activeDMContact.appUserId)}
          onClose={() => setActiveDMContact(null)}
        />
      )}

      {/* Messaging Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side={isLeft ? "left" : "right"} className="w-[80vw] max-w-[320px] p-0 flex flex-col">
          <SheetHeader className="px-3 pt-3 pb-1">
            <div className="flex items-center justify-between">
              <SheetTitle className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground/70">
                Messages
              </SheetTitle>
              {totalUnread > 0 && (
                <span className="h-4 min-w-4 px-1 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
            </div>
          </SheetHeader>

          <div className="overflow-y-auto flex-1 px-3 pb-2 space-y-0">
            <SidebarProvider defaultOpen={false}>
              {/* Ask TELA threads */}
              <CollapsibleSection title="Ask TELA">
                <SidebarTelaThreads />
              </CollapsibleSection>

              {/* Tour Team */}
              <CollapsibleSection title="Tour Team" count={totalTeamContacts}>
                {filteredTourTeamGroups.map(g => (
                  <SidebarContactList
                    key={g.tourId}
                    contacts={g.contacts}
                    onNavigate={() => setDrawerOpen(false)}
                    onUpdate={updateContact}
                    onDelete={deleteContact}
                    onlineUserIds={onlineUsers}
                    unreadFrom={unreadFrom}
                    onContactTap={handleContactTap}
                  />
                ))}
              </CollapsibleSection>

              {/* Venue Partners */}
              {tourVenueGroups.length > 0 && (
                <CollapsibleSection title="Venue Partners" count={totalVenueContacts}>
                  {tourVenueGroups.map(tvg => (
                    <SidebarContactList
                      key={tvg.tourId}
                      contacts={tvg.venueGroups.flatMap(vg => vg.contacts)}
                      onNavigate={() => setDrawerOpen(false)}
                      onUpdate={updateContact}
                      onDelete={deleteContact}
                      onlineUserIds={onlineUsers}
                      grouped
                      venueGroups={tvg.venueGroups}
                    />
                  ))}
                </CollapsibleSection>
              )}
            </SidebarProvider>
          </div>

          {/* Pinned profile footer */}
          <div className="border-t border-border px-3 py-2 flex items-center gap-2.5 shrink-0">
            <div className="h-6 w-6 rounded-full overflow-hidden ring-1 ring-border shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName || "Profile"} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="h-full w-full bg-primary/20 flex items-center justify-center text-[8px] font-bold text-primary">
                  {(displayName || "?")[0].toUpperCase()}
                </div>
              )}
            </div>
            <p className="text-xs font-medium text-foreground truncate">{displayName}</p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Bottom bar */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 h-12 bg-card/95 backdrop-blur-md border-t border-border flex items-center px-1 gap-0.5 ${
          isLeft ? "flex-row" : "flex-row-reverse"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Message button */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="h-10 w-10 flex items-center justify-center rounded-lg text-foreground hover:bg-accent transition-colors shrink-0 relative"
          aria-label="Open messages"
        >
          <MessageCircle className="h-5 w-5" />
          {totalUnread > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
          )}
        </button>

        {/* Nav items */}
        <div className="flex-1 flex items-center justify-around">
          {navItems.map((item) => {
            const active = isActive(item.url, item.end);
            return (
              <button
                key={item.url}
                onClick={() => handleNavClick(item.url)}
                className={`flex flex-col items-center justify-center gap-0.5 py-1 px-1.5 rounded-md transition-colors min-w-0 ${
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                <span className="text-[8px] font-mono tracking-wider leading-none truncate">
                  {item.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* Avatar / account dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-7 w-7 rounded-full overflow-hidden ring-1 ring-border hover:ring-primary transition-all focus:outline-none shrink-0"
              aria-label="Account menu"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName || "Profile"} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="h-full w-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                  {(displayName || "?")[0].toUpperCase()}
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isLeft ? "start" : "end"} side="top" className="w-48">
            <div className="px-2 py-1.5 border-b border-border mb-1">
              <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
              {user?.email && <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>}
            </div>
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="cursor-pointer">
              <Camera className="h-3.5 w-3.5 mr-2" />
              Change photo
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setHandPreference(isLeft ? "right" : "left")}
              className="cursor-pointer"
            >
              <HandMetal className="h-3.5 w-3.5 mr-2" />
              Switch to {isLeft ? "right" : "left"} hand
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive cursor-pointer">
              <LogOut className="h-3.5 w-3.5 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
};

export default MobileBottomNav;
