# Graph Report - Cueflow  (2026-07-05)

## Corpus Check
- 10 files · ~105,786 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 129 nodes · 127 edges · 10 communities (9 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `efdb6fc9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]

## God Nodes (most connected - your core abstractions)
1. `CueFlow — Project Context` - 15 edges
2. `CueFlow — Security, Data Integrity & Reliability Audit` - 9 edges
3. `mac` - 7 edges
4. `build` - 6 edges
5. `CueFlow — Top 10 Priority Actions` - 6 edges
6. `MEDIUM findings` - 6 edges
7. `Architecture` - 5 edges
8. `HIGH findings` - 5 edges
9. `startLanServer()` - 4 edges
10. `Badge rules — enforced design spec` - 4 edges

## Surprising Connections (you probably didn't know these)
- `startLan()` --calls--> `startLanServer()`  [EXTRACTED]
  main.js → lan-server.js

## Import Cycles
- None detected.

## Communities (10 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.10
Nodes (19): Architecture — the three script blocks, Badge rules — enforced design spec, Block 1 — main app globals, Block 2 — collab IIFE, Camera badges (`.cam-badge`, `.cam-badge-sq`), Commands, Data model, Electron (+11 more)

### Community 1 - "Community 1"
Cohesion: 0.11
Nodes (17): Auth pass (planned, not started), Conflict detection, CueFlow — Project Context, Current file, Data model, Development notes, File history, Future features discussed (+9 more)

### Community 2 - "Community 2"
Cohesion: 0.14
Nodes (13): dependencies, qrcode, ws, description, devDependencies, electron, electron-builder, main (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.14
Nodes (14): build, appId, dmg, files, mac, productName, title, NSMicrophoneUsageDescription (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.11
Nodes (19): crypto, fs, getLanIPs(), http, os, path, QRCode, startLanServer() (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (18): Assessment: are the `true` RLS policies acceptable for this threat model?, C1 — `shows` is world-readable: any internet user can read every show's full data, C2 — `show_access` is world-readable AND PINs are stored in plaintext, C3 — Stored XSS via rich-text sequence description, rendered raw in the live cockpit, CRITICAL findings, CueFlow — Security, Data Integrity & Reliability Audit, Executive summary, H1 — `track-editor` restriction is client-side only; the server lets them overwrite the whole show (+10 more)

### Community 6 - "Community 6"
Cohesion: 0.40
Nodes (5): Architecture, RLS policies (all currently open — to be tightened when auth is added), Supabase configuration, Supabase tables, Three script blocks (in order)

### Community 7 - "Community 7"
Cohesion: 0.33
Nodes (6): M1 — "Read-only" viewers/crew can write cue descriptions, M2 — No durable offline edit queue; offline reconnect is whole-snapshot last-write-wins, M3 — Leaked-password protection disabled on Supabase Auth, M4 — Offline/logged-out show creation can strand data, M5 — LAN inbound handler does no role enforcement, MEDIUM findings

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (6): CueFlow — Top 10 Priority Actions, Fix log — 2026-07-04, Fix log — 2026-07-04 (batch 2: H1/H2/H3 + PIN hardening), Fix log — 2026-07-04 (batch 3: M1/M2/M3), Fix log — 2026-07-04 (batch 4: remaining hardening + deploy), Fix log — 2026-07-05 (M4 + deploy notes)

## Knowledge Gaps
- **93 isolated node(s):** `http`, `os`, `fs`, `zlib`, `path` (+88 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CueFlow — Security, Data Integrity & Reliability Audit` connect `Community 5` to `Community 7`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `build` connect `Community 3` to `Community 2`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `CueFlow — Project Context` connect `Community 1` to `Community 6`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **What connects `http`, `os`, `fs` to the rest of the system?**
  _93 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._