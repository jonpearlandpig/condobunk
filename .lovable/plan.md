

# Messaging Drawer: ChatGPT-Style Side Menu with Full-Screen Chat

## Overview
Replace the hamburger Menu icon with a MessageCircle icon in the mobile bottom nav. When tapped, instead of a small corner panel, open a full-width bottom Drawer (using the existing vaul-based Drawer component) styled like a ChatGPT sidebar -- clean list of conversations organized by section. When a user taps on a contact to chat, transition to a full-screen chat view.

## Changes

### 1. Replace Menu Icon with MessageCircle (`MobileBottomNav.tsx`)

- Swap the `Menu` / `X` icon toggle for a `MessageCircle` icon (always shown, no toggle to X)
- Keep the unread badge dot on the icon
- When tapped, open a Drawer instead of the current motion panel

### 2. Replace Corner Panel with Full-Width Drawer (`MobileBottomNav.tsx`)

- Remove the current `AnimatePresence` + `motion.div` DM panel overlay
- Use the existing `Drawer` component (from `src/components/ui/drawer.tsx`) anchored to the bottom
- Drawer slides up to ~75% of screen height with a drag handle
- Clean ChatGPT-style layout inside:
  - Header: "Messages" title with unread count badge
  - Search input (optional, phase 2)
  - Three sections (all start collapsed, using existing `CollapsibleSection`):
    - **Ask TELA** -- TELA thread list (reuses `SidebarTelaThreads`)
    - **Tour Team** -- team contacts with online indicators and unread badges
    - **Venue Partners** -- venue contacts grouped by venue
- Each contact row shows: name, role, online dot, unread count
- Tapping a contact triggers the chat transition (see below)

### 3. Full-Screen Chat on Contact Tap (`MobileBottomNav.tsx`)

- When a user taps on an online contact in the drawer:
  1. Close the drawer
  2. Set a `activeDMContact` state with the selected contact
  3. Render a full-screen overlay (fixed, inset-0, z-50) containing the existing inline DM chat UI (already built in `SidebarContactList.tsx` lines 100-178)
  - Header: back arrow + contact name + online indicator
  - Message list (scrollable)
  - Input bar at bottom
  - Back button closes the full-screen chat and returns to the normal view
- For offline contacts: existing behavior (toast + SMS fallback) remains unchanged
- For TELA threads: tapping navigates to `/bunk/chat?thread=<id>` and closes drawer

### 4. Extract DM Chat Logic into Reusable Component (New File)

Create `src/components/bunk/DMChatScreen.tsx`:
- Extract the DM chat logic from `SidebarContactList.tsx` (message loading, realtime subscription, sending, read receipts)
- Props: `contact: SidebarContact`, `tourId: string`, `onClose: () => void`
- Full-screen fixed layout with:
  - Header bar: back arrow, contact avatar/name, online status
  - Scrollable message list
  - Fixed bottom input with send button
- Reuses the same Supabase queries and realtime channel pattern already in `SidebarContactList`

## Technical Details

### Files to Create
1. **`src/components/bunk/DMChatScreen.tsx`** -- Full-screen DM chat component
   - Extracted from `SidebarContactList.tsx` DM logic (lines 100-178)
   - Props: `contact`, `tourId`, `userId`, `onClose`, `isContactOnline`
   - Full-screen fixed overlay with chat UI
   - Realtime subscription for new messages
   - Auto-mark messages as read on open
   - Send button disabled when contact goes offline (with toast)

### Files to Modify
2. **`src/components/bunk/MobileBottomNav.tsx`**
   - Replace `Menu`/`X` import with `MessageCircle` from lucide
   - Remove `AnimatePresence` + `motion.div` panel code
   - Import `Drawer`, `DrawerContent`, `DrawerHeader`, `DrawerTitle` from drawer component
   - Add `activeDMContact` state for full-screen chat
   - Wire contact tap to set `activeDMContact` (online) or trigger SMS fallback (offline)
   - Render `DMChatScreen` when `activeDMContact` is set
   - Drawer contains the same three collapsible sections but in a cleaner full-width layout

### Layout Structure

```text
DRAWER (75vh, full width):
+----------------------------------+
|          --- drag handle ---      |
|  MESSAGES                    (3) |
+----------------------------------+
|  > Ask TELA              (5)     |
|  > Tour Team             (4)     |
|    * John Smith (online)    (2)  |
|    * Jane Doe                    |
|  > Venue Partners                |
|    Harbor City Church            |
|      * Venue Rep                 |
+----------------------------------+

FULL-SCREEN CHAT (when contact tapped):
+----------------------------------+
| <- John Smith          * online  |
+----------------------------------+
|                                  |
|  [message bubbles]               |
|                                  |
|                                  |
+----------------------------------+
| [type a message...]       [send] |
+----------------------------------+
```

### Key Behavioral Details
- Drawer uses `vaul` (already installed) for native-feeling swipe-to-dismiss
- Hand preference still respected: drawer content alignment can mirror
- The `MessageCircle` icon replaces the `Menu` icon in the exact same position in the bottom nav
- Unread dot badge stays on the `MessageCircle` icon
- Full-screen chat closes via back arrow or swipe-back gesture
- When chat is open, bottom nav is hidden behind the full-screen overlay

