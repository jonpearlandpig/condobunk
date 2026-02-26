
# Reduce Spacing Between Logo and Narrative

## Problem
The screenshot shows a large empty gap between the CONDO BUNK logo and the "It's the night before..." headline. This is caused by:
- `mb-6` on the logo container (line 80)
- `space-y-8` on the outer wrapper (line 78) adding 2rem gap between all children
- `space-y-8` on the narrative container (line 88) adding more internal spacing

## Changes

**File: `src/pages/Login.tsx`**

1. **Line 78** -- Change `space-y-8` to `space-y-4` on the outer `motion.div` wrapper to tighten the gap between the logo and the narrative section
2. **Line 80** -- Change `mb-6` to `mb-2` on the logo container to reduce the bottom margin after the logo
3. **Line 88** -- Change `space-y-8` to `space-y-6` on the narrative `motion.div` to slightly tighten the internal spacing between narrative sections while keeping it readable

These three changes will significantly reduce the dead space while maintaining a clean, readable flow from logo into the story.
