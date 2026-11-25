# Specification-as-AC: Budgets and Ceilings

This specification serves directly as the normative quantitative Acceptance
Criterion for `REQ-A1`, `REQ-A2`, `REQ-B1`, `REQ-B3`, `REQ-C2`, `REQ-E1`,
`REQ-F1`, `REQ-G1`, `REQ-G2`, and `ENG-03`. Detailed measurement calibration
lives in
[performance-budgets.md](../../../docs/contribute/reference/performance-budgets.md).

## Controlled Latency Budgets (Reference Hardware)

Measured serially on attributable controlled reference hardware with one worker
and zero retries. Shared hosted CI runners reporting `NOT MEASURED` never
satisfy controlled acceptance.

| Surface / Operation | Fixture / Condition | Metric | Budget / Ceiling | Owning REQ / ENG |
| --- | --- | --- | --- | --- |
| Layout compute (100 nodes) | Deterministic 100-node fixture (cold & warm, 20 samples) | Nearest-rank p95 | `<= 500 ms` | `REQ-C2`, `ENG-03` |
| Layout compute (500 nodes) | Deterministic 500-node fixture (cold & warm, 20 samples) | Nearest-rank p95 | `<= 2,000 ms` (2 s) | `REQ-C2`, `ENG-03` |
| Layout compute (2,000 nodes) | Deterministic 2,000-node fixture (cold & warm, 20 samples) | Nearest-rank p95 | `<= 10,000 ms` (10 s) | `REQ-C2`, `ENG-03` |
| Warm layout scaling ratio | 200-node to 2,000-node warm series | Growth ratio | `< 30` | `REQ-C2`, `ENG-03` |
| Complete spatial pipeline | 25-node/36-edge & 24-node nested long-label fixtures | First-op & warm p95 | `<= 500 ms` | `REQ-C2`, `ENG-03` |
| Editor spatial row solver | 400-member row arrangement (Node, serial) | Completion | `< 500 ms` | `REQ-C2`, `ENG-03` |
| `@coral-viz/viz` waypoint repair | 20 waypoint edits through scene repair | Repair p95 | `<= 200 ms` | `REQ-C2`, `ENG-03` |
| Editor node drag | 500-node (and 350-node/350-edge) production path | Input-to-paint p95 | `<= 45 ms` | `REQ-C2` |
| Editor zoom | 500-node (and 350-node/350-edge) production path | Input-to-paint p95 | `<= 55 ms` | `REQ-C2` |
| Editor waypoint drag | 20 checkpoint pointer moves, double-rAF | Input-to-paint p95 | `<= 45 ms` | `REQ-C2` |
| `@coral-viz/browser` cold render | 25-node flowchart, 30 fresh Chromium contexts | Render p95 | `<= 500 ms` | `REQ-F1` |
| `@coral-viz/browser` warm render | 25-node flowchart, 50 repeat Chromium renders | Render p95 | `<= 200 ms` | `REQ-F1` |

## Deterministic Parse, Print and SVG Regression Ceilings

Enforced in automated tests to catch order-of-magnitude algorithmic regressions
(such as quadratic ID allocation or serializer blow-ups) on connected chains
with positions and labeled edges:

| Operation | 100 Nodes | 500 Nodes | 2,000 Nodes | Owning REQ / ENG |
| --- | --- | --- | --- | --- |
| Parse | `<= 100 ms` | `<= 400 ms` | `<= 2,000 ms` | `REQ-A1`, `ENG-03` |
| Print | `<= 100 ms` | `<= 400 ms` | `<= 2,000 ms` | `REQ-A2`, `ENG-03` |
| SVG serialize | `<= 200 ms` | `<= 600 ms` | `<= 3,000 ms` | `REQ-E1`, `ENG-03` |

## Bundle and Artifact Ceilings

| Artifact / Surface | Metric | Budget / Ceiling | Owning REQ / ENG |
| --- | --- | --- | --- |
| `@coral-viz/browser` self-contained IIFE | Gzip level 9 size | `<= 770 KiB` | `REQ-F1`, `ENG-03` |
| `@coral-viz/browser` ESM path | Compressed bytes for equivalent render | `<=` IIFE gzip-9 bytes | `REQ-F1`, `ENG-03` |
| `@coral-viz/browser` standalone runtime | External runtime chunk/network fetches | `0` fetches | `REQ-F1`, `ENG-03` |

## Visual Sizing and Layout Regression Bounds

| Fixture / Property | Condition | Bound | Owning REQ |
| --- | --- | --- | --- |
| Catalog stencil area growth | 5, 26, 67, and 100-char labels | At most linear in label length (never quadratic) | `REQ-B1` |
| Captioned glyph invariance | Varying caption text within same sizing mode & authored dimensions (`actor`, `brain`, `funnel`, `neural-net`) | Glyph `width`, `height`, and relative port coords `delta = 0` | `REQ-B1` |
| Canonical 8-node AI/ML pipeline (`RIGHT`) | Full descriptive captions, `hifi` and `lowfi` | Bounding viewport `<= 1,600 x 600 px` | `REQ-B1` |
| Canonical 8-node AI/ML pipeline (`DOWN`) | Full descriptive captions, `hifi` and `lowfi` | Bounding viewport `<= 700 x 1,600 px` | `REQ-B1` |
| Seeded route-robustness corpus | Flowchart, architecture, AI/ML, data-engineering; grouped/ungrouped; 4 directions | `0` hard render failures without conflicting authored geometry | `REQ-B3` |

## On-Device AI Editing Ceilings (0.2.10 `coralsmol`)

Recorded exception details live in
coralsmol integration plan
and P5 verification results.

| Metric | Target Ceiling | Active 0.2.10 Exception | Conditions | Owning REQ |
| --- | --- | --- | --- | --- |
| Incremental memory above idle Chrome | `<= 1,000,000,000` bytes (1.0 GB) over `>= 100` consecutive short requests (200 ms sampling, host + GPU high-water) | `CS-10` / OD-3 (2026-11-15): ships at measured **1.17 GB** high-water (disclosed as **~1.2 GB**) | Exception valid only while the worker terminates after every exchange and on Stop/timeout/failure, and no UI or doc claims 1 GB compliance | `REQ-G2` |
| Off-device exfiltration / telemetry | `0` bytes of prompts, snapshots, replies, documents, or telemetry | None | Verified via full-lifecycle network interception on exact artifact | `REQ-G1` |
| Model host requests after Ready | `0` network requests | None | Verified in OPFS offline-from-host load test | `REQ-G1` |

## Package Coverage Floors

Enforced via Vitest coverage gates (`npm run test:coverage:gate`):

| Package / Scope | Statements | Lines | Functions | Branches | Owning ENG |
| --- | --- | --- | --- | --- | --- |
| `@coral-viz/viz` | `>= 80%` | `>= 80%` | `>= 80%` | `>= 75%` | `ENG-03` |
| `@coral-viz/mcp-server` | `>= 80%` | `>= 80%` | `>= 80%` | `>= 75%` | `ENG-03` |
| `@coral-viz/diagram-editor` (aggregate and critical state owners) | `>= 80%` | `>= 80%` | `>= 80%` | `>= 75%` | `ENG-03` |
