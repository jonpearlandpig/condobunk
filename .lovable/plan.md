

## Add Product Summary to Login Page

### What Changes

Below the tagline ("Close the curtain. Get schtuff done!"), add a concise 3-part product summary that explains what CondoBunk is, how it works, and what makes it different. The copy will be styled to fit the dark mission-control aesthetic -- small, muted text that doesn't compete with the logo or login form.

### Proposed Copy

Something along these lines (can be refined):

> **One source of truth for your tour.**
> CondoBunk extracts venue advances, tech packs, and contacts into a structured knowledge base -- then makes it searchable for your entire crew via text message or in-app AI.
> No more digging through email threads. No more outdated spreadsheets.

### Layout

```text
[  CONDO BUNK LOGO  ]
Close the curtain. Get schtuff done!

One source of truth for your tour.
CondoBunk extracts venue advances, tech packs,
and contacts into a structured knowledge base --
then makes it searchable for your entire crew
via text message or in-app AI.
No more digging through email threads.
No more outdated spreadsheets.

[========= LOGIN FORM =========]
```

### Technical Detail

**File: `src/pages/Login.tsx`** (lines 80-85)

- Add a new `<div>` block after the tagline `<p>` and before the closing `</div>` of the text-center section
- Use `text-xs text-muted-foreground/70` styling for the body text and `text-sm font-semibold text-foreground` for the headline
- Keep the max width constrained so it reads well on mobile
- No new components or dependencies needed -- just a few lines of JSX

