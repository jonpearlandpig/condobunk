
Root cause confirmed from live runtime evidence (not guesswork):

1) “North Carolina” is not parsed as a location today.
- Current parser only matches city names/venue words from schedule rows.
- Full state names (e.g., “North Carolina”) and state abbreviations aren’t mapped to tour cities.
- So the message becomes an ambiguous follow-up, not a confident location match.

2) “Raleigh?” and “North Carolina” fell into LLM fallback instead of deterministic handling.
- Deterministic venue-tech branch only runs when the current message contains explicit tech keywords (“haze”, “labor”, etc.).
- “Raleigh?” has no tech keyword, so the system skipped deterministic extraction even though the prior turn was clearly haze-related.

3) Context window widened across years and polluted prompt scope.
- For city-only asks, date range is currently min/max across all matching events for that city.
- For Raleigh there are events in both 2023 and 2026, producing a huge window (seen in logs).
- Query then fetches date-window rows with limit(10), which can exclude the target city’s VAN while still including unrelated context.

4) Stale prior city/topic leaked into responses.
- Because LLM fallback still saw prior user turns (including Cleveland question), it kept Cleveland in answers when user shifted to Raleigh/NC.

What I will implement (priority order):

Phase 1 — Immediate reliability hardening in SMS (`supabase/functions/tourtext-inbound/index.ts`)

A) Add robust location parsing for state-based asks
- Extend relevance extraction to support:
  - Full state names (“North Carolina”)
  - State abbreviations (“NC”, “N.C.”)
- Build a city-state index from schedule rows (`City, ST`) and map state input -> matching tour cities.
- Result: “North Carolina” deterministically resolves to Raleigh (or multiple NC stops if present).

B) Add topic carryover for location-only follow-ups
- Detect location-only follow-ups (examples: “Raleigh?”, “North Carolina”, “what about Raleigh”).
- Backtrack recent inbound messages to inherit the last explicit topic when current turn has location but no topic keyword.
- If inherited topic is venue-tech, route to deterministic venue-tech extractor (not LLM).
- Result: after “Haze restrictions?” then “Raleigh?” it stays on haze and does not drift.

C) Add deterministic schedule responder for location-only queries
- If message resolves a location but no tech/logistics/contact intent is present, respond deterministically from schedule rows.
- Output only matched city/state rows (not full broad date-window context).
- Result: terse, factual answers like:
  - “Raleigh, NC — 2026-03-22 at Lenovo Center (PNC Arena)”

D) Replace min/max multi-year city windowing with anchor-date logic
- For city-only context, choose a single anchor event per city:
  - nearest upcoming event first; if none, latest past event.
- Build narrow windows around anchor(s), not across historical min/max.
- Result: removes 2023→2026 expansion and unrelated city bleed.

E) Guarantee target VAN selection even when date-window rows are limited
- Resolve target VAN from all tour VANs first, then include it first in packed context.
- Do not depend on “date-window VANs not empty” shortcut that can miss target due limit(10).
- Result: Raleigh VAN is included when Raleigh is the target.

F) Tighten LLM fallback history scope
- When explicit new location is detected, keep only relevant recent user turns for same location/topic in LLM history.
- Prevent stale city carryover (e.g., Cleveland) after user pivots to Raleigh/NC.

G) Add explicit diagnostics for fast incident debugging
- Log:
  - parsed state/city resolution
  - inherited topic (if any)
  - deterministic branch used (schedule vs venue-tech vs LLM)
  - chosen anchor date
  - whether target VAN was included

Phase 2 — Channel parity hardening (same behavior in web + voice)

Files:
- `supabase/functions/akb-chat/index.ts`
- `supabase/functions/elevenlabs-conversation-token/index.ts`

H) Add same state/location normalization helper and location-only intent behavior.
I) Add deterministic schedule/venue-tech pre-resolution block before LLM phrasing in these channels too.
J) Keep “I don’t have that information” behavior when a field is truly missing, but only after deterministic lookup checks all scoped sources.

Validation plan (must pass before closing):

1) Exact failure replay
- “Haze restrictions?”
- “How about in Cleveland?”
- “Raleigh?”
- “North Carolina”
Expected:
- Cleveland and Raleigh each resolved correctly for the active topic.
- No stale Cleveland mention once user pivots to Raleigh/NC.

2) State-only query behavior
- “North Carolina”
Expected:
- Deterministic city mapping from state to schedule row(s); no “I don’t have that information” when schedule data exists.

3) Multi-year duplicate city
- City with historical + current entries (e.g., Raleigh 2023 + 2026)
Expected:
- nearest relevant anchor chosen; no giant multi-year context window.

4) True missing data behavior
- Ask for missing field in a city with no value.
Expected:
- exact gap message (“<field> not listed in <city> VAN”), no guessing.

5) Regression
- Existing Boston labor/haze deterministic flow still works.
- “Look again” / “Wrong” carryover still works.
- No duplicate outbound SMS behavior changes.

Scope and safety:
- No schema changes.
- No auth/RLS changes.
- No secrets changes.
- Backend function logic hardening only.

Why this fixes your specific complaint:
- “Raleigh” wasn’t reliably seen because state/location parsing + fallback routing were too weak.
- “Cleveland” stuck because ambiguous location turns were sent to LLM with stale history and broad context.
- This plan moves those cases to deterministic resolution first, narrows context to the correct stop, and only uses LLM for phrasing when scope is already locked.
