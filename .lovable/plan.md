

## Fix Tour Team Contact Overflow Menu

### Problem
When clicking the three-dot menu on a tour team contact, two things go wrong:
1. The menu trigger disappears because it relies on CSS hover (`hidden group-hover:flex`), and once focus moves to the dropdown content, the row loses its hover state.
2. The sidebar/drawer closes, leaving the dropdown floating over the main content with no way to see the result of the action.

### Solution
Replace the CSS hover-only visibility with a combined approach: show the three-dot button on hover **OR** when the dropdown is open. This keeps the trigger visible while the menu is active and prevents the jarring disappearance.

### Technical Changes

**File: `src/components/bunk/SidebarContactList.tsx`**

1. Add a `openMenuId` state to track which contact's dropdown is currently open.
2. On the wrapper div (line 404), change `hidden group-hover:flex` to a conditional class that shows the button when either the row is hovered OR the dropdown for that contact is open.
3. Add `modal={false}` to the `DropdownMenuContent` so it doesn't steal focus from the sidebar and cause it to close.
4. Use `onOpenChange` on the `DropdownMenu` to update `openMenuId`.

The key changes:
- Line 404: `hidden group-hover:flex` becomes a dynamic class using the new state
- Add state: `const [openMenuId, setOpenMenuId] = useState<string | null>(null);`
- The DropdownMenu gets `open` and `onOpenChange` props tied to the state
- The wrapper div visibility becomes: `opacity-0 group-hover:opacity-100` combined with forced visibility when `openMenuId === c.id`

This is a minimal, clean fix that keeps the existing UI pattern but prevents the disappearing trigger problem.

