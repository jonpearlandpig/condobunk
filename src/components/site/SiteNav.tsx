import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/white_condobunks.png";

const NAV_LINKS = [
  { label: "Features", to: "/site/features" },
  { label: "About", to: "/site/about" },
  { label: "Pricing", to: "/site/pricing" },
  { label: "Contact", to: "/site/contact" },
];

const SiteNav = () => {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link to="/site" className="flex items-center gap-2">
          <img src={logo} alt="CondoBunk" className="h-8" />
        </Link>

        {/* Desktop Links */}
        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`text-sm font-medium transition-colors hover:text-primary ${
                pathname === l.to ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Button asChild size="sm">
            <Link to="/login">SIGN IN</Link>
          </Button>
        </div>

        {/* Mobile Toggle */}
        <button
          className="md:hidden text-foreground"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {open && (
        <div className="border-t border-border/50 bg-background md:hidden">
          <div className="flex flex-col gap-1 px-4 py-4">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent ${
                  pathname === l.to ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <Button asChild size="sm" className="mt-2">
              <Link to="/login" onClick={() => setOpen(false)}>SIGN IN</Link>
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default SiteNav;
