

# Brand Event Reminders as TELA

## What Changes
One line in the `send-event-reminders` edge function: change the SMS sign-off from `-CondoBunk` to `-TELA`.

**Current message:**
> REMINDER: Load-in at Raleigh (PNC Arena) in 2 hours -- 3:00 PM. -CondoBunk

**New message:**
> REMINDER: Load-in at Raleigh (PNC Arena) in 2 hours -- 3:00 PM. -TELA

This aligns with TELA being the communication brand across all SMS touchpoints (TourText inbound already identifies as TELA in its system prompt). CondoBunk remains the platform brand; TELA is the voice that talks to users.

## Technical Detail

**File:** `supabase/functions/send-event-reminders/index.ts` (line 132)

Change:
```
const smsBody = `REMINDER: ${typeLabel} at ${venue}${city} ${leadLabel} — ${timeFormatted}. -CondoBunk`;
```
To:
```
const smsBody = `REMINDER: ${typeLabel} at ${venue}${city} ${leadLabel} — ${timeFormatted}. -TELA`;
```

No other files need changes. The guest list SMS messages (`guest-list-request`) don't currently have a sign-off, and the `notify-box-office` email already uses "Condo Bunk TourText" which is appropriate for email (not SMS).

