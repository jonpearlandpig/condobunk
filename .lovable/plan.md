

## Add TourText Artifacts to SMS TELA Context

### Problem
The `tourtext-inbound` edge function never queries the `user_artifacts` table. When a crew member texts "Tour wifi?", TELA has no idea that a TourText artifact titled "Tour Wi-Fi" exists with the WiFi password. The data is there (visibility: `tourtext`, created by Caleb) but it's simply not loaded into the AI context.

### Fix

**File: `supabase/functions/tourtext-inbound/index.ts`**

1. **Add a `user_artifacts` query** to the parallel data fetch block (line 675). Fetch artifacts where `visibility = 'tourtext'` and `tour_id` matches. These are public tour info artifacts meant for all crew. Cap at 20 artifacts, content trimmed to 1,500 chars each (matching the akb-chat pattern).

2. **Build an artifacts section** and append it to the `akbContext` string before the substring cap.

3. **Add a prompt instruction** telling TELA to check User Artifacts for tour-wide info like WiFi, policies, notes.

### Changes (single file)

In the `Promise.all` block (~line 675), add:
```text
admin.from("user_artifacts")
  .select("title, content, artifact_type")
  .eq("tour_id", matchedTourId)
  .eq("visibility", "tourtext")
  .order("updated_at", { ascending: false })
  .limit(20)
```

Build the section (~line 826):
```text
const artifactsSection = (artifactsRes.data || []).length > 0
  ? (artifactsRes.data || []).map(a =>
      `${a.title} (${a.artifact_type}): ${(a.content || "").substring(0, 1500)}`
    ).join("\n\n")
  : "(No TourText artifacts)";
```

Append to `akbContext` (after Tour Policies):
```text
Tour Artifacts (crew-shared notes & info):
${artifactsSection}
```

Add to system prompt:
```text
TOUR ARTIFACTS: The "Tour Artifacts" section contains crew-shared notes, checklists, and info published by tour staff (WiFi passwords, department SOPs, packing lists, etc.). Check here for general tour info questions.
```

### Expected Result
When Jon texts "Tour wifi?", TELA will see the "Tour Wi-Fi" artifact in its context and respond with the WiFi network name and password.

Only `tourtext` visibility artifacts are included -- no private Bunk Stash or internal CondoBunk data leaks into SMS.
