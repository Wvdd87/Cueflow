# CueFlow — Project Context

## What is CueFlow
A live show timecode cue manager. A single self-contained HTML file that runs
in the browser via a local web server. It allows a show operator (owner) to
create and manage cue sheets tied to SMPTE timecode, and share live views
with crew members via Supabase.

## Current file
`cueflow_v18.html` — ~720KB, self-contained HTML/CSS/JS, no build step needed.

Run it with:
```bash
cd ~/Desktop/Cueflow
npx serve .
# open http://localhost:3000/cueflow_v18.html
```

## Architecture

### Three script blocks (in order)
1. **Block 0** (191KB) — Supabase JS SDK v2 (inlined, no CDN dependency)
2. **Block 1** (180KB) — CueFlow main app (untouched core)
3. **Block 2** (31KB) — CueFlow v18 collaboration layer IIFE

The three-block structure is intentional and critical. The Supabase SDK
affects JS strict mode parsing in a way that breaks function declarations
if they share a script tag with the app code. Never merge these blocks.

### Supabase configuration
- **Project URL**: `https://bdqqkmkxflamzqjonvko.supabase.co`
- **Publishable key**: `sb_publishable_fjJ9TRMu-6dTcVHTxRvXLw_kC3F-5Rl`
- **Project ID**: `bdqqkmkxflamzqjonvko`

### Supabase tables
**shows**
- `id` uuid PK
- `name` text
- `owner_id` text (currently 'local' — will be auth.uid() when auth is added)
- `project_data` jsonb (entire project as one JSON blob)
- `created_at` timestamptz
- `updated_at` timestamptz

**show_access**
- `id` uuid PK
- `show_id` uuid FK → shows.id (cascade delete)
- `pin_hash` text (SHA-256 of PIN, first 16 hex chars)
- `display_pin` text (human-readable 6-digit PIN)
- `role` text ('owner'|'editor'|'viewer'|'crew'|'tc')
- `label` text
- `track_ids` jsonb (array of stream IDs, null = all tracks)

### RLS policies (all currently open — to be tightened when auth is added)
```sql
create policy "shows read"   on shows for select using (true);
create policy "shows insert" on shows for insert with check (true);
create policy "shows update" on shows for update using (true);
create policy "shows delete" on shows for delete using (true);
create policy "access read"   on show_access for select using (true);
create policy "access insert" on show_access for insert with check (true);
create policy "access delete" on show_access for delete using (true);
```
Realtime must be enabled on the `shows` table.

## Roles
| Role    | Access                                              |
|---------|-----------------------------------------------------|
| owner   | Full app, TC broadcast authority, role management   |
| editor  | Full app minus online/settings panel, sync button   |
| viewer  | Waterfall + track selector, read-only               |
| crew    | Waterfall filtered to assigned tracks, read-only    |
| tc      | Fullscreen timecode display only                    |

## TC Broadcast
- Uses Supabase Broadcast (WebSocket relay, never written to DB)
- Channel name: `tc:<showId>`
- **Owner sends 4fps reference frames** (every 250ms) when in live mode only
- **Viewers interpolate** between reference frames using local RAF loop + clock
- Payload: `{frames, source:'mtc'|'sim', seqName, fps}`
- Green digits = live MTC, Yellow digits = simulator TC
- TC relay stops automatically when owner exits live mode
- Viewers show "Waiting for TC" after 5 seconds with no reference frame

## Session persistence
Owner PIN stored in `localStorage` key `cf18_session` as `{showId, t}`.
Auto-reconnects on page reload. Expires after 30 days.

## Conflict detection
Only triggers when:
1. Owner was offline (`CF._wasOffline = true`)
2. Owner had local dirty changes (`CF._offlineDirty = true`)
3. Owner reconnects and finds same fields changed remotely

Normal online editor pushes auto-apply without any prompt.

## Key global objects in Block 2 (collab layer)
```js
window.CF = {
  showId, role, isOwner, tracks,
  dirty, _wasOffline, _offlineDirty,
  _tcChan, _projChan, _tcReady, _tcRelayActive,
  _lastBcast, _tcRef,           // TC interpolation
  _pendingConflictProj,
  _conflictChoices,
  _pinList, _showList,
  // Hooks called by main app
  _onEnterLive,  // called by switchMode('live')
  _onExitLive,   // called by switchMode (any other mode)
}
```

## Hooks between Block 1 and Block 2
Block 2 patches these Block 1 functions after init:
- `window.persist` — debounced Supabase push for owner; immediate push for editor
- `window.redrawLive` — relays live MTC frames to Supabase Broadcast
- `window.redrawTest` — relays simulator TC frames to Supabase Broadcast
- `window._sbRender` — intercepts 'online' and 'save' panel rendering

## Sidebar panels
- **Save icon** → "Projects" panel (create/rename/delete/import/export)
- **Globe icon** → "Online & Roles" panel (sync button + access links only)

## Known issues / TODO

### High priority
- **Viewer waterfall** may not connect properly if `wf-live` element
  isn't in place before `switchMode('live')` fires. Check timing.
- **Cue IDs on wf-row** — `row.dataset.cueId` is set in renderWaterfall
  so viewer description edit buttons can find the cue. Verify this works
  on viewer screens since they use a cloned/injected `wf-live` element.

### Auth pass (planned, not started)
Complete architectural change needed:
1. Enable Supabase Auth with email disabled (use `username@cueflow.local` trick)
2. Owner logs in with username + password before accessing the app
3. `shows.owner_id` stores `auth.uid()` instead of `'local'`
4. RLS policies tightened to `using (auth.uid() = owner_id)`
5. Session handled by Supabase Auth (replaces `cf18_session` localStorage key)
6. Only owner's own projects visible in the Projects panel
7. Viewer/crew/editor roles still use PIN system (no auth needed)
8. Persistent sessions via Supabase's built-in session token in cookies

### Future features discussed
- Multiple cue list tracks filtered by crew assignment
- Standalone Electron app (Mac + Windows)
  - MTC via node-midi (not Web MIDI API)
  - `userData` instead of localStorage for session
  - Admin token for TC authority (not PIN)
  - ngrok bundled for tunnel management

## Data model
```
project_data (stored as JSON in shows.project_data)
├── id, name, fps, visibleCount, warnSec, autoAdvanceSec
├── activeSongId
├── streams[]  ← tracks
│   └── {id, name, colorId}
├── visibleStreamIds[]
└── songs[]    ← sequences
    ├── {id, name, description, startTc}
    ├── cues[]
    │   └── {id, tc, name, desc, streamId}
    └── chapters[]  ← markers
        └── {id, tc, name}
```

## Development notes
- Never merge the three script blocks
- Always validate JS with `node --check` after edits
- The collab layer (Block 2) is a self-contained IIFE — all functions
  are local scope except what's explicitly assigned to `window.CF`
- `escH()`, `fTC()`, `state`, `applyProject()`, `renderSongList()`,
  `renderCueList()`, `redrawActive()`, `switchMode()`, `getAllCues()`,
  `getStreamColor()` are all available from Block 1 (main app globals)
- Do NOT use `const`/`let` for top-level declarations in Block 2 —
  use `var` to avoid strict mode TDZ issues

## File history
- v17.11 — clean base (no collab)
- v17.12 — first Supabase integration attempt
- v18    — current version, clean three-block architecture
