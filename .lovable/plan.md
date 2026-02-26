
Goal: fix the “big fail” so extraction failures are honest, actionable, and never silently reported as successful “CONTACTS — 0 items” when AI processing actually failed.

What I found (root cause)
1) The backend is receiving AI provider failures (402 “Not enough credits”) during extraction.
- Edge logs clearly show:
  - `PDF extraction failed: 402 {"type":"payment_required","message":"Not enough credits"}`
  - `Text extraction API error: 402`
2) Those failures are currently swallowed.
- `aiExtractFromPdf` / `aiExtractFromText` log the status and return `null` instead of propagating a typed error.
3) After null AI result, the function falls through into generic/fallback paths.
- In multi-venue path: “returned no venues, falling through”
- In general path: if `rawText` exists, it returns a 200 domain-only result with `extracted_count: 0`
- This is why users can see misleading success states like `Extracted CONTACTS — 0 items`.
4) Frontend error handling is too generic.
- `invokeWithTimeout` wraps non-200 responses as plain `Error(text)`, making it harder to branch on status (402 vs timeout vs 422).

Implementation plan

Phase 1 — Make backend errors explicit and structured
A) Introduce a typed extraction error shape in `supabase/functions/extract-document/index.ts`
- Example fields:
  - `status` (number)
  - `code` (`AI_PAYMENT_REQUIRED`, `AI_RATE_LIMIT`, `AI_PROVIDER_ERROR`, `EXTRACTION_EMPTY_RESULT`)
  - `message` (human-readable)
  - `provider_status` (original HTTP status)
  - `provider_body` (trimmed)
B) Update `aiExtractFromPdf` and `aiExtractFromText`
- Instead of returning `null` on non-OK responses:
  - map 402 => `AI_PAYMENT_REQUIRED`
  - map 429 => `AI_RATE_LIMIT`
  - map 5xx/other => `AI_PROVIDER_ERROR`
- Return a typed result object (or throw a typed error) so caller can distinguish:
  - “provider failed” vs “model returned empty/invalid JSON”
C) Preserve current JSON sanitation/parsing behavior for successful responses.

Phase 2 — Stop silent fallback for authority/AI-dependent document types
A) In multi-venue/advance-master path:
- If extraction failed due typed AI provider error (402/429/etc), immediately return that status and error payload (do not fall through).
- If extraction technically succeeds but returns zero venues, return 422 with explicit `EXTRACTION_EMPTY_RESULT` for these document types.
B) In tech-pack path:
- same strategy: no silent fallthrough when provider failure is known.
C) In general path:
- keep domain-only fallback only for truly safe cases (plain text heuristic use), not when a known provider error occurred.
- If provider error occurred earlier in the request, return that error directly.

Phase 3 — Improve frontend classification and UX
A) Update `src/lib/invoke-with-timeout.ts`
- Parse non-OK response body as JSON when possible.
- Return an error object containing:
  - `status`
  - `code`
  - `message`
  - raw body fallback
B) Update extraction callers (`BunkSetup.tsx` and `BunkDocuments.tsx`)
- Branch by error status/code:
  - 402 / `AI_PAYMENT_REQUIRED`: show clear message (“Extraction paused: AI credits exhausted. Retry after credits refresh/top-up.”)
  - 429 / `AI_RATE_LIMIT`: show retry-after guidance
  - timeout/network: keep existing recovery polling
  - 422 empty-result: show “No extractable structure found” guidance
- Do not run “timeout recovery polling” for known provider errors (402/429), because extraction did not complete in background.

Phase 4 — Guardrails for authority workflows (Advance Master first)
A) For Advance Master uploads specifically:
- treat `isAdvanceMaster` extraction as strict mode:
  - if no venues extracted, fail explicitly
  - never return misleading success with zero extracted entities
B) Keep current authority dedup logic intact; this plan only hardens failure behavior and observability.

Phase 5 — Validation checklist
1) Re-run extraction on Advance Master with normal credits:
- expect successful venue/event extraction and dedup behavior unchanged.
2) Simulate/observe 402 condition:
- backend returns 402 JSON with `AI_PAYMENT_REQUIRED` (not 200 fallback).
- frontend toast clearly says credits issue; no “Extracted CONTACTS — 0 items”.
3) Simulate/observe 429:
- clear rate-limit message and retry guidance.
4) Ensure timeout path still works:
- network abort still enters polling recovery.
5) Regression checks:
- non-AI-safe text-only docs still classify properly when intended.
- no schema or auth changes required.

Technical notes
- Files impacted:
  - `supabase/functions/extract-document/index.ts`
  - `src/lib/invoke-with-timeout.ts`
  - `src/pages/bunk/BunkSetup.tsx`
  - `src/pages/bunk/BunkDocuments.tsx`
- No database migration needed.
- No RLS/auth policy change needed.
- This is mainly error propagation + fallback control + clearer UX messaging.

Optional follow-up (separate small fix)
- Console warning indicates `MobileBottomNav` passes refs to a non-forwardRef function component.
- I can provide a separate patch plan to wrap the relevant component with `React.forwardRef` and remove those warnings.
