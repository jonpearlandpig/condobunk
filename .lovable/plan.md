

# Make Critical Alerts Configurable and Shelve Notification Settings

## Summary
Make the real-time critical AKB alerts respect user preferences (can be turned up, down, or off), and remove the Notification Settings page from navigation since the full notification system is being deferred. The alert hook will check the user's `notification_preferences` before showing toasts.

## Changes

### 1. Update `useAkbAlerts` hook to respect user preferences
**File:** `src/hooks/useAkbAlerts.ts`

- Query `notification_preferences` for the current user + tour combo
- If a preference row exists, check:
  - `min_severity` -- only alert if the change meets or exceeds the threshold (INFO < IMPORTANT < CRITICAL)
  - `safety_always` / `time_always` / `money_always` -- if any matching impact flag is true and the change has that flag, alert regardless of severity
  - `day_window` -- only alert if the event is within N days
- If no preference row exists, fall back to current behavior (CRITICAL only, always alert)
- This makes alerts fully controllable: users can set `min_severity` to CRITICAL (current default), IMPORTANT (more alerts), INFO (all alerts), or effectively "off" by disabling all change types

### 2. Remove Notification Settings from routing and sidebar
**File:** `src/App.tsx`
- Remove the `/bunk/notifications` route and the `BunkNotificationSettings` import

The page file (`BunkNotificationSettings.tsx`) stays in the codebase for when notifications come back -- just unreachable for now.

### 3. No database changes needed
The `notification_preferences` table already has all the columns needed. The `useAkbAlerts` hook just needs to read from it.

## Technical Details

The severity comparison logic:
```
const SEVERITY_RANK = { INFO: 0, IMPORTANT: 1, CRITICAL: 2 };
```

The hook will use a `useQuery` to fetch the user's prefs for each tour, then filter incoming realtime events against those prefs. If a user has no prefs row, the system defaults (CRITICAL-only with all impact overrides on) apply -- identical to current behavior.

