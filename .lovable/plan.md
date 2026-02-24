

## Make "+X more" Clickable on Desktop Calendar

### Problem
When a calendar day has more events than the visible limit (2 in month view, 3 in week view), the overflow shows as "+X more" plain text with no way to view the hidden events.

### Solution
Make the "+X more" text a clickable button that opens a popover showing all events for that day. This keeps users in context without navigating away.

### Technical Detail

**File: `src/pages/bunk/BunkCalendar.tsx`**

1. Add `Popover, PopoverTrigger, PopoverContent` imports from `@/components/ui/popover`
2. Add state: `const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null)`
3. Replace the plain `<p>` overflow indicator (line 638-640) with a `Popover` that:
   - Uses a styled button as trigger showing "+X more"
   - Opens a `PopoverContent` listing ALL events for that day (full list, not truncated)
   - Each event in the popover is clickable, opening the existing detail dialog
   - The popover includes the day header (e.g., "Thu, Mar 20") for context

**Before (line 638-640):**
```
<p className="text-[9px] font-mono text-muted-foreground pl-1">+{overflow} more</p>
```

**After:**
```
<Popover>
  <PopoverTrigger asChild>
    <button className="text-[9px] font-mono text-primary pl-1 hover:underline cursor-pointer">
      +{overflow} more
    </button>
  </PopoverTrigger>
  <PopoverContent className="w-64 p-2" align="start">
    <p className="text-[10px] font-mono text-muted-foreground mb-1.5">
      {format(day, "EEE, MMM d")} -- {dayEntries.length} events
    </p>
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {dayEntries.map(entry => (
        // Render compact event buttons that open the detail dialog
      ))}
    </div>
  </PopoverContent>
</Popover>
```

| File | Change |
|------|--------|
| `src/pages/bunk/BunkCalendar.tsx` | Add Popover import; replace plain "+X more" with Popover showing all day events |

