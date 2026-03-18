

# Fix: Venue Tech Pack PDF Extraction Failure

## Root Cause
The `advance-venue-analyze` edge function uses a primitive regex-based PDF text extractor (`extractTextFromBinaryPdf`) that only handles uncompressed `Tj`/`TJ` text operators. Most modern PDFs (including the Bryce Jordan Center production guide) use compressed content streams (FlateDecode), CIDFont encodings, or CMap-based text. This produces empty/garbled text, so the AI receives nothing useful and returns `{}`.

Meanwhile, the `extract-document` function already solves this correctly — it sends the raw PDF binary as base64 to Gemini's multimodal endpoint (`data:application/pdf;base64,...`), letting the AI read the PDF natively.

## Fix
**File: `supabase/functions/advance-venue-analyze/index.ts`**

1. **Remove** the `extractTextFromBinaryPdf` function entirely
2. **For PDF files**, send the binary as base64 to the AI using the multimodal `image_url` content format (same pattern as `extract-document`), instead of trying to extract text first
3. **For non-PDF files** (xlsx, txt), keep the existing text-based extraction path
4. Use chunked base64 encoding (matching `extract-document`'s approach) to avoid stack size errors on large files

### Specific code changes

- In the document processing loop (around line 365-388), for PDFs: convert file bytes to base64 instead of calling `extractTextFromBinaryPdf`
- In the AI call (around line 412-427), switch to multimodal message format when we have base64 data:
  ```
  messages: [
    { role: "system", content: extractionPrompt },
    { role: "user", content: [
        { type: "text", text: `Document: ${doc.file_name}` },
        { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64Data}` } },
    ]}
  ]
  ```
- Keep text-based fallback for xlsx/txt files

This is the same proven pattern used by `extract-document` for the last several weeks.

## No other changes needed
- Database schema unchanged
- Frontend unchanged  
- Intelligence report generation (step 2 of the function) already works — it just needs actual extracted data to analyze

