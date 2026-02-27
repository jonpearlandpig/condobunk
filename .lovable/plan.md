

## Fix Progressive Depth and VAN Detail in TourText SMS

### Problem 1: Progressive Depth Not Working
"Special notes?" after "Haze?" should trigger depth 2 or 3 (same venue_tech topic), but it stays at depth 1 because "special notes" doesn't match any keyword in `TOPIC_GROUPS`. The depth detection is purely keyword-based and misses natural follow-ups.

### Problem 2: Missing VAN Info
Two causes:
- `max_tokens: 150` at depth 1 is too small to include meaningful VAN data
- Assistant messages were completely removed from history (the self-contamination fix), so the model has no idea what was just discussed. When the user says "Special notes?" the AI doesn't know this is about haze at TD Garden.

### Solution

**File: `supabase/functions/tourtext-inbound/index.ts`**

#### 1. Re-include assistant messages in conversation history (with guardrails)
The full removal of assistant history broke progressive depth and context continuity. Instead of removing all assistant messages, include them but add a guardrail instruction telling the model not to repeat prior mistakes.

- Re-merge `recentOutbound` into `historyMessages` (restoring the interleaved user/assistant history)
- Add a prompt instruction: "If your previous replies contained errors, correct them — do not repeat them."

#### 2. Add general follow-up detection to `TOPIC_GROUPS`
Add a catch-all "follow_up" group with terms like: "special notes", "notes", "anything else", "what about", "details", "more", "anything special", "restrictions", "rules", "policy", "policies".

This ensures "Special notes?" gets matched to a topic group and can overlap with the prior "haze" exchange (both touch venue_tech-adjacent content).

#### 3. Improve depth detection for short contextual queries
Add logic: if the current message is very short (under 30 chars) and there's at least 1 prior message in the last 60 seconds, auto-bump to depth 2 minimum. Short messages after a conversation are inherently follow-ups.

#### 4. Raise minimum max_tokens
- Depth 1: 150 -> 250 (enough for a meaningful VAN fact)
- Depth 2: 300 -> 500 (enough for operational context)
- Depth 3: 600 -> 800 (full detail)

### Technical Details

| Change | Location | Before | After |
|--------|----------|--------|-------|
| History | Lines 694-701 | User messages only | User + assistant interleaved |
| TOPIC_GROUPS | Lines 38-45 | No "follow_up" group | Add follow_up keywords |
| Depth detection | Lines 62-96 | Keyword-only | Add short-message auto-bump |
| Token limits | Line 819 | 150/300/600 | 250/500/800 |
| Prompt | Line 833 | No self-correction rule | Add "correct prior errors" instruction |

### Expected Result
- "Haze?" -> depth 1, concise answer (250 tokens)
- "Special notes?" -> depth 2 (recognized as follow-up), model sees its prior haze answer, gives fuller VAN detail (500 tokens)
- "Tell me everything" -> depth 3, complete VAN breakdown (800 tokens)

### Single file change + redeploy. No database changes.

