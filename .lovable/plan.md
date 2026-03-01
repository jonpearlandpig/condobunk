

# TELA Scheduled SMS — External Recipient Security Isolation

## The Risk
When TELA sends a scheduled SMS to a non-tour person (e.g., a runner, a vendor), that person receives the message from the same Twilio number used by TourText. If they reply, the `tourtext-inbound` function processes it. Currently it rejects unknown numbers, but the scheduled SMS feature must be designed with explicit guardrails to prevent any data leakage.

## Security Principles

1. **Outbound-only by default** — Scheduled messages to external recipients are fire-and-forget. No reply handling, no conversation threading.
2. **No tour membership creation** — The scheduled_messages table never triggers auto-join logic or contact creation for external recipients.
3. **No AKB context in messages** — The message text stored in `scheduled_messages` is the exact user-provided string. TELA does not auto-enrich outbound messages with tour data.
4. **Reply isolation** — When an unknown number replies to the TourText number, the existing rejection ("this number isn't linked to any active tour") remains the only response. No scheduled-message context is leaked back.

## Database Design: `scheduled_messages` table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | NOT NULL, the TA/MGMT who created it |
| tour_id | uuid | NOT NULL, scoping for RLS |
| to_phone | text | NOT NULL, E.164 validated |
| message_text | text | NOT NULL, max 1500 chars |
| send_at | timestamptz | NOT NULL, when to dispatch |
| sent | boolean | default false |
| is_self | boolean | default false (true = reminder to self) |
| created_at | timestamptz | default now() |

- **No recipient name stored** — prevents building a shadow contact list of external people.
- **`is_self` flag** — distinguishes personal reminders from outbound messages to others. This matters for the reply path: if `is_self = true`, a reply could optionally route through TourText normally since the sender IS a tour member.

### RLS Policies
- SELECT: `auth.uid() = user_id AND is_tour_member(tour_id)`
- INSERT: `auth.uid() = user_id AND is_tour_admin_or_mgmt(tour_id)` (TA/MGMT only)
- UPDATE: `auth.uid() = user_id` (only to cancel/edit before send)
- DELETE: `auth.uid() = user_id`

## Edge Function Changes: `send-event-reminders`

Add a second processing block after event reminders:

```text
1. Query scheduled_messages WHERE sent = false AND send_at <= now() + 7.5min
2. For each message:
   a. Validate phone (E.164 regex)
   b. Send via Twilio: "{message_text}. -TELA"
   c. Mark sent = true
   d. Log to sms_outbound (tour_id from the record)
   e. Do NOT log to sms_inbound or create any contact record
3. Auto-delete sent messages older than 7 days
```

Key security detail: the edge function uses the service role but **never** creates contacts, tour_members, or any association between the external phone number and tour data.

## Inbound Reply Guardrail

The existing `tourtext-inbound` function already handles this correctly at line 712-722: if a phone number doesn't match any contact or profile with an active tour membership, it responds with "Sorry, this number isn't linked to any active tour" and stops. No AKB data is queried, no tour context is loaded.

**No changes needed to `tourtext-inbound`** — the existing rejection is the correct behavior for external recipients who reply.

## TELA Chat Integration (akb-chat)

Add a `SCHEDULE_SMS` action type that TELA can emit when a user says something like "text the runner at +1555... in one hour to pick up groceries":

```text
<<ACTION:{"type":"schedule_sms","id":"new","fields":{"to_phone":"+15551234567","message_text":"Pick up groceries","send_at":"2026-03-01T18:00:00Z","is_self":false}}>>
```

The `useTelaActions` hook processes this by inserting into `scheduled_messages`. The action handler validates:
- Phone is E.164 format
- Message text is under 1500 characters
- `send_at` is in the future
- User has TA/MGMT role on the tour

## Frontend: Quick Reminder Button

Add a small entry point on the Calendar page (next to the existing Add Event button) that opens a lightweight dialog:
- **To**: Phone number field (pre-fills with user's own phone if "remind me" toggle is on)
- **Message**: Free text
- **When**: Date/time picker (defaults to 1 hour from now)
- **"Remind Me" toggle**: When on, auto-fills the user's phone and sets `is_self = true`

## What External Recipients CANNOT Do
- Cannot query the AKB
- Cannot see tour schedules, contacts, or any data
- Cannot be auto-added as tour members
- Cannot trigger guest list flows
- Cannot see who sent the message (only "-TELA" sign-off)
- Replies are rejected with a generic message — no tour name or data is included in the rejection

## Files to Create
- `src/components/bunk/AddQuickReminderDialog.tsx` — the dialog UI

## Files to Modify
- `supabase/functions/send-event-reminders/index.ts` — add scheduled_messages processing block
- `src/hooks/useTelaActions.ts` — add `schedule_sms` action type
- `src/pages/bunk/BunkCalendar.tsx` — add Quick Reminder button
- Database migration for `scheduled_messages` table + RLS

