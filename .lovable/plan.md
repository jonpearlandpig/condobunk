

# Separate Tours into Expandable Sub-Groups

## Problem

Right now, "Tour Team" and "Venue Partners" each render as one flat list combining all tours. When a user has multiple tours, contacts from different tours are mixed together with no separation. The screenshot shows all contacts dumped under a single expanded "Tour Team" header.

## Solution

Replace the flat contact dump with per-tour sub-collapsibles inside each section. Each tour starts **collapsed** and expands on tap to reveal its contacts. The scrollable container is also updated to allow proper scrolling when lists get long.

```text
+---------------------+
| MESSAGES       (2)  |
|                     |
| (scrollable area)   |
|                     |
| > TOUR TEAM     8   |
|   > Summer Run  5   |  <- collapsed, tap to expand
|   > Fall Tour   3   |  <- collapsed, tap to expand
|                     |
| > VENUE PARTNERS 73 |
|   > Summer Run  40  |  <- collapsed, shows venue groups inside
|   > Fall Tour   33  |
|                     |
| > ASK TELA          |
+---------------------+
| Avatar  Name        |
+---------------------+
```

## Technical Changes

### File: `src/components/bunk/MobileBottomNav.tsx`

1. **Fix scrollable container**: Change from `flex flex-col justify-end` to `overflow-y-auto flex-1 px-3 pb-2 flex flex-col justify-end min-h-0` -- adding `min-h-0` ensures the flex child can actually shrink and scroll when content overflows.

2. **Tour Team section**: Instead of rendering `filteredTourTeamGroups.map(g => <SidebarContactList .../>)` directly inside one `CollapsibleSection`, render each tour group as its own nested `CollapsibleSection` (starting closed):

```tsx
<CollapsibleSection title="Tour Team" count={totalTeamContacts}>
  {filteredTourTeamGroups.map(g => (
    <CollapsibleSection key={g.tourId} title={g.tourName} count={g.contacts.length}>
      <SidebarContactList
        contacts={g.contacts}
        onNavigate={() => setDrawerOpen(false)}
        onUpdate={updateContact}
        onDelete={deleteContact}
        onlineUserIds={onlineUsers}
        unreadFrom={unreadFrom}
        onContactTap={handleContactTap}
      />
    </CollapsibleSection>
  ))}
</CollapsibleSection>
```

3. **Venue Partners section**: Same pattern -- each `tourVenueGroup` becomes its own nested collapsible:

```tsx
<CollapsibleSection title="Venue Partners" count={totalVenueContacts}>
  {tourVenueGroups.map(tvg => (
    <CollapsibleSection key={tvg.tourId} title={tvg.tourName} count={tvg.totalContacts}>
      <SidebarContactList
        contacts={tvg.venueGroups.flatMap(vg => vg.contacts)}
        onNavigate={() => setDrawerOpen(false)}
        onUpdate={updateContact}
        onDelete={deleteContact}
        onlineUserIds={onlineUsers}
        grouped
        venueGroups={tvg.venueGroups}
      />
    </CollapsibleSection>
  ))}
</CollapsibleSection>
```

4. **CollapsibleSection nesting style**: Add a small left indent (`pl-2`) to nested sections so the hierarchy is visually clear. Update the `CollapsibleSection` component to accept an optional `nested` prop or detect depth via a slightly smaller font/indent.

### No other files modified

The data structures (`TourTeamGroup`, `TourVenueGroup`) already separate contacts per tour -- we just need to render them as individual expandables instead of flat lists.

