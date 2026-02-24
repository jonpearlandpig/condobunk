

## CondoBunk Marketing Site — Multi-Page Build

### Overview
Build a standalone marketing site at `/site` with sub-pages, completely separate from the authenticated `/bunk` app. The marketing site will pull all content from the existing codebase (glossary, branding, copy) and use the same dark mission-control aesthetic.

### Site Structure

```text
/site              --> Landing page (Hero + overview)
/site/features     --> Detailed feature breakdowns
/site/about        --> About CondoBunk / the team
/site/pricing      --> Plans and pricing tiers
/site/contact      --> Contact form / inquiry
```

Each page shares a marketing navigation bar and footer.

### Page Breakdown

**1. Landing Page (`/site`)**
- Full-width hero with the white CondoBunk logo, tagline "Close the curtain. Get schtuff done!", and subheading "TOUR LAW LIVES HERE"
- Three-column value prop section: AKB (your knowledge base), TELA (AI assistant), TourText (SMS answers)
- Social proof / stats section (placeholder for metrics)
- CTA buttons: "TRY DEMO" (links to login with demo activation) and "SIGN IN" (links to /login)

**2. Features Page (`/site/features`)**
- Feature grid built from the glossary data: AKB, TELA, TourText, VANs, Tech Packs, Artifacts, Gaps, Conflicts, Sign-offs, Presence
- Each feature gets an icon, title, and description pulled from `glossary.ts`
- Grouped by category (Core, Data, Features)
- Animated entrance using framer-motion

**3. About Page (`/site/about`)**
- Product story / mission statement
- How CondoBunk replaces email threads and spreadsheets
- "Built by tour professionals, for tour professionals" positioning
- Placeholder section for team bios

**4. Pricing Page (`/site/pricing`)**
- Three-tier card layout (Demo / Pro / Enterprise)
- Demo: Free 24h access, read-only AKB
- Pro: Full AKB management, TELA, TourText, unlimited crew
- Enterprise: Custom, contact for details
- Pricing values as placeholders you can update

**5. Contact Page (`/site/contact`)**
- Simple inquiry form (name, email, message)
- Stores submissions in a new `site_inquiries` database table
- "Request a Demo" CTA alongside the form

### Shared Components

**Marketing Nav Bar** (`src/components/site/SiteNav.tsx`)
- White CondoBunk logo (left)
- Nav links: Features, About, Pricing, Contact
- "SIGN IN" button (right, links to /login)
- Mobile hamburger menu

**Marketing Footer** (`src/components/site/SiteFooter.tsx`)
- Logo, tagline, copyright
- Quick links to all marketing pages
- "TOURTEXT + CONDO BUNK v2.1" branding

**Marketing Layout** (`src/components/site/SiteLayout.tsx`)
- Wraps all /site pages with nav + footer
- No sidebar, no auth required

### Technical Detail

| File | Change |
|------|--------|
| `src/App.tsx` | Add routes: `/site`, `/site/features`, `/site/about`, `/site/pricing`, `/site/contact` |
| `src/components/site/SiteLayout.tsx` | New -- marketing layout with nav + footer |
| `src/components/site/SiteNav.tsx` | New -- marketing navigation bar |
| `src/components/site/SiteFooter.tsx` | New -- marketing footer |
| `src/pages/site/SiteLanding.tsx` | New -- hero + value props + CTA |
| `src/pages/site/SiteFeatures.tsx` | New -- feature grid from glossary |
| `src/pages/site/SiteAbout.tsx` | New -- about / mission page |
| `src/pages/site/SitePricing.tsx` | New -- pricing tiers |
| `src/pages/site/SiteContact.tsx` | New -- contact form |
| Database migration | New `site_inquiries` table for contact form submissions |

### Design Notes
- Same dark background, burnt orange primary, Space Grotesk + JetBrains Mono
- framer-motion scroll animations for section reveals
- All content pulled from existing glossary and login copy -- no new copywriting needed for features
- Fully responsive (mobile-first grid layouts)
- No authentication required for any marketing page

