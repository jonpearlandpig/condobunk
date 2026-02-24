

## Replace Ask Tela Icon with Walkie-Talkie Icon

### Change

In `src/components/bunk/MobileBottomNav.tsx`, swap the `MessageSquare` icon used for the "Ask Tela" nav item with the `Radio` icon (the walkie-talkie icon already used throughout the app for TELA -- in `SidebarTelaThreads`, `VenueTelaMini`, etc.).

### Details

| Location | Change |
|----------|--------|
| Import (line 6) | Remove `MessageSquare`, add `Radio` |
| Nav items (line 49) | Change `icon: MessageSquare` to `icon: Radio` |

One file, two lines changed.

