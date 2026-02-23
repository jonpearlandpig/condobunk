

## Fix: Desktop Contact Names Truncated by Too Many Action Buttons

### Root Cause
Each tour team contact row shows up to 7 action buttons (Message, Edit, Invite/Remove, TELA, Call, Email). Even with `hidden group-hover:flex`, on touch-enabled devices hover states persist, keeping all buttons visible. More fundamentally, 7 small icon buttons simply cannot fit alongside a name in a ~240px sidebar column.

### Solution
Replace the row of 6-7 individual icon buttons with a **single overflow menu button** (three-dot "..." icon). Hovering the row reveals just one small button; clicking it opens a dropdown with all the actions listed by name. This guarantees the contact name always has nearly full width.

### Changes

**File: `src/components/bunk/SidebarContactList.tsx`**

1. Import `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` from `@/components/ui/dropdown-menu` and the `MoreHorizontal` icon from `lucide-react`.

2. Replace the entire desktop action buttons container (lines 370-511, the `{!isMobile && (...)}` block) with a single overflow menu:
   - Show a `MoreHorizontal` icon button, hidden by default and visible on `group-hover`
   - The dropdown menu contains labeled items for each action:
     - "Bunk Chat" / "Text" (MessageCircle) — if `c.appUserId` or `c.phone`
     - "Edit" (Pencil) — if `onUpdate`
     - "Invite to Condo Bunk" (UserPlus) — if `!c.appUserId && c.email`
     - "Remove from tour" (UserMinus) — if owner and `c.appUserId`
     - "Ask TELA" (MessageSquare)
     - "Call" (Phone) — if `c.phone`
     - "Email" (Mail) — if `c.email`
   - For `isMissingContact`, show just a visible TELA icon (no overflow needed since there's only 1 action)
   - For `showQuickActions` (venue contacts), keep existing minimal icons (SMS + Email) since those are only 2 and fit fine

3. Keep the online status dot and INVITED badge inline with the name (they're small and don't crowd).

### Result
- Contact names like "Trey", "Nathan", "David", "Pip Palmer", "Sidney" will display in full
- A single "..." button appears on hover; all actions are accessible via dropdown
- Mobile tap-to-expand behavior is unchanged
