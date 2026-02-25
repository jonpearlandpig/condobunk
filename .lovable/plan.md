

# Guest List & Ticket Request System

## Overview

A fully automated guest list flow where crew text TourText with a guest request, TELA validates the fields, checks ticket availability, and either auto-approves (zero-touch) or escalates to the Tour Admin. The TA manages allotments and handles edge cases from a new Guest List section in BunkAdmin.

## How It Works

```text
Crew texts: "Guest list for tomorrow: John Smith +1"
                        |
               tourtext-inbound
          (detects guest list intent)
                        |
              guest-list-request
                (new edge function)
                        |
          +-------------+-------------+
          |                           |
   Fields complete?              Missing fields?
   Tickets available?            -> SMS back asking
          |                        for missing info
          |
    +-----+-----+
    |             |
  YES            NO (sold out / over limit)
    |             |
Auto-approve    Status = PENDING
SMS confirm     DM to Tour Admin
with pickup     in BunkChat
info            TA approves/edits/denies
```

## What the Tour Admin Manages

### 1. Guest List Allotments (new section in BunkAdmin)

Before each show, the TA sets up ticket availability:

```text
+--------------------------------------------------+
|  GUEST LIST ALLOTMENTS                            |
+--------------------------------------------------+
|  Bridgestone Arena - Mar 8                        |
|  Total Comp: 20    Per-Person Max: 4    Used: 7   |
|  [Edit]                                           |
|                                                   |
|  Little Caesars Arena - Mar 10                     |
|  Total Comp: 15    Per-Person Max: 2    Used: 0   |
|  [Edit]                                           |
+--------------------------------------------------+
```

- **Total comp tickets** per show
- **Per-person max** (e.g., max 4 guests per crew member)
- **Pickup instructions** or digital ticket notes (e.g., "Will Call under tour name" or "Ticketmaster transfer -- provide email")
- **Deadline** (optional cutoff time for requests)

### 2. Request Queue

```text
+--------------------------------------------------+
|  PENDING REQUESTS                        [2]      |
+--------------------------------------------------+
|  Jake (Lighting) - Bridgestone 3/8                |
|  Guests: Sarah Miller +1 (2 tickets)             |
|  Reason: No tickets available at time of request  |
|  [Approve] [Edit] [Next Time]                     |
+--------------------------------------------------+
|  APPROVED (auto + manual)                         |
|  Mike (Audio) - 2 tickets - Auto-approved 2h ago  |
|  Lisa (Video) - 1 ticket - Auto-approved 5h ago   |
+--------------------------------------------------+
```

"Next Time" is a soft decline -- sends the crew member an SMS: "Guest list is full for this show. We'll try to get you on the next one."

## Database Design

### New Table: `guest_list_allotments`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| tour_id | uuid | FK to tours |
| event_id | uuid | FK to schedule_events (nullable -- can match by date/venue) |
| event_date | date | Show date |
| venue | text | Venue name |
| city | text | City |
| total_tickets | integer | Total comp tickets available |
| per_person_max | integer | Max tickets per crew member (default 4) |
| pickup_instructions | text | "Will Call under tour name" or "TM transfer" etc. |
| deadline | timestamptz | Optional cutoff for requests |
| created_by | uuid | TA who set it up |
| created_at | timestamptz | |

RLS: TA/MGMT can full CRUD; all tour members can SELECT (crew needs to see availability).

### New Table: `guest_list_requests`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| tour_id | uuid | FK |
| allotment_id | uuid | FK to allotments |
| requester_phone | text | Crew member's phone |
| requester_name | text | Crew member name (from contacts match) |
| requester_user_id | uuid | If matched to a profile |
| guest_names | text | "John Smith, Jane Smith" |
| ticket_count | integer | Number of tickets requested |
| status | text | APPROVED / PENDING / DENIED |
| status_reason | text | "Auto-approved" / "No tickets available" / "Next time" |
| pickup_info_sent | boolean | Whether confirmation SMS was sent |
| approved_by | uuid | Null for auto-approve, TA id for manual |
| created_at | timestamptz | |
| resolved_at | timestamptz | |

RLS: TA/MGMT can full CRUD; tour members can SELECT (own requests visible).

## Edge Function: `guest-list-request`

Called by `tourtext-inbound` when TELA detects a guest list intent. Also callable from the frontend for manual processing.

**Input:**
```json
{
  "tour_id": "uuid",
  "requester_phone": "+1...",
  "requester_name": "Jake",
  "guest_names": "John Smith, Jane Smith",
  "ticket_count": 2,
  "event_date": "2026-03-08",
  "venue": "Bridgestone Arena"
}
```

**Processing:**
1. Find matching allotment by tour_id + event_date (+ venue fuzzy match)
2. If no allotment exists: reply "Guest list isn't set up for that show yet. Your Tour Admin has been notified." + DM the TA
3. Check deadline (if set): if past deadline, reply "Guest list requests for this show are closed."
4. Count approved tickets already used for this allotment
5. Check per-person limit for this requester
6. If tickets available and within limits:
   - Insert request with status=APPROVED, status_reason="Auto-approved"
   - SMS crew: "You're on the guest list! [guest_names] (X tickets) for [venue] on [date]. [pickup_instructions]"
   - Return success
7. If over capacity or per-person limit:
   - Insert request with status=PENDING, status_reason="No tickets available" or "Over per-person limit"
   - DM the Tour Admin via `direct_messages` insert (service role): "Guest list request from [name]: [X tickets] for [venue] [date]. Over capacity -- needs your review."
   - SMS crew: "Your request is in -- your Tour Admin will confirm shortly."

## Modifying `tourtext-inbound`

Add guest list intent detection to the existing flow. Before sending to the general TELA AI, check if the message matches guest list patterns:

1. After matching the phone to a tour, check if the message contains guest list intent keywords (e.g., "guest list", "comp tickets", "put [name] on the list", "tickets for", "+1")
2. If detected, send the message to a focused AI prompt that extracts structured fields: guest_names, ticket_count, event_date, venue
3. If all required fields are present, call the `guest-list-request` function
4. If fields are missing, SMS back asking for the specific missing info: "Got it! Just need a few details: Who are your guests (full names)? Which show date?"
5. If no guest list intent, continue with the normal TELA Q&A flow

The intent detection uses a lightweight AI call with a structured JSON output schema, keeping it fast.

## BunkAdmin Integration

Add a "Guest List" section in BunkAdmin (after Team Members, before Integrations) with:

1. **Allotment Setup**: Cards per upcoming show with editable ticket counts, per-person max, pickup instructions, and optional deadline
2. **Quick Setup**: "Auto-create allotments" button that generates allotments for all upcoming schedule_events with default values (20 tickets, max 4 per person)
3. **Request Queue**: Pending requests with Approve / Edit / "Next Time" buttons
4. **Approved List**: Collapsible summary of all approved guests per show (printable for venue will-call)

## Notification Flow

| Scenario | Crew SMS | TA DM |
|----------|----------|-------|
| Auto-approved | Confirmation + pickup info | None (silent success) |
| Pending (no tickets) | "Request received, TA will confirm" | DM with request details |
| Pending (over limit) | "Request received, TA will confirm" | DM with limit info |
| TA approves | Confirmation + pickup info SMS | -- |
| TA denies ("next time") | "Guest list full, next time" SMS | -- |
| No allotment exists | "Not set up yet, TA notified" | DM to set up allotment |

When TA approves/denies from BunkAdmin, the system calls `tourtext-inbound`'s SMS sending logic (or a shared utility) to send the crew member a notification SMS.

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/guest-list-request/index.ts` | Core logic: check availability, auto-approve or escalate |
| `src/components/bunk/GuestListManager.tsx` | BunkAdmin section: allotments + request queue + approved list |

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/tourtext-inbound/index.ts` | Add guest list intent detection before general TELA flow |
| `src/pages/bunk/BunkAdmin.tsx` | Add GuestListManager section |

## Migration

One migration creating both tables with RLS policies and grants.

## Security

- `guest-list-request` uses service role (called from `tourtext-inbound` webhook context) but validates tour membership for frontend calls
- Allotments: TA/MGMT full CRUD, all members SELECT
- Requests: TA/MGMT full CRUD, members can SELECT own requests (where requester_user_id = auth.uid())
- SMS sending reuses existing Twilio credentials

## What This Does NOT Change

- Existing TourText Q&A flow remains identical for non-guest-list messages
- No changes to TELA chat, AKB, or extraction pipelines
- No changes to CondoBunkCrew (future -- crew app could show their approved requests read-only)

