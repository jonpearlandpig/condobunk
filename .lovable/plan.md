

# TL;DR Desktop Calendar: Start 5 Days Back + Mobile 2-Week Toggle

## Overview

Two targeted changes to the calendar widgets:
1. **TL;DR desktop calendar** (BunkOverview): Shift the grid to start 5 days before today instead of at the beginning of the current month, showing a forward-looking ~5-week window.
2. **Mobile calendar** (BunkCalendar): Add a toggle so mobile users can switch between "Today" (agenda from today forward) and "2 Weeks" view, instead of being locked to the current week-only agenda.

## Changes

### 1. BunkOverview.tsx -- Desktop Calendar Start Date (lines ~426-444)

Currently the desktop `calendarDays` computes a full month grid starting at the beginning of the current month. Change this to:
- Start date = 5 days before today
- End date = ~30 days from today (roughly one month out)
- Still rendered as a 7-column grid with day-of-week headers
- The header label changes from "FEBRUARY 2026" to something like "FEB 20 - MAR 27" to reflect the rolling window
- Today still gets the highlighted ring treatment

The `calendarDays` useMemo becomes:
```typescript
const today = new Date();
if (isMobile) {
  return Array.from({ length: 14 }, (_, i) => addDays(today, i));
}
// Desktop: 5 days back + ~30 days ahead, aligned to week boundaries
const rangeStart = addDays(today, -5);
const rangeEnd = addDays(today, 30);
const gridStart = startOfWeek(rangeStart);
const gridEnd = endOfWeek(rangeEnd);
const days: Date[] = [];
let d = gridStart;
while (d <= gridEnd) {
  days.push(d);
  d = addDays(d, 1);
}
return days;
```

The header label (line ~625) changes from `format(new Date(), "MMMM yyyy").toUpperCase()` to show the date range like `"FEB 20 - MAR 27"`.

The `outsideMonth` dimming logic is removed since we're no longer doing a month-based grid.

### 2. BunkCalendar.tsx -- Mobile 2-Week Toggle

Currently the WEEK/MONTH toggle is hidden on mobile (`hidden sm:flex` on line 479). We need to:

- Add a mobile-only toggle with two options: **TODAY** and **2 WEEKS**
- Add a new state variable `mobileRange` with values `"today"` or `"2weeks"`
- When "TODAY" is selected: show agenda from today forward for the current week (existing behavior)
- When "2 WEEKS" is selected: show a 14-day rolling agenda from today

**New state:**
```typescript
const [mobileRange, setMobileRange] = useState<"today" | "2weeks">("today");
```

**Mobile toggle UI** (visible only on mobile, placed near the existing nav buttons):
```tsx
<div className="flex sm:hidden rounded-md border border-border overflow-hidden">
  <button onClick={() => setMobileRange("today")} className={`px-3 py-1.5 text-[11px] font-mono ...`}>TODAY</button>
  <button onClick={() => setMobileRange("2weeks")} className={`px-3 py-1.5 text-[11px] font-mono ...`}>2 WEEKS</button>
</div>
```

**Adjust `visibleDays`** to account for mobile range:
- When mobile + "today": keep existing week view behavior (starts from current week)
- When mobile + "2weeks": use `eachDayOfInterval` from today to today+13

**Adjust navigation**: When in "2weeks" mode, the left/right arrows shift by 2 weeks instead of 1 week. The "Today" button resets to today.

## Files Modified

| File | Change |
|------|--------|
| `src/pages/bunk/BunkOverview.tsx` | Desktop `calendarDays` starts 5 days back; update header label; remove `outsideMonth` dimming |
| `src/pages/bunk/BunkCalendar.tsx` | Add `mobileRange` state; add mobile-only TODAY/2WEEKS toggle; adjust `visibleDays` for 2-week mobile mode |

## No Backend Changes

This is purely frontend -- no migrations, edge functions, or RLS changes needed.

