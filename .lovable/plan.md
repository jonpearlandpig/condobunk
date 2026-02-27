
Root cause is now clear from runtime evidence: the backend is correctly fetching Boston, but the model is still answering incorrectly.

What I verified:
- `targetCities` correctly detects Boston in direct queries.
- `Date window` includes Boston dates.
- `Events in context` includes `"Boston, MA"`.
- Yet outbound replies still claim “Boston is not on schedule.”

So this is no longer a data-fetch bug; it’s a response-reliability bug caused by prompt behavior + contaminated conversation history.

Implementation plan (single file):
- File: `supabase/functions/tourtext-inbound/index.ts`
- No database changes required.

1) Add deterministic “city-on-schedule” responder before AI generation
- Detect schedule-presence intents (examples: “Boston show?”, “Is Boston on schedule?”, “Boston not on schedule?”).
- Resolve city membership from `allEvents` directly and return factual SMS immediately.
- If scheduled, include date + venue; if not scheduled, say not found.
- This removes model guesswork for the exact failure case.

2) Add short follow-up city carryover
- When message is a brief correction/follow-up (e.g., “Yes it is”, “Nope”, “that’s wrong”) and has no city mention, inherit city from the previous inbound user message.
- Reuse that inferred city in the deterministic schedule check.

3) Prevent assistant self-contamination in prompt history
- Keep recent user messages for conversational context.
- Stop feeding prior assistant SMS replies back into the model prompt (those prior wrong claims are currently reinforcing future wrong claims).

4) Harden AI prompt with explicit schedule authority rules
- Add a compact “Schedule Facts” section derived from `eventsRes` (city/date/venue list).
- Add explicit instruction:
  - Schedule section is authoritative.
  - If a city appears there, never say it is not on the schedule.
  - Missing VAN/tech details does not mean city is unscheduled.

5) Keep/adjust logging for verification
- Retain concise logs for:
  - effective target cities (including carried-over city),
  - deterministic branch triggered or not,
  - schedule match result.
- This makes production verification immediate without guessing.

Validation checklist after implementation:
1. “Boston show?” should return Boston date/venue directly.
2. “Low steel in Boston and haze in Cleveland” should not claim Boston is unscheduled; it should state Boston is scheduled and only mark missing tech details as unknown if absent.
3. “Yes it is” immediately after a Boston dispute should resolve using prior-city carryover, not generic AI drift.
4. Confirm outbound SMS no longer contains “Boston is not on schedule” for this tour unless truly absent.
