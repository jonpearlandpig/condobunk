

## Make All AKB Changes Through TELA — Full CRUD via Chat

### What exists today
TELA can already **create** contacts, **update** events/contacts/VANs, and **resolve** conflicts/gaps via action cards with sign-off. These changes land in the database and dispatch `akb-changed` / `contacts-changed` events so the UI refreshes everywhere.

### What's missing
Two things prevent TELA from being the complete command center:

1. **No DELETE actions** — You can't remove an event, contact, or VAN from TELA. The action types `delete_event`, `delete_contact`, and `delete_van` don't exist.
2. **No CREATE event action** — You can create contacts but not schedule events.

### Plan

#### 1. Add new action types to `useTelaActions.ts`

Add three new types to `TelaActionType`:
- `delete_event` — deletes a `schedule_events` row by ID, logs to change log
- `delete_contact` — deletes a `contacts` row by ID, logs to change log, dispatches `contacts-changed`
- `create_event` — inserts a new `schedule_events` row with fields like `venue`, `city`, `event_date`, `notes`, `load_in`, `show_time`

Each follows the same pattern as existing actions:
- Resolve tour_id deterministically
- Execute the DB operation
- Log to `akb_change_log`
- Dispatch refresh events (`akb-changed`, `contacts-changed`)
- Show toast with tour name confirmation

#### 2. Update `getActionLabel()` in `useTelaActions.ts`

Add labels:
- `delete_event` -> "Remove Event"
- `delete_contact` -> "Remove Contact"
- `create_event` -> "Add Event"

#### 3. Update TELA system prompt in `akb-chat/index.ts`

Add the new action block formats to the system prompt so the AI knows it can propose deletions and event creation:

```
<<ACTION:{"type":"delete_event","id":"<event_uuid>","tour_id":"<tour_uuid>"}>>
<<ACTION:{"type":"delete_contact","id":"<contact_uuid>","tour_id":"<tour_uuid>"}>>
<<ACTION:{"type":"create_event","id":"new","tour_id":"<tour_uuid>","fields":{"venue":"Venue Name","city":"City","event_date":"2026-03-15","notes":"Off day"}}>>
```

Add rules:
- For delete actions, TELA must explain what will be removed and why before the action block
- Deletions are permanent and require sign-off like all other actions
- For create_event, `venue` and `event_date` are required fields

#### 4. Sign-off gate stays mandatory

All new actions route through the existing `AkbEditSignoff` dialog — the user must provide a reason and flag safety/time/money impact before any delete or create executes. No changes needed here; `TelaActionCard` already handles this.

#### 5. Propagation

All changes already propagate:
- **UI**: `window.dispatchEvent(new Event("akb-changed"))` triggers re-fetches in Calendar, Overview, Conflicts, Gaps
- **TourText SMS**: The `akb-chat` edge function queries live DB data on every SMS, so deleted/added records are immediately reflected
- **Change Log**: Every action writes to `akb_change_log`, visible at `/bunk/changelog`

### Technical Details

**Files modified:**
- `src/hooks/useTelaActions.ts` — Add `delete_event`, `delete_contact`, `create_event` to type union and `executeAction` switch
- `supabase/functions/akb-chat/index.ts` — Add new action block examples and rules to system prompt

**No database changes needed** — existing tables and RLS policies already support DELETE on `schedule_events` and `contacts` for TA/MGMT roles, and INSERT for `schedule_events`.

