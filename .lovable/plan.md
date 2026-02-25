

# TourText Intelligence Dashboard + TELA Pattern Detection

## Overview

Build an SMS activity dashboard in BunkAdmin and a backend edge function that analyzes TourText inquiry patterns. When 5+ crew members ask about the same topic, TELA surfaces a proactive alert with a suggested fix -- turning reactive Q&A into preventive tour management.

## Architecture

```text
+-------------------+       +----------------------+       +------------------+
| tourtext-inbound  | --->  | sms_inbound/outbound | <---  | BunkAdmin        |
| (existing)        |       | (existing tables)     |       | TourText tab     |
+-------------------+       +----------------------+       +------------------+
                                     |                              |
                                     v                              v
                            +----------------------+       +------------------+
                            | tourtext-insights    |       | TELA Alert Card  |
                            | (new edge function)  | --->  | "17 asked about  |
                            | clusters questions   |       |  catering..."    |
                            +----------------------+       +------------------+
```

## What the Tour Admin Sees

### 1. TourText Activity Tab (in BunkAdmin)

A new section/tab in BunkAdmin with:

- **Stats bar**: Total messages (24h), unique senders, avg response time
- **Message feed**: Recent inbound/outbound pairs showing sender phone (masked), question, TELA's reply, timestamp, matched tour
- **Pattern Alerts**: TELA-generated insight cards when 5+ inquiries cluster around the same topic

### 2. Pattern Alert Card (the key feature)

When TELA detects a pattern:

```text
+--------------------------------------------------+
|  ! TELA Pattern Alert                             |
|                                                   |
|  17 of 18 TourTexts today asked about CATERING    |
|  location at tomorrow's venue.                    |
|                                                   |
|  Suggested fix:                                   |
|  "Catering info is missing from the VAN for       |
|   Bridgestone Arena. Add catering details to the  |
|   venue advance notes, or send a group text to    |
|   crew with the info."                            |
|                                                   |
|  [ Go to VAN ]  [ Dismiss ]                       |
+--------------------------------------------------+
```

## Technical Plan

### 1. New Edge Function: `tourtext-insights`

Called from the frontend when the TA opens the TourText dashboard tab. It:

1. Fetches recent `sms_inbound` messages for the tour (last 24-72h)
2. Sends the batch of questions to the AI gateway with a clustering prompt
3. Returns:
   - `clusters`: Array of `{ topic, count, sample_questions, suggested_fix, severity, related_entity }` 
   - `stats`: `{ total_inbound, total_outbound, unique_senders, avg_response_ms }`

The AI prompt instructs the model to:
- Group questions by semantic similarity
- Only flag clusters with 5+ occurrences as actionable
- Suggest concrete fixes referencing AKB entities (VANs, contacts, schedule)
- Rate severity: `info` (1-4 similar), `warning` (5-9), `critical` (10+)

### 2. Frontend: TourText Dashboard Component

A new `TourTextDashboard` component rendered inside BunkAdmin after the existing sections. Contains:

- **Stats row**: 3 metric cards (total messages, unique senders, avg response time)
- **Pattern alerts**: Cards for each cluster with 5+ occurrences, color-coded by severity
- **Message log**: Scrollable table of recent SMS conversations (inbound question + outbound reply paired by phone/timestamp)
- **Refresh button**: Re-runs the insights analysis

### 3. Modify BunkAdmin

Add the TourText dashboard section after the Sync History section, gated behind `is_tour_admin_or_mgmt`. Uses `sms_inbound` and `sms_outbound` tables (already have TA/MGMT SELECT policies).

### 4. Enhance `tourtext-inbound` (minor)

Add a `sender_name` column to `sms_inbound` so the dashboard can show who texted without a separate lookup. This is a small migration + one line change in the edge function.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/tourtext-insights/index.ts` | Create | AI-powered clustering of SMS inquiries, stats computation |
| `src/components/bunk/TourTextDashboard.tsx` | Create | Full dashboard UI: stats, pattern alerts, message log |
| `src/pages/bunk/BunkAdmin.tsx` | Modify | Add TourText dashboard section after Sync History |
| `supabase/functions/tourtext-inbound/index.ts` | Modify | Save `sender_name` alongside inbound messages |
| `sms_inbound` table | Migration | Add `sender_name` text column (nullable) |
| `supabase/config.toml` | Modify | Add `tourtext-insights` function config |

## Edge Function: `tourtext-insights` Detail

```text
Input (POST, authenticated):
  { tour_id: string, hours?: number }  // default 24h lookback

Processing:
  1. Query sms_inbound WHERE tour_id = X AND created_at > now() - interval
  2. Query sms_outbound WHERE tour_id = X AND created_at > now() - interval  
  3. Compute stats (counts, unique phones, avg time between inbound/outbound pairs)
  4. Send inbound messages to AI with clustering prompt
  5. Return { stats, clusters, messages }

Output:
  {
    stats: { total_inbound, total_outbound, unique_senders, avg_response_seconds },
    clusters: [
      { topic: "Catering location", count: 17, severity: "critical",
        sample_questions: ["where is catering?", "what floor is catering on?"],
        suggested_fix: "Add catering location to Bridgestone Arena VAN...",
        related_entity: "venue_advance_notes" }
    ],
    messages: [
      { direction: "inbound", phone: "+1***5678", sender_name: "Jake",
        text: "where is catering?", created_at: "...", tour_id: "..." },
      ...
    ]
  }
```

## Pattern Detection Thresholds

- **1-4 similar questions**: Normal -- no alert, just visible in the log
- **5-9 similar questions**: Warning-level alert -- yellow card, "You may want to address this"
- **10+ similar questions**: Critical alert -- red card, "This is a recurring gap that needs immediate attention"

These thresholds are embedded in the AI prompt, not hardcoded in filtering logic, so TELA can apply judgment about what constitutes "similar."

## Security

- `tourtext-insights` validates the JWT and checks tour membership via `is_tour_admin_or_mgmt` RPC before returning data
- Phone numbers in the message log are partially masked (show last 4 digits) for privacy in the UI
- No new RLS policies needed -- existing `sms_inbound` / `sms_outbound` SELECT policies already gate to TA/MGMT

## What This Does NOT Change

- The existing `tourtext-inbound` SMS flow remains identical
- No changes to TELA chat or the AKB extraction pipeline
- No new tables beyond the `sender_name` column addition
- The pattern detection is on-demand (when TA opens the tab), not a background cron

