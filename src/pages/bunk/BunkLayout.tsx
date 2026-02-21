import { Outlet, useSearchParams } from "react-router-dom";
import BunkSidebar from "@/components/bunk/BunkSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Radio, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { TourProvider } from "@/hooks/useTour";
import { useIsMobile } from "@/hooks/use-mobile";

const BunkLayout = () => {
  const { signOut } = useAuth();
  const [searchParams] = useSearchParams();
  const isWelcome = searchParams.get("welcome") === "1";
  const isMobile = useIsMobile();

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
              {isMobile ? (
                <button
                  onClick={signOut}
                  className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={signOut}
                  className="font-mono text-xs text-muted-foreground hover:text-destructive transition-colors tracking-wider"
                >
                  SIGN OUT
                </button>
              )}
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
