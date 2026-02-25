

# Replace "AI" with "TI" (Tour Intelligence) in All User-Facing Copy

TELA is Tour Intelligence, not Artificial Intelligence. Every place where users or venues see "AI" needs to say "TI" or "Tour Intelligence" instead. Internal code (API gateway URLs, console logs, variable names) stays untouched -- those are infrastructure, not branding.

## Changes

### 1. `src/lib/glossary.ts`

**Line 16** -- TELA definition:
- Before: `"Tour Efficiency Liaison Assistant — the AI that answers questions from your tour data."`
- After: `"Tour Efficiency Liaison Assistant — the Tour Intelligence that answers questions from your tour data."`

The `buildGlossaryPromptBlock` function comment on line 76 says "AI system prompts" -- this is an internal developer comment, not user-facing. Leave it.

### 2. `src/pages/site/SiteLanding.tsx`

**Line 27** -- TELA description:
- Before: `"AI that answers questions from your tour data instantly."`
- After: `"Tour Intelligence that answers questions from your tour data instantly."`

### 3. `src/pages/site/SitePricing.tsx`

**Line 24** -- Demo tier feature:
- Before: `"Try TELA AI assistant"`
- After: `"Try TELA Tour Intelligence"`

**Line 38** -- Pro tier feature:
- Before: `"TELA AI — unlimited queries"`
- After: `"TELA TI — unlimited queries"`

### 4. `src/pages/site/SiteAbout.tsx`

**Line 27** -- Pain point "after" text:
- Before: `"Instant answers via AI or SMS"`
- After: `"Instant answers via TELA or SMS"`

### 5. `supabase/functions/tourtext-inbound/index.ts`

**Line 326** -- TELA system prompt (this IS user-facing since it shapes how TELA describes itself):
- Before: `"You are TELA, the touring AI for..."`
- After: `"You are TELA, the Tour Intelligence for..."`

### 6. `supabase/functions/akb-chat/index.ts`

**Line 393** -- Glossary block in TELA's system prompt:
- Before: `"TELA: Tour Efficiency Liaison Assistant — the AI that answers questions from your tour data."`
- After: `"TELA: Tour Efficiency Liaison Assistant — the Tour Intelligence that answers questions from your tour data."`

## NOT Changing (Internal/Technical)

These stay as-is because they're infrastructure code, not branding:
- API gateway URLs (`ai.gateway.lovable.dev`)
- Console log messages (`"AI error:"`, `"AI returned non-JSON"`)
- Variable names (`aiResponse`, `aiExtractFromPdf`)
- Code comments about extraction logic
- The `ai` loop variable in `BunkChat.tsx` line 468 (just an iterator variable name)

## Summary

| File | Lines Changed | What |
|------|--------------|------|
| `src/lib/glossary.ts` | 1 | TELA definition |
| `src/pages/site/SiteLanding.tsx` | 1 | TELA value prop |
| `src/pages/site/SitePricing.tsx` | 2 | Demo + Pro feature lists |
| `src/pages/site/SiteAbout.tsx` | 1 | Pain point copy |
| `supabase/functions/tourtext-inbound/index.ts` | 1 | TELA self-description in system prompt |
| `supabase/functions/akb-chat/index.ts` | 1 | Glossary in TELA system prompt |

7 total string replacements. No structural changes. No database changes.
