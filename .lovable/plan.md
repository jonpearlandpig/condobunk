

## Restore Caleb Cook and Trey Mills to KOH2026

### Problem
The previous data repair deleted Caleb and Trey from KOH2026 assuming they were misplaced. In reality, they belong to **both** KOH2026 and PW2026 -- contacts can exist across multiple tours.

### Current State
- **Caleb Cook** (Tour Manager) -- exists only in PW2026
- **Trey Mills** (Tour Assist) -- exists only in PW2026
- Both are missing from KOH2026 (`202b5bb5-f404-41b1-bcb4-27d120d6324c`)

### Fix
Insert one record each for Caleb and Trey back into KOH2026:

| Name | Role | Email | Phone | Tour | Scope |
|------|------|-------|-------|------|-------|
| Caleb Cook | Tour Manager | caleb@breitgroup.com | 612-202-6429 | KOH2026 | TOUR |
| Trey Mills | Tour Assist | imjonhartman@gmail.com | (none) | KOH2026 | TOUR |

### Technical Detail
A single INSERT into the `contacts` table with `tour_id = '202b5bb5-f404-41b1-bcb4-27d120d6324c'` for both records. No code changes needed -- this is a data-only fix.
