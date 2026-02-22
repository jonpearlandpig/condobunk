import { Outlet, useSearchParams } from "react-router-dom";
import BunkSidebar from "@/components/bunk/BunkSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Radio, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { TourProvider } from "@/hooks/useTour";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BunkLayout = () => {
  const { user, signOut } = useAuth();
  const [searchParams] = useSearchParams();
  const isWelcome = searchParams.get("welcome") === "1";
  const isMobile = useIsMobile();

  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email;

  return (
    <TourProvider>
      <SidebarProvider defaultOpen={isWelcome}>
        <div className="h-dvh flex w-full overflow-hidden">
          <BunkSidebar />
          {/* Invisible hover zone to open sidebar on desktop */}
          <div
            className="hidden md:block fixed left-0 top-0 h-full w-3 z-40"
            onMouseEnter={() => {
              const event = new CustomEvent("sidebar-hover-open");
              window.dispatchEvent(event);
            }}
          />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <header className="h-10 md:h-12 flex items-center justify-between border-b border-border px-3 md:px-4 bg-card/50">
              <div className="flex items-center gap-2 md:gap-3">
                <SidebarTrigger />
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-primary" />
                  <span className="font-mono text-xs text-muted-foreground tracking-widest hidden md:inline">
                    CONDO BUNK
                  </span>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-7 w-7 rounded-full overflow-hidden ring-1 ring-border hover:ring-primary transition-all focus:outline-none focus:ring-2 focus:ring-primary" aria-label="Account menu">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={displayName || "Profile"} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="h-full w-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                        {(displayName || "?")[0].toUpperCase()}
                      </div>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5 border-b border-border mb-1">
                    <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                    {user?.email && <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>}
                  </div>
                  <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive cursor-pointer">
                    <LogOut className="h-3.5 w-3.5 mr-2" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </header>
            <main className="flex-1 p-3 sm:p-6 overflow-auto min-w-0">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </TourProvider>
  );
};

export default BunkLayout;
