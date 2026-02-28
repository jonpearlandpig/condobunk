

## Remove TELA Talk from Menus, Keep Voice in Ask TELA Chat Window

### What Changes

Remove the standalone "TELA Talk" section from both the desktop sidebar and mobile messaging drawer. The voice agent already lives inside the Ask TELA chat page header bar -- that's the only place it needs to be.

### Menu Order (both sidebar and mobile drawer)

1. Tour Team
2. Venue Partners
3. Ask TELA
4. Artifacts

### Files Modified

**1. `src/components/bunk/BunkSidebar.tsx`**
- Remove the TELA Talk `SidebarGroup` block (lines 386-397)
- Remove the `TelaVoiceAgent` import (line 42)
- Order stays: Tour Team -> Venue Partners -> Ask TELA threads -> Artifacts

**2. `src/components/bunk/MobileBottomNav.tsx`**
- Remove the TELA Talk section (lines 292-302)
- Remove the `TelaVoiceAgent` import (line 25)
- Order stays: Tour Team -> Venue Partners -> Ask TELA -> Artifacts

### What's Kept

The `TelaVoiceAgent` component in `BunkChat.tsx` (the Ask TELA page) stays exactly as-is -- it's already in the top bar of the chat window (line 410-417), with tour context and transcript forwarding.

### No Other Impact

- The edge function (`elevenlabs-conversation-token`) and `TelaVoiceAgent.tsx` component are unchanged
- Voice is still accessible via the mic icon in the Ask TELA chat header

