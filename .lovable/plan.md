
# Add Calendar View to TL;DR + Fix Advance Master Start Position

## What's changing

### 1. Calendar widget on the TL;DR page
A compact, visual calendar will be added between the Daily Briefing and the Stat Cards sections. It shows upcoming events as colored dots/indicators on a date grid.

- **Mobile**: 2-week rolling view starting from today
- **Desktop**: Full month view (standard calendar grid)
- Tapping a date with events navigates to the full Calendar page
- Tour color coding matches existing palette (primary, info, success, warning)
- Minimal design: date grid with small colored dots under dates that have events

### 2. Advance Master Review -- start at closest venue
The VANReviewDialog already has logic to auto-select the first venue from today forward. I'll verify it works correctly and ensure the horizontal venue bar scrolls to center on that venue.

---

## Technical details

### TL;DR Calendar Widget (`BunkOverview.tsx`)
- Fetch `schedule_events` (already fetched for counts -- extend to include `event_date` and `tour_id`)
- Use `date-fns` to build a date grid:
  - Mobile (`useIsMobile`): 14-day range starting today
  - Desktop: full month grid (same logic as BunkCalendar's month view)
- Render a compact grid with day numbers and small colored dots for events
- Clicking a day with events navigates to `/bunk/calendar`
- Wrapped in a `motion.div` card matching existing design
- No new components needed -- inline in BunkOverview

### Advance Master Review (`VANReviewDialog.tsx`)
- Current auto-select logic already picks the first venue >= today -- this is correct
- Ensure the `scrollIntoView` call uses `inline: "center"` instead of `"start"` for better centering
- No functional change needed beyond the scroll positioning tweak

### Files modified
1. **`src/pages/bunk/BunkOverview.tsx`** -- Add calendar widget section, fetch event dates, render date grid with responsive sizing
2. **`src/components/bunk/VANReviewDialog.tsx`** -- Minor scroll behavior tweak (change `inline: "start"` to `inline: "center"`)
