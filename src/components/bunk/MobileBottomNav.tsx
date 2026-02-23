import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  CalendarDays,
  MessageSquare,
  FileText,
  Settings,
  Menu,
  X,
  Camera,
  LogOut,
  HandMetal,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHandPreference } from "@/hooks/useHandPreference";
import { useSidebarContacts } from "@/hooks/useSidebarContacts";
import { usePresence } from "@/hooks/usePresence";
import { useUnreadDMs } from "@/hooks/useUnreadDMs";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import SidebarContactList from "@/components/bunk/SidebarContactList";
import SidebarTelaThreads from "@/components/bunk/SidebarTelaThreads";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarProvider } from "@/components/ui/sidebar";

const navItems = [
  { title: "TL;DR", url: "/bunk", icon: LayoutDashboard, end: true },
  { title: "Calendar", url: "/bunk/calendar", icon: CalendarDays },
  { title: "Ask Tela", url: "/bunk/chat", icon: MessageSquare },
  { title: "AKB's", url: "/bunk/documents", icon: FileText },
  { title: "Admin", url: "/bunk/admin", icon: Settings },
];

interface MobileBottomNavProps {
  avatarUrl?: string | null;
  displayName?: string | null;
  user: any;
  signOut: () => Promise<void>;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

const MobileBottomNav = ({ avatarUrl, displayName, user, signOut, fileInputRef }: MobileBottomNavProps) => {
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const { handPreference, setHandPreference } = useHandPreference();
  const navigate = useNavigate();
  const location = useLocation();

  const { tourTeamGroups, tourVenueGroups, venueContacts, loading, updateContact, deleteContact } = useSidebarContacts();
  const { onlineUsers } = usePresence();
  const { totalUnread, unreadFrom } = useUnreadDMs();
  const { tours } = useTour();

  if (!isMobile) return null;

  const isLeft = handPreference === "left";

  const filteredTourTeamGroups = tourTeamGroups.map(g => ({
    ...g,
    contacts: g.contacts.filter(c => c.appUserId !== user?.id),
  }));

  const handleNavClick = (url: string) => {
    navigate(url);
    setMenuOpen(false);
  };

  const isActive = (url: string, end?: boolean) => {
    if (end) return location.pathname === url;
    return location.pathname.startsWith(url);
  };

  return (
    <>
      {/* DM Panel overlay */}
      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
              onClick={() => setMenuOpen(false)}
            />
            {/* DM Panel */}
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className={`fixed bottom-14 z-50 w-72 max-h-[60vh] overflow-y-auto rounded-t-xl border border-border bg-card shadow-2xl ${
                isLeft ? "left-0 rounded-bl-none" : "right-0 rounded-br-none"
              }`}
              style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            >
              <SidebarProvider defaultOpen={false}>
                <div className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase">
                      Messages
                    </h3>
                    {totalUnread > 0 && (
                      <span className="h-4 min-w-4 px-1 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
                        {totalUnread > 99 ? "99+" : totalUnread}
                      </span>
                    )}
                  </div>

                  {/* Tela Threads */}
                  <SidebarTelaThreads />

                  {/* Tour Team contacts */}
                  <div>
                    <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase mb-1">
                      Tour Team
                    </p>
                    {filteredTourTeamGroups.map(g => (
                      <SidebarContactList
                        key={g.tourId}
                        contacts={g.contacts}
                        onNavigate={() => setMenuOpen(false)}
                        onUpdate={updateContact}
                        onDelete={deleteContact}
                        onlineUserIds={onlineUsers}
                        unreadFrom={unreadFrom}
                      />
                    ))}
                  </div>

                  {/* Venue Partners */}
                  {tourVenueGroups.length > 0 && (
                    <div>
                      <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase mb-1">
                        Venue Partners
                      </p>
                      {tourVenueGroups.map(tvg => (
                        <SidebarContactList
                          key={tvg.tourId}
                          contacts={tvg.venueGroups.flatMap(vg => vg.contacts)}
                          onNavigate={() => setMenuOpen(false)}
                          onUpdate={updateContact}
                          onDelete={deleteContact}
                          onlineUserIds={onlineUsers}
                          grouped
                          venueGroups={tvg.venueGroups}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </SidebarProvider>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom bar */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 h-12 bg-card/95 backdrop-blur-md border-t border-border flex items-center px-1 gap-0.5 ${
          isLeft ? "flex-row" : "flex-row-reverse"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Menu button */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="h-10 w-10 flex items-center justify-center rounded-lg text-foreground hover:bg-accent transition-colors shrink-0 relative"
          aria-label="Toggle messages"
        >
          <motion.div
            animate={{ rotate: menuOpen ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </motion.div>
          {!menuOpen && totalUnread > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
          )}
        </button>

        {/* Nav items */}
        <div className={`flex-1 flex items-center justify-around ${isLeft ? "" : ""}`}>
          {navItems.map((item, i) => {
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
