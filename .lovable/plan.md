

## Update TELA Voice Agent ID in Chat

### What Changes

The voice button is already wired into the TELA chat header (top-right, next to the sidebar trigger). It just needs the correct ElevenLabs Agent ID swapped in.

### Current State

In `src/pages/bunk/BunkChat.tsx` (line 411), the `TelaVoiceAgent` component is rendered with a placeholder agent ID `"DXFkLCBUTmvXpp2QwZjA"`.

### Update

Replace the agent ID with your actual one: `agent_8301kjjfsz2febx8748ezrcmz0t8`.

### File Modified

- `src/pages/bunk/BunkChat.tsx` -- change `agentId` prop from `"DXFkLCBUTmvXpp2QwZjA"` to `"agent_8301kjjfsz2febx8748ezrcmz0t8"`

### How It Works

1. User taps the mic icon in the TELA chat header
2. Browser requests microphone permission
3. The `elevenlabs-conversation-token` edge function (already deployed) fetches a secure WebRTC token from ElevenLabs using your API key
4. WebRTC session starts -- user speaks, TELA responds via voice
5. Transcripts are appended to the chat message list via the existing `onTranscript` callback

