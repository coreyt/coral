# Performance Budgets

Recorded numbers and the budgets enforced against them for R-026.

| Record | Purpose |
| --- | --- |
| Budgets | Separate deterministic regression gates from controlled-host timing |

## Measured

Node 24.19.0, built output, warm — one unrecorded warm-up followed by one
recorded sample on the release development machine, in milliseconds. These
legacy tests intentionally enforce regression ceilings rather than statistical
latency claims.

| Nodes | Parse | Print | SVG |
|---|---|---|---|
| 100 | 0.7 | 0.8 | 0.9 |
| 500 | 7.0 | 2.2 | 3.6 |
| 2000 | 13.2 | 4.5 | 12.2 |

Each graph is fully connected in a chain, with a position and a labelled edge
per node, so the numbers cover the geometry and attribute paths rather than
bare declarations.

## Enforced

| Operation | 100 | 500 | 2000 |
|---|---|---|---|
| Parse | 100 ms | 400 ms | 2000 ms |
| Print | 100 ms | 400 ms | 2000 ms |
| SVG | 200 ms | 600 ms | 3000 ms |

The budgets sit far above the measurements on purpose. CI timing is noisy and
a flaky budget gets deleted rather than fixed, so these are sized to catch an
order-of-magnitude regression — an accidental quadratic in the id allocator,
say — not to police milliseconds. Two shape assertions do the finer work: a
tenfold increase in node count must cost well under a hundredfold, and a
document whose labels all derive the same id must not degrade, which is the
case that would expose a bad allocator.

## Shared ELK and editor interaction gates (0.2.4)

The shared layout engine has separate 20-sample cold and warm series for
connected 100, 500, and 2000-node fixtures. Both series enforce nearest-rank
p95 ceilings of 500 ms, 2 s, and 10 s respectively; a 200-to-2000 warm-series
growth ratio must remain below 30. A separate production Playwright path uses
500 positioned nodes and no edges, one warm-up, then 20 equivalent-state node
drag and 20 zoom samples. Input-to-double-animation-frame p95 must remain at
or below 45 ms for dragging and 55 ms for zooming. The 350-node scene with
350 labeled connectors uses the same interaction limits. The controlled-machine
performance gate is serial and has zero retries; GitHub-hosted shared runners
are non-authoritative for these hard timing limits.

The exact fixture, raw samples, environment, and calibration rationale are in
`dev/archive/releases/0.2.4/slice-60/performance-calibration.md` in the
repository.

## Browser package gate (0.2.6)

The 0.2.17 browser IIFE includes `renderText` and must be at most 816 KiB
(835,584 bytes) at gzip level 9. The self-contained ESM bundle must be at
most the measured IIFE size at the same compression level.

A 25-node flowchart runs in the pinned Playwright
Chromium fixture with 30 fresh browser contexts for cold p95 and 50 warm
renders for repeat p95. Cold render must be at most 500 ms and repeat render
at most 200 ms.

Script evaluation and in-memory resource fetch are reported separately and are
not included in render duration. The performance configuration runs one worker
with zero retries. Normal browser tests run the same fixtures' functional assertions
without timing loops.

## Editor spatial resolver gate

Resolving a 400-member row arrangement must take less than 500 ms. The timing
runs only in the editor benchmark suite, in Node with one worker and zero
retries. Its functional resolution assertions stay in the normal editor tests.

## Complete spatial operations (0.2.9)

The renderer benchmark suite runs files serially with one worker and zero
retries. It measures production source parsing,
semantic projection, measured layout, route validation, and scene preparation
together.
The 25-node/36-connector workload and the 24-node nested long-label workload
use the existing 100-node ceiling of 500 ms for first operation and warm p95.
First-operation samples include lazy engine initialization when it has not
already occurred in that test worker; warm samples are reported separately.

The separate viz benchmark suite measures 20 waypoint edits through route
repair and a validated prepared scene, including unchanged unrelated connectors.
Its p95 ceiling is
200 ms, matching the repeat-render budget. The browser waypoint benchmark
adds 20 actual checkpoint pointer moves through two animation frames, using
the drag p95 ceiling of 45 ms. Run the existing browser gates with
`npm run test:e2e:performance` and the waypoint case with
`npx playwright test e2e/spatial-waypoint-performance029.spec.ts
--config playwright.performance.config.ts --workers=1 --retries=0`.
Run timing tests in isolation; unit scene timings do not measure paint latency.
Benchmark output is disposable.

## SVG artwork calibration (0.2.9)

The render benchmark suite and the Playwright performance configuration
measure user-symbol artwork at the `coral.svg-artwork` 1 Standard and Detailed
limits with 1, 100 and 500 instances, real icons, and documents at the GraphIR
document limits. Both are report-only: they print one JSON line and assert no
ceiling. Run them with `npm run test:performance:render` and
`npx playwright test e2e/svg-artwork-calibration-performance029.spec.ts
--config playwright.performance.config.ts --workers=1 --retries=0`.

Measured on 2026-10-31, Node 26.8.2 and Chromium 153 on one development
machine, in milliseconds:

| Artwork | Instances | Parse | SVG | Browser draw | Zoom frame p95 |
|---|---|---|---|---|---|
| Typical icon | 500 | 2.6 | 26.7 | 398 | 17 |
| Standard at limit | 100 | 6.0 | 6.4 | 316 | 33 |
| Standard at limit | 500 | 8.0 | 26.5 | 916 | 48 |
| Detailed at limit | 100 | 25.2 | 10.7 | 661 | 43 |
| Detailed at limit | 500 | 26.7 | 31.1 | 2,363 | 162 |
| 256 typical definitions | 256 | 80.5 | 44.8 | — | — |
| 19 Detailed definitions, 4.05 MB | 19 | 497 | 490 | — | — |

Every column, with its definition, is in section 11.3 of
`packages/render/spec/svg-artwork-1.md` in the repository.

## What is not budgeted

Selection, connection, keyboard-authoring, and text-edit timing have
no hard budget; their behavior stays covered by functional tests. Public viz,
Node, and MCP layout remain direct calls. Only reference-editor initial/reflow
layout uses the abortable worker, so this release does not imply a new public
asynchronous or cancellation contract.

Timing tests are outside normal unit discovery. Run every budget above with
`npm run test:performance` locally or on a controlled host; the
[testing reference](testing.md#browser-and-performance-tests) describes the
profile and the GitHub not-measured warning. CI runs no benchmark job.

## Related

- [Testing](testing.md)
