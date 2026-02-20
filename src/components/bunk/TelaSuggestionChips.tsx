import { ArrowRight, Navigation, FileText, Users, Calendar, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface TelaSuggestionChipsProps {
  content: string;
  onFollowUp: (text: string) => void;
  isLatest: boolean;
}

interface Suggestion {
  label: string;
  followUp: string;
  icon?: "navigate" | "doc" | "contact" | "calendar" | "chat";
}

// Route-aware keywords that trigger navigation instead of follow-up
const ROUTE_PATTERNS: { pattern: RegExp; route: string; icon: Suggestion["icon"] }[] = [
  { pattern: /\b(check|view|review|open)\b.*\b(schedule|calendar|dates)\b/i, route: "/bunk/calendar", icon: "calendar" },
  { pattern: /\b(check|view|review|open)\b.*\b(document|tech pack|file|rider)\b/i, route: "/bunk/documents", icon: "doc" },
  { pattern: /\b(check|view|review|open)\b.*\b(contact|staff|crew|roster)\b/i, route: "/bunk/coverage", icon: "contact" },
  { pattern: /\b(check|view|review|open)\b.*\b(conflict|issue)\b/i, route: "/bunk/conflicts", icon: "navigate" },
  { pattern: /\b(check|view|review|open)\b.*\b(gap|missing|unknown)\b/i, route: "/bunk/gaps", icon: "navigate" },
];

/**
 * Extract actionable suggestions from TELA's response.
 * Looks for numbered lists, bullet points, and action-oriented sentences.
 */
function extractSuggestions(text: string): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const seen = new Set<string>();

  // Match numbered items (1. Do something, 2. Check this)
  const numberedRe = /(?:^|\n)\s*\d+[\.)]\s*\*{0,2}([^\n*]+)\*{0,2}/g;
  let m: RegExpExecArray | null;
  while ((m = numberedRe.exec(text)) !== null) {
    addIfActionable(m[1].trim(), suggestions, seen);
  }

  // Match bullet items (- Do something, * Check this)
  const bulletRe = /(?:^|\n)\s*[-*•]\s*\*{0,2}([^\n*]+)\*{0,2}/g;
  while ((m = bulletRe.exec(text)) !== null) {
    addIfActionable(m[1].trim(), suggestions, seen);
  }

  // Match "Next step:" or "I recommend:" style sentences
  const directiveRe = /(?:next step|i recommend|you should|i suggest|action item|to do this)[:\s]+\*{0,2}([^.\n]+[.\n]?)\*{0,2}/gi;
  while ((m = directiveRe.exec(text)) !== null) {
    addIfActionable(m[1].trim(), suggestions, seen);
  }

  return suggestions.slice(0, 4); // Max 4 chips
}

const ACTION_VERBS = /^(check|verify|confirm|contact|reach out|call|email|text|send|ask|get|request|update|review|upload|add|set up|schedule|coordinate|look into|follow up|resolve|fix|ensure|arrange)/i;

function addIfActionable(line: string, suggestions: Suggestion[], seen: Set<string>) {
  // Clean markdown artifacts
  let clean = line.replace(/\*{1,2}/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
  // Remove trailing colons or periods
  clean = clean.replace(/[:.]+$/, "").trim();

  if (clean.length < 8 || clean.length > 120) return;
  if (seen.has(clean.toLowerCase())) return;

  // Must start with an action verb or contain strong action language
  if (!ACTION_VERBS.test(clean) && !/\b(need to|should|must|can|let's|have to)\b/i.test(clean)) return;

  seen.add(clean.toLowerCase());

  // Determine icon based on content
  let icon: Suggestion["icon"] = "chat";
  if (/\b(contact|call|email|text|reach out|phone)\b/i.test(clean)) icon = "contact";
  else if (/\b(schedule|calendar|date|show)\b/i.test(clean)) icon = "calendar";
  else if (/\b(document|tech pack|file|upload|rider)\b/i.test(clean)) icon = "doc";
  else if (/\b(check|review|verify|look)\b/i.test(clean)) icon = "navigate";

  suggestions.push({
    label: clean.length > 60 ? clean.slice(0, 57) + "…" : clean,
    followUp: `Let's do this: ${clean}. What's the best approach?`,
    icon,
  });
}

const ICON_MAP = {
  navigate: Navigation,
  doc: FileText,
  contact: Users,
  calendar: Calendar,
  chat: MessageCircle,
};

const TelaSuggestionChips = ({ content, onFollowUp, isLatest }: TelaSuggestionChipsProps) => {
  const navigate = useNavigate();

  // Only show chips on the latest assistant message
  if (!isLatest) return null;

  const suggestions = extractSuggestions(content);
  if (suggestions.length === 0) return null;

  const handleClick = (suggestion: Suggestion) => {
    // Check if this maps to a route
    for (const rp of ROUTE_PATTERNS) {
      if (rp.pattern.test(suggestion.label)) {
        navigate(rp.route);
        return;
      }
    }
    // Otherwise send as follow-up
    onFollowUp(suggestion.followUp);
  };

  return (
    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border/50">
      {suggestions.map((s, i) => {
        const Icon = ICON_MAP[s.icon || "chat"];
        return (
          <button
            key={i}
            onClick={() => handleClick(s)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 hover:border-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Icon className="h-3 w-3 shrink-0" />
            <span className="truncate">{s.label}</span>
            <ArrowRight className="h-3 w-3 shrink-0 opacity-50" />
          </button>
        );
      })}
    </div>
  );
};

export default TelaSuggestionChips;
