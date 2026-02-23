

# Fix Messy Messages Drawer Layout

## Problems (from screenshot)

1. **Giant empty space above contacts** -- The scrollable container uses `justify-end`, which pushes Tour Team / Venue Partners / Ask TELA to the very bottom of the drawer, leaving a massive void above them. On mobile this looks broken.

2. **No "unread messages" section** -- The badge shows 2 unread messages, but there's no way to see WHO sent them without expanding Tour Team, then expanding the tour sub-group, then scanning for the unread dot. Contacts with waiting messages should be surfaced at the top automatically.

3. **Tour name text wrapping** -- Long names like "THE POSITIVE ROCKS -- CHURCH TOUR AKB BUILD" overflow and wrap awkwardly in the nested collapsible header.

## Changes

### File: `src/components/bunk/MobileBottomNav.tsx`

**1. Remove `justify-end` from the scrollable container (line 163)**

Change `flex flex-col justify-end` to just `flex flex-col` so content starts at the top of the drawer instead of being pushed to the bottom.

**2. Add a "Waiting" section at the top that auto-surfaces contacts with unread DMs**

Before the Tour Team collapsible, add a new section that:
- Scans all tour team contacts for any with `unreadFrom(c.appUserId) > 0`
- If any exist, renders them in a non-collapsible "WAITING" section at the top (always visible)
- Each contact is tappable (uses the same `handleContactTap` flow)
- Shows the unread count badge next to each name

This means when someone messages you, they appear right at the top of the drawer -- no digging through collapsed sections.

**3. Truncate long tour names in nested collapsibles (line 55)**

Add `truncate` to the tour name text inside `CollapsibleSection` so long names like "THE POSITIVE ROCKS -- CHURCH TOUR AKB BUILD" get ellipsized instead of wrapping to multiple lines. Also add `max-w-[70%]` to the title span to leave room for the count.

### Technical Detail

```text
Messages drawer layout (after fix):
+---------------------+
| MESSAGES         2  |
|                     |
| WAITING          2  |  <- new, always visible
|  * Sidney Wagner  1 |  <- tappable, shows unread count
|  * Caleb Cook     1 |
|                     |
| > TOUR TEAM     16  |  <- collapsed
| > VENUE PARTNERS 73 |  <- collapsed
| > ASK TELA          |  <- collapsed
|                     |
| Jon Hartman         |
+---------------------+
```

**Line 163** -- remove justify-end:
```tsx
// Before
<div className="overflow-y-auto flex-1 px-3 pb-2 flex flex-col justify-end min-h-0">

// After
<div className="overflow-y-auto flex-1 px-3 pb-2 flex flex-col min-h-0">
```

**New "Waiting" section** -- inserted before the Tour Team collapsible (after line 163):
```tsx
{/* Contacts with unread messages — always visible at top */}
{(() => {
  const waitingContacts = filteredTourTeamGroups
    .flatMap(g => g.contacts)
    .filter(c => unreadFrom(c.appUserId) > 0);
  if (waitingContacts.length === 0) return null;
  return (
    <div className="mb-1">
      <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase py-1.5 px-1">
        Waiting
        <span className="ml-auto float-right text-[9px] text-muted-foreground/40">{waitingContacts.length}</span>
      </p>
      {waitingContacts.map(c => (
        <button
          key={c.id}
          onClick={() => handleContactTap(c)}
          className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-sidebar-accent/50 rounded-md transition-colors text-left"
        >
          <span className="h-2 w-2 rounded-full bg-success shrink-0" />
          <span className="text-sm text-sidebar-foreground truncate flex-1">{c.name}</span>
          <span className="h-4 min-w-4 px-1 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
            {unreadFrom(c.appUserId)}
          </span>
        </button>
      ))}
    </div>
  );
})()}
```

**CollapsibleSection title truncation** -- update the button content (line 55-58):
```tsx
<button
  onClick={() => setOpen(!open)}
  className={`w-full font-mono tracking-[0.2em] text-muted-foreground/60 uppercase py-1.5 px-1 flex items-center gap-1.5 hover:text-muted-foreground transition-colors ${nested ? "text-[9px]" : "text-[10px]"}`}
>
  <ChevronRight className={`h-2.5 w-2.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
  <span className="truncate">{title}</span>
  {count !== undefined && count > 0 && (
    <span className="ml-auto shrink-0 text-muted-foreground/40 normal-case tracking-normal text-[9px]">{count}</span>
  )}
</button>
```

### No other files modified

Only `MobileBottomNav.tsx` is touched. The data hooks already provide everything needed.

