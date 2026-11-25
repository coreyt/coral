# Slice 70 verification summary

Empirical verification of Coral `0.2.14` across rendering quality, notation
understandability, cloud icon admission, browser bundle budget, and
cross-surface parity (`2026-11-25`).

## Rendering quality benchmarks

- **`LAYOUT_CORPUS_0211` (40 stratified diagrams across 9 notations):**
  `40/40` Tier-1 pass (`0` hard defects), composite mean **`95.06 / 100`**
  (up from `93.83 / 100` in `0.2.12`).
- **Edition `0.2.14` showcase suite (4 notations in `hifi` and `anemone`):**
  `8/8` Tier-1 pass (`0` hard defects), living composite mean **`99.06 / 100`**:
  - `@diagram block` (expanded freeform shapes + inline `[style: ...]`):
    `100.0 / 100` (`hifi` and `anemone`).
  - `@diagram architecture` (C4-grade types + `technology`/`description` +
    system boundary): `96.25 / 100` (`hifi` and `anemone`).
  - `@diagram infrastructure` (AWS VPC/ingress/compute/RDS topology):
    `100.0 / 100` (`hifi` and `anemone`).
  - `@diagram erd` (Crow's Foot tabular entities + cardinality markers):
    `100.0 / 100` (`hifi` and `anemone`).

## Presentation architecture

- **Monochrome defaults (`lowfi`, `hifi`):** Preserved as basic black-and-white
  ink-on-paper without cloning C4's visual format.
- **Peer output style `anemone` (shorthand `ane`):** Wired end-to-end across
  `@coral-viz/render`, `@coral-viz/browser`, `@coral-viz/mcp-server`,
  `@coral-viz/viz`, and `@coral-viz/diagram-editor`.
- **`parrotfish` modeled-output API:** Exported from `@coral-viz/render` to
  apply modeled presentation treatments (colors, strokes, accents, decorative
  elements) strictly without modifying layout, flow, or edge routing.

## Notation understandability and cloud icons

- **Vocabulary directness across all 12 active edition `0.2.14` notations:**
  Improved from **`54.5%`** (`0.2.12`) to **`88.5%`** (`0.2.14`), reaching
  `100%` directness on `block`, `architecture`, `infrastructure`, `code`,
  `aiml`, `data-engineering`, `sketch`, `uml-class`, and `uml-sequence`.
- **Immutability:** All 12 `0.2.8` catalog digests remain byte-identical
  (`catalogDigest028.test.ts` verifies both `0.2.8` and `0.2.14` manifests).
- **Cloud icon admission (`scripts/convert-cloud-icons.mjs`):** Built-in
  Apache-2.0 geometric glyphs cover all 19 `@diagram infrastructure` symbols;
  the reusable vendor SVG converter passes `admitSvgArtwork029` on `25/25` AWS,
  `19/19` GCP core, and `21/25` Azure official icons.

## Bundle size and cross-surface parity

- **`@coral-viz/browser` gzip budget:** **`799.80 KiB`** IIFE and ESM
  (`<= 800 KiB` gate passes; `352/352` tests across `20` files).
- **Cross-surface edition `0.2.14` parity:** Verified across
  `@coral-viz/language`, `@coral-viz/render`, `@coral-viz/browser`,
  `@coral-viz/viz`, `@coral-viz/mcp-server`, `tree-sitter-coral` (`116/116`
  Tree-sitter parity tests), and `@coral-viz/diagram-editor`.
- **Static & compatibility gates:** `npm run api-compat`, `npm run typecheck`,
  `npm run lint` (`0` errors), `npm run check:docs`, `npm run lint:md`,
  `npm run test:markdownlint`, and `npm run test:capability-truth` all pass.

## Owner review and final polish

The owner reviewed the gallery on `2026-11-25` and accepted node placement and
connector routing, retained the Apache-2.0 cloud built-ins plus the vendor
conversion script, and requested the following presentation adjustments:

- Keep `anemone` available for comparison but undocumented in authored user
  documentation and release notes; retain the monochrome defaults.
- Preserve the original Coral Inter font. The split gallery had removed the
  embedded font and exposed a browser fallback. It now displays the original
  SVG assets, including their embedded font, without modifying typography.
- Enlarge Crow's Foot variants by `1.4x` with unchanged contact anchors and
  edge routes. SVG and React projections share marker sizing and reserve the
  larger marker envelopes.

The approved grouped C4 routing fix checks every body and caption before
final validation. `bm07-c4-grouped-3zone` now has zero hard defects in both
styles, scores `92.00` (living `93.20`), and has no edge crossings. Across the
12-case comparison, both styles pass `12/12` with zero hard defects and a
mean of `96.91` (living `96.93`). The 40-case corpus remains `40/40` with zero
hard defects; its mean is `95.06`, compared with `95.13` before this targeted
repair and `93.83` in the published baseline.

Visual QA also found that filled group backgrounds could cover connectors in
`anemone`. Shared scenes and exported SVG now paint containers behind edges.
Regression tests verify shared-scene, React, and SVG paint order, marker
sizes, and the complete grouped C4 routing pipeline.

The final browser IIFE is `818997` bytes (`799.80 KiB`) under gzip level 9,
within the `819200`-byte ceiling. Validator message parity with Node is
preserved under strict CSP; generated error-object factoring saves space
without changing schema validation or public diagnostics.

Network-enabled local release gates passed on Linux x64:

- `audit:dependencies`: zero high/critical findings; 11 moderate findings are
  reported unchanged by the release audit policy.
- `smoke:consumer`: isolated runtime, type, artifact, and strict-CSP browser
  parity checks passed against the packed `0.2.14` packages.
- `smoke:native`: the packaged Tree-sitter grammar compiled and loaded under
  Node.js `26.8.2` with `tree-sitter@0.25.1`.

Publication remains subject to fresh exact-SHA final-candidate CI evidence
and explicit owner approval before promotion or registry mutation.

Final browser validation exposed a same-size node replacement race in React
Flow's cached handle measurements. `SymbolNode` now refreshes its batched
measurements when prepared parts or port contacts change. Regression coverage
includes the initialized keyboard edge-creation flow and same-size scene
replacement. All `922` viz tests and coverage floors passed; the reproducing
parallel keyboard scenario passed all six runs without retries.

## Final local product validation

- `npm run build`: all configured release builds passed.
- `npm run api-compat`: `61/61` API checks, `16/16` GraphIR adoption checks,
  and workspace typechecks passed.
- `@coral-viz/render`: `3087/3087` tests across `136` files passed.
- `@coral-viz/browser`: `352/352` tests across `20` files passed, including
  the `800 KiB` gzip gate.
- `@coral-viz/viz`: `922/922` tests across `51` files passed with coverage
  floors met (`87.79%` statements, `81.49%` branches, `88.35%` functions,
  `90.04%` lines).
- Final full Chromium E2E: `273/273` passed with zero retries after the
  same-size scene measurement fix.

Static controls passed after the final E2E run: ESLint reported zero errors,
Markdownlint checked all `147` files with zero issues, Markdown policy tests
passed `70/70`, documentation tests passed `38/38`, and capability-truth checks
passed. Workflow policy and its `16` tests passed, the `68` release/package
contract tests passed, and the redacted gitleaks scan found no leaks.
Exact-SHA final-candidate CI and explicit owner approval remain the promotion
and publication gates.
