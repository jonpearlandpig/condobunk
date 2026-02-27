
You’re right to call this out — the current behavior is still wrong, and I traced why.

### What I verified
- The TourText artifact exists and has WiFi data:
  - title: **Tour Wi‑Fi**
  - content preview: **[KOH] Tour Wifi / Password: koh-internet**
- The SMS function is fetching artifacts (`TourText artifacts in context: 1` in logs).
- But the final model context is being truncated:
  - combined context payload is ~**39k chars**
  - `vans` alone are ~**30k chars**
  - hard cap is `.substring(0, 16000)`
  - **Tour Artifacts are appended near the end**, so they are often cut off before the model sees them.
- Also, SMS history currently includes prior assistant replies, which can reinforce old bad responses (“I don’t have WiFi info”).

### Implementation plan

1. **Guarantee TourText artifacts survive context building**
   - File: `supabase/functions/tourtext-inbound/index.ts`
   - Replace the single end-of-string truncation strategy with **section-level budgets**.
   - Move **Tour Artifacts** above heavy VAN blocks in `akbContext`.
   - Cap large sections individually (especially VAN JSON) so artifacts are always present in the first part of prompt context.
   - Add debug logs for section lengths (`events_len`, `contacts_len`, `vans_len`, `artifacts_len`, `final_context_len`) so we can prove artifacts are included.

2. **Add deterministic “artifact-first” handling for WiFi/password/general tour-note intents**
   - In the same function, before LLM call:
     - detect keywords like `wifi`, `wi-fi`, `password`, `network`, `internet`, `tour code`, `house code`.
     - search fetched TourText artifacts for matching content/title.
     - if matched, send direct SMS response from artifact content (trimmed for SMS length) and skip LLM.
   - This creates a reliability path for exactly the public info you marked as critical.

3. **Remove assistant-history contamination in SMS AI calls**
   - Keep history for continuity/depth logic, but send **user messages only** to the model (same safety pattern already used in `akb-chat`).
   - This prevents stale incorrect assistant wording from being re-learned in follow-ups.

4. **Strengthen prompt guardrails (still in same file)**
   - Add explicit artifact allowlist line block from current query results (artifact titles/types).
   - Rule: for general tour info questions, consult Tour Artifacts first; if not found, state that clearly without inventing.

5. **Verification checklist**
   - Send SMS: **“Tour WiFi?”** from Jon’s number.
     - Expected: returns WiFi artifact content (not “I don’t have info”).
   - Follow-up: **“password?”**
     - Expected: still resolves from artifact/history correctly.
   - Regression: ask venue-specific tech question (e.g., “Cleveland power?”)
     - Expected: still answered from VAN data.
   - Negative test on a tour with no TourText artifacts:
     - Expected: honest “not available in current tour notes.”

### Technical notes
- No database schema change needed.
- No RLS/policy changes needed.
- This is a prompt/context assembly + history hygiene fix in one backend function (`tourtext-inbound`), with deterministic fallback for critical public artifact intents.
