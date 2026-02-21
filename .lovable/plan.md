
# "ASK TELA" for Incomplete Contacts -- Always Offer Solutions

## Problem
Contacts like "Steve Meadows -- Production Contact" get extracted with a name and role but no phone or email. They just sit there, useless. TELA should never present a dead end -- it should always offer to find the missing info and fix it.

## Changes

### File: `src/components/bunk/SidebarContactList.tsx`

**1. Detect incomplete contacts**
Add `const isMissingContact = !c.phone && !c.email` inside `renderContact()`.

**2. Inline "ASK TELA" link for incomplete contacts**
- **Venue contacts (grouped mode, desktop + mobile):** Below the role line, render a small orange "ASK TELA" link when `isMissingContact`. The link navigates to chat with a solution-oriented, pre-filled query:
  `"Find contact details for [Name] ([Role]) at [Venue]. Check tech packs and advance documents for phone and email. If you find them, update the contact."`
- **Tour team contacts (flat mode, desktop):** When `isMissingContact`, make the TELA icon always visible (not hover-gated) so the solution is obvious. The pre-filled query:
  `"Find contact details for [Name] ([Role]). Check all tour documents for phone and email. If you find them, update the contact."`

**3. Mobile expanded action bar adjustment**
When `isMissingContact` and the contact is tapped on mobile, the action bar shows only:
- **TELA** button (pre-filled solution query)
- **Edit** button
Skip TEXT / CALL / EMAIL buttons since there's nothing to act on -- no dead-end buttons.

**4. Desktop hover actions adjustment**
For incomplete contacts, skip rendering MessageCircle/Phone/Mail icons (nothing to link to). Instead, the ASK TELA button (MessageSquare) is always visible outside the hover gate so users immediately see the path forward.

**5. Pre-filled TELA query design**
The queries are solution-oriented so TELA actively searches uploaded documents (tech packs, advance masters) and returns an action card to auto-update the contact:
- Venue: `"Find contact details for [Name] ([Role]) at [Venue]. Check tech packs and advance documents for phone and email. If you find them, update the contact."`
- Tour: `"Find contact details for [Name] ([Role]). Check all tour documents for phone and email. If you find them, update the contact."`

---

## Technical Details

### Only one file changes: `src/components/bunk/SidebarContactList.tsx`

Inside `renderContact(c, showQuickActions)`:

1. Add at line ~237: `const isMissingContact = !c.phone && !c.email;`

2. Build the TELA query string:
```typescript
const telaFixQuery = isMissingContact
  ? showQuickActions
    ? `Find contact details for ${c.name}${c.role ? ` (${c.role})` : ""}${c.venue ? ` at ${c.venue}` : ""}. Check tech packs and advance documents for phone and email. If you find them, update the contact.`
    : `Find contact details for ${c.name}${c.role ? ` (${c.role})` : ""}. Check all tour documents for phone and email. If you find them, update the contact.`
  : "";
```

3. After the role line (line ~260), add an inline ASK TELA link when `isMissingContact`:
```tsx
{isMissingContact && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      navigate(`/bunk/chat?scope=tour&q=${encodeURIComponent(telaFixQuery)}`);
      onNavigate?.();
    }}
    className="inline-flex items-center gap-1 text-[10px] font-mono tracking-wider text-primary hover:text-primary/80 transition-colors mt-0.5"
  >
    <MessageSquare className="h-2.5 w-2.5" />
    ASK TELA FOR DETAILS
  </button>
)}
```

4. Desktop hover actions (line ~265-343): When `isMissingContact`, skip MessageCircle/Phone/Mail icons and always show TELA icon (remove hover gate).

5. Mobile expanded bar (line ~375-414): When `isMissingContact`, only render TELA + Edit buttons, skip TEXT/CALL/EMAIL.

6. Mobile quick-action indicators (line ~363-371): When `isMissingContact` in non-grouped mode, show a small TELA icon instead of grayed-out phone/mail icons.

### No database, backend, or edge function changes required.
