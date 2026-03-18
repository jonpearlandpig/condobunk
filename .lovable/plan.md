

# Tighten Reminder Cron to Every 5 Minutes

## What Changes
The cron job `send-event-reminders-every-15min` currently runs at `:00`, `:15`, `:30`, `:45`. We'll update it to run every 5 minutes (`:00`, `:05`, `:10`, ..., `:55`), so scheduled reminders fire within ~5 minutes of their target time instead of ~15.

## Steps

1. **Unschedule the existing cron job** (`jobid: 2`, named `send-event-reminders-every-15min`)
2. **Create a new cron job** with a `*/5 * * * *` schedule and an updated name (`send-event-reminders-every-5min`)
3. **Update the reminder window** in `supabase/functions/send-event-reminders/index.ts` -- change the `+-7.5 minute` dedup window to `+-2.5 minutes` so event reminders don't double-fire on the tighter cadence

## Technical Detail

**SQL (run via query, not migration -- contains project-specific keys):**
```sql
SELECT cron.unschedule('send-event-reminders-every-15min');

SELECT cron.schedule(
  'send-event-reminders-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := '...functions/v1/send-event-reminders',
    headers := '...'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

**Edge function change (`send-event-reminders/index.ts`):**
- Line with `reminderWindow - 7.5` / `reminderWindow + 7.5` changes to `reminderWindow - 2.5` / `reminderWindow + 2.5`

This is a minimal change -- two SQL statements and one line in the edge function.

