# Graph Report - Cueflow  (2026-09-06)

## Corpus Check
- 12 files · ~135,948 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 163 nodes · 161 edges · 12 communities (10 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `288c222d`
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
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 12|Community 12]]

## God Nodes (most connected - your core abstractions)
1. `CueFlow — Project Context` - 15 edges
2. `build` - 9 edges
3. `CueFlow — Security, Data Integrity & Reliability Audit` - 9 edges
4. `mac` - 8 edges
5. `Building and distributing CueFlow (macOS)` - 7 edges
6. `MEDIUM findings` - 6 edges
7. `Architecture` - 5 edges
8. `HIGH findings` - 5 edges
9. `startLanServer()` - 4 edges
10. `dmg` - 4 edges

## Surprising Connections (you probably didn't know these)
- `startLan()` --calls--> `startLanServer()`  [EXTRACTED]
  main.js → lan-server.js

## Import Cycles
- None detected.

## Communities (12 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (21): Architecture — the three script blocks, Badge rules — enforced design spec, Block 1 — main app globals, Block 2 — collab IIFE, Camera badges (`.cam-badge`, `.cam-badge-sq`), Commands, Data model, Electron (+13 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (22): Architecture, Auth pass (planned, not started), Conflict detection, CueFlow — Project Context, Current file, Data model, Development notes, File history (+14 more)

### Community 2 - "Community 2"
Cohesion: 0.14
Nodes (13): dependencies, qrcode, ws, description, devDependencies, electron, electron-builder, main (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.20
Nodes (10): mac, NSMicrophoneUsageDescription, UTExportedTypeDeclarations, category, entitlements, entitlementsInherit, extendInfo, icon (+2 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (21): crypto, fs, getLanIPs(), http, os, path, QRCode, startLanServer() (+13 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (18): Assessment: are the `true` RLS policies acceptable for this threat model?, C1 — `shows` is world-readable: any internet user can read every show's full data, C2 — `show_access` is world-readable AND PINs are stored in plaintext, C3 — Stored XSS via rich-text sequence description, rendered raw in the live cockpit, CRITICAL findings, CueFlow — Security, Data Integrity & Reliability Audit, Executive summary, H1 — `track-editor` restriction is client-side only; the server lets them overwrite the whole show (+10 more)

### Community 6 - "Community 6"
Cohesion: 0.15
Nodes (6): fs, MEDIA_EXTS, MEDIA_MIME, mediaDirs, path, { ReadableStream }

### Community 7 - "Community 7"
Cohesion: 0.15
Nodes (13): build, afterPack, afterSign, appId, dmg, fileAssociations, files, productName (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.33
Nodes (6): M1 — "Read-only" viewers/crew can write cue descriptions, M2 — No durable offline edit queue; offline reconnect is whole-snapshot last-write-wins, M3 — Leaked-password protection disabled on Supabase Auth, M4 — Offline/logged-out show creation can strand data, M5 — LAN inbound handler does no role enforcement, MEDIUM findings

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (10): Ad-hoc signing (automatic, free), Best: hand it over on a USB stick or local file share, Build, Building and distributing CueFlow (macOS), If you ever do sign it ($99/year), Installing on any OTHER Mac, Installing on the machine that built it, Known gaps (+2 more)

## Knowledge Gaps
- **113 isolated node(s):** `http`, `os`, `fs`, `zlib`, `path` (+108 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `build` connect `Community 7` to `Community 2`, `Community 3`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `mac` connect `Community 3` to `Community 7`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `CueFlow — Security, Data Integrity & Reliability Audit` connect `Community 5` to `Community 9`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `http`, `os`, `fs` to the rest of the system?**
  _113 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._