import { Link } from "react-router-dom";
import logo from "@/assets/white_condobunks.png";

const LINKS = [
  { label: "Features", to: "/site/features" },
  { label: "About", to: "/site/about" },
  { label: "Pricing", to: "/site/pricing" },
  { label: "Contact", to: "/site/contact" },
];

const SiteFooter = () => (
  <footer className="border-t border-border/50 bg-background">
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="grid gap-8 md:grid-cols-3">
        {/* Brand */}
        <div className="space-y-3">
          <img src={logo} alt="CondoBunk" className="h-8" />
          <p className="text-sm text-muted-foreground">
            Your tour knowledge base. Ask TELA.
          </p>
        </div>

        {/* Quick Links */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-foreground">Quick Links</h4>
          <ul className="space-y-2">
            {LINKS.map((l) => (
              <li key={l.to}>
                <Link
                  to={l.to}
                  className="text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Branding */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-foreground">Product</h4>
          <p className="font-mono text-xs text-muted-foreground">
            TOURTEXT + CONDO BUNK v2.1
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            © {new Date().getFullYear()} CondoBunk. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  </footer>
);

export default SiteFooter;
