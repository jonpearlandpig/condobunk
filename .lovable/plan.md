

# Fix: Fuzzy VAN Matching for Calendar Events

## Problem

The March 5th event at "Allen County War Memorial Coliseum" in "Fort Wayne, IN" has a VAN record, but the calendar can't find it because of name mismatches:

| Field | Event | VAN Record |
|-------|-------|------------|
| Venue | Allen **County** War Memorial Coliseum | Allen War Memorial Coliseum |
| City | Fort Wayne, IN | Ft Wayne |

The current lookup uses exact normalized string matching, so `allencountywarmemorialcoliseum` never equals `allenwarmemorialcoliseum`, and `fortwaynein` never equals `ftwayne`.

## Solution

Add fuzzy/substring matching as a fallback when exact matches fail. This covers common variations like abbreviated names, extra words (County), and city format differences (Ft vs Fort, with/without state).

## Technical Changes

### File: `src/pages/bunk/BunkCalendar.tsx`

**1. Add a city normalization helper** (near the existing `normalize` function around line 191):

A small function that handles common city abbreviations and strips state suffixes:
- `Ft` to `fort`, `St` to `saint`, `Mt` to `mount`
- Strip trailing state codes like `, IN` or `, OH`

```typescript
const normalizeCity = (s: string | null | undefined) => {
  let c = (s || "").toLowerCase().trim();
  c = c.replace(/,?\s*(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)$/i, "");
  c = c.replace(/\bft\b/g, "fort").replace(/\bst\b/g, "saint").replace(/\bmt\b/g, "mount");
  return c.replace(/[^a-z0-9]/g, "");
};
```

**2. Update VAN lookup map building** (lines ~196-209):

Add a normalized-city key alongside the existing keys:
```typescript
if (v.city) {
  const cityKey = `${v.tour_id}::city::${normalizeCity(v.city)}`;
  // ... existing logic but using normalizeCity
}
```

**3. Update VAN matching for events** (lines ~286-288):

Use `normalizeCity` for the city fallback key so `Fort Wayne, IN` and `Ft Wayne` both normalize to `fortwayne`.

**4. Add substring fallback** when exact venue match fails:

After checking the three existing keys, if no match is found, iterate over the VAN entries for the same tour and check if one venue name contains the other (substring match). This handles "Allen War Memorial Coliseum" being a substring of "Allen County War Memorial Coliseum".

```typescript
// Substring fallback for venue name mismatches
if (!hasVan && s.venue) {
  const eventNorm = normalize(s.venue);
  const tourVans = vans?.filter(v => v.tour_id === s.tour_id) || [];
  for (const v of tourVans) {
    const vanNorm = normalize(v.venue_name);
    if (eventNorm.includes(vanNorm) || vanNorm.includes(eventNorm)) {
      const subKey = `substr::${s.id}`;
      vanLookup[subKey] = [v];
      // update hasVan and store the key on the entry
      break;
    }
  }
}
```

### File: `src/hooks/useTelaActions.ts`

The `update_van` handler already has the upsert logic from the previous fix. Add the same `normalizeCity` treatment to the fallback lookup so that `ilike` queries also match city variations (this is already partially handled by `ilike`, but we should also normalize the `Ft`/`Fort` difference in the query).

## Files Modified

1. `src/pages/bunk/BunkCalendar.tsx` -- Add fuzzy city normalization + substring venue fallback for VAN matching
2. `src/hooks/useTelaActions.ts` -- Apply city normalization to VAN fallback lookup

