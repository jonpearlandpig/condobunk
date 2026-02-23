export interface GlossaryEntry {
  term: string;
  short: string;
  long?: string;
  category: "core" | "data" | "visibility" | "features";
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  AKB: {
    term: "AKB",
    short: "Advance Knowledge Base — the structured data layer for a tour containing schedules, contacts, documents, and venue data.",
    category: "core",
  },
  TELA: {
    term: "TELA",
    short: "Tour Efficiency Liaison Assistant — the AI that answers questions from your tour data.",
    category: "core",
  },
  TourText: {
    term: "TourText",
    short: "The public-facing SMS service (888-340-0564) that crew can text to get AKB answers.",
    category: "core",
  },
  VAN: {
    term: "VAN",
    short: "Venue Advance Notes — structured per-venue records extracted from the Advance Master covering production contacts, rigging, power, labor, and logistics.",
    category: "data",
  },
  "Advance Master": {
    term: "Advance Master",
    short: "The highest-authority source document for a tour. Extracted data populates VANs.",
    category: "data",
  },
  "Tech Pack": {
    term: "Tech Pack",
    short: "Venue-provided technical specifications (capacities, rigging points, power). Supplementary to VANs.",
    category: "data",
  },
  Artifacts: {
    term: "Artifacts",
    short: "Notes and documents organized by visibility level (TourText, CondoBunk, or Bunk Stash).",
    category: "features",
  },
  "Sign-off": {
    term: "Sign-off",
    short: "An audit trail gate for AKB edits. Tracks whether changes affect safety, time, or money.",
    category: "features",
  },
  Gaps: {
    term: "Gaps",
    short: "Missing data fields detected in the AKB — e.g., no load-in time for a venue.",
    category: "features",
  },
  Conflicts: {
    term: "Conflicts",
    short: "Data inconsistencies detected between sources — e.g., overlapping show times or duplicate contacts.",
    category: "features",
  },
  Presence: {
    term: "Presence",
    short: "Real-time online/offline status. Routes messages between in-app Bunk Chat and SMS fallback.",
    category: "features",
  },
  "Venue Partners": {
    term: "Venue Partners",
    short: "External venue contacts grouped by upcoming show date in the sidebar.",
    category: "features",
  },
  "Telauthorium ID": {
    term: "Telauthorium ID",
    short: "A user's unique identifier in the CondoBunk system.",
    category: "features",
  },
};

/** Build glossary text block for AI system prompts */
export function buildGlossaryPromptBlock(): string {
  const lines = Object.values(GLOSSARY).map(
    (g) => `- **${g.term}**: ${g.short}`
  );
  return `## CondoBunk Glossary

When a user asks "What is [term]?" or "What does [term] mean?", answer from this glossary. Keep glossary answers brief (2-3 sentences max) unless the user asks for more detail.

${lines.join("\n")}`;
}
