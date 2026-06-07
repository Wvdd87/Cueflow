# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

CueFlow is a live show timecode cue manager. A single self-contained HTML file (`index.html`) that runs as a web app or packaged Electron desktop app. Operators create cue sheets tied to SMPTE timecode and share live views with crew via Supabase Realtime.

## UI Kit — follow this for all new UI work

**All new additions or changes to the app UI must follow the CueFlow UI Kit.**

Reference file: `CueFlow UI Kit.html` (open in a browser to view)

Before adding any new component, panel, modal, or visual element, consult the UI Kit for:
- Colour tokens (`--amber`, `--red`, `--green`, `--surface`, `--hair`, etc.)
- Typography scale and font families (`--cond`, `--mono`, and system sans)
- Spacing, border-radius, and layout patterns
- Button styles (primary, cancel, outline, icon)
- Input / select field styles (`.tcs-select`)
- Status indicators (pip dots, badges, glyphs)
- Modal anatomy (header / tab bar / body / footer pattern)
- Cockpit layout components (ON AIR strip, NEXT hero, THEN rows, setlist rail)

Do **not** invent new colour values, font sizes, or component patterns that aren't in the UI Kit. If a UI Kit pattern doesn't cover the need, extend it conservatively using the same token system.

## Badge rules — enforced design spec

### Camera badges (`.cam-badge`, `.cam-badge-sq`)

**Always: coloured background + black text (`#06060a`).**

The CSS base class already sets `color: #06060a`. Never override it with `color:#fff` in inline styles. When rendering a camera badge in JS, only set `background`:

```html
<!-- correct -->
<div class="cam-badge sm" style="background:${hex};">${cam.number}</div>

<!-- wrong — do not do this -->
<div class="cam-badge sm" style="background:${hex};color:#fff;">${cam.number}</div>
```

Sizes: `xs` 24 px · `sm` 32 px · `md` 52 px · `lg` 96 px · `xl` 144 px.

### Track glyphs (`.track-glyph`)

**Always: near-black background (`#06060a`) + white text (`#fff`).**

```html
<span class="track-glyph xs" style="background:#06060a;color:#fff;">${shortName}</span>
```

### New-cue picker badges (`.nc-badge` — camera row)

Set `--nc-text: '#06060a'` and `--nc-base-bg: hex` so the coloured background + black text rule is respected in the picker grid.

## Commands

```bash
# Run in browser (no build step)
npx serve .
# open http://localhost:3000/index.html

# Run as Electron app
npm start

# Package as macOS .dmg
npm run dist

# Validate JS after any edit (always do this)
node --check index.html
```

## Architecture — the three script blocks

`index.html` contains three `<script>` blocks in order. **Never merge them** — the Supabase SDK affects strict-mode parsing in a way that breaks function declarations if they share a tag with app code.

| Block | Size | Contents |
|-------|------|----------|
| Block 0 | ~191KB | Supabase JS SDK v2 (inlined, no CDN) |
| Block 1 | ~180KB | CueFlow main app — global functions, `state`, UI render |
| Block 2 | ~31KB | Collab IIFE — Supabase sync, TC relay, role enforcement |

### Block 1 — main app globals

All functions are plain `function` declarations at script scope, so they are on `window`. Key ones used by Block 2:
- `state` — single mutable object holding all project data
- `applyProject(proj)` — loads a project object into `state` and re-renders
- `persist()` — saves current `state` to Supabase (debounced for owner, immediate for editor)
- `redrawActive()`, `redrawLive()`, `redrawTest()`
- `renderSongList()`, `renderCueList()`, `renderStreamsBar()`
- `switchMode(mode)` — `'edit'|'live'|'test'`
- `getAllCues(visibleOnly)` — returns cues from **active playlist only** (uses `getActivePlaylistSongs()`)
- `getActivePlaylist()`, `getActivePlaylistSongs()` — playlist-scoped song accessors
- `getSortedSongs()` — returns ALL songs from `state.songs` regardless of playlist; avoid in live-mode logic
- `fTC(frames)`, `tcF(tc)` — frame↔TC string conversion
- `escH(s)` — HTML escape
- `getStreamColor(colorId)` — track colour lookup
- `openConfirmModal(msg, onConfirm, onCancel)` — standard destructive-action dialog

### Block 2 — collab IIFE

Exposes `window.CF`. All internal variables use `var` (not `let`/`const`) — top-level `let`/`const` in a non-strict IIFE are NOT on `window`, which breaks cross-block access. This is a known footgun.

```js
window.CF = {
  showId, role, isOwner, tracks,
  dirty, _wasOffline, _offlineDirty,
  _tcChan, _projChan, _tcReady, _tcRelayActive,
  _lastBcast, _tcRef,
  _pendingConflictProj, _conflictChoices,
  _pinList, _showList,
  _onEnterLive,   // called by switchMode('live')
  _onExitLive,    // called by switchMode (any non-live mode)
}
```

Block 2 patches Block 1 functions after init:
- `window.persist` — wraps with Supabase push
- `window.redrawLive` / `window.redrawTest` — wraps with TC relay broadcast
- `window._sbRender` — intercepts sidebar panel rendering for 'online' and 'save' panels

Block 2 calls Block 1 via `window.*` pattern with guards: `if(window.persist) persist();`

## Data model

```
state / project_data (stored as jsonb in shows.project_data)
├── id, name, fps, warnSec, autoAdvanceSec, visibleCount
├── activeSongId, activePlaylistId
├── playlists[]   ← {id, name, songIds[]}
├── streams[]     ← tracks: {id, name, colorId}
└── songs[]       ← sequences: {id, name, description, startTc, cues[], chapters[]}
    └── cues[]    ← {id, tc, name, desc, streamId}
```

Songs not referenced in any playlist's `songIds` are orphans — `applyProject()` auto-adopts them into the first playlist on load.

### Per-device visibility (NOT synced)

`state.visibleStreamIds` and `state.cameraTrackVisible` are **per-device, per-user UI preferences** and are deliberately excluded from `snapshot()` (the Realtime push payload). Each client persists its own choice in `localStorage` session state (`cf_ss_<showId>_<userId>` — keys `v`, `c`, `k`) and re-applies it on every load via `_cfRestoreVisOnly()` (called at the tail of `applyProject()`) and `restoreSessionState()`. Access-restricted roles (`CF.tracks` / `CF.cameraIds`) are clamped to their assigned set in `applyRemote()` instead. **Never add these fields back to `snapshot()`** — doing so makes the owner's show/hide toggles override every editor's and viewer's local visibility over Realtime.

## Roles

| Role | Capability |
|------|-----------|
| `owner` | Full access, TC broadcast authority, role management |
| `editor` | Create/edit sequences, playlists, cues — cannot delete |
| `track-editor` | Same as editor, restricted to assigned `CF.tracks` |
| `viewer` | Read-only waterfall |
| `crew` | Waterfall filtered to assigned tracks |
| `tc` | Fullscreen TC display only |

Role checks: `CF.role === 'editor' || CF.role === 'track-editor'`

## Supabase

- **Project URL**: `https://bdqqkmkxflamzqjonvko.supabase.co`
- **Publishable key**: `sb_publishable_fjJ9TRMu-6dTcVHTxRvXLw_kC3F-5Rl`
- **Tables**: `shows` (project data as jsonb blob), `show_access` (PINs + roles)
- **Realtime**: `postgres_changes` on `shows` for project sync; Broadcast channel `tc:<showId>` for TC frames (never written to DB)
- TC is broadcast at ~12fps (80ms gate); viewers interpolate using local RAF + clock

## TC/timecode

- `tcF(tc)` converts `"hh:mm:ss:ff"` → integer frame count
- `fTC(frames)` converts frames → display string
- All live-mode logic must use `getAllCues()` (playlist-scoped), not `getSortedSongs()` directly
- `_doRedraw()` drives the live waterfall; auto-advance and up-next both use `getActivePlaylistSongs()`

## Electron

- `main.js` — standard Electron shell, loads `cueflow_v18.html`; grants MIDI permission only
- `build/entitlements.mac.plist` — required for Web MIDI API on macOS
- `build/icon.png` — app icon for DMG
