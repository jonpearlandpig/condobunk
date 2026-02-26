

# Update TourText Line on Login Page

## Summary
Update the TourText reveal line (line 144) to include the new tagline about TELA.

## Change

**File: `src/pages/Login.tsx`** (line 143-145)

Replace the current line:
> "The Tour Manager is on **CondoBunk** and had already sent you the **TourText** number."

With:
> "The Tour Manager is on **CondoBunk** and had already sent you the **TourText** number. One number, one text, endless tour intelligence, brought to you by **TELA**."

The second sentence will be styled slightly differently -- keeping "TELA" in `text-primary font-bold` to match the other brand highlights, and the tagline portion in a slightly lighter weight to create visual contrast between the factual statement and the brand tagline.

### Technical detail
- Edit line 144 in `src/pages/Login.tsx` to append the new sentence
- "TELA" wrapped in `<span className="text-primary font-bold">` to match CondoBunk/TourText styling
- Single line change, no structural or layout modifications

