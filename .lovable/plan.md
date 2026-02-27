

## First-Contact Identity Confirmation for TourText

### What Changes

When a user texts TourText for the first time (no prior conversation history), TELA will respond with an identity confirmation message before processing their question. This ensures the right person is on the right tour before any data is shared.

### How It Works

After matching the phone number and building conversation history, check if `recentHistory` is empty (no prior inbound or outbound messages for this phone + tour). If so:

1. Fetch the sender's **role** from the matched contact record (already available from `matchPhoneToTour`, just not returned currently)
2. Send a confirmation message like: *"Hey [Name]! This is TELA for [Tour Abbreviation]. I have you as [Role]. Text back YES to confirm, or let me know if anything's off."*
3. Log the outbound message and return — do NOT process their original question yet
4. On next text, if they confirm (YES/yeah/correct/that's me), proceed normally. If they say something is wrong, instruct them to contact their Tour Admin.

### Implementation Details

**File: `supabase/functions/tourtext-inbound/index.ts`**

1. **Update `matchPhoneToTour`** to also return the sender's `role` from the contact record (it already has this data, just discards it). Return signature becomes `{ tourId, senderName, senderRole }`.

2. **Add first-contact detection** after conversation history is built (around line 628). Check if `recentHistory.length === 0` (no prior messages exist for this phone + tour combo).

3. **Add confirmation handler**: If it IS first contact:
   - Fetch the tour's abbreviated name from `tour_metadata` (the `tour_code` or `akb_id` field), falling back to the full tour name if no abbreviation exists
   - Send identity confirmation SMS: "Hey [Name]! This is TELA for [TourCode]. I have you as [Role]. Text YES to confirm or let me know if anything's off."
   - Log the outbound, return empty TwiML, skip the AI call entirely

4. **Add confirmation response handler**: Before the main AI flow, check if the most recent outbound message to this user contains the identity confirmation pattern. If the user's reply is affirmative (YES, yeah, correct, yep, that's me, confirmed), send a brief welcome: "Confirmed! You're all set. Ask me anything about the tour -- schedule, venues, contacts, hotels. I'm here 24/7." Then fall through to process normally on subsequent texts. If they reply negatively, send: "No worries. Reach out to your Tour Admin to update your info."

### Flow Diagram

```text
First text arrives
  |
  v
Match phone -> tour + name + role
  |
  v
Check conversation history
  |
  +-- History exists? --> Normal TELA flow (Progressive Depth, etc.)
  |
  +-- No history (first contact)?
        |
        v
      Send: "Hey [Name]! This is TELA for [TourCode]. I have you as [Role]. Text YES to confirm."
        |
        v
      User replies YES --> "Confirmed! You're all set."
      User replies NO  --> "No worries. Contact your Tour Admin."
```

### Edge Cases

- **User's first text IS a confirmation reply (e.g. "yes")**: Won't trigger since there's no prior outbound confirmation message to match against
- **User ignores confirmation and asks a question**: After the confirmation was sent, if their next message is not affirmative/negative, treat it as confirmed (they're engaging with the system) and process normally
- **Tour code not set**: Fall back to the full tour name from the `tours` table

### No Database Changes Required

All data needed (name, role, tour code) already exists in the contacts, tours, and tour_metadata tables.

