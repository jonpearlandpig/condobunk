
## Fix: Contact Names Truncated on Desktop

### Problem
The desktop sidebar shows up to 7 action icons (BUNK, Edit, Invite, Remove, TELA, Call, Email) per contact. These buttons use `opacity-0 group-hover:opacity-100` to show on hover, but `opacity-0` only makes them invisible -- they still occupy horizontal space. This forces names like "Trey" to truncate to "Tr...".

### Solution
Change the tour team action buttons container from `opacity-0`/`opacity-100` to actually collapse when not hovered. Replace the opacity approach with a width-collapsing pattern so buttons take zero space until the row is hovered.

### Technical Details

**File: `src/components/bunk/SidebarContactList.tsx`** (line 371)

Current:
```
className={`... ${showQuickActions ? "" : isMissingContact ? "" : "opacity-0 group-hover:opacity-100"} transition-opacity`}
```

Change to use `hidden group-hover:flex` for tour team contacts (when `!showQuickActions && !isMissingContact`). This completely removes the buttons from layout until hover, giving the name the full width.

The venue contacts (`showQuickActions`) already show a minimal set of always-visible icons (just text + email), so they remain unchanged.

Additionally, the Edit button on line 432 has its own `opacity-0 group-hover:opacity-100` for venue mode -- that stays as-is since venue buttons are minimal.
