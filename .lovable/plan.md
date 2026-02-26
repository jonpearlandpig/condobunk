
Goal: eliminate “Timed out / Load failed” during Advance Master extraction while keeping high-quality extraction and ensuring venue/date cross-linking still completes.

What I found from the current run:
- The extraction did not actually fail in the backend.
- For document `aecb4c08-b472-42a3-82d6-80ca23ebbc1f`, the database already contains:
  - 36 venue advance note rows (all with city + event_date)
  - 34 schedule events (city + venue mostly populated)
- The failure is transport-level: request closes before response finishes (`Http: connection closed before message completed`) after a long run.
- The frontend currently treats that as hard failure in `src/pages/bunk/BunkDocuments.tsx`, unlike `BunkSetup` which has timeout recovery polling.

Implementation plan:

1) Add timeout-recovery polling to Bunk Documents extraction flow
- File: `src/pages/bunk/BunkDocuments.tsx`
- Bring over the resilient pattern already used in `BunkSetup`:
  - If `invokeWithTimeout("extract-document")` returns network timeout / `Load failed` / aborted response, do not immediately show failure.
  - Poll backend state (every 5s, bounded retries) and detect completion by checking:
    - `documents.doc_type` changed from `UNKNOWN` OR
    - fresh rows exist for `source_doc_id` in `venue_advance_notes` / `schedule_events` / `contacts`.
  - On recovery, show success toast and open the appropriate review dialog instead of error.
- This makes user experience robust even when long extraction completes after the HTTP connection dies.

2) Add the same resilience to “Re-extract dates”
- File: `src/pages/bunk/BunkDocuments.tsx`
- For `backfill-schedule-events` call:
  - On timeout/network close, poll for recently created/updated `schedule_events` for the selected tour.
  - If updates are detected, show a recovered-success message.
- This directly addresses “Re-extract fail” cases where work finished but response channel dropped.

3) Reduce extraction runtime variance so responses are more likely to complete before connection cutoff
- File: `supabase/functions/extract-document/index.ts`
- Keep high-accuracy model, but reduce per-request payload pressure:
  - Lower Advance Master batch size (e.g., 6 → 4) to shorten slowest parallel call.
  - Keep parallel execution but cap per-batch character payload conservatively.
- Remove heavy response/log overhead:
  - Stop logging the full `JSON.stringify(result)` for giant multi-venue payloads.
  - Return a leaner response for Advance Master (summary/counts/ids), since review UI already loads full details from database tables by `source_doc_id`.
- Net effect: lower chance of hitting gateway/proxy request lifetime limits while preserving data quality.

4) Strengthen venue-name backfill when date/tour match
- File: `supabase/functions/extract-document/index.ts`
- Extend reconciliation logic to fill `Unknown Venue` events more aggressively:
  - Match by `tour_id + event_date + city` first, not just date.
  - If multiple candidates on same date, break ties using show-time similarity from VAN `event_dates` / `venue_schedule`.
  - If VAN `venue_name` is unknown but `event_details.venue` exists, use that as fallback before final insert.
- This directly implements your requirement: same tour + same date/time should populate venue name automatically.

5) Keep cross-linking deterministic and auditable
- File: `supabase/functions/extract-document/index.ts`
- Add concise reconciliation counters in logs/response:
  - `vans_city_backfilled`
  - `vans_date_backfilled`
  - `events_venue_backfilled`
  - `events_city_backfilled`
- This makes it clear whether smart matching actually ran and what it changed.

Validation plan:
1. Upload the same Advance Master and run EXTRACT once.
2. Confirm UI behavior:
   - No final destructive error if transport drops.
   - Recovery path auto-detects completed extraction and opens VAN review.
3. Confirm data outputs:
   - VAN rows count matches venue columns.
   - `venue_advance_notes.city/event_date` populated.
   - `schedule_events` has no `Unknown Venue` when same tour+date(+time/city) match exists.
4. Run “Re-extract dates” and confirm recovered success behavior under long-running conditions.
5. Verify one full end-to-end flow in `/bunk/documents`: upload → extract → review → approve.

Technical notes:
- No schema migration is required for this fix.
- No auth/RLS changes are needed.
- This is mainly reliability hardening in UI + extraction function runtime tuning + stronger reconciliation matching.
