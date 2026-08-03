# Graph Report - Cueflow  (2026-08-01)

## Corpus Check
- 11 files · ~118,201 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 141 nodes · 139 edges · 10 communities (9 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3887986d`
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
3. `build` - 7 edges
4. `mac` - 7 edges
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
Cohesion: 0.09
Nodes (22): Architecture, Auth pass (planned, not started), Conflict detection, CueFlow — Project Context, Current file, Data model, Development notes, File history (+14 more)

### Community 2 - "Community 2"
Cohesion: 0.14
Nodes (13): dependencies, qrcode, ws, description, devDependencies, electron, electron-builder, main (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (15): build, appId, dmg, fileAssociations, files, mac, productName, title (+7 more)

### Community 4 - "Community 4"
Cohesion: 0.11
Nodes (19): crypto, fs, getLanIPs(), http, os, path, QRCode, startLanServer() (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (20): Assessment: are the `true` RLS policies acceptable for this threat model?, CueFlow — Security, Data Integrity & Reliability Audit, Executive summary, H1 — `track-editor` restriction is client-side only; the server lets them overwrite the whole show, H2 — 6-digit PINs from `Math.random()`, no server-side rate limiting, H3 — Editor writes are blind last-write-wins with no conflict detection, H4 — SECURITY DEFINER RPCs are callable by `anon`, HIGH findings (+12 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (6): fs, MEDIA_EXTS, MEDIA_MIME, mediaDirs, path, { Readable }

### Community 7 - "Community 7"
Cohesion: 0.50
Nodes (4): C1 — `shows` is world-readable: any internet user can read every show's full data, C2 — `show_access` is world-readable AND PINs are stored in plaintext, C3 — Stored XSS via rich-text sequence description, rendered raw in the live cockpit, CRITICAL findings

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (6): CueFlow — Top 10 Priority Actions, Fix log — 2026-07-04, Fix log — 2026-07-04 (batch 2: H1/H2/H3 + PIN hardening), Fix log — 2026-07-04 (batch 3: M1/M2/M3), Fix log — 2026-07-04 (batch 4: remaining hardening + deploy), Fix log — 2026-07-05 (M4 + deploy notes)

## Knowledge Gaps
- **100 isolated node(s):** `http`, `os`, `fs`, `zlib`, `path` (+95 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `build` connect `Community 3` to `Community 2`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `CueFlow — Security, Data Integrity & Reliability Audit` connect `Community 5` to `Community 7`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `http`, `os`, `fs` to the rest of the system?**
  _100 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._