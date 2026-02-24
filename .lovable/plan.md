

## Rewrite Login Page Copy: Make It Hit Hard

### Problem
The current product summary reads like a feature list — small text, generic SaaS copy. It doesn't convey the energy or the two-product relationship (CondoBunk + TourText). Users should feel like they're entering something powerful, not just logging into another tool.

### New Copy Direction

Replace the small summary block with bold, stacked messaging that explains both products and gets people hyped. Bigger text, more personality, clear separation between what CondoBunk is and what TourText is.

**Proposed layout:**

```text
[  CONDO BUNK LOGO  ]
Close the curtain. Get schtuff done!

TOUR LAW LIVES HERE.                        <- big, bold headline

CondoBunk is your tour's command center.
Upload advances, tech packs, and contacts —
TELA (Tour Intelligence) turns them into
searchable, structured knowledge for your
entire operation.

TOURTEXT                                     <- secondary headline
One phone number. One text.
Your crew is one question away from
anything they need to know — and
so much more.

[========= LOGIN FORM =========]
```

### Visual Treatment

- **"TOUR LAW LIVES HERE."** — `text-lg` or `text-xl`, `font-bold`, `font-mono`, `tracking-widest`, foreground color. This is the anchor line.
- **CondoBunk description** — `text-sm`, `text-muted-foreground`, relaxed leading. Explains the workspace.
- **"TOURTEXT"** — `text-base`, `font-bold`, `font-mono`, burnt orange accent color to visually separate it as the crew-facing product.
- **TourText description** — `text-sm`, `text-muted-foreground`. Short, punchy, one-liner energy.
- Centered alignment throughout, max-w-sm for readability.
- Add subtle staggered fade-in animations using framer-motion for each block.

### Technical Detail

**File: `src/pages/Login.tsx`** (lines 82-95)

- Remove the existing tagline `<p>` and the `<div>` summary block
- Replace with the new structured copy blocks described above
- Use existing `motion.div` or add lightweight staggered children for the fade-in effect
- No new components or dependencies — just JSX and existing tailwind classes + framer-motion (already installed)

### Single File Change

| File | Change |
|------|--------|
| `src/pages/Login.tsx` | Replace lines 82-95 with new bold copy blocks |

