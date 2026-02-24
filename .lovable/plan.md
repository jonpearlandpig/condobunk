

## Replace Menu Icon with Clickable Logo

### What Changes

Remove the `SidebarTrigger` hamburger icon from the header and make the white bunk logo + "CONDO BUNK" text act as the sidebar toggle instead.

### Technical Detail

**File: `src/pages/bunk/BunkLayout.tsx`** (lines 129-136)

- Remove the `<SidebarTrigger />` component from the header
- Wrap the logo `<img>` and "CONDO BUNK" text in a `<SidebarTrigger asChild>` so clicking the logo toggles the sidebar
- Style the wrapper button with `cursor-pointer` and a subtle hover effect
- Keep the `useSidebar` hook's `toggleSidebar` accessible via the `SidebarTrigger` component (which already handles this internally with `asChild`)

**Before:**
```text
[hamburger icon]  [bunk logo]  CONDO BUNK          [avatar]
```

**After:**
```text
[bunk logo]  CONDO BUNK  (clickable, toggles sidebar)    [avatar]
```

### Single file change

| File | Change |
|------|--------|
| `src/pages/bunk/BunkLayout.tsx` | Remove standalone `SidebarTrigger`, wrap logo+text in `SidebarTrigger asChild` |

