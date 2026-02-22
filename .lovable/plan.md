

# Simplify Invite Flow: One-Click Google Sign-In

## Problem
1. **Bulk invite doesn't send anything** -- it creates database records but never emails anyone
2. **Individual invite** opens a `mailto:` link (relies on your email app), which is clunky
3. **Invite landing page** is cluttered with password fields and sign-up/sign-in toggles when all you want is "Sign in with Google and join"

## What Changes

### 1. Invite Landing Page (`InviteAccept.tsx`) -- Simplified
- Remove the password form, sign-up/sign-in toggle, and all email/password auth
- Show only: Tour name, role, and a single **"SIGN IN WITH GOOGLE & JOIN"** button
- If user is already logged in, show a single **"JOIN TOUR TEAM"** button that accepts immediately
- After accepting, redirect to `/bunk` (TL;DR page) instead of showing a delay screen

### 2. Bulk Invite -- Actually Send via Email Edge Function
- Create a new backend function `send-invite-email` that sends a branded email to each invitee using the Lovable AI-supported approach (or a simple SMTP/Resend integration)
- The "INVITE ALL" button will: create invite records, then call the edge function to send emails to all eligible contacts
- Each email contains: Tour name, a "Join Tour" button linking to `/invite/{token}`

### 3. Individual Invite -- Also Send via Edge Function
- Instead of opening `mailto:`, the individual invite button calls the same edge function to send the email directly
- No more relying on the admin's email client

## Recipient Experience (After Changes)
```
1. Recipient gets email: "You've been invited to join [Tour Name] on Condo Bunk"
2. Clicks "Join Tour" button in email --> opens /invite/{token}
3. Sees: Tour name, their role, one big "SIGN IN WITH GOOGLE & JOIN" button
4. Signs in with Google --> auto-accepts invite --> lands on TL;DR page
```

## Technical Details

### New Edge Function: `supabase/functions/send-invite-email/index.ts`
- Accepts: `{ invites: [{ email, name, token, tour_name, role }] }`
- Uses Resend API (requires RESEND_API_KEY secret) OR we can use the Lovable AI model to generate the email HTML and send via Supabase's built-in email
- Sends a clean branded email with a "Join Tour" CTA button

### Modified: `src/pages/InviteAccept.tsx`
- Strip out password form, sign-up/sign-in toggle
- Keep only: invite info card + "SIGN IN WITH GOOGLE & JOIN" button (for unauthenticated users)
- Add: "JOIN TOUR TEAM" button (for already-authenticated users)
- Redirect to `/bunk` immediately after acceptance

### Modified: `src/components/bunk/BunkSidebar.tsx`
- `handleBulkInvite`: after creating invite records, call `send-invite-email` edge function with all the invite details
- Show toast: "X invites sent!" instead of the misleading "Links will be included when you email each contact"

### Modified: `src/components/bunk/SidebarContactList.tsx`
- `handleInviteContact`: replace `mailto:` with a call to `send-invite-email` edge function
- Show toast: "Invite sent to {name}!"

### Secret Required
- `RESEND_API_KEY` -- needed to send emails programmatically (Resend is free for up to 100 emails/day)
- Alternative: If you prefer not to add another service, we can keep `mailto:` but make the bulk version open one pre-composed email per contact

### No Database Changes
- Uses existing `tour_invites` table as-is
