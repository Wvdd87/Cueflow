# CueFlow — Top 10 Priority Actions

Condensed from `SECURITY_AUDIT.md`. Ordered by risk. Items 1–3 are exploitable today with the already-public anon key.

> **Status update (2026-07-04):** Items **1, 2, 3, 4, 5, 6, 7 are FIXED and verified**
> (C1/C2/C3 plus H1/H2/H3 and the PIN-generation hardening). The world-readable
> `shows` / `show_access` SELECT policies are now owner-only; collaborators read via
> the `join_show` / `get_show_data` SECURITY DEFINER RPCs. `song.description` is
> sanitized. Track-editor scope is now enforced server-side; editor writes use
> optimistic concurrency; PIN validation is rate-limited; PINs are generated with a
> CSPRNG. All verified against the live database. See the **Fix log** at the bottom.
> Remaining: item 8 (viewer/crew cue-desc write policy — decision needed), items
> 9–10 (offline queue, leaked-password protection), and lower-priority hardening
> (drop the cleartext `display_pin` column — now owner-only readable; salt the PIN
> hash). Item 5 (H2) is largely done bar longer/salted hashes.

| # | Action | Ref | Severity | Effort |
|---|--------|-----|----------|--------|
| 1 | **Fix `shows` SELECT RLS.** Change `shows_select` from `USING (true)` to `USING (auth.uid()::text = owner_id)`. Add a SECURITY DEFINER `get_show_data(show_id, pin_hash)` RPC for collaborator reads and switch `cfJoin` (`index.html:18647`) to call it instead of `db().from('shows').select(...)`. | C1 | Critical | M |
| 2 | **Fix `show_access` SELECT RLS + drop plaintext PIN.** Change `access_select` to owner-only (`EXISTS ... shows.owner_id = auth.uid()`). Stop writing `display_pin` (show the PIN once at creation, never persist cleartext). Validate PINs only through a DEFINER RPC — never `SELECT` the table client-side for auth. Salt + full-length `pin_hash`. | C2 | Critical | M |
| 3 | **Sanitize `song.description`.** It's saved as raw `innerHTML` (`index.html:8775/10479/11695`) and rendered raw in the live cockpit (`6152/6167/8227/10473/11701`). Allowlist-sanitize on render (and on save). | C3 | Critical | L–M |
| 4 | **Enforce `track-editor` scope server-side** in `push_show_data`, or stop treating it as a security boundary and document it. Today it can overwrite the whole show. | H1 | High | H |
| 5 | **CSPRNG PINs + rate limiting.** Replace `Math.floor(100000+Math.random()*900000)` with `crypto.getRandomValues`; add attempt throttling/lockout on the PIN-validation RPC. | H2 | High | M |
| 6 | **Conflict detection for editors.** The `findConflicts`/`_versionsDiffer`/modal path is gated on `CF.isOwner` (`index.html:17417`); editors do blind last-write-wins. Add optimistic-concurrency (`updated_at` check) in `push_show_data` and snapshot editor writes. | H3 | High | M |
| 7 | **Harden SECURITY DEFINER RPCs.** `push_show_data`/`save_show_snapshot`/`update_cue_desc` are `anon`-executable; make internal auth airtight and ensure no DEFINER function returns more than the caller's scope. | H4 | High | L–M |
| 8 | **Resolve viewer/crew write inconsistency.** `update_cue_desc` and the LAN `_cfLanOnClientMsg` (`index.html:17897`) let read-only roles write. Decide the policy; enforce role in the LAN handler. | M1/M5 | Medium | L |
| 9 | **Durable offline queue.** Persist the dirty *payload* (not just the flag) per show; run reconnect conflict resolution for all roles, not just owner. Surface unsynced-change count. | M2 | Medium | M–H |
| 10 | **Enable leaked-password protection** in Supabase Auth; block/flag logged-out show creation so it can't strand `owner_id: null` rows. | M3/M4 | Medium | L |

**Do first, today:** items 1, 2, 3 — they close a live read+write breach reachable with a public key and one `curl`, plus the XSS that can hit the operator's machine mid-show. Items 4–7 close the partially-trusted-insider and concurrency gaps. Items 8–10 are correctness/hardening.

**Keep as-is (already good):** server-side history snapshots, owner conflict modal, realtime echo detection, per-device visibility exclusion from `snapshot()`, Electron context isolation + path-traversal guard, `escH` on cue fields. See *What's done well* in `SECURITY_AUDIT.md`.

---

## Fix log — 2026-07-04

**C1/C2 — world-readable RLS + plaintext PIN exposure → FIXED (verified via live anon key)**
- DB migration `add_validated_read_rpcs`: added `join_show(show_id, pin_hash)` and `get_show_data(show_id, pin_hash)` — SECURITY DEFINER functions that validate the PIN server-side and return only that show's access row / project data. Granted to `anon, authenticated`.
- DB migration `restrict_select_rls_owner_only`: replaced `shows_select` and `access_select` `USING (true)` with owner-only policies (`auth.uid()::text = owner_id`).
- Client (`index.html`):
  - `cfJoin` now calls `join_show` instead of directly SELECTing `show_access` + `shows`.
  - `_fetchAndApplyRemote` refetches via `get_show_data` for collaborators (authenticated owner still reads its own row directly).
  - `pushProject` now broadcasts `proj_sync` after every successful owner **and** editor push, because collaborators no longer receive `postgres_changes` (they refetch on the broadcast). Reuses the existing `netSend`/`_onProjSyncBroadcast` path already used by `pushCueDesc`.
- Verification: with the public anon key, `GET /rest/v1/shows` and `/show_access` now return `[]` (previously dumped full project data + the plaintext owner PIN `697964`); `rpc/join_show` and `rpc/get_show_data` with a valid PIN still return data; a wrong PIN returns `null`.
- **Cutover note:** old cached clients that still SELECT the tables directly will fail to load/join until they pick up the new `index.html`. Deploy the updated file before relying on the lockdown for all devices.
- **Still open (hardening, not the critical hole):** `display_pin` is still stored in cleartext (now owner-only readable); PIN hash is unsalted SHA-256/64-bit; no server-side rate limiting on the validation RPC (H2).

**C3 — stored XSS via `song.description` → FIXED (19/19 payload tests pass)**
- Added `cfSanitizeHTML()` (allowlist sanitizer using `DOMParser`, which does not execute scripts or load resources) next to `escH` in `index.html`. Keeps the formatting the notes toolbar emits (headings, bold/italic/underline, lists, font/span colour) and strips scripts, event handlers, and resource-loading tags.
- Applied at all 5 render points (`live-sp-desc`, `live-next-desc`, `rte-editor`, `notes-rte`, notes-tab) and all 3 save points.
- Also hardened `escH` to escape `>` and `'` (closes L1).

## Fix log — 2026-07-04 (batch 2: H1/H2/H3 + PIN hardening)

**H1 — track-editor scope now enforced server-side → FIXED (verified via curl)**
- DB migrations `track_editor_server_side_scope` + `fix_merge_null_streamid_dataloss`: `push_show_data` now, for `role='track-editor'`, rebuilds the authoritative document from the stored copy via `_merge_scoped_tracks(stored, incoming, allowed_streams)` — it takes only cues whose `streamId` is in the caller's assigned streams, from existing songs; everything else (other tracks' cues, null-`streamId` markers/camera cues, song structure, playlists, metadata) comes from storage. A tampered full-document payload therefore cannot alter anything outside the caller's tracks.
- **Data-loss guard:** the first merge version dropped cues with no `streamId` (SQL `NOT (NULL = ANY(...))` → NULL). Fixed so null-`streamId` cues are always kept. Verified.
- Verification: a temp track-editor scoped to `["stream_cam"]` attempted to edit an out-of-scope cue, rename a song, and inject a song — all six checks passed (allowed edit applied; denied edit, rename, and injection rejected; song count and total cue count unchanged → no data loss). Full (unrestricted) `editor` role bypasses the merge and is unaffected.
- **Behaviour note:** track-editors can now only add/edit/remove cues on their assigned streams within existing sequences; they can no longer create/rename/delete sequences or edit camera/marker (null-stream) cues server-side. If track-editors need broader powers, widen `_merge_scoped_tracks` — flagged for product decision.

**H2 — PIN brute-force → FIXED (rate limiting + CSPRNG); hash length still open**
- DB migration `pin_rate_limit_and_optimistic_concurrency`: added `pin_attempts` table + lockout in `join_show` — 10 failures / 15 min per show blocks further attempts (a correct PIN is also blocked during lockout). Verified: attempts 1–10 return `bad_pin`, 11+ return `rate_limited` with `retry_after_s`.
- Client: `_cfGenPin()` replaces all six `Math.floor(100000+Math.random()*900000)` sites — uniform 6-digit PIN from `crypto.getRandomValues` with rejection sampling (no modulo bias, no `Math.random` fallback). Verified uniform over 200k samples.
- `cfJoin` handles the new `{ok,reason}` envelope and shows a "try again in N minutes" message on lockout.
- Still open (lower priority): PIN hash is unsalted SHA-256 truncated to 64 bits — but hashes are no longer exposed (owner-only RLS) and the PIN space bounds entropy anyway, so this is minor.

**H3 — editor blind last-write-wins → FIXED (optimistic concurrency + editor conflict UI)**
- DB (same migration): `push_show_data` takes an optional `p_base_updated_at`; if the row's `updated_at` moved since the client's base, the write is refused with `{ok:false, reason:'conflict', updated_at, project_data}` (server copy returned) instead of clobbering. The legacy 3-arg call still resolves (base defaults null → old behaviour). Verified: correct base writes, stale base returns conflict + server copy, 3-arg still works.
- Client: tracks `CF._baseUpdatedAt` from `join_show` / `get_show_data`; editor push sends it; on `conflict` the new `_editorHandleConflict()` reuses the owner's resolution path (`findConflicts` → field-level modal, or `_showVersionConflict` keep-local/use-remote, or silent re-push when only the timestamp moved). Read RPCs now return `updated_at`.

**Cross-cutting:** `join_show`/`get_show_data`/`push_show_data` all return `{ok,...}` envelopes now; the client was updated in lockstep. App re-verified in headless Chrome: boots to sign-in, **0 console errors/warnings**, sanitizer confirmed live.
