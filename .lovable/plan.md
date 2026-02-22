

# Add "Ask TELA" Action to Event Cards

## What's changing

Each event card in the TL;DR calendar popup will get an **"Ask TELA"** button alongside the existing "View Full Calendar" link. Tapping "Ask TELA" will:

1. Close the event card dialog
2. Navigate to the TELA chat page (`/bunk/chat`) with a pre-filled context query using the existing `?q=` parameter (e.g., `"What's the rundown for Rock Nashville on Feb 28?"`)
3. The chat will auto-scope to the relevant tour using `?scope=tour`

This uses the existing BunkChat auto-send feature (`?q=` search param) so no new components are needed.

## How it will look

The dialog footer will have two side-by-side actions:
- **VIEW FULL CALENDAR** (existing, left-aligned)
- **ASK TELA** (new, right-aligned, with Sparkles icon)

Each individual event card will also get a small "Ask TELA" tap target that scopes the question specifically to that venue/city/date.

---

## Technical details

### Changes to `src/pages/bunk/BunkOverview.tsx`

1. Import `Sparkles` icon from lucide-react (may already be imported)
2. Add a small "Ask TELA" button to each event card row that:
   - Builds a query string like: `What's the full rundown for [venue] in [city] on [date]?`
   - Navigates to `/bunk/chat?q={encodedQuery}&scope=tour`
   - Sets `selectedTourId` before navigating (via existing tour selection mechanism)
   - Closes the dialog
3. Add an "Ask TELA" button in the dialog footer next to "View Full Calendar" for a general date-scoped question (e.g., `"What's happening on Feb 28?"`)

### No other files need changes
The BunkChat page already supports `?q=` for auto-sending and `?scope=tour` for tour-scoped queries.

