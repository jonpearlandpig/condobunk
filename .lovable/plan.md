

## TourText Inbox: Real-Time Auto-Categorized SMS Dashboard

### Overview

Add a `category` column to every inbound TourText, auto-classify it at arrival using the existing keyword engine, enable realtime subscriptions, and build a dedicated folder-based inbox dashboard inside the admin area so tour admins can monitor crew inquiries as they happen.

---

### Part 1: Database Changes

**Add `category` column to `sms_inbound`:**

```sql
ALTER TABLE public.sms_inbound
  ADD COLUMN category text NOT NULL DEFAULT 'general';
```

**Enable realtime on `sms_inbound`:**

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_inbound;
```

No new RLS policies needed -- existing TA/MGMT SELECT policy already covers admin access.

---

### Part 2: Auto-Categorize at Inbound Time

**File: `supabase/functions/tourtext-inbound/index.ts`**

When inserting into `sms_inbound` (around line 371), use the existing `extractTopics()` function to determine the category. Map to a single primary category:

- If topics include `guest_list` -> "guest_list"
- If topics include `schedule` -> "schedule"  
- If topics include `venue_tech` -> "venue_tech"
- If topics include `logistics` -> "logistics"
- If topics include `contacts` -> "contacts"
- If topics include `catering` -> "catering"
- If no match -> "general"

Update the insert call:
```typescript
const topics = extractTopics(messageBody);
const category = topics.has("guest_list") ? "guest_list"
  : topics.has("venue_tech") ? "venue_tech"
  : topics.has("schedule") ? "schedule"
  : topics.has("logistics") ? "logistics"
  : topics.has("contacts") ? "contacts"
  : topics.has("catering") ? "catering"
  : "general";

await admin.from("sms_inbound").insert({
  from_phone: fromPhone,
  message_text: messageBody,
  tour_id: matchedTourId,
  sender_name: senderName !== "Unknown" ? senderName : null,
  category,
});
```

---

### Part 3: New TourText Inbox Component

**New file: `src/components/bunk/TourTextInbox.tsx`**

A real-time, folder-based inbox with:

- **Folder sidebar/tabs**: "All", "Schedule", "Venue Tech", "Logistics", "Contacts", "Guest List", "Catering", "General" -- each showing an unread count badge
- **Message list**: Shows sender name, masked phone, message text, timestamp, and the paired outbound reply (if any) in a conversation-style view
- **Real-time updates**: Subscribes to `postgres_changes` on `sms_inbound` filtered by `tour_id`, prepends new messages with a subtle animation
- **Stats bar**: Total messages today, messages this hour, most active category
- **Filter controls**: Time range selector (1h, 6h, 12h, 24h, 48h, 7d)

The component fetches initial data via direct Supabase query (not an edge function) since TA/MGMT already have SELECT access on `sms_inbound` and `sms_outbound`.

---

### Part 4: Integrate Into Admin

**File: `src/pages/bunk/BunkAdmin.tsx`**

Replace the existing `<TourTextDashboard>` component with tabs:
- **Tab 1: "TourText Inbox"** -- the new real-time categorized inbox (`TourTextInbox`)
- **Tab 2: "TELA Analysis"** -- the existing `TourTextDashboard` (AI clustering, on-demand)

This keeps the AI-powered pattern analysis available while adding the always-on real-time inbox.

---

### Part 5: Existing TourTextDashboard

Keep `TourTextDashboard` as-is. It serves a different purpose (AI-powered semantic clustering for pattern alerts). The new inbox is the operational real-time view; the existing dashboard is the strategic analysis view.

---

### Technical Notes

- The `extractTopics()` function already exists in `tourtext-inbound` and handles all keyword matching -- reusing it for categorization adds zero latency
- Realtime subscription uses Supabase's `postgres_changes` channel filtered by `tour_id` and `INSERT` events
- Messages pair with outbound replies by matching `from_phone` (inbound) to `to_phone` (outbound) within a time window, similar to how `tourtext-insights` already does it
- The category column defaults to `"general"` so existing historical messages still display correctly
- Mobile-responsive: folder tabs collapse to a horizontal scrollable strip on small screens

