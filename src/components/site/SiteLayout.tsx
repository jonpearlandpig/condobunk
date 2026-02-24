import { Outlet } from "react-router-dom";
import SiteNav from "./SiteNav";
import SiteFooter from "./SiteFooter";

const SiteLayout = () => (
  <div className="flex min-h-screen flex-col bg-background text-foreground">
    <SiteNav />
    <main className="flex-1 pt-16">
      <Outlet />
    </main>
    <SiteFooter />
  </div>
);

export default SiteLayout;
