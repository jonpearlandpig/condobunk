

# Fix: Scheduled Messages Not Sending + Flexible Phone Input

## Bug: Why Your 12:15 PM Reminder Didn't Send

**Root Cause**: In `send-event-reminders/index.ts` (lines 83-87), when the `event_reminders` table query returns zero rows, the function exits early with `"No active reminders"` -- and the `scheduled_messages` processing block (line 164+) is never reached.

Since you have no event reminders configured, the function always short-circuits before it can process your scheduled text.

**Fix**: Remove the early return on lines 83-87. Instead, let the function continue through the event reminders loop (which will simply skip if empty) and proceed to the scheduled messages block.

## Feature: Flexible Phone Number Input

Add a `normalizePhone()` helper to `AddQuickReminderDialog.tsx` that converts common formats into E.164 before validation:

- `615-788-4644` becomes `+16157884644`
- `1-615-788-4644` becomes `+16157884644`
- `(615) 788-4644` becomes `+16157884644`
- `615.788.4644` becomes `+16157884644`
- `+16157884644` stays as-is

Update the input placeholder to `615-788-4644` and make the error message friendlier ("Could not parse phone number" instead of E.164 jargon).

## Files to Modify

1. **`supabase/functions/send-event-reminders/index.ts`**
   - Remove the early return at lines 83-87 (the "No active reminders" block)
   - Keep the error return for `remError` (lines 75-80)
   - Initialize `now` and `sentCount` before the event reminders loop regardless

2. **`src/components/bunk/AddQuickReminderDialog.tsx`**
   - Add `normalizePhone(raw)` helper function
   - Call it in `handleSubmit` before E.164 validation
   - Update placeholder to `615-788-4644`
   - Update error toast text

## After Fix

Once deployed, the cron will process your still-pending "Receipt picture" scheduled message on its next 15-minute cycle (it's still `sent: false` in the database).

