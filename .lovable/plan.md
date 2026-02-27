

## Make All Phone Numbers and Email Addresses Actionable

### Overview

Anywhere a phone number or email address is displayed as plain text, wrap it in a tappable link so users can call, text, or email with one tap.

### Changes

**1. SidebarContactList.tsx -- Show phone/email as tappable links in contact rows**

Currently the contact row only shows name + role. Add a small line below the role showing the phone (as `tel:` link) and email (as `mailto:` link) when present, styled as tappable text. This makes them visible and actionable at a glance without needing to expand or open a menu.

- Below the role `<p>` tag (around line 375), add a row displaying:
  - Phone as `<a href="tel:{phone}">` with the Phone icon, styled in muted mono text
  - Email as `<a href="mailto:{email}">` with the Mail icon, styled in muted mono text
- Both truncated to fit the row, separated by a dot
- Skip in demo mode (PII is hidden)
- Stop propagation on click so it doesn't trigger the row's expand/message behavior

**2. TourTextInbox.tsx -- Make masked phone numbers tappable**

The masked phone display (line 263-265) currently shows `maskPhone(msg.from_phone)` as a plain `<span>`. Change it to an `<a href="tel:{msg.from_phone}">` link so admins can tap to call or text the crew member back directly from the inbox.

Also add a small SMS icon button next to the phone that opens `sms:{from_phone}` for quick text reply.

**3. DMChatScreen.tsx -- Make header phone/email tappable**

In the chat header, add a small tappable phone number under the contact's role (around line 106) that links to `tel:{contact.phone}`, giving users a quick way to call while in a DM conversation.

### Technical Details

| File | Change |
|------|--------|
| `src/components/bunk/SidebarContactList.tsx` | Add phone/email display links below role text in contact rows (~line 375). Wrap in `<a>` tags with `tel:` and `mailto:` hrefs. Add `onClick stopPropagation` to prevent row expansion. |
| `src/components/bunk/TourTextInbox.tsx` | Change masked phone `<span>` to `<a href="tel:">` link + add SMS reply button (~line 263) |
| `src/components/bunk/DMChatScreen.tsx` | Add tappable phone number in chat header below role (~line 106) |

### Styling

- Phone/email links use `text-muted-foreground/70 hover:text-foreground` with `font-mono text-[10px]`
- Underline on hover for discoverability
- Links stop event propagation so they don't trigger parent click handlers

### No database or backend changes needed.

