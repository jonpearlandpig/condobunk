

# Full AKB Data Wipe -- Execution Plan

## What This Does
Runs a single database migration that deletes all tour-related data across 22 tables, in foreign-key-safe order. **Zero code changes.**

## What Gets Deleted
All rows from: venue_risk_flags, venue_scores, venue_tech_specs, venue_advance_notes, knowledge_gaps, calendar_conflicts, finance_lines, schedule_events, contacts, akb_change_log, direct_messages, sync_logs, travel_windows, notification_preferences, tour_notification_defaults, tour_invites, tour_integrations, sms_inbound, sms_outbound, documents, tour_members, tours.

## What Stays Untouched
- **profiles** -- all user accounts remain
- **user_artifacts** -- all personal artifacts remain
- **user_presence** -- online status remains
- **All code, UI, and functionality** -- completely unchanged

## How
A single SQL migration with DELETE statements in dependency order (children first, parents last). After approval, I will also note that you should empty the `document-files` storage bucket manually from the backend view to remove uploaded PDF files.

## Technical Detail

One migration file with this SQL:

```text
DELETE FROM venue_risk_flags;
DELETE FROM venue_scores;
DELETE FROM venue_tech_specs;
DELETE FROM venue_advance_notes;
DELETE FROM knowledge_gaps;
DELETE FROM calendar_conflicts;
DELETE FROM finance_lines;
DELETE FROM schedule_events;
DELETE FROM contacts;
DELETE FROM akb_change_log;
DELETE FROM direct_messages;
DELETE FROM sync_logs;
DELETE FROM travel_windows;
DELETE FROM notification_preferences;
DELETE FROM tour_notification_defaults;
DELETE FROM tour_invites;
DELETE FROM tour_integrations;
DELETE FROM sms_inbound;
DELETE FROM sms_outbound;
DELETE FROM documents;
DELETE FROM tour_members;
DELETE FROM tours;
```

No schema changes. No column drops. No code edits. Just row deletions.

