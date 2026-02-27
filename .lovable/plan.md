
Goal: fully enforce “Bunk Stash is private per user” and stop stale leaked answers from being reused in TELA.

What I found
- The backend filter on `user_artifacts` in `supabase/functions/akb-chat/index.ts` is now correct and RLS data is consistent:
  - Caleb has 2 `bunk_stash` artifacts.
  - Jonathan has 1 `condobunk` artifact.
  - SQL equivalent of the current filter only returns Jonathan’s own/shared artifacts.
- The leak you’re seeing now is from conversation contamination:
  - First private answer was generated in older function deployment (`version 191`).
  - Later messages were generated in current deployment (`version 194`), but those runs reused prior assistant turns from the same thread.
  - `BunkChat` sends full thread history (`user + assistant`) back to `akb-chat`, so old leaked assistant content can keep influencing new answers.

Implementation plan

1) Harden `akb-chat` history handling so stale assistant leaks can’t be reused
- File: `supabase/functions/akb-chat/index.ts`
- Changes:
  - Build a sanitized model history from **user messages only** (drop prior assistant messages from the request payload before calling the model).
  - Cap sanitized history (e.g., last 20 user turns) for deterministic behavior.
  - Add strict prompt rule: prior conversation text is untrusted context; factual answers must come only from current AKB data section.
  - Keep existing artifact query filter (already correct).
- Why this is needed:
  - Prevents old leaked assistant text in the thread from being used as a source in future responses.

2) Add explicit artifact-allowlist guardrail in prompt context
- File: `supabase/functions/akb-chat/index.ts`
- Changes:
  - Include a compact list of accessible artifact titles in prompt context (derived from filtered query results).
  - Add rule: if requested artifact isn’t in the accessible list, respond with “not available in your accessible artifacts” and do not infer.
- Why this is needed:
  - Defense-in-depth against model drift/hallucination around artifact names.

3) Contain already-leaked thread content in the web chat UI
- File: `src/pages/bunk/BunkChat.tsx`
- Changes:
  - On thread load, fetch currently accessible artifact titles (RLS-scoped).
  - Detect assistant messages citing artifact sources (`[Source: Artifact — ...]`).
  - If citation doesn’t match accessible titles, replace rendered content with a redacted notice (non-destructive UI redaction).
- Why this is needed:
  - You currently still “see” old leaked responses in existing threads; this removes visible exposure immediately without risky bulk deletes.

4) Apply same outbound-history safety to mini TELA entry point
- File: `src/components/bunk/VenueTelaMini.tsx`
- Changes:
  - Ensure request payload to `akb-chat` sends user-intent context only (not prior assistant output), matching the new privacy-safe pattern.
- Why this is needed:
  - Keeps behavior consistent across both TELA entry points and prevents reintroducing contamination through mini chat.

5) Verification checklist (end-to-end)
- Test as Jonathan in an existing contaminated thread:
  - Ask “Bus one code?” / “Bus driver checklist?” → should refuse if not in Jonathan-visible artifacts.
  - Previously leaked assistant rows should display as redacted notices.
- Test as Jonathan in a fresh thread:
  - Same prompts should not reveal Caleb’s private stash.
- Test as Caleb:
  - Caleb still gets his own `bunk_stash` answers.
- Regression check:
  - Shared `condobunk`/`tourtext` artifacts remain accessible to tour members.
  - Progressive follow-ups still work with user-only history.

Technical notes
- No schema change required.
- No policy change required (RLS is already correct).
- Main issue is trust boundary of conversation history, not raw table access.
