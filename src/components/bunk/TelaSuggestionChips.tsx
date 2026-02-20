import { ArrowRight, FileText, Users, Calendar, MessageCircle, Upload, Zap, Phone } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface TelaSuggestionChipsProps {
  content: string;
  onFollowUp: (text: string) => void;
  isLatest: boolean;
}

interface Suggestion {
  label: string;
  followUp: string;
  icon: keyof typeof ICON_MAP;
}

const ICON_MAP = {
  contact: Users,
  doc: FileText,
  calendar: Calendar,
  chat: MessageCircle,
  upload: Upload,
  action: Zap,
  phone: Phone,
};

// ─── Named contact references from [Source: Contacts — Name] ───
function extractContactRefs(text: string): Suggestion[] {
  const results: Suggestion[] = [];
  const sourceRe = /\[Source:\s*Contacts?\s*—\s*([^\]]+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = sourceRe.exec(text)) !== null) {
    const names = m[1].split(/,\s*/);
    for (const raw of names) {
      const name = raw.trim();
      if (name.length < 2) continue;
      results.push({
        label: `Reach out to ${name}`,
        followUp: `Help me draft a message to ${name}. What should I say and what's their contact info?`,
        icon: "phone",
      });
    }
  }
  return results;
}

// ─── Bold-prefixed sections: **Action:**, **Next Step:**, **Example Fix:** ───
function extractBoldSections(text: string): Suggestion[] {
  const results: Suggestion[] = [];
  // Match **Label:** or **Label** followed by content until next ** or end
  const boldRe = /\*\*(Action|Next Steps?|Example Fix|Recommendation|To Do|Fix|Resolution|Solution|What to do)[:\s]*\*\*[:\s]*([^\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = boldRe.exec(text)) !== null) {
    const sectionType = m[1].toLowerCase();
    let content = m[2].trim();
    // Clean markdown/source citations
    content = cleanLine(content);
    if (content.length < 10) continue;

    // If it's a conditional ("If you have..." / "If not..."), split into options
    const ifParts = content.split(/\.\s*If not[,\s]*/i);
    if (ifParts.length > 1) {
      for (const part of ifParts) {
        const clean = cleanLine(part);
        if (clean.length >= 10) {
          results.push(makeSuggestion(clean, sectionType));
        }
      }
    } else {
      results.push(makeSuggestion(content, sectionType));
    }
  }
  return results;
}

// ─── Inline action phrases within prose ───
function extractInlineActions(text: string): Suggestion[] {
  const results: Suggestion[] = [];

  // "you should [verb]..." / "I recommend [verb]..." / "you can [verb]..."
  const inlineRe = /(?:you should|i recommend|you can|i can|you need to|i suggest|let me|we should|we need to)\s+([^.!?\n]{10,80})/gi;
  let m: RegExpExecArray | null;
  while ((m = inlineRe.exec(text)) !== null) {
    const clean = cleanLine(m[1]);
    if (clean.length >= 10) {
      results.push(makeSuggestion(clean, "inline"));
    }
  }

  // "reach out to [Name]" / "contact [Name]" / "call [Name]"
  const reachRe = /(?:reach out to|contact|call|text|email)\s+(?:[""]([^""]+)[""]|"([^"]+)"|(\w+(?:\s+\w+)?))\s*(?:\(([^)]+)\))?/gi;
  while ((m = reachRe.exec(text)) !== null) {
    const name = (m[1] || m[2] || m[3] || "").trim();
    const role = m[4]?.trim();
    if (name.length < 2 || /^(the|a|an|your|our|their|this|that)$/i.test(name)) continue;
    const label = role ? `Contact ${name} (${role})` : `Contact ${name}`;
    results.push({
      label: label.length > 55 ? label.slice(0, 52) + "…" : label,
      followUp: `Help me reach out to ${name}${role ? ` (${role})` : ""}. Draft a message and show me their contact info.`,
      icon: "phone",
    });
  }

  return results;
}

// ─── Numbered & bulleted list items ───
function extractListItems(text: string): Suggestion[] {
  const results: Suggestion[] = [];
  const listRe = /(?:^|\n)\s*(?:\d+[.)]\s*|[-*•]\s+)\*{0,2}([^\n]+)\*{0,2}/g;
  let m: RegExpExecArray | null;
  while ((m = listRe.exec(text)) !== null) {
    const clean = cleanLine(m[1]);
    if (clean.length >= 10 && isActionable(clean)) {
      results.push(makeSuggestion(clean, "list"));
    }
  }
  return results;
}

// ─── "provide" / "upload" / "send" requests (TELA asking user to do something) ───
function extractUserPrompts(text: string): Suggestion[] {
  const results: Suggestion[] = [];
  const promptRe = /(?:please\s+)?(provide|upload|send|share|attach|paste)\s+(?:the\s+|a\s+|your\s+)?([^.!?\n]{8,60})/gi;
  let m: RegExpExecArray | null;
  while ((m = promptRe.exec(text)) !== null) {
    const verb = m[1].toLowerCase();
    const obj = cleanLine(m[2]);
    if (obj.length < 6) continue;

    if (verb === "upload" || verb === "attach") {
      results.push({
        label: `Upload ${obj}`,
        followUp: `I'll upload the ${obj} now. Where should I add it?`,
        icon: "upload",
      });
    } else {
      results.push({
        label: `${capitalize(verb)} ${obj}`,
        followUp: `Here's what I have for ${obj} — let me provide it now.`,
        icon: "chat",
      });
    }
  }
  return results;
}

// ─── Helpers ───

function cleanLine(s: string): string {
  return s
    .replace(/\*{1,2}/g, "")
    .replace(/\[Source:[^\]]*\]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[""\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/[:.]+$/, "")
    .trim();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ACTION_VERBS = /^(check|verify|confirm|contact|reach out|call|email|text|send|ask|get|request|update|review|upload|add|set up|schedule|coordinate|look into|follow up|resolve|fix|ensure|arrange|provide|share|draft|prepare|create|notify)/i;

function isActionable(line: string): boolean {
  if (ACTION_VERBS.test(line)) return true;
  if (/\b(need to|should|must|can|let's|have to|will)\b/i.test(line)) return true;
  return false;
}

function makeSuggestion(content: string, _context: string): Suggestion {
  const label = content.length > 55 ? content.slice(0, 52) + "…" : content;

  let icon: keyof typeof ICON_MAP = "action";
  if (/\b(contact|call|email|text|reach out|phone|message)\b/i.test(content)) icon = "phone";
  else if (/\b(upload|attach|file|document|tech pack|rider|packet)\b/i.test(content)) icon = "upload";
  else if (/\b(schedule|calendar|date|show|event)\b/i.test(content)) icon = "calendar";
  else if (/\b(add|create|update|resolve|fix)\b/i.test(content)) icon = "action";

  return {
    label,
    followUp: `Let's do this: ${content}. Help me with the next steps.`,
    icon,
  };
}

// ─── Main extraction pipeline ───

function extractAllSuggestions(text: string): Suggestion[] {
  const all: Suggestion[] = [];
  const seen = new Set<string>();

  const addUnique = (items: Suggestion[]) => {
    for (const item of items) {
      const key = item.label.toLowerCase().slice(0, 40);
      if (seen.has(key)) continue;
      // Skip if a very similar label exists
      let isDupe = false;
      for (const existing of seen) {
        if (key.includes(existing.slice(0, 20)) || existing.includes(key.slice(0, 20))) {
          isDupe = true;
          break;
        }
      }
      if (isDupe) continue;
      seen.add(key);
      all.push(item);
    }
  };

  // Priority order: bold sections > contact refs > user prompts > inline > list items
  addUnique(extractBoldSections(text));
  addUnique(extractContactRefs(text));
  addUnique(extractUserPrompts(text));
  addUnique(extractInlineActions(text));
  addUnique(extractListItems(text));

  return all.slice(0, 5);
}

// ─── Route patterns for navigation chips ───
const ROUTE_PATTERNS: { pattern: RegExp; route: string }[] = [
  { pattern: /\b(check|view|review|open)\b.*\b(schedule|calendar|dates)\b/i, route: "/bunk/calendar" },
  { pattern: /\b(check|view|review|open)\b.*\b(document|tech pack|file|rider)\b/i, route: "/bunk/documents" },
  { pattern: /\b(check|view|review|open)\b.*\b(contact|staff|crew|roster)\b/i, route: "/bunk/coverage" },
  { pattern: /\b(check|view|review|open)\b.*\b(conflict|issue)\b/i, route: "/bunk/conflicts" },
  { pattern: /\b(check|view|review|open)\b.*\b(gap|missing|unknown)\b/i, route: "/bunk/gaps" },
  { pattern: /\bupload\b/i, route: "/bunk/documents" },
];

const TelaSuggestionChips = ({ content, onFollowUp, isLatest }: TelaSuggestionChipsProps) => {
  const navigate = useNavigate();

  if (!isLatest) return null;

  const suggestions = extractAllSuggestions(content);
  if (suggestions.length === 0) return null;

  const handleClick = (suggestion: Suggestion) => {
    for (const rp of ROUTE_PATTERNS) {
      if (rp.pattern.test(suggestion.label)) {
        navigate(rp.route);
        return;
      }
    }
    onFollowUp(suggestion.followUp);
  };

  return (
    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border/50">
      {suggestions.map((s, i) => {
        const Icon = ICON_MAP[s.icon];
        return (
          <button
            key={i}
            onClick={() => handleClick(s)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 hover:border-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Icon className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[200px]">{s.label}</span>
            <ArrowRight className="h-3 w-3 shrink-0 opacity-50" />
          </button>
        );
      })}
    </div>
  );
};

export default TelaSuggestionChips;
