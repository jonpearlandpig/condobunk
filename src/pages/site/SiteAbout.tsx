import { motion } from "framer-motion";
import { Mail, FileSpreadsheet, Clock, Users } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.5 },
  }),
};

const PAIN_POINTS = [
  {
    icon: Mail,
    before: "200+ email threads per tour",
    after: "One searchable knowledge base",
  },
  {
    icon: FileSpreadsheet,
    before: "Spreadsheet chaos across 5 tools",
    after: "Structured data extracted from your Advance Master",
  },
  {
    icon: Clock,
    before: "Hours hunting for venue contacts",
    after: "Instant answers via TELA or SMS",
  },
  {
    icon: Users,
    before: "New crew asking the same questions",
    after: "Self-serve answers from the AKB, day one",
  },
];

const SiteAbout = () => (
  <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6 lg:px-8">
    {/* Mission */}
    <motion.div
      className="mb-20 text-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <h1 className="mb-6 text-4xl font-bold text-foreground">
        Built by tour professionals,{" "}
        <span className="text-gradient-amber">for tour professionals.</span>
      </h1>
      <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground">
        CondoBunk was born on the road. We watched Tour Accountants drown in email threads, 
        crew scramble for venue contacts at load-in, and production managers rebuild the same 
        spreadsheet for every tour. We knew there had to be a better way.
      </p>
    </motion.div>

    {/* Before / After */}
    <section className="mb-20">
      <motion.h2
        className="mb-10 text-center text-2xl font-bold text-foreground"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={fadeUp}
        custom={0}
      >
        What changes when you switch to CondoBunk
      </motion.h2>
      <div className="grid gap-6 sm:grid-cols-2">
        {PAIN_POINTS.map((p, i) => (
          <motion.div
            key={p.before}
            className="rounded-xl border border-border/50 bg-card p-6"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={i + 1}
          >
            <p.icon className="mb-3 h-8 w-8 text-primary" />
            <p className="mb-2 text-sm text-destructive line-through">{p.before}</p>
            <p className="text-sm font-medium text-foreground">{p.after}</p>
          </motion.div>
        ))}
      </div>
    </section>

    {/* How It Works */}
    <motion.section
      className="rounded-2xl border border-border/50 bg-card p-8 sm:p-12"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
    >
      <h2 className="mb-8 text-2xl font-bold text-foreground">How it works</h2>
      <ol className="space-y-6">
        {[
          "Upload your Advance Master. CondoBunk extracts every venue, contact, and schedule into your AKB.",
          "TELA reads your AKB. Ask any question about your tour and get an instant, sourced answer.",
          "Crew texts TourText. Anyone on the tour can get AKB answers via SMS — no login, no app.",
          "Changes are tracked. Every edit logs who changed what, when, and whether it affects safety, time, or money.",
        ].map((step, i) => (
          <li key={i} className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {i + 1}
            </span>
            <p className="text-sm leading-relaxed text-muted-foreground">{step}</p>
          </li>
        ))}
      </ol>
    </motion.section>

    {/* Team Placeholder */}
    <motion.section
      className="mt-20 text-center"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={fadeUp}
      custom={0}
    >
      <h2 className="mb-4 text-2xl font-bold text-foreground">The Team</h2>
      <p className="text-muted-foreground">
        We've collectively spent decades on the road. More coming soon.
      </p>
    </motion.section>
  </div>
);

export default SiteAbout;
