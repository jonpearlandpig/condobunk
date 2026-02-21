

# Mobile-First Optimization for Condo Bunk

## Problem
The app works but was built desktop-first. On a phone, users deal with cramped calendar grids, oversized dialogs, too many buttons visible at once, and wasted space in headers. Tour teams need to get answers and take action fast from their phones -- zero friction.

## Strategy
Strip every screen down to what matters on a phone. Use bottom sheets (Drawer) instead of center Dialogs on mobile. Collapse toolbars. Make touch targets bigger. Hide chrome until needed.

---

## Changes by Screen

### 1. Layout (BunkLayout.tsx)
- Shrink header from `h-12` to `h-10` on mobile
- Hide "CONDO BUNK" label on mobile (just show the Radio icon) to save horizontal space
- Make SIGN OUT a smaller icon-only button on mobile

### 2. Calendar (BunkCalendar.tsx) -- biggest win
- **Mobile view mode**: Default to a vertical list/agenda view on mobile instead of the 7-column grid (the grid cells are unreadable on 375px screens). Week grid stays on tablet/desktop.
- **Header toolbar**: Stack filter/view controls into a single row with smaller buttons; hide the "WEEK/MONTH" toggle on phones (force agenda view)
- **Event detail**: Swap `Dialog` for `Drawer` (bottom sheet) on mobile -- much more natural for thumb reach
- **Add Event**: Also use Drawer on mobile
- **Touch targets**: Event pills get `min-h-[44px]` tap targets in agenda view

### 3. Chat / TELA (BunkChat.tsx)
- Already decent; minor tweaks:
  - Reduce top bar height to `h-10` on mobile
  - Remove scope badge text on very small screens (just show icon)
  - Pin input bar with `pb-safe` (safe-area-inset-bottom) for phones with home indicators
  - Make suggestion chips scroll horizontally instead of wrapping

### 4. Overview / TL;DR (BunkOverview.tsx)
- Reduce heading from `text-2xl` to `text-xl` on mobile
- Make stat cards full-width single column (already `grid-cols-1 sm:grid-cols-2` -- good)
- Reduce padding in briefing card
- Make "ASK TELA" buttons full-width on mobile for easy tap

### 5. Documents (BunkDocuments.tsx)
- Already uses `px-3 sm:px-4` -- good
- Action buttons (EXTRACT, REVIEW, ARCHIVE) -- collapse into a single "..." dropdown on mobile (already partially done with DropdownMenu)
- Upload zone: reduce padding on mobile

### 6. VAN Review Dialog (VANReviewDialog.tsx)
- Use Drawer instead of Dialog on mobile
- Venue scroll bar already fixed; ensure buttons have adequate tap targets (`min-h-[44px]`)

### 7. Sidebar (BunkSidebar.tsx)
- Already handles mobile via `setOpenMobile` -- no changes needed

### 8. Shared responsive wrapper component
- Create a `ResponsiveDialog` component that renders a `Drawer` on mobile and a `Dialog` on desktop. This avoids duplicating every dialog.

---

## Technical Details

### New file: `src/components/ui/responsive-dialog.tsx`
A wrapper that checks `useIsMobile()` and renders either Drawer or Dialog with matching sub-components (Header, Title, Description, Content, Footer, Close). All existing Dialogs that appear on event detail, add event, VAN review, tech pack review, and extraction review will switch to this.

### Files modified:
| File | Change |
|---|---|
| `src/components/ui/responsive-dialog.tsx` | New -- responsive Dialog/Drawer wrapper |
| `src/pages/bunk/BunkLayout.tsx` | Compact mobile header |
| `src/pages/bunk/BunkCalendar.tsx` | Agenda view on mobile, use ResponsiveDialog for event detail |
| `src/pages/bunk/BunkChat.tsx` | Safe-area padding, compact top bar |
| `src/pages/bunk/BunkOverview.tsx` | Tighter mobile spacing |
| `src/pages/bunk/BunkDocuments.tsx` | Tighter mobile padding |
| `src/components/bunk/AddEventDialog.tsx` | Use ResponsiveDialog |
| `src/components/bunk/VANReviewDialog.tsx` | Use Drawer on mobile |
| `src/components/bunk/ExtractionReviewDialog.tsx` | Use ResponsiveDialog |
| `src/components/bunk/TechPackReviewDialog.tsx` | Use ResponsiveDialog |
| `src/index.css` | Add `env(safe-area-inset-bottom)` utility |

### No database or backend changes required.

