
## Give TELA Talk Access to Tour AKB Data

### Problem
The TELA Talk voice agent connects to ElevenLabs with zero tour context -- it has no schedule, contacts, VANs, routing, or any AKB data. It can't answer tour-specific questions because the system prompt is whatever's configured in the ElevenLabs dashboard, not your actual tour data.

### Solution
Inject your AKB data into the voice agent's system prompt using ElevenLabs' **conversation overrides**. When you tap the mic, we'll fetch your tour data and pass it as a dynamic prompt override so the voice agent knows everything the text-based TELA knows.

### Changes

**1. Edge Function: `elevenlabs-conversation-token/index.ts`**

Expand it to also accept `tour_id`, fetch AKB data (same queries as `akb-chat` -- schedule, contacts, VANs, routing, policies, artifacts, gaps, conflicts), and build a voice-optimized system prompt. Returns `{ token, system_prompt }` instead of just `{ token }`.

The voice system prompt will be a condensed version of the `akb-chat` prompt, optimized for spoken responses:
- Same AKB data sections (schedule, contacts, VANs, routing, policies, artifacts)
- Shorter instruction set: keep answers brief and conversational (voice, not text)
- No action blocks (voice can't render UI buttons)
- Same source-of-truth rules: never guess, cite sources verbally
- Same document authority hierarchy (VANs first)

**2. Component: `TelaVoiceAgent.tsx`**

- Add `tourId?: string` prop
- Pass `tour_id` in the token request body
- Use the returned `system_prompt` as a conversation override when starting the session:
```text
conversation.startSession({
  conversationToken,
  connectionType: "webrtc",
  overrides: {
    agent: {
      prompt: { prompt: systemPrompt }
    }
  }
})
```

**3. All callsites pass `tourId`**

- `BunkSidebar.tsx` -- `tourId={tourId}` (already has `const tourId = tours[0]?.id`)
- `MobileBottomNav.tsx` -- `tourId={tours[0]?.id}`
- `BunkChat.tsx` -- `tourId={selectedTourId}` (already has the selected tour ID)

### Files Modified
| File | Change |
|---|---|
| `supabase/functions/elevenlabs-conversation-token/index.ts` | Fetch AKB data for `tour_id`, build voice system prompt, return alongside token |
| `src/components/bunk/TelaVoiceAgent.tsx` | Accept `tourId` prop, pass to edge function, apply `system_prompt` as override |
| `src/components/bunk/BunkSidebar.tsx` | Pass `tourId={tourId}` to TelaVoiceAgent |
| `src/components/bunk/MobileBottomNav.tsx` | Pass `tourId={tours[0]?.id}` to TelaVoiceAgent |
| `src/pages/bunk/BunkChat.tsx` | Pass `tourId` to TelaVoiceAgent |

### No Database or Secret Changes Needed
- The `ELEVENLABS_API_KEY` secret is already configured
- The `SUPABASE_SERVICE_ROLE_KEY` is already available for AKB queries
- No new tables or migrations required
