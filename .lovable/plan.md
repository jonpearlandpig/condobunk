

## Problem Diagnosis

There are **two separate "Brandon Lake -- King of Hearts Tour"** tours in the system:

| Tour | Owner | Events | ID (short) |
|------|-------|--------|------------|
| Tour A | Jon Hartman | 50 | `6aff7e98` |
| Tour B | Nathan Jon | 61 | `202b5bb5` |

**What happened:**
1. Jon created Tour A at 7:58 PM
2. Nathan created Tour B at 8:05 PM
3. Nathan invited Jon to Tour B -- the invite was manually marked as "used" before the `accept_tour_invite` RPC existed, so **the tour_members INSERT never actually ran**
4. Jon is only a member of his own Tour A, so he sees 50 events and only his own contacts
5. Nathan is only a member of Tour B, so he sees 61 events and his team (David, Caleb, Pip, Sidney)

## Fix Plan

### Step 1: Data fix -- add Jon to Nathan's tour and clean up

Run SQL to:
- Add Jon as a member of Nathan's tour (`202b5bb5`)
- Delete Jon's duplicate tour (`6aff7e98`) and its associated data (events, contacts, etc.)

This will consolidate everyone onto a single tour with 61 events.

### Step 2: Prevent future duplicate tours (code change)

Update `BunkSetup.tsx` to check if a tour with the same name already exists before creating a new one, showing a warning if a duplicate is detected.

### Technical Details

**Data migration SQL:**
```text
-- Add Jon to Nathan's tour
INSERT INTO tour_members (tour_id, user_id, role)
VALUES ('202b5bb5-f404-41b1-bcb4-27d120d6324c', '1385f11a-1337-4ef7-83ac-1bbd62af4781', 'TA')
ON CONFLICT DO NOTHING;

-- Delete Jon's duplicate tour data
DELETE FROM schedule_events WHERE tour_id = '6aff7e98-a84e-4dd8-8711-08010c360a83';
DELETE FROM contacts WHERE tour_id = '6aff7e98-a84e-4dd8-8711-08010c360a83';
DELETE FROM documents WHERE tour_id = '6aff7e98-a84e-4dd8-8711-08010c360a83';
DELETE FROM tour_members WHERE tour_id = '6aff7e98-a84e-4dd8-8711-08010c360a83';
DELETE FROM tours WHERE id = '6aff7e98-a84e-4dd8-8711-08010c360a83';
```

**Code change in BunkSetup.tsx:**
- Before creating a new tour, query existing tours the user belongs to and warn if a tour with the same name exists
- This prevents accidental duplicate tour creation

