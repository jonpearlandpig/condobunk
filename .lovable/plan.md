

# Bulk Show Advance Creation -- Import from Schedule + CSV Upload

## What Changes

**Single file modified:** `src/pages/bunk/AdvanceLedger.tsx`

No database migrations. No new files. No edge functions. The existing `seed_advance_fields_on_create` trigger handles canonical field seeding automatically.

## Three Creation Paths via Dropdown

Replace the current "New Show" `<Button>` + `<Dialog>` with a `<DropdownMenu>` offering:

1. **Import from Schedule** -- pulls `schedule_events` for the tour, shows pre-checked list, batch inserts
2. **Upload Tour Dates** -- paste CSV or upload `.csv`, instant preview, batch inserts
3. **New Show** -- existing single-create dialog (preserved as-is)

## Key Implementation Details

### Column Mapping
- `schedule_events` uses `venue` and `city` (confirmed from schema)
- `show_advances` uses `venue_name`, `venue_city`, `venue_state`
- Mapping: `venue` -> `venue_name`, `city` -> `venue_city`, state left null (not in schedule_events)

### Dedup Key
Normalized `event_date + venue_name + venue_city` (lowercase, trim, strip punctuation, collapse spaces). Checked both at preview time (UX) and at insert time (idempotency against concurrent creates).

### TID/TAID Generation
Each bulk-inserted row gets its own `TID-ADV-XXXXXX` / `TAID-ADV-XXXXXX` using the same random suffix pattern as the existing single-create mutation. The `created_by` field is set to `user.id`.

### CSV Parsing
- Client-side, no edge function
- Header aliases: Date/Show Date/Event Date, Venue/Venue Name, City, State/Province/Region
- Date parsing: ISO (`YYYY-MM-DD`), US (`M/D/YYYY`, `MM-DD-YYYY`). Ambiguous values marked invalid, never guessed.
- Preview shows three counts: valid, duplicate, invalid

### Import Dialog UX
- Fetches schedule_events + existing advances in parallel on open
- All valid non-duplicate rows pre-selected
- "Select all" toggle at top
- Each row shows venue, city, date, and a status badge (Ready / Duplicate / error message)
- Single "Import All" button -- shows count

### Upload Dialog UX
- Textarea for paste + file input for `.csv` upload
- Instant preview on paste/upload with same badge system
- Three count badges always visible: selected, duplicates, invalid

### Post-Create
- Invalidates `show-advances` and `advance-readiness` query keys
- Toast: `"12 shows created, 3 skipped"`

## Technical Notes
- All dialogs stay in `AdvanceLedger.tsx` (tightly coupled to creation state)
- Uses existing imports: `useAuth`, `useTour`, `useQuery`, `useMutation`, `useQueryClient`
- New imports: `DropdownMenu*`, `Checkbox`, `Textarea`, `ScrollArea`, `DialogDescription`, `DialogFooter`
- `useRef` for file input, `useEffect` for dialog open/close reset

