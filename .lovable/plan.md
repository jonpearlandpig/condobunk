

# iCal Feed + Google Drive File Picker

Two additive features. Zero changes to existing systems.

---

## Feature 1: iCal (.ics) Calendar Feed

### How it works
- A new edge function `calendar-feed` serves an iCal (.ics) file per tour
- URL format: `https://{project}.supabase.co/functions/v1/calendar-feed?tour_id={uuid}`
- Uses the service role to read `schedule_events` (no auth required for subscribable feeds -- secured by tour_id UUID obscurity, same pattern as invite tokens)
- Users paste the URL into Google Calendar "Add by URL" and get a read-only overlay that auto-refreshes

### Edge function: `supabase/functions/calendar-feed/index.ts`
- Accepts `GET` with query param `tour_id`
- Queries `schedule_events` for that tour, ordered by `event_date`
- Fetches `tours.name` for the calendar title
- Generates RFC 5545 compliant iCal output:
  - `VCALENDAR` wrapper with `PRODID`, `X-WR-CALNAME` (tour name)
  - One `VEVENT` per schedule event with `DTSTART` (date or datetime from `show_time`), `DTEND` (from `end_time`), `SUMMARY` (venue), `LOCATION` (city), `DESCRIPTION` (notes, load-in time)
- Returns with `Content-Type: text/calendar; charset=utf-8` and `Content-Disposition: inline`
- CORS headers included for browser access

### Config update: `supabase/config.toml`
```toml
[functions.calendar-feed]
verify_jwt = false
```

### Frontend: "Subscribe" button on Calendar page
- Add a small button/icon in `BunkCalendar.tsx` header (next to the existing view controls)
- On click, shows a popover/dialog with:
  - The feed URL (pre-built using `selectedTourId`)
  - A "Copy URL" button
  - Brief instructions: "Paste this URL in Google Calendar > Other calendars > From URL"
  - A direct `webcal://` link for one-click subscribe on supported clients
- Only visible to non-demo users

### What stays untouched
- All existing calendar rendering, data loading, realtime subscriptions
- No database changes
- No new tables

---

## Feature 2: Google Drive File Picker

### Architecture
Google Picker API runs entirely in the browser. It needs:
1. A Google API Client ID (OAuth2, for the picker UI)
2. A Google API Key (for Drive read access)
3. The user authorizes via a popup, picks a file, and we get a temporary download URL
4. We download the file content and feed it into the existing upload + extraction flow

### Implementation approach

#### Step 1: Store Google credentials
- Use the secrets tool to request two secrets from the user:
  - `GOOGLE_PICKER_API_KEY` -- API key for Google Drive API
  - `GOOGLE_PICKER_CLIENT_ID` -- OAuth client ID
- These are PUBLIC-facing keys (used in browser), so they can be stored as `VITE_` env vars or fetched via a tiny edge function

#### Step 2: Edge function `google-drive-proxy/index.ts`
- Accepts POST with `{ file_id, access_token }` (the OAuth token from the Picker)
- Downloads the file from Google Drive API using the access token
- Uploads it to the `document-files` storage bucket under the appropriate tour path
- Returns the storage path
- This avoids CORS issues with direct browser-to-Drive downloads

#### Step 3: Frontend component `GoogleDrivePickerButton.tsx`
- Loads the Google Picker API script dynamically
- On click: authenticates the user via Google OAuth popup (using the client ID), opens the file picker
- On file selection: calls the `google-drive-proxy` edge function with the file ID and access token
- Then creates the `documents` row and triggers extraction -- reusing the exact same `handleFileUpload` logic from `BunkSetup.tsx`

#### Step 4: Integration points (additive only)
- Add the picker button alongside the existing file upload zone in `BunkSetup.tsx` (the "Click or drop a file" area)
- Add it to `BunkDocuments.tsx` if there's an upload area there
- Styled as a secondary option: "Or import from Google Drive"

### Config
```toml
[functions.google-drive-proxy]
verify_jwt = false
```

### What stays untouched
- Existing file upload flow unchanged
- Existing extraction pipeline unchanged
- No database schema changes
- The picker is purely additive UI

---

## Implementation Order

| Step | What | Risk |
|------|------|------|
| 1 | Build `calendar-feed` edge function | None -- new endpoint, no existing code touched |
| 2 | Add "Subscribe" UI to BunkCalendar | Minimal -- additive button in header |
| 3 | Request Google API credentials from user | Blocking -- need keys before Drive picker works |
| 4 | Build `google-drive-proxy` edge function | None -- new endpoint |
| 5 | Build `GoogleDrivePickerButton` component | None -- new component |
| 6 | Wire picker into BunkSetup upload zone | Minimal -- additive alongside existing input |

I recommend building the iCal feed first (steps 1-2) since it has zero dependencies and ships immediately. The Google Drive picker (steps 3-6) requires API credentials from you before it can work.

