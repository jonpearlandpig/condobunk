

## Show Tour/Artist Name on Every Event Card

### Problem
When working multiple tours, you can't tell at a glance which tour an event belongs to. The tour name only shows on desktop grid cards in global multi-tour mode, and it's tiny and faded.

### Changes

**File: `src/pages/bunk/BunkCalendar.tsx`**

All changes make the tour name the **first line** on every event card, always visible regardless of how many tours you have.

#### 1. Mobile Event Cards (~line 547-565)
Add the tour name as a bold top line above the venue name:
```text
[Icon] Keepers of the House        >
       Madison Square Garden
       New York, NY  |  Show 8:00 PM
```

#### 2. Desktop Grid Event Cards (~line 604-635)
Move tour name to the top of each card instead of the bottom, remove the `isGlobal && tours.length > 1` condition so it always shows:
```text
[Icon] Keepers of the House
       Madison Square Garden
       New York, NY
       Show 8:00 PM
```

#### 3. Upcoming Shows List (~line 668-679)
Add a tour name column/label between the date and venue name so you can scan the list and know which tour each show belongs to.

#### 4. Detail Dialog Header (~line 694-711)
Add the tour name as a small label above the venue title in the event detail dialog so when you tap into a card, the tour context is immediately clear.

### Visual Hierarchy (all cards)
1. **Tour/Artist Name** -- top line, slightly smaller, uses the tour color
2. **Venue Name** -- primary line, bold
3. **City** -- secondary
4. **Times** -- tertiary

### No Database Changes
All data is already available in `CalendarEntry.tourName`. This is purely a UI rearrangement.
