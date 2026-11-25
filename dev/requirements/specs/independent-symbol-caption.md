# Specification-as-AC: Independent Symbol and Caption Sizing

This decomposed specification defines the detailed acceptance criteria and
GraphIR coordination contract for `UN-04`, `REQ-B1`, and `REQ-E3` in Coral
`0.2.10` (renderer robustness Phase 5 / RR-6).

## Problem Statement

Prior to `0.2.10`, captioned glyph stencils (`actor`, `brain`, `funnel`) bound
caption height to a fixed fraction of an aspect-locked outer frame, while dense
mesh stencils such as `neural-net` drew text directly across internal linework.
Long descriptive labels caused quadratic frame growth (a 67-character caption
inflated a `brain` symbol to `354 x 461 px` and stretched a 7-node AI/ML
pipeline past `4,800 px`), forcing authors to abandon domain notations or
shorten labels.

## Normative Geometry Contract (Verification AC)

| ID | Rule | Target | Observable Verification Check |
| --- | --- | --- | --- |
| **ISC-1** | **Glyph invariance** | `0.2.10` | For all `0.2.10` outside-captioned stencils (`actor`, `brain`, `funnel`, `neural-net`), changing caption text across empty, 5, 26, 67, and 100 characters (plus multiline and long unbroken tokens) keeps painted glyph `width`, `height`, and glyph-relative port coordinates identical (`delta = 0`) within the same sizing mode and authored dimensions. |
| **ISC-2** | **Independent caption box & wrap parity** | `0.2.10` | Each captioned glyph has a separate measured caption box with its own wrap width (for example, `max(glyphWidth, defaultCaptionWrapWidth)` unless overridden). Sizing and painting use the exact same wrap width so line breaks and ink bounds agree 100%. |
| **ISC-3** | **Overflow & hard-size policy** | `0.2.10` | Long unbroken tokens (such as URLs or hashes) expand up to a bounded width ceiling (`max(wrapWidth, 320 px)`) and then wrap deterministically at grapheme boundaries so `100%` of label text remains readable without horizontal blowout or silent truncation. When explicit authored `dimensions` (`REQ-B4`) cannot contain measured label ink (including a shrunken caption band), Coral emits a located `render.capability.hard-size-text-conflict` diagnostic rather than silently clipping unmeasured ink. |
| **ISC-4** | **Two-box obstacle & contour semantics** | `0.2.10` | Caption ink clears its own glyph and surrounding diagram elements. Generated routes attach to non-caption-facing **glyph contours** (not the caption box, per `DRQ-16`) and treat the **caption box as an occupied obstacle** so connectors never cross caption text. Explicit caption-facing semantic/authored ports follow `DRQ-16` resolution rules. |
| **ISC-5** | **Glyph resize independence** | `0.2.10` (internal API); `Post-0.2.10` (authored controls) | **0.2.10 Baseline:** Passing an explicit `glyphSize` to the shared sizing/frame geometry helper preserves caption typography and `captionWrapWidth` independently. **Post-0.2.10 Target:** Authored DSL/GraphIR glyph-size and caption-width controls (`G-3`/`G-4`) preserve caption typography and wrap width unless the author explicitly changes caption settings. |
| **ISC-6** | **Text-region stencil stability** | `0.2.10` | Open-interior region-inset stencils (`cylinder`, `document`, `hexagon`, `stadium`, `parallelogram`, `cube`, `warehouse`, `chat-bubble`, `subroutine`, `pipe`, `note`) solve for a fixed-point frame size where sizing wrap width equals painted wrap width inside the fitted safe region (`DRQ-11`) so area grows at most linearly with label length (never quadratically). |
| **ISC-7** | **Cross-surface parity** | `0.2.10` | Editor canvas, `@coral-viz/browser`, `@coral-viz/render` SVG/HTML export, and `coral_render` MCP output produce equivalent glyph bounds, caption bounds, anchors, and routes for the same input (within the bundled font repertoire per `REQ-B2`). |
| **ISC-8** | **Persistence & round-trip** | `0.2.10` | Save, reopen, reflow, and GraphIR export/re-import preserve authored source, semantics, sizing behavior, and supported authored geometry without rewriting derived bounds into authored text. |

## Coordinated GraphIR Evaluation and 0.2.10 Decision

Coral maintainers also maintain `graph-ir` and `graph-ir-tools`. A GraphIR
schema change is acceptable and often cleaner than hiding authored layout
intent inside Coral-only heuristics—it simply requires explicit cross-repo
coordination.

The `0.2.10` GraphIR evaluation is recorded in
graphir-symbol-caption-rfc.md
and renderer robustness status:

| Case | Scenario | Current GraphIR Representation | 0.2.10 Evaluation Outcome |
| --- | --- | --- | --- |
| **G-1** | Automatic captioned sizing: catalog glyph + long descriptive `label` | `symbol` + `label` + font/profile | **Coral-owned in `0.2.10`.** Deterministic derivation from existing GraphIR data with zero schema break. |
| **G-2** | Explicit authored outer size or position (`@ (x, y)`, `pinned`) on a captioned node | Single node `position` + `dimensions` | **Coral-owned in `0.2.10`.** Outer box scales proportionally on shrink while preserving authored frame; explicit glyph-only anchoring tracked alongside `G-3`. |
| **G-3** | Authored independent glyph size vs. caption wrap width (e.g., resizing glyph without changing caption wrap, or setting explicit caption width) | Single `dimensions` box cannot express both independently | **Coordinated additive GraphIR RFC prepared** (`GraphNode.symbolDimensions?: Dimensions` and `NodeLabelPlacement.maxWidth?: number`), scheduled when authored resize/caption UX enters scope. |
| **G-4** | Authored caption placement/offset relative to glyph | Existing label placement covers basic anchors; free offset or explicit wrap width needs additive fields | **Covered by coordinated additive GraphIR RFC** alongside `G-3` when arbitrary authored caption placement enters scope. |

### Cross-Repository Coordination Checklist (When GraphIR Changes Ship)

When the additive GraphIR schema update (`G-3`/`G-4`) enters an active release
slice:

1. **Schema & types (`graph-ir`):** Publish additive fields
   (`symbolDimensions`, `labelPlacement.maxWidth`), JSON Schema, and TypeScript
   types with backwards-compatible defaults for existing documents.
2. **Validation & migrations (`graph-ir-tools`):** Update validators and add
   explicit migration adapters so prior GraphIR documents upgrade cleanly
   without silent relabeling.
3. **Coral adoption:** Pin the exact published `@graph-ir/core` version and
   integrity hash per `ENG-02`, update `@coral-viz/language` (following
   `ENG-06` HITL review if saved Coral syntax changes), update
   `@coral-viz/render`, and verify direct/worker/editor/browser/MCP round-trips.

## Linked Human Validation (Tier 1)

Automated `ISC-1`–`ISC-8` checks do not by themselves validate `UN-04`. Release
acceptance also requires executed human evidence for `VAC-04.1` (multi-domain
completion trial including the AI/ML pipeline in `RIGHT` and `DOWN` with zero
workarounds) and `VAC-04.2` (cold-reader 30-second scannability and visual
polish check on true-font Chromium renders) recorded in
[user-needs.md](../user-needs.md#un-04-scannable-publication-ready-visual-legibility-and-layout-reliability).
