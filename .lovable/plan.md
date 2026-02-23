

## Update Login Page with Official Condo Bunk Logo

### What Changes
Replace the current icon + text header on the login page with the official Condo Bunk logo image. The login page has a dark background, so the **white text logo** (`WHITE_TEXT_CONDO_BUNK_LOGO.png`) will be used for best contrast.

### Steps

1. Copy `user-uploads://WHITE_TEXT_CONDO_BUNK_LOGO.png` to `src/assets/WHITE_TEXT_CONDO_BUNK_LOGO.png`
2. Update `src/pages/Login.tsx`:
   - Import the logo image
   - Replace the `Radio` icon + "CONDO BUNK" `h1` block (lines 80-88) with an `<img>` tag showing the logo, sized appropriately (roughly 200px wide)
   - Keep the tagline text below

### Technical Details

**File: `src/pages/Login.tsx`**

Remove:
- The `Radio` and `Shield` icon imports (Shield is still used on the button, so keep that)
- The Radio icon + animated dot + h1 "CONDO BUNK" markup

Replace with:
```tsx
import logoWhite from "@/assets/WHITE_TEXT_CONDO_BUNK_LOGO.png";

// In the header area:
<img src={logoWhite} alt="Condo Bunk" className="h-16 w-auto mx-auto mb-2" />
```

The tagline "Close the curtain. Get schtuff done!" stays as-is below the logo.

