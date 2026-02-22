

# Clickable Calendar Events with Inline Event Cards

## What's changing

Calendar date buttons on the TL;DR page will open an inline event card (popover/dialog) instead of navigating to the full Calendar page. Users can quickly read event details without leaving the TL;DR screen.

---

## How it works

- Tapping a date with events opens a **Popover** (desktop) or **bottom Drawer** (mobile) showing all events for that date
- Each event card displays: venue, city, date, tour name, show time, load-in, and notes preview
- A "View Full Calendar" link remains available inside the popover for deep navigation
- Tapping outside or pressing X closes the card

## Technical details

### Data changes
- Expand `loadEventDates` to fetch full event details: `id, event_date, tour_id, venue, city, show_time, load_in, notes`
- Store as `eventDetails` array instead of just date+tour_id pairs

### UI changes in `BunkOverview.tsx`
- Add state for `selectedDate: string | null`
- On date button click: set `selectedDate` to that date string (instead of navigating)
- Render a `ResponsiveDialog` (Drawer on mobile, Dialog on desktop) that filters events for the selected date
- Event card content:
  - Tour color dot + tour name
  - Venue name (bold) + city
  - Show time / load-in if available
  - Notes snippet (first 2 lines)
  - Tap event row to navigate to full calendar (optional deep link)

### Files modified
1. **`src/pages/bunk/BunkOverview.tsx`** -- Replace navigate-on-click with popover/dialog showing event details inline; expand event data fetch to include venue, city, times, notes

