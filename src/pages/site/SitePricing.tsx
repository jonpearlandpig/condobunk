import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.5 },
  }),
};

const TIERS = [
  {
    name: "Demo",
    price: "Free",
    period: "24 hours",
    desc: "See what CondoBunk can do with real tour data.",
    features: [
      "Read-only AKB access",
      "Browse calendar & venue data",
      "Try TELA Tour Intelligence",
      "View Gaps & Conflicts",
    ],
    cta: "TRY DEMO",
    to: "/login",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$TBD",
    period: "per tour / month",
    desc: "Full operational command for your tour.",
    features: [
      "Full AKB management",
      "TELA TI — unlimited queries",
      "TourText SMS for all crew",
      "Unlimited crew members",
      "Document extraction & versioning",
      "Change log & sign-off audit trail",
      "Bunk Chat + DMs",
    ],
    cta: "GET STARTED",
    to: "/login",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "contact us",
    desc: "Multi-tour operations with dedicated support.",
    features: [
      "Everything in Pro",
      "Multi-tour dashboard",
      "Priority support",
      "Custom integrations (Master Tour, etc.)",
      "SSO & advanced permissions",
    ],
    cta: "CONTACT US",
    to: "/site/contact",
    highlight: false,
  },
];

const SitePricing = () => (
  <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
    <motion.div
      className="mb-16 text-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <h1 className="mb-4 text-4xl font-bold text-foreground">
        Simple pricing.{" "}
        <span className="text-gradient-amber">No spreadsheet required.</span>
      </h1>
      <p className="mx-auto max-w-xl text-muted-foreground">
        Start with a free 24-hour demo. Upgrade when you're ready.
      </p>
    </motion.div>

    <div className="grid gap-8 md:grid-cols-3">
      {TIERS.map((tier, i) => (
        <motion.div
          key={tier.name}
          className={`relative flex flex-col rounded-2xl border p-8 ${
            tier.highlight
              ? "border-primary/50 bg-card glow-amber"
              : "border-border/50 bg-card"
          }`}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          custom={i}
        >
          {tier.highlight && (
            <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-bold text-primary-foreground">
              MOST POPULAR
            </span>
          )}
          <h3 className="mb-1 text-xl font-bold text-foreground">{tier.name}</h3>
          <div className="mb-1 flex items-baseline gap-1">
            <span className="text-3xl font-bold text-foreground">{tier.price}</span>
            <span className="text-sm text-muted-foreground">/ {tier.period}</span>
          </div>
          <p className="mb-6 text-sm text-muted-foreground">{tier.desc}</p>
          <ul className="mb-8 flex-1 space-y-3">
            {tier.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {f}
              </li>
            ))}
          </ul>
          <Button
            asChild
            variant={tier.highlight ? "default" : "outline"}
            className="w-full"
          >
            <Link to={tier.to}>{tier.cta}</Link>
          </Button>
        </motion.div>
      ))}
    </div>
  </div>
);

export default SitePricing;
