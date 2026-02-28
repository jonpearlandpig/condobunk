
Goal: Make TELA reliably return correct AKB facts (especially venue-tech answers) on the first try, at scale, without guessing and without depending on fragile conversation carryover.

What I confirmed from your live backend data/logs:
1) The data exists, but isn’t always reaching the model.
- Boston VAN row contains:
  - `misc.haze_restrictions = "Water based hazers only"`
  - `labour.labor_notes = "8hr minimum for everyone."`
- But in the failing window (3/12–3/14), VAN rows are large (4041 + 4215 + 3872 chars).
- Current SMS function concatenates all VAN rows then hard-cuts to 4000 chars. Boston starts after char 4119, so it gets chopped out.

2) Follow-up correction handling is too shallow.
- “Look again” and “Wrong.” lost city scope because carryover only checks one prior inbound message.
- If that one prior message is also short (“Look again”), context collapses and date window drifts.

3) Current reliability protections are prompt-only in this path.
- Date injection + anti-hallucination rules are good, but they cannot fix missing retrieval context.

Implementation plan

Phase 1 (immediate hardening in SMS path) — highest priority
File: `supabase/functions/tourtext-inbound/index.ts`

A) Strengthen follow-up context carryover (multi-step, not single-step)
- Expand correction/follow-up intent patterns to include:
  - “look again”, “check again”, “again”, “that’s wrong”, “you’re wrong”, “not right”, etc.
- Replace one-message carryover with backtracking across last 6 inbound messages.
- Carry forward city + venue + date together from the most recent resolvable prior user message.

B) Add deterministic venue-tech responder (bypass LLM for critical factual asks)
- Trigger on venue-tech intents (labor/labour, haze, union, power, dock, rigging, staging, SPL, curfew).
- Resolve target VAN deterministically via ranking:
  1. exact city + date
  2. exact city
  3. venue match
  4. nearest event-date fallback
- Extract facts directly from VAN JSON (alias-safe):
  - `labour.*` and `labor.*`
  - `misc.haze_restrictions`, `misc.audio_spl_restrictions`, `misc.curfew`
  - plus requested sections as needed
- If field exists: return factual value.
- If field missing: return precise field-level gap (not broad “don’t have info”).
- If no venue can be resolved: ask a short clarification (city/date), not a guess.

C) Fix VAN packing so target venue cannot be truncated out
- Stop applying a single 4000-char cut after full VAN concatenation.
- Build relevance-first VAN context:
  - Always include target VAN first
  - Per-venue cap (e.g., compact summary + limited raw snippet)
  - Then add nearby venues if budget remains
- Keep total context cap but preserve target venue guarantee.

D) Add explicit reliability logging for auditability
- Log:
  - resolved intent + entity scope (city/date/venue)
  - selected VAN id(s)
  - deterministic branch hit vs LLM fallback
  - whether target VAN made it into context
- This makes future misses diagnosable in minutes.

Phase 2 (channel parity hardening)
Files:
- `supabase/functions/akb-chat/index.ts`
- `supabase/functions/elevenlabs-conversation-token/index.ts`

E) Add “Verified Venue Facts” precomputed block from deterministic extractor
- For venue-tech questions, compute structured facts server-side from VAN data and prepend them in prompt.
- Keep existing anti-hallucination/date rules.
- This reduces miss risk in web chat and voice when AKB is large (many cities/venues).

F) Keep model as fallback, not source of truth for critical venue-tech facts
- Deterministic extraction is authoritative when a venue is resolvable.
- LLM handles phrasing and non-critical synthesis.

Validation plan (must pass before closing)
1) Replay exact failing sequence:
- “Labor notes for Boston? Or haze?”
- “Look again”
- “Wrong.”
Expected:
- First answer returns Boston labor + haze from VAN.
- Follow-ups remain Boston-scoped and repeat/correct with same facts (no drift).

2) Missing-field behavior
- Ask for a field absent in VAN (example on another stop).
Expected:
- Specific gap message (“X not listed for [city/date]”), no invented value.

3) Multi-city behavior
- Ask: “Labor for Boston and Bridgeport?”
Expected:
- Segmented answer per city with real values/gaps.

4) Regression checks
- Schedule deterministic responder still works.
- Artifact deterministic responder still works.
- No duplicate outbound SMS behavior change.

Scope and safety
- No database schema changes.
- No RLS changes.
- No new secrets.
- Backend logic hardening only.

Why this will stop the “again” pattern
- It removes the two observed failure modes directly:
  1) target facts being cut out of context
  2) follow-up context dropping on short corrections
- It also reduces dependence on model recall for critical venue-tech truth by using deterministic extraction first.
