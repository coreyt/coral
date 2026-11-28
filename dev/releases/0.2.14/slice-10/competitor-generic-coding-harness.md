# Competitor analysis: Generic Coding Harness (inline JSX/SVG widgets)

Recorded: `2026-11-27`. Competitor archetype: **Generic Coding Harness**
(an AI coding/document harness that generates standalone hand-placed JSX/SVG
widget modules embedded directly inside a hosted document runtime, with no
diagramming DSL, IR, or layout engine).

## 1. Architectural model

Rather than authoring a semantic diagram language and running a layout/routing
engine, the Generic Coding Harness writes a single-line ~8 KB JSX module
(`export default () => { ... return <svg>...</svg>; }`) directly into a host
document node:

- **100% manual geometry:** Every box, arrow, and label uses hand-typed pixel
  coordinates (e.g., `viewBox="0 0 760 688"`, 10 `rect`, 13 `path`, 44 `text`,
  7,968 bytes for a single architecture diagram). No automatic layout, port
  allocation, or orthogonal routing exists.
- **Host-coupled runtime & styling:** Contains no `import`, `require`, `fetch`,
  `<style>`, `<use>`, or `<foreignObject>`, and omits `xmlns` and `font-family`.
  Every colour depends on host CSS custom properties (59 `var(--...)` token
  references across 4–5 host tokens).
- **Document-native annotation hooks:** Every editable text span carries a
  literal text-ID attribute (e.g., 44 unique IDs) and each logical box or
  connector group sits in a `<g>` with a literal named anchor (e.g., 13
  anchors), written outside loops so the host validator can index them for
  in-place label wording edits and part-level comments.
- **Staged validation & publishing:** Writes pass through a deterministic host
  validator (forbidding randomness, clocks, and window/parent escape) with a
  draft/publish lifecycle that keeps the last valid render live on errors.

## 2. Observed strengths (what Coral should respect)

1. **Unbounded bespoke drawing inside the host:** Because the harness emits raw
   SVG primitives with ad-hoc helper functions, it can sketch one-off domain
   visuals without waiting for a catalog symbol.
2. **In-place label edits and part-level comments:** Literal label IDs and
   named group anchors let readers edit wording or comment on a single box or
   connector inside the host doc without touching geometry.
3. **Safe draft/publish lifecycle:** Invalid code drafts are staged with
   diagnostics and refused at publish while the live page retains the last good
   diagram.
4. **Automatic host light/dark theming (in-app only):** Binding colours to host
   CSS tokens adapts automatically to the host viewer's theme.

## 3. Structural weaknesses vs. Coral

| Dimension | Generic Coding Harness (raw JSX/SVG) | Coral (`0.2.14`) |
| --- | --- | --- |
| **Authoring & maintenance** | ~8 KB single-line JSX of hand-typed `(x, y)` coordinates; adding a node or lengthening a label requires manual coordinate recalculation; overflow is clipped by `viewBox`. | ~20–30 lines of standardized, Git-diffable DSL (`id type [fields] as "Label"`) across 12 notations; automatic deterministic reflow via `ELK` + `libavoided-js` (`95.13/100`, `0` hard defects). |
| **Portability & self-containment** | Not standalone as a file: requires JSX transpile, lacks `xmlns` and `font-family`; without host CSS tokens, Chrome drops all box outlines and connector lines. | Truly standalone offline SVG, HTML, and `<coral-diagram>` custom element (`@coral-viz/browser`, Shadow-DOM isolated, embedded portable fonts, CSP-safe). |
| **HTML & Markdown export** | **Silently dropped in HTML** (`0` `<svg>`, `0` `<img>`, empty `<figure>` with no warning); dropped in Markdown with placeholder caption only. | First-class vector SVG and self-contained HTML export; saved source is plain text that embeds cleanly in Markdown and Git. |
| **PDF & print fidelity** | Flattened to a light-theme **1344×1230 raster PNG (192 ppi)** in PDF and Word: loses zoom sharpness, loses text search/copy (`0` hits in `pdftotext`), loses dark theme, drops label-level accessibility, and triggers awkward page gaps (`41%` blank page). | Native vector SVG output preserves crisp zoom, selectable/searchable text, accessible semantic structure (`role="img"`, titles, part IDs), and both light and dark themes. |
| **Visual editing & refinement** | Read-only geometry in viewer; only label wording edits and comments persist. No drag/move, reflow, or layout switching. | Local-first visual editor (`diagram-editor` / `@coral-viz/viz`) paired with byte-preserving source transactions, keyboard authoring, and Mermaid/DOT/PlantUML import. |
| **Semantic model & conformance** | None — raw SVG shapes only; no GraphIR, no notation rules, no format conversion, and no cross-diagram nomenclature. | Full `GraphIR` pipeline with U1 interpretation, U2 conformance checking, reusable catalog digests, and MCP tools (`@coral-viz/mcp-server`) for AI agents. |
| **Drill-down / click-through** | None (`0` `<a>`, `0` `href`, `0` handlers); relies on doc-level heading links, sub-tabs, or splitting into separate diagrams. | Not yet in `0.2.x`; planned candidate capability for `0.3.x` (node-level click-through links / drill-down). |

## 4. Strategic takeaways for Coral

1. **Positioning for humans & AI agents:** The Generic Coding Harness proves
   why "just have an LLM write raw SVG/JSX" breaks down in real engineering
   workflows. It looks impressive on a first one-shot render inside a walled
   garden, but fails at iterative edits (manual coordinates), portability
   (broken without host CSS), publishing (silently dropped in HTML/Markdown,
   rasterized to non-searchable PNG in PDF), and Git code review. Coral's MCP
   server (`@coral-viz/mcp-server`) gives any coding harness a deterministic,
   maintainable, vector-clean alternative.
2. **Existing Coral advantage to highlight:** Coral already emits deterministic
   part-level DOM hooks (`data-coral-node`, `data-coral-edge`,
   `data-coral-part-id`) in every rendered SVG — enabling host platforms to
   attach part-level comments or in-place label editing without brittle
   unrolled JSX loops.
3. **Future roadmap inputs (`0.3.x`):**
   - **Click-through / drill-down navigation (`0.3.x`):** Declarative links on
     nodes/boundaries (e.g., jumping to a section anchor or child diagram) will
     surpass both doc widgets and static diagram tools.
   - **Optional host-token theme mode:** Keep standalone literal colours +
     embedded fonts as the rock-solid default, while considering an opt-in CSS
     variable bridge for host doc embeds that want native theme syncing.
