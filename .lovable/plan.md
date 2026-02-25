

## Add ElevenLabs Voice Agent to TELA

### What This Does
Adds a "Talk to TELA" voice button inside the existing TELA chat screen. Tap it, speak your question hands-free, and TELA responds with voice — perfect for on-site walkthroughs, load-in, and production calls where your hands are full.

### How It Works

```text
User taps mic  -->  Browser mic opens
       |
User speaks    -->  ElevenLabs agent transcribes + sends to your AKB data
       |
TELA responds  -->  Voice audio plays back through phone speaker
       |
Transcript     -->  Both sides appear as text in the existing chat thread
```

The ElevenLabs Conversational AI agent connects to your existing `akb-chat` backend function as a "server tool," so TELA's voice answers draw from the exact same tour data, citations, and action blocks as the text chat.

### Prerequisites

1. **ElevenLabs Account** -- you already have one
2. **ElevenLabs API Key** -- you'll be prompted to securely store it
3. **ElevenLabs Agent Setup** -- you'll create a Conversational AI agent in the ElevenLabs dashboard with:
   - A voice that fits TELA's personality (recommendation: **"George"** or **"Eric"** for a calm, professional ops tone)
   - A server tool pointing to your `akb-chat` function so the agent can query tour data
   - Prompt overrides will be injected from the app (tour context, user identity)

### Implementation Steps

**Step 1: Store the ElevenLabs API Key**
- Securely add your `ELEVENLABS_API_KEY` as a backend secret
- Add your `ELEVENLABS_AGENT_ID` as a second secret (the agent ID from the ElevenLabs dashboard)

**Step 2: Create Token Edge Function**
- New file: `supabase/functions/elevenlabs-conversation-token/index.ts`
- Authenticates the user (JWT validation)
- Calls ElevenLabs API to generate a short-lived WebRTC conversation token
- Returns the token to the client

**Step 3: Install the React SDK**
- Add `@elevenlabs/react` package
- Provides the `useConversation` hook for WebRTC audio management

**Step 4: Build the Voice UI Component**
- New file: `src/components/bunk/TelaVoiceAgent.tsx`
- Floating mic button in the TELA chat screen
- States: idle, connecting, listening, TELA speaking
- Pulsing animation when TELA is speaking, waveform when listening
- Transcripts from both sides are injected into the existing chat message list
- "End call" button to disconnect

**Step 5: Integrate into BunkChat**
- Add the voice button to the TELA chat top bar (next to the scope badge)
- When voice is active, text input is dimmed/disabled
- Voice transcripts are saved to the same `tela_messages` / `tela_threads` tables
- Works in both scoped (single tour) and global (all tours) modes

**Step 6: Configure the ElevenLabs Agent (Manual Step)**
- You'll set up the agent in the ElevenLabs dashboard:
  - **System prompt**: "You are TELA, a touring efficiency assistant. Use the akb_query tool to answer questions about tour schedules, venues, contacts, and production data."
  - **Server tool**: POST to your `akb-chat` endpoint with the user's question
  - **Voice**: Choose from the ElevenLabs voice library
  - **First message**: "Hey, TELA here. What do you need?"

### Technical Detail

| File | Change |
|------|--------|
| `supabase/functions/elevenlabs-conversation-token/index.ts` | New -- generates WebRTC conversation tokens |
| `supabase/config.toml` | Add `[functions.elevenlabs-conversation-token]` with `verify_jwt = false` |
| `src/components/bunk/TelaVoiceAgent.tsx` | New -- voice UI with mic button, status indicators, transcript display |
| `src/pages/bunk/BunkChat.tsx` | Add voice button to top bar, integrate transcript into message list |
| Secrets | `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` |
| Package | `@elevenlabs/react` |

### Voice UX Details

- **Mic button**: Appears as a small microphone icon in the chat top bar
- **Permission prompt**: First tap explains why mic access is needed, then requests it
- **Active state**: Chat input area shows "TELA is listening..." with a pulsing indicator
- **Speaking state**: Audio plays through device speaker; visual indicator shows TELA is responding
- **Transcript sync**: User speech and TELA responses appear as regular chat bubbles in real-time
- **Mobile optimized**: Works great on-site with one hand -- tap to start, tap to stop

### What You'll Need to Do

1. Approve this plan
2. When prompted, paste your ElevenLabs API key
3. Create a Conversational AI agent in the ElevenLabs dashboard (I'll give you exact setup instructions)
4. Paste the Agent ID when prompted
5. Pick a voice for TELA

