
## Fix: Inject Current Date + Strengthen Anti-Hallucination Rules in All TELA Prompts

### Problem
TELA hallucinates dates (e.g., says "today is March 4th" when it isn't) because none of the three main system prompts include the actual current date. The model falls back to guessing. Additionally, the anti-hallucination guardrails need reinforcement across all three interfaces.

### Changes

**1. `supabase/functions/akb-chat/index.ts`** (Web chat)
- Inject `Today's date is YYYY-MM-DD.` at the top of the system prompt (right after the opening line, ~line 260)
- Add explicit anti-hallucination rule: "NEVER fabricate, guess, or infer information not present in the data below. If the answer is not in your provided data, say 'I don't have that information' and cite the gap."

**2. `supabase/functions/tourtext-inbound/index.ts`** (SMS)
- Inject `Today's date is YYYY-MM-DD.` into the main system prompt (~line 939, after the opening line)
- Add the same anti-hallucination rule to the SMS system prompt

**3. `supabase/functions/elevenlabs-conversation-token/index.ts`** (Voice)
- Inject `Today's date is YYYY-MM-DD.` into the voice system prompt (after the opening line in the systemPrompt template)
- The voice prompt already says "Say 'I don't have that information' if the data is missing. Never guess." -- this stays as-is

### Implementation Detail
All three use the same date injection:
```
Today's date is ${new Date().toISOString().split("T")[0]}.
```

This is computed at request time on the edge function server, so it's always accurate regardless of the user's timezone or the model's training cutoff.

### Anti-Hallucination Rule (added to akb-chat and tourtext-inbound)
```
ABSOLUTE RULE: NEVER fabricate, guess, or infer any information not explicitly present in the data sections below. If the answer is not in your data, respond with "I don't have that information" and cite it as a Gap. Do NOT use your training data to fill in missing tour details. Wrong information is infinitely worse than no information.
```

### Files Modified
| File | Change |
|---|---|
| `supabase/functions/akb-chat/index.ts` | Add today's date + anti-hallucination rule to system prompt |
| `supabase/functions/tourtext-inbound/index.ts` | Add today's date + anti-hallucination rule to main system prompt |
| `supabase/functions/elevenlabs-conversation-token/index.ts` | Add today's date to voice system prompt |

### No Other Changes
- No database changes
- No frontend changes
- No new secrets needed
