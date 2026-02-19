import { Outlet } from "react-router-dom";
import BunkSidebar from "@/components/bunk/BunkSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Radio } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const BunkLayout = () => {
  const { signOut } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <BunkSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-12 flex items-center justify-between border-b border-border px-4 bg-card/50">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" />
                <span className="font-mono text-xs text-muted-foreground tracking-widest">
                  CONDO BUNK
                </span>
              </div>
            </div>
            <button
              onClick={signOut}
              className="font-mono text-xs text-muted-foreground hover:text-destructive transition-colors tracking-wider"
            >
              SIGN OUT
            </button>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default BunkLayout;
