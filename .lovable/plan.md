

# Fix Advance Master Extraction Timeout

## Problem

The extraction finds 37 venue columns and processes them in **sequential** batches of 3, requiring 13 AI calls. Each gemini-2.5-pro call takes ~90 seconds, totaling ~1,170 seconds -- far exceeding the 300-second edge function limit. The function dies after batch 2-3.

## Root Causes

1. **Too many columns detected (37)**: The parser picks up sparse/empty columns. Real venue count is likely 15-20.
2. **Sequential batch processing**: Batches run one after another instead of in parallel.
3. **Small batch size (3)**: More batches = more overhead.

## Solution

Three changes in `supabase/functions/extract-document/index.ts`:

### 1. Filter out sparse/junk columns more aggressively
- Increase minimum non-empty cell threshold from 3 to 8 (real venue columns have 20+ populated rows)
- Skip columns where the header looks like a date, number, or single character (not a venue/city name)
- This should cut 37 columns down to ~15-20 real venues

### 2. Increase batch size from 3 to 6
- Per-column data is clean and compact (~3,000 chars per venue)
- 6 venues per batch = ~18,000 chars, well within context limits
- Cuts total batches roughly in half

### 3. Process batches in parallel (Promise.all) instead of sequentially
- Fire all batches concurrently
- Each AI call runs independently
- Total time = slowest single batch (~90-120s) instead of sum of all batches
- Add error handling so one failed batch doesn't kill the others

### 4. Switch to gemini-2.5-flash for speed
- The per-column parsing already gives the AI clean, structured data
- Flash model is sufficient for structured extraction when input is well-formatted
- Cuts per-call time from ~90s to ~20-30s

## Expected Result

- ~15-20 real venue columns (after better filtering)
- ~3 batches of 6 (instead of 13 batches of 3)
- All batches run in parallel
- Total time: ~30-40 seconds (vs 1,170+ seconds before)

## Technical Details

File: `supabase/functions/extract-document/index.ts`

**Change 1 -- Column filtering (lines ~1458-1462)**:
```typescript
// Before: if (nonEmpty < 3) continue;
// After:
if (nonEmpty < 8) continue;
// Also skip columns with numeric-only or single-char headers
if (/^\d+$/.test(headerValue) || headerValue.length <= 2) continue;
```

**Change 2 -- Batch size and parallel execution (lines ~1571-1594)**:
```typescript
const BATCH_SIZE = 6;
const extractModel = "google/gemini-2.5-flash";

// Build all batch promises
const batchPromises = [];
for (let i = 0; i < venueBlocks.length; i += BATCH_SIZE) {
  const batch = venueBlocks.slice(i, i + BATCH_SIZE);
  const batchText = batch.join("\n\n---\n\n");
  batchPromises.push(
    aiExtractFromText(batchText, apiKey, extractPrompt, extractModel, 120000)
      .then(result => result?.venues || [])
      .catch(err => {
        console.error(`[extract] Batch failed:`, err.message);
        return [];
      })
  );
}

// Run all batches in parallel
const batchResults = await Promise.all(batchPromises);
const allVenues = batchResults.flat();
```

## What Stays the Same

- Per-column parsing logic (section headers, key-value pairs)
- VAN prompt and schema
- VAN storage, contact extraction, schedule event insertion
- Delta computation, risk flags
- Review dialog

