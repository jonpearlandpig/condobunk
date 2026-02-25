

# TELA Progressive Depth Response Protocol

## Concept

TELA currently responds with full detail on every question. The upgrade introduces a "Progressive Depth" behavior: short, high-signal first answers that reward curiosity with deeper follow-ups. This teaches crew that asking more = knowing more, and keeps initial responses fast and scannable (especially important for TourText SMS).

## How It Works

**Depth Level 1 (First question on a topic):** Answer with the single most important fact. No context, no contacts, no caveats. Just the answer.

- "Docks?" -> "2 loading docks." 
- "Curfew?" -> "11 PM."
- "Power?" -> "400A 3-phase."

**Depth Level 2 (Follow-up on same topic):** Expand with location, logistics, contacts, and operational detail.

- "Where?" -> "Northwest corner past security gate. Guards on duty are Frank and Stacy. Trucks expected 4 AM. Onsite contact: Frank, 555-555-1213."

**Depth Level 3 (Further drill-down):** Full context — related documents, download links, known gaps, action blocks if something needs fixing.

The model determines depth from conversation history (the full message array is already sent). No new database tables or state tracking needed — the AI reads the thread and escalates naturally.

## Changes

### `supabase/functions/akb-chat/index.ts` — System Prompt Update

Add a new `## RESPONSE DEPTH PROTOCOL` section right after the opening paragraph (before "CRITICAL BEHAVIOR: SOLVE, DON'T JUST REPORT"). This section will contain:

```
## RESPONSE DEPTH PROTOCOL (Progressive Disclosure)

Your default response style is SHORT AND PUNCHY. Crew are busy. Reward curiosity.

### Depth Rules:

**DEPTH 1 — First question on a topic (default):**
- Answer with the SINGLE most important fact. One line. No preamble.
- Examples:
  - "Docks?" -> "2 loading docks. [Source: VAN — Venue — Dock & Logistics]"
  - "Curfew?" -> "11 PM. [Source: VAN — Venue — Misc]"
  - "Power?" -> "400A 3-phase. [Source: VAN — Venue — Power]"
  - "Who's the PM?" -> "Sarah Chen, 555-1234. [Source: Contacts — Sarah Chen]"
- Do NOT add context, warnings, related info, or follow-up suggestions unless
  the data reveals an urgent issue (conflict, missing critical field).
- Keep source citations but make them compact (one tag at end of line).

**DEPTH 2 — Follow-up or "tell me more" on same topic:**
- Expand with location, logistics, contacts, timing, and operational context.
- Example: "Docks?" -> "2" ... then "Location?" -> "Northwest corner past 
  security gate. Guards: Frank and Stacy. Trucks expected 4 AM. Onsite 
  contact: Frank, 555-555-1213. [Source: VAN — Venue — Dock & Logistics]"
- Include relevant contacts, phone numbers, and practical details.
- Still concise — a short paragraph, not a wall of text.

**DEPTH 3 — Deep drill-down, explicit request for everything, or complex query:**
- Full detail: documents with download links, related gaps/conflicts,
  action blocks for fixes, cross-references between sources.
- This is where you show the FULL power of the AKB.
- Use structured formatting (bullets, bold labels) for scanability.

### How to determine depth:
- Count how many times the user has asked about the SAME topic/venue/field
  in the current conversation. First mention = Depth 1. Second = Depth 2. 
  Third+ or explicit "tell me everything" = Depth 3.
- A broad question like "Tell me about Detroit" or "What do I need to know
  about load-in?" starts at Depth 2 (the question itself implies they want
  more than a number).
- Questions with multiple sub-topics ("docks and power and curfew?") get
  Depth 1 for each: a compact list of one-line answers.
- Action blocks (fixes) are ALWAYS included regardless of depth when TELA
  detects an issue it can resolve — but at Depth 1, keep the explanation
  to one sentence before the block.

### The philosophy:
Every crew member who texts TourText or asks TELA should instantly see that
the system KNOWS the answer. Short replies prove confidence. Follow-ups
prove depth. The message to the user: "Ask more, and I'll show you 
everything. The data is here."
```

Also update the existing Rules section line "Keep responses concise — tour managers are busy." to reinforce the new behavior:

Change:
```
- Keep responses concise — tour managers are busy.
```
To:
```
- Default to Depth 1 (shortest useful answer). Let the user pull more detail by asking follow-ups. Tour managers are busy — prove you know the answer in one line, then go deep when they want it.
```

## Technical Details

- **No new files, tables, or migrations** — this is purely a system prompt behavioral change
- **No frontend changes** — the chat UI already handles short and long responses
- **Conversation history already sent** — the `messages` array in the request body contains the full thread, so TELA can naturally detect follow-up patterns
- **SMS-ready** — this pattern is ideal for TourText since first responses will be short enough for a single SMS segment
- **Source citations preserved** — even Depth 1 answers include a compact citation

