import { motion } from "framer-motion";
import {
  Database, Radio, MessageSquare, FileText, ClipboardList,
  Archive, AlertTriangle, GitCompare, ShieldCheck, Wifi,
} from "lucide-react";
import { GLOSSARY, type GlossaryEntry } from "@/lib/glossary";

const ICON_MAP: Record<string, React.ElementType> = {
  AKB: Database,
  TELA: Radio,
  TourText: MessageSquare,
  VAN: FileText,
  "Tech Pack": ClipboardList,
  Artifacts: Archive,
  Gaps: AlertTriangle,
  Conflicts: GitCompare,
  "Sign-off": ShieldCheck,
  Presence: Wifi,
};

const CATEGORY_LABELS: Record<string, string> = {
  core: "Core Platform",
  data: "Data Layer",
  features: "Operational Features",
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5 },
  }),
};

const SiteFeatures = () => {
  const grouped = Object.values(GLOSSARY).reduce<Record<string, GlossaryEntry[]>>(
    (acc, entry) => {
      if (!ICON_MAP[entry.term]) return acc;
      (acc[entry.category] ??= []).push(entry);
      return acc;
    },
    {}
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <motion.div
        className="mb-16 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="mb-4 text-4xl font-bold text-foreground">
          Everything your tour needs.{" "}
          <span className="text-gradient-amber">Nothing it doesn't.</span>
        </h1>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          Every feature below is built from real tour workflows — not generic project management tools bolted onto a calendar.
        </p>
      </motion.div>

      {(["core", "data", "features"] as const).map((cat) => (
        <section key={cat} className="mb-16">
          <h2 className="mb-8 font-mono text-xs font-semibold uppercase tracking-widest text-primary">
            {CATEGORY_LABELS[cat]}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(grouped[cat] ?? []).map((entry, i) => {
              const Icon = ICON_MAP[entry.term] ?? Database;
              return (
                <motion.div
                  key={entry.term}
                  className="rounded-xl border border-border/50 bg-card p-6 transition-colors hover:border-primary/30"
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  custom={i}
                >
                  <Icon className="mb-3 h-8 w-8 text-primary" />
                  <h3 className="mb-2 text-lg font-bold text-foreground">{entry.term}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{entry.short}</p>
                </motion.div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

export default SiteFeatures;
