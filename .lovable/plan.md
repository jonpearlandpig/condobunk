
# Mobile Login Page: Collapsible Checklist and Tighter Spacing

## Changes

### 1. Make the checklist collapsible on mobile (`src/pages/Login.tsx`)

On mobile, wrap the "Before wheels down, you need:" section (lines 105-128) in a `Collapsible` component (already available at `@/components/ui/collapsible`). The heading "Before wheels down, you need:" becomes the trigger with a chevron icon. Tapping it expands/collapses the checklist items. On desktop (`sm:` and up), the checklist remains always visible without the collapsible wrapper.

Implementation approach:
- Import `useIsMobile` from `@/hooks/use-mobile`
- Import `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` from `@/components/ui/collapsible`
- Import `ChevronDown` from `lucide-react`
- On mobile: render the checklist inside a `Collapsible` (default closed), with the "Before wheels down" text as a tappable trigger showing a rotating chevron
- On desktop: render exactly as-is (no collapsible behavior)

### 2. Reduce remaining gap between logo and headline on mobile

- **Line 78**: Change `space-y-4` to `space-y-2 sm:space-y-4` -- tighter on mobile, normal on desktop
- **Line 80**: Change `mb-2` to `mb-0 sm:mb-2` -- eliminate bottom margin on mobile
- **Line 88**: Change `space-y-6` to `space-y-4 sm:space-y-6` -- tighter narrative spacing on mobile

### Files modified
- `src/pages/Login.tsx` only
