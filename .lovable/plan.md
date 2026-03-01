

# SMS Event Reminders for Condo Bunk Tour Team

## Overview
Add an event reminder system exclusively for Condo Bunk web UI users (TA/MGMT roles). They can set SMS text alerts on existing calendar events and create new events with reminders attached. This is a management-level feature -- not exposed to general TourText SMS users.

## How It Works
- From the Calendar page, TA/MGMT users can tap any event to set a reminder (e.g., "Alert me 2 hours before load-in")
- They can also set reminders when creating new events via the Add Event dialog
- A backend function runs every 15 minutes, finds reminders due, and sends SMS via the existing Twilio number
- Users configure their phone number and default reminder preferences from a Reminder Settings section

## Database Changes

### New table: `event_reminders`
Stores individual reminder subscriptions tied to specific events.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| tour_id | uuid | FK scope |
| event_id | uuid | Which schedule event |
| user_id | uuid | Who to alert |
| phone | text | SMS destination |
| remind_before_minutes | int | Default 120 (2 hours) |
| remind_type | text | load_in, show_time, doors, soundcheck |
| enabled | boolean | Default true |
| created_at | timestamptz | Auto |

RLS: Users can manage their own reminders within tours they belong to. TA/MGMT can view all reminders for their tour.

### New table: `sent_reminders`
Deduplication log to prevent double-sends.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| reminder_id | uuid | FK to event_reminders |
| event_id | uuid | Which event |
| phone | text | Who was texted |
| remind_type | text | Which slot |
| sent_at | timestamptz | When sent |

Unique constraint on (event_id, phone, remind_type) prevents duplicates. No RLS needed -- only accessed by service role from the cron function.

## New Edge Function: `send-event-reminders`
- Triggered every 15 minutes via pg_cron + pg_net
- Queries `event_reminders` joined with `schedule_events` to find events where the target time (e.g., load_in) falls within the reminder window
- Checks `sent_reminders` to skip already-sent alerts
- Sends SMS via existing Twilio credentials
- Logs to `sent_reminders` and `sms_outbound`
- Message format: "REMINDER: Load-in at Raleigh (PNC Arena) in 2 hours -- 3:00 PM. -CondoBunk"

## Frontend Changes

### 1. Event Detail -- "Set Reminder" button
In the Calendar event detail dialog (already exists when you tap an event), add a "Set Reminder" section:
- Toggle reminder on/off for this event
- Choose which time slot to remind about (load-in, showtime, doors, soundcheck -- only shows slots that have data)
- Choose lead time (30 min, 1 hr, 2 hrs, day before)
- Phone number auto-filled from profile; prompt to add if missing

### 2. Add Event Dialog -- optional reminder toggle
In the existing `AddEventDialog`, add a "Remind me" checkbox + lead-time selector so users can set a reminder at creation time.

### 3. Reminder Settings (in existing Notification Settings page)
Add a "Reminders" card to `BunkNotificationSettings`:
- Default lead time preference
- Default remind types (which time slots to auto-remind)
- Phone number display/edit

### 4. Route/access
No new routes needed. All UI lives within existing Calendar and Notification Settings pages. Only visible to authenticated Condo Bunk users (already behind ProtectedRoute).

## Cron Setup
- Enable `pg_cron` and `pg_net` extensions
- Schedule: every 15 minutes
- Calls `send-event-reminders` edge function via `pg_net.http_post`

## Security
- RLS on `event_reminders`: users manage own rows, TA/MGMT can view all for tour
- `sent_reminders`: no RLS (service role only, no client access)
- Edge function uses service role key (cron-triggered, no user auth)
- Reuses existing Twilio secrets -- no new secrets needed
- Phone numbers validated before sending

## Implementation Sequence
1. Create `event_reminders` and `sent_reminders` tables with RLS policies
2. Build `send-event-reminders` edge function
3. Add "Set Reminder" UI to Calendar event detail dialog
4. Add optional reminder toggle to AddEventDialog
5. Add Reminders section to BunkNotificationSettings
6. Set up pg_cron schedule
7. Deploy and test

