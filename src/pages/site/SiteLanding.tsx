import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Database, Radio, MessageSquare, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/WHITE_TEXT_CONDO_BUNK_LOGO.png";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const VALUE_PROPS = [
  {
    icon: Database,
    title: "AKB",
    subtitle: "Authoritative Knowledge Base",
    desc: "Your structured source of truth for the entire tour — built from extracted document data, not email threads.",
  },
  {
    icon: Radio,
    title: "TELA",
    subtitle: "Tour Efficiency Liaison Assistant",
    desc: "AI that answers questions from your tour data instantly. No digging through spreadsheets.",
  },
  {
    icon: MessageSquare,
    title: "TourText",
    subtitle: "SMS Answers — 888-340-0564",
    desc: "Crew texts a number, gets AKB answers back. Works anywhere, no app required.",
  },
];

const STATS = [
  { value: "100+", label: "Venue Data Points Tracked" },
  { value: "24/7", label: "SMS Access for Crew" },
  { value: "<5s", label: "Average TELA Response Time" },
  { value: "0", label: "Email Threads Required" },
];

const SiteLanding = () => (
  <div className="overflow-hidden">
    {/* Hero */}
    <section className="relative flex min-h-[85vh] items-center justify-center px-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.08),transparent_70%)]" />
      <div className="relative z-10 mx-auto max-w-4xl text-center">
        <motion.img
          src={logo}
          alt="CondoBunk"
          className="mx-auto mb-8 h-24 sm:h-32"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7 }}
        />
        <motion.h1
          className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-6xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          Close the curtain.{" "}
          <span className="text-gradient-amber">Get schtuff done!</span>
        </motion.h1>
        <motion.p
          className="mb-8 font-mono text-lg tracking-widest text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          TOUR LAW LIVES HERE
        </motion.p>
        <motion.div
          className="flex flex-wrap items-center justify-center gap-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
        >
          <Button asChild size="lg" className="glow-amber">
            <Link to="/login">TRY DEMO</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/login">
              SIGN IN <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </motion.div>
      </div>
    </section>

    {/* Value Props */}
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <motion.h2
        className="mb-16 text-center text-3xl font-bold text-foreground"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={fadeUp}
        custom={0}
      >
        One platform. Every answer.
      </motion.h2>
      <div className="grid gap-8 md:grid-cols-3">
        {VALUE_PROPS.map((v, i) => (
          <motion.div
            key={v.title}
            className="group rounded-xl border border-border/50 bg-card p-8 transition-colors hover:border-primary/30"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={i + 1}
          >
            <v.icon className="mb-4 h-10 w-10 text-primary" />
            <h3 className="mb-1 text-xl font-bold text-foreground">{v.title}</h3>
            <p className="mb-3 font-mono text-xs text-muted-foreground">{v.subtitle}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{v.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>

    {/* Stats */}
    <section className="border-y border-border/50 bg-card/50">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 py-16 sm:px-6 md:grid-cols-4 lg:px-8">
        {STATS.map((s, i) => (
          <motion.div
            key={s.label}
            className="text-center"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={i}
          >
            <p className="text-3xl font-bold text-primary">{s.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
          </motion.div>
        ))}
      </div>
    </section>

    {/* CTA */}
    <section className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6 lg:px-8">
      <motion.h2
        className="mb-4 text-3xl font-bold text-foreground"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={fadeUp}
        custom={0}
      >
        Ready to replace your spreadsheet chaos?
      </motion.h2>
      <motion.p
        className="mb-8 text-muted-foreground"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={fadeUp}
        custom={1}
      >
        Try the 24-hour demo. Full AKB access, real tour data. No credit card.
      </motion.p>
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={fadeUp}
        custom={2}
      >
        <Button asChild size="lg" className="glow-amber">
          <Link to="/login">GET STARTED</Link>
        </Button>
      </motion.div>
    </section>
  </div>
);

export default SiteLanding;
