

# TELA;QR — Quick Read

TELA;QR is the gold standard: intelligence-based analysis built on the user's pristinely maintained AKB data. Not guessing — reading what's there and surfacing what matters.

## Changes

### 1. Page title (`src/pages/bunk/BunkOverview.tsx`, line 466)
- Before: `<GlossaryTerm term="TELA">TELA</GlossaryTerm> TL;DR`
- After: `TELA;QR`
- Remove the GlossaryTerm wrapper — TELA;QR is its own brand mark now
- Subtitle stays: "Real-time tour intelligence"

### 2. Section header (`src/pages/bunk/BunkOverview.tsx`, line 532)
- Before: `DAILY BRIEFING`
- After: `QUICK READ`

### 3. Mobile 2-line collapse (`src/pages/bunk/BunkOverview.tsx`, lines 554-574)
- Add `briefingExpanded` state (default `false`)
- On mobile (`isMobile`): show only `tldr.slice(0, 2)` when collapsed
- Render a "SHOW MORE" / "SHOW LESS" toggle button below the items (only on mobile, only when more than 2 items exist)
- Desktop: always show all items, no change

### 4. Desktop sidebar (`src/components/bunk/BunkSidebar.tsx`, line 51)
- Before: `{ title: "TL;DR", ... }`
- After: `{ title: "TELA;QR", ... }`

### 5. Mobile bottom nav (`src/components/bunk/MobileBottomNav.tsx`, line 47)
- Before: `{ title: "TL;DR", ..., tip: "Tour overview" }`
- After: `{ title: "TELA;QR", ..., tip: "Quick Read" }`

### 6. Glossary (`src/lib/glossary.ts`)
- Add new entry:
```typescript
"TELA;QR": {
  term: "TELA;QR",
  short: "TI-generated daily quick read — intelligence-based analysis built from your AKB data, surfacing upcoming events, open gaps, and unresolved conflicts.",
  category: "features",
}
```

## Files

| File | What |
|------|------|
| `src/pages/bunk/BunkOverview.tsx` | Title rename, section rename, mobile 2-line collapse |
| `src/components/bunk/BunkSidebar.tsx` | Sidebar nav label |
| `src/components/bunk/MobileBottomNav.tsx` | Bottom nav label + tip |
| `src/lib/glossary.ts` | New glossary entry |

No database changes. No new dependencies. Internal variable names (`tldr`, `tldrLoading`, etc.) stay as-is.

