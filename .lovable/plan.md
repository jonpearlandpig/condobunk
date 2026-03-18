
Issue identified: the section progress is working as coded, but it is measuring the wrong thing for your expectation.

What’s happening now:
- The venue analysis did capture some data for this show.
- Database check shows multiple fields were populated and marked `needs_confirmation`.
- But the progress bars on `AdvanceShow` only count fields that are both:
  - `status === "confirmed"`
  - `locked_boolean === true`
- Since AI extraction does not auto-lock fields, every section still shows `0/x` even when values were captured.

Evidence from this show:
- Populated sections exist:
  - Event Details: 2 populated
  - Production Contact: 3 populated
  - House Rigger Contact: 1 populated
  - Summary: 1 populated
  - Plant Equipment: 2 populated
  - Labor: 1 populated
- Confirmed + locked fields: 0 in every section
- So “Nothing captured” is really “nothing confirmed/locked yet”

Root cause:
- `AdvanceShow.tsx` section progress and headline readiness percentage use confirmed+locked counts only.
- `AdvanceFields.tsx` also shows section counts using the same confirmed+locked rule.
- The analyzer writes extracted values as `needs_confirmation`, which is correct for governance, but the dashboard doesn’t separately visualize “captured by AI”.

Plan to fix:
1. Keep governance intact
- Do not auto-confirm or auto-lock AI-filled values.
- Preserve manual review as the gate for authoritative progress.

2. Split “captured” from “confirmed”
- Update `AdvanceShow.tsx` so each section card can show:
  - captured count = fields with a non-empty `current_value`
  - confirmed count = fields with `status === "confirmed"` and `locked_boolean`
- Keep the current progress bar for confirmed/locked if desired, but add visible captured info so the user can see extraction worked.

3. Improve top-level readiness copy
- Keep readiness based on confirmed/locked critical fields.
- Change nearby labels so it’s obvious this is “reviewed/locked progress”, not “AI capture progress”.
- Example:
  - “fields locked” stays for readiness
  - add “fields captured” as a separate KPI

4. Update section progress UI wording
- Replace the ambiguous current section display with clearer wording, for example:
  - `Captured 3/4`
  - `Locked 0/4`
- Or show a dual-state row:
  - primary bar = captured
  - secondary text = locked
- This avoids the impression that nothing happened.

5. Align the fields review page
- In `AdvanceFields.tsx`, section headers should also show both:
  - captured/populated
  - confirmed/locked
- This keeps the detail screen consistent with the dashboard.

6. Optional enhancement for better operator workflow
- Add a quick filter/chip for “Needs confirmation”
- Add a “Review captured fields” CTA from the dashboard to the fields page
- This makes it easy to approve extracted values section by section

Technical changes:
- `src/pages/bunk/AdvanceShow.tsx`
  - add per-section `captured` count based on `current_value`
  - add overall captured KPI
  - update labels around progress/readiness
- `src/pages/bunk/AdvanceFields.tsx`
  - update accordion section counters to show captured vs locked
- No backend/database changes needed for this specific issue

Why this is the right fix:
- It preserves the current governed workflow
- It makes AI extraction visible immediately
- It removes the false impression that the analysis failed when it actually populated reviewable fields

Expected result after implementation:
- After a venue packet run, sections with extracted values will visibly show captured progress right away
- Locked/confirmed progress will remain separate and continue to reflect human-reviewed readiness
- Users will be able to distinguish “AI found data” from “team approved data”

<lov-actions>
<lov-suggestion message="Test this end-to-end after the UI update and verify captured counts increase right after venue analysis while locked counts remain separate until review.">Verify that it works</lov-suggestion>
<lov-suggestion message="Update the section progress UI to show both captured fields and confirmed/locked fields so venue analysis results are visible immediately.">Show Captured vs Locked</lov-suggestion>
<lov-suggestion message="Add a 'Needs confirmation' filter and review queue on the Advance Fields page so I can quickly approve AI-captured venue data.">Add Review Queue</lov-suggestion>
<lov-suggestion message="Add a dashboard KPI row for captured fields, needs confirmation fields, and locked fields to make advance status easier to understand at a glance.">Improve KPI Clarity</lov-suggestion>
</lov-actions>
