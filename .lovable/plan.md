

# Add "Ask TELA" Section to Sidebar with Persistent Chat Threads

## What's changing

A new **"Ask TELA"** collapsible folder will appear in the sidebar above "Tour Team", showing the latest 10 TELA conversation threads. Each thread is expandable to preview messages. Threads can be renamed, deleted, and messages can be edited.

---

## How it works

**Sidebar section** (above Tour Team, below nav links):
- Collapsible "ASK TELA" header with Sparkles icon and thread count
- Lists up to 10 most recent threads, each showing a title (auto-generated from first message or user-renamed)
- Clicking a thread navigates to `/bunk/chat?thread={id}` and loads that conversation
- Each thread has a context menu (or inline icons) for **Rename** and **Delete**
- A "+ New Thread" button at the top starts a fresh conversation

**Thread persistence** (BunkChat changes):
- When a user sends their first message, a new thread row is created automatically
- All messages are saved to the database as they stream in
- Loading a thread from the sidebar restores the full conversation history
- User messages can be edited inline (pencil icon) -- editing re-sends to TELA for a fresh response
- Messages can be deleted individually

---

## Database changes

### New table: `tela_threads`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| tour_id | uuid | NOT NULL |
| user_id | uuid | NOT NULL |
| title | text | Default: first 60 chars of first message |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

RLS: Users can CRUD their own threads (user_id = auth.uid() AND is_tour_member(tour_id)).

### New table: `tela_messages`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| thread_id | uuid | FK to tela_threads.id ON DELETE CASCADE |
| role | text | 'user' or 'assistant' |
| content | text | NOT NULL |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

RLS: Users can CRUD messages on threads they own.

---

## Code changes

### 1. `src/hooks/useTelaThreads.ts` (new)
- Fetches latest 10 threads for the current user + tour
- Provides `createThread`, `renameThread`, `deleteThread` functions
- Subscribes to realtime updates on `tela_threads` table

### 2. `src/components/bunk/SidebarTelaThreads.tsx` (new)
- Renders the "ASK TELA" collapsible section
- Lists threads with title, timestamp, expand/collapse
- Inline rename (click title to edit)
- Delete button with confirmation
- "+ New" button to start fresh thread

### 3. `src/components/bunk/BunkSidebar.tsx` (modified)
- Import and render `SidebarTelaThreads` between the Separator and Tour Team section

### 4. `src/pages/bunk/BunkChat.tsx` (modified)
- Accept `?thread={id}` search param
- On load with thread ID: fetch all messages from `tela_messages` and populate state
- On first message send (no active thread): create a new thread, save messages as they arrive
- Save each user message and completed assistant response to `tela_messages`
- Add edit/delete controls per message:
  - **Edit**: pencil icon on user messages, replaces content and re-sends from that point
  - **Delete**: remove message (and subsequent assistant response) from DB and state
- Update thread `updated_at` on each new message

### 5. `src/App.tsx` (no change needed -- existing `/bunk/chat` route handles search params)

---

## User experience flow

1. User opens sidebar -- sees "ASK TELA" section with recent threads listed by title
2. Clicks a thread -- navigates to TELA chat with full history loaded
3. Clicks "+ New" -- opens fresh TELA chat
4. Long-press or hover on thread title -- rename or delete options appear
5. Inside a chat, user can hover a message to edit or delete it
6. Editing a user message removes all subsequent messages and re-sends to TELA

