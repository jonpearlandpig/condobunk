

## Fix: Add `phone` to contacts SELECT in tourtext-inbound

### Problem
The `tourtext-inbound` edge function queries the `contacts` table to match an inbound phone number, but the `.select()` call omits the `phone` column:

```
.select("tour_id, name, role, scope")
```

Since `contact.phone` is always `undefined`, the normalization comparison never matches, and every inbound SMS gets the "not linked to any active tour" response.

### Fix
**File:** `supabase/functions/tourtext-inbound/index.ts`

Change the contacts query SELECT from:
```
.select("tour_id, name, role, scope")
```
to:
```
.select("tour_id, name, role, scope, phone")
```

This is a one-line fix. Once deployed, the function will correctly match `+16157884644` to the contact `Jon Hartman` (phone `615-788-4644`) on tour `530ed4eb`, and TELA will respond with actual tour data instead of the fallback error.

### Verification
After deployment, send another text to (888) 340-0564 (e.g., "Load in 3/5?") and confirm you receive a real answer from TELA instead of the "not linked" message.
