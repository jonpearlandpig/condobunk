

## Progressive Depth for TourText SMS Responses

### What Changes

Add a "Progressive Depth" protocol so that TELA rewards curiosity. Simple first-time questions get a quick, punchy answer. Follow-up questions on the same topic automatically unlock more detail.

### How It Works

**Depth 1 (Default)** -- First question on a topic
- Single most important fact, 1-2 lines
- Example: "Haze for Boston?" -> "Haze OK at MGM, just heads up FOH before starting."

**Depth 2** -- Second question on same topic (or "tell me more", "details", "what else")
- Operational context, 3-5 lines
- Example: "What about the haze machine specs?" -> "MGM allows MDG theONE or Ultratec Radiance. No oil-based. Venue requires 30min pre-show burn-off. FOH has final say on density. Union stagehand must operate."

**Depth 3** -- Third question or explicit "everything" / "full rundown"
- Full detail dump, up to 1500 chars
- Example: "Give me the full haze rundown" -> Complete haze policy, machine specs, union rules, ventilation notes, emergency shutoff protocol, contact for questions

### Detection Logic

The depth level is determined by analyzing the conversation history (last 6 messages) that is already fetched:

1. **Topic extraction**: Use a lightweight keyword match to identify the topic of the current message (haze, labor, rigging, hotel, load-in, doors, etc.)
2. **History scan**: Count how many of the recent messages touch the same topic
3. **Explicit depth triggers**: Phrases like "tell me more", "details", "full rundown", "everything about", "what else" immediately bump to Depth 2 or 3

### System Prompt Update

The current system prompt tells TELA to "keep it under 300 characters when possible." This changes to a depth-aware instruction:

```
RESPONSE DEPTH PROTOCOL:
- Depth 1 (first ask): One punchy line, under 160 chars. Just the key fact.
- Depth 2 (follow-up or "tell me more"): 2-4 lines of operational context, under 480 chars.
- Depth 3 (third ask or "full rundown"/"everything"): Complete detail, up to 1500 chars.

Current depth level: {depth}
```

The depth value is computed before the AI call and injected into the system prompt.

### max_tokens Scaling

- Depth 1: `max_tokens: 150`
- Depth 2: `max_tokens: 300`
- Depth 3: `max_tokens: 600`

This saves AI cost on simple questions and gives room for detail on deep dives.

### Implementation Details

**File: `supabase/functions/tourtext-inbound/index.ts`**

1. Add a `detectDepth()` function after the conversation history is built:
   - Extract topic keywords from the current message (venue-specific terms, schedule terms, contact terms)
   - Scan the `recentHistory` array for messages with overlapping topic keywords
   - Count same-topic exchanges; check for explicit depth triggers ("more", "details", "everything", "full rundown", "elaborate")
   - Return depth level: 1, 2, or 3

2. Before the AI call, compute depth and inject it into the system prompt:
   - Replace the static "keep it under 300 characters" line with the depth-aware protocol
   - Set `max_tokens` based on depth level

3. The topic detection uses simple keyword groups (not AI) to keep latency zero:
   - Schedule: load-in, doors, soundcheck, curfew, show time, set time
   - Venue tech: haze, rigging, steel, power, docks, labor, union, staging, SPL
   - Logistics: hotel, routing, bus, truck, travel, drive, fly
   - Contacts: PM, TM, LD, FOH, name-based lookups
   - Guest list: tickets, guest, comp, will call

No database changes required. No new tables or columns needed. This is purely a logic change within the existing edge function.
