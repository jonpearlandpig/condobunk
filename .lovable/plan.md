

# Login Page Narrative Redesign -- Bold, Eye-Catching, Story-Driven

## Goal
Replace the current tagline and branding block with a large, immersive narrative that immediately tells the user what CondoBunk solves. The copy should feel like a briefing -- scannable, punchy, and impossible to ignore. By the time they hit the login form, they already understand the value and are thinking about how to talk to TELA.

## Layout Change

The current `max-w-md` container is too narrow for impactful storytelling. The page will be restructured into a **scrollable single-column layout** with the narrative section wider (`max-w-2xl`) and the login form staying compact (`max-w-md`) below it, both centered.

## Content Structure (lines 72-125 replacement)

The page will flow top-to-bottom:

1. **Logo** -- unchanged, full-width within container
2. **Hero headline** -- large, bold: "It's the night before you land with a new touring team."
3. **Scene-setting paragraph** -- medium text, high contrast: stepping in cold, no history, no margin
4. **"Before wheels down, you need:" checklist** -- styled as a two-column grid of bold items with subtle left-border accent, large enough to scan instantly
5. **Resolution block** -- "You don't chase texts..." lines as a punchy trio
6. **Product reveal** -- "The Tour Manager is on **CondoBunk** and had already sent you the **TourText** number."
7. **Optional CTA line** -- smaller text about CondoBunkCrew app for visual display
8. **Login form card** -- unchanged

## Styling Approach

- Hero headline: `text-2xl sm:text-3xl font-bold text-foreground` with `leading-tight`
- Scene paragraph: `text-base sm:text-lg text-foreground/80 leading-relaxed`
- Checklist: `grid grid-cols-1 sm:grid-cols-2 gap-2` with each item using `text-sm sm:text-base text-foreground font-medium` and a `border-l-2 border-primary pl-3` accent
- Resolution lines: `text-base sm:text-lg font-semibold text-foreground` -- tight, declarative
- Brand names (CondoBunk, TourText, TELA): `text-primary font-bold`
- CondoBunkCrew line: `text-sm text-muted-foreground italic`
- Gentle staggered fade-in animation using framer-motion for sections (not per-word)

## File Changes

### 1. `src/pages/Login.tsx`

**Remove** (lines 78-125):
- The `max-w-md` width constraint on the outer wrapper
- The tagline "Close the curtain..."
- The entire staggered `motion.div` block (TOUR LAW, WORKSPACE, TELA, TOURTEXT)

**Replace with**:
- Outer wrapper becomes `max-w-2xl` with the narrative content
- A `motion.div` containing the narrative sections with simple stagger animation
- The login form card wrapped in its own `max-w-md mx-auto` to stay compact
- Content exactly as specified by the user, with the corrected TourText line

### 2. `src/components/site/SiteFooter.tsx` (line 23)

Update tagline from "Close the curtain. Get schtuff done!" to: "Your tour knowledge base. Ask TELA."

### 3. `src/pages/site/SiteLanding.tsx` (line 78)

Update hero subtitle from "Close the curtain. Get schtuff done!" to: "Hop in your CondoBunk and Ask TELA."

### 4. Memory update

Update the style/aesthetic memory to reflect the new narrative-driven login page positioning instead of the old "Tour Law" tagline approach.

