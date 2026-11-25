# Slice 60 — SVG artwork budget calibration

Status: **revision 3** 2026-10-31. Revision 2 resolved a Fable medium-effort
review of revision 1 (see [Review](#review)); revision 3 moves M4 to the
browser package (see [Implementation note](#implementation-note)) and records
the results. On `s60-calibrate` cut from
`release/0.2.9` at `aeb93d28`. Owner: [Slice 60 design](design.md), section
"Performance", and profile
[§15](../../../../packages/render/spec/svg-artwork-1.md#15-freezing-version-1)
item 1. Inputs: profile
[§11](../../../../packages/render/spec/svg-artwork-1.md#11-budgets-and-tiers)
and §15.1, the SVG icon proposal benchmark plan, the
C2 design "Performance limits", and the GraphIR 4
specification at `v0.2.4`, section "Document limits".

This step measures and recommends. It changes no budget, vector, source
spelling, canonical print or diagnostic, does not freeze version 1 and does
not flip `SVG_ARTWORK_PROFILE_FROZEN_029`. A recommended change that would
alter any admission outcome is left for the author.

## Questions

1. Do the Standard and Detailed limits (`bytes`, `elements`, `segments`) fit
   real icons, and can a document hold 1, 100 and 500 instances of artwork at
   each limit within Coral's existing performance ceilings?
2. Are the ingress ceilings and the effective-bound margin `R` (SA-4) right
   for real artwork?
3. Are the GraphIR document limits — 256 definitions and 4,194,304 total
   artwork bytes — safe to keep?
4. What do the measurements say about the open questions? The real-icon set
   decides SA-9 and whether SA-4's margin refuses real artwork; a small
   sample of raw exported files gives anecdotal evidence for SA-1 and SA-3.
   SA-8 and SA-10 are not measurement questions: the recommendation for each
   cites the specification text or the measures the admitter already
   reports.

## Corpus

| Artwork | What it is | Measures (bytes / elements / segments) |
| --- | --- | --- |
| `typical` | The C2 performance icon: group, gradient, path, circle, rect | 760 / 8 / 23, Standard |
| `standard` | Synthetic, exactly at the Standard element and segment limits: 255 filled 16-segment polygons on a 64-unit view box | 53,370 / 256 / 4,096, Standard |
| `detailed` | The same construction at the Detailed limits: 1,023 polygons | 213,422 / 1,024 / 16,384, Detailed |
| Real icons | `@iconify-json/simple-icons` 1.2.95 (CC0), 3,732 single-path brand icons, a VitePress dependency of the docs already in the root `node_modules` and pinned by the lockfile | Distribution only |
| Raw exports | The SVG files already in the checkout outside generated output: Playwright's bundled logos in `node_modules/playwright-core/lib/vite`, `docs/public/figures` and the archived editor icon | Admission outcome only |

The synthetic artworks are deterministic (a fixed linear congruential
sequence) and paint overlapping translucent fills, so paint cost is not
trivially small. They sit exactly at the element and segment limits and at
about 80 % of the byte limits. The real-icon set is normalised by Iconify to
single-path bodies on a 24-unit view box: it exercises bytes, segments, arcs
and the effective bounds, but says nothing about `elements`, gradients,
internal reuse or editor-export attributes. The raw exports are a handful of
un-normalised files, so they illustrate SA-1 and SA-3 rather than measure
them. No corpus file is committed or downloaded; when the real-icon set is
absent the benchmark logs that and skips M2.

## Measurements

All run on this machine, Node 26.8.2, built from source, with the repository
performance policy (`scripts/performance-policy.mjs`).

| ID | Measurement | Suite |
| --- | --- | --- |
| M1 | For each synthetic artwork and 1, 100 and 500 pinned instances of one definition: cold source parse with admission (a new artwork text each sample, so the admission cache misses), display projection and layout, scene preparation, SVG serialization, and output bytes. One warm-up, five samples, median | Render benchmark |
| M2 | Real icons: admission result, tier, measures and admission time for every icon; p50, p95, p99 and maximum | Render benchmark |
| M2b | Raw exports: admission outcome and the distinct failure codes of each file | Render benchmark |
| M3 | GraphIR limits: 256 distinct `typical` definitions with one instance each, and 19 distinct `detailed` definitions (about 4.05 MB of canonical text, the byte limit) with one instance each; the M1 phases, plus a warm re-parse of the same text, which is what the editor does on every edit | Render benchmark |
| M4 | Browser package in Chromium: `renderTo` a document with 1, 100 and 500 instances of `typical`, `standard` and `detailed`, timed to the second animation frame; then ten zooms, each a host transform change timed to the second animation frame (the existing zoom gate's measure) and to a completed screenshot, which waits for rasterization | Playwright performance |

M1 to M3 live in one file,
`packages/render/test/svg-artwork-calibration-performance029.test.ts`, picked
up by the existing render benchmark configuration (outside normal unit
discovery, one worker, zero retries). M4 is
`e2e/svg-artwork-calibration-performance029.spec.ts`, added to
`playwright.performance.config.ts` and ignored by the normal browser
configuration. Both are report-only: they validate their samples with the
performance policy and print one JSON line, and assert no ceiling, so
`npm run test:performance` stays green whatever the workload costs. Gating a
case is the author's later choice. The corpus builders are one fixture module,
`packages/render/test/fixtures/svgArtworkCalibration029.ts`, shared by both.

M4 draws the `<symbol>`/`<use>` markup that M1 serializes, which is also the
export path, and checks that every instance is drawn from one `<symbol>`.
Double-animation-frame timing measures main-thread frame production;
rasterization runs off the main thread, so the screenshot time is reported
too. Edit latency is the M3 warm re-parse; drag latency is not measured,
because the 0.2.4 drag gate moves one node and repaints no more artwork than
zoom. No device floor is defined, so all figures are this machine's.

## Decision rules

Each measurement decides only the budgets named here.

| Budget or limit | Decided by | Keep when | Otherwise |
| --- | --- | --- | --- |
| Standard `bytes`, `elements`, `segments` | M2, M1, M4 | At least 99 % of real icons are admitted as Standard, and 100 `standard` instances meet the existing ceilings: SVG serialization 200 ms at 100 nodes, zoom frame p95 55 ms | Recommend the per-artwork limit that meets both |
| Detailed `bytes`, `elements`, `segments` | M1, M4 | 100 `detailed` instances meet the same ceilings | Recommend a lower Detailed limit |
| Repeated instances | M1, M4 | 500 `standard` and 500 `detailed` instances meet the 500-node ceilings: SVG 600 ms, zoom p95 55 ms | Recommend a GraphIR and Coral aggregate limit, not a lower per-artwork limit: no per-artwork limit bounds repetition |
| `input.bytes`, `input.elements`, `nesting`, `input.segments`, `reference-depth` | M2 and the C2 performance cases | The largest real icon is far below each ceiling and the C2 2 MiB cases meet their 1,500 ms target | Recommend a lower ceiling |
| `R` (SA-4) | M2 | No real icon is refused by the effective bounds | Recommend the smallest rule change that admits them while still refusing artwork that draws far outside its view box |
| GraphIR 256 definitions | M3 | Cold and warm parse of 256 definitions meet the 500-node parse ceiling (400 ms), and SVG serialization meets 600 ms | Recommend a lower count, or a cache change if only the warm parse fails |
| GraphIR 4,194,304 bytes | M3 | Cold parse with admission of 19 Detailed artworks meets the sum of C2's per-artwork Detailed target (19 × 250 ms = 4,750 ms); the warm re-parse meets 400 ms; SVG serialization meets 600 ms | Recommend a lower byte limit, or a cache change if only the warm parse fails |

Layout is reported but decides nothing: pinned nodes without edges make it
independent of artwork. Instance counts 1 and 100 are reported; the rules
above name which counts decide. A recommendation that changes no admission
outcome may be applied here; any other goes to the author. Timing rules
compare medians (M1, M3) or p95 (M4) on this machine; GitHub-hosted runners
are not authoritative.

## What lands

- The fixture module, its functional test
  (`packages/render/test/svgArtworkCalibration029.test.ts`, normal unit
  discovery: each synthetic artwork's tier and exact measures, and the
  document builder's definition and instance counts), committed failing
  first.
- The two benchmark files and the Playwright configuration lines.
- A compact measured table in profile §11 (new §11.3, "Calibration
  measurements"; the sentence that every numeric limit is provisional, and
  the freeze record, are untouched) and in
  [performance budgets](../../../../docs/contribute/reference/performance-budgets.md),
  in their existing style.
- [Results and recommendations](#results-and-recommendations) below, for the
  author. Raw benchmark output is disposable and is not committed.

## Implementation note

Revision 2 measured zoom on the editor canvas. Running it showed the canvas
draws no user-symbol artwork when a node has scene parts: `SymbolNode`
renders the artwork part with `namespace="node"`
(`packages/viz/src/components/SymbolNode.tsx`), so its `<use>` points at
`#node-coral-sym-<id>`, while `CoralEditor` writes the definitions with the
`coral-instance` scope (`packages/viz/src/editor/CoralEditor.tsx`). Every
instance therefore references a missing symbol and paints nothing, and the
editor timings were flat whatever the artwork. Node markers are inline
decorations and are unaffected; edge-owned route
markers already receive the correct instance namespace. This is a defect for the
editor step to fix; it is outside this step. M4 now measures the browser
package, which draws the artwork.

## Results and recommendations

The measured figures are in profile
[§11.3](../../../../packages/render/spec/svg-artwork-1.md#113-calibration-measurements).
Node work never decides anything: at 500 Detailed instances parse is 27 ms
and SVG 31 ms, far inside the 400 ms and 600 ms ceilings, because
`<symbol>`/`<use>` writes each definition once. Browser painting decides.

| Budget or limit | Evidence | Recommendation |
| --- | --- | --- |
| Standard `bytes` 65,536 | 99.97 % of admitted real icons are Standard; the one Detailed icon is 78,195 canonical bytes | Keep |
| Standard `elements` 256, `segments` 4,096 | Real icons reach 2,316 segments; 100 instances at the limit: zoom frame p95 33 ms | Keep |
| Detailed `bytes`, `elements`, `segments` | 100 instances at the limit: zoom frame p95 43 ms ≤ 55 ms | Keep |
| Repeated instances | 500 Detailed instances: zoom frame p95 162 ms and 1.6 s to raster, over the 55 ms gate; 500 Standard (2.05 M painted segments) and 100 Detailed (1.64 M) pass | Author decision: add a document aggregate of painted segments, Σ instances × `segments`, at 2,097,152 (512 Standard or 128 Detailed instances at the limits). Coral would show it as a complexity notice; making it a refusal, or a GraphIR limit, is a new rule either way |
| Ceilings `input.*`, `nesting`, `reference-depth` | Largest real input 54,153 bytes, 2.6 % of `input.bytes`; the C2 2 MiB cases meet their targets in the render suite | Keep |
| `R` = 8 × max(width, height) | 128 of 3,732 real icons (3.4 %) are refused for arc radius, all on arcs with large-arc flag 0 in a separate probe (the committed survey does not classify flags); checking radius only when the flag is 1 admits all 3,732 with `R` unchanged. A minor arc stays near its chord whatever its radius; a major arc with a huge radius draws far outside | Author decision, changes outcomes: apply the arc-radius check only to arcs with large-arc flag 1, keep `R`, and add a vector for each case |
| GraphIR 256 definitions | Cold parse 81 ms, warm 84 ms, SVG 45 ms | Keep |
| GraphIR 4,194,304 bytes | Cold parse 497 ms ≤ 4,750 ms, but warm re-parse 475 ms > 400 ms and one render (parse, layout and SVG) takes about 1.8 s: the admission cache (64 MiB) holds about 12 Detailed results, and `documentCatalog029` re-admits by text in each phase, so every phase re-admits all 19. With a 256 MiB, 512-entry cache (a probe, not committed) warm parse is 159 ms, layout 7 ms and SVG 132 ms | Keep the limit. Fix the cache, which changes no outcome: have `documentCatalog029` reuse the parse's admitted artwork, and size the cache to hold a document at the byte limit |

Open questions:

| ID | Recommendation | Evidence |
| --- | --- | --- |
| SA-1 | No `<use>` in version 1 | 3 of 9 raw exports use `<use>`, and each also uses another refused construct (`filter`, a foreign namespace), so admitting `<use>` alone admits none of them |
| SA-3 | Keep refusing `display`, `visibility`, root `x`/`y` and `xml:space` | None of the 9 raw exports uses them; the refusals seen are `role`, `aria-labelledby` and `id` on `title`/`desc` in Coral's own icons, which the author may choose to discard with disclosure in a separate change |
| SA-4 | See `R` above | 128 false refusals, all minor arcs in the separate probe |
| SA-8 | Publish `spec/` in `@coral-viz/render` before the freeze | GraphIR 0.2.4 states that Coral publishes the profile's normative document and conformance vectors; `spec/` is 232 KB unpacked |
| SA-9 | Keep the 2 MiB recovery ceilings for every input | The largest real icon uses 2.6 % of `input.bytes`, and the C2 ceiling cases meet their targets |
| SA-10 | Keep counting the root and charging gradients per reference | The typical icon's 8 elements include the root and 3 for one gradient reference; no real icon comes near 256 elements, so neither rule changes a tier |

## Review

A Fable medium-effort review of revision 1 returned revise (four P1).

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| DR-1 | P1 | M3 measures cold parse only; the admission cache (64 entries, 64 MiB) holds about 12 Detailed results, so the editor's re-parse of the GraphIR-limit documents may re-admit everything | M3 adds a warm re-parse, a decision input for both GraphIR limits |
| DR-2 | P1 | The byte-limit rule used the single 2 MiB input target, inconsistent with C2's 250 ms per Detailed artwork | Ceiling derived as 19 × 250 ms |
| DR-3 | P1 | Committed benchmarks asserting ceilings the workload may exceed would turn the performance suite red | Both benchmarks are report-only |
| DR-4 | P1 | Question 4 overpromised what the corpus decides | Question 4 and the corpus section state what each sample can decide; raw exports added as M2b |
| DR-5 | P2 | Layout cannot decide an artwork budget | Reported only |
| DR-6 | P2 | `SymbolNode` can draw a copy of the definition per node | M4 asserts one `<symbol>` and the expected instance count |
| DR-7 | P2 | The Standard rule conflated per-artwork and repetition levers | 500-instance failures go to the aggregate row for both tiers |
| DR-8 | P3 | No ceilings named per instance count | Named in the rules |
| DR-9 | P3 | Corpus dependency unstated | Stated; M2 skips with a message when absent |
| DR-10 | P3 | Time to settle had no use | Reported as context |
| DR-11 | P3 | §11.3 must not touch the provisional statement | Stated |
| DR-12 | — | Implementation: the editor canvas paints no artwork (see [Implementation note](#implementation-note)) | M4 measures the browser package |

## Code review follow-up

Applied the Fable review fixes: the minor-arc classification is labelled as
a separate probe; §11.3 explains frame quantisation, the 256-definition
cache overflow and the unmeasured, arithmetically derived Detailed capacity; M4
asserts one
`<symbol>`; redundant file existence and result truncation are removed;
the editor defect note distinguishes inline node markers from edge references.

Complexity self-assessment: the benchmark implementation is about 290 lines
in four new files. One fixture module feeds both consumers. The two short
percentile helpers duplicate about six lines; extracting a shared timing
module would add a dependency surface for no useful reduction. No product
code or admission outcome changes in this step.

Follow-up review P2 corrected: the aggregate permits 512 Standard or 128
Detailed instances by arithmetic; neither boundary count was measured.
Node-marker premise corrected after G-38 review against actual part ownership.
