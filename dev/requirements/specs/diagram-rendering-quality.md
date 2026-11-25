# Specification-as-AC: Diagram Rendering Quality and Layout Aesthetics

This decomposed specification serves as the normative Verification Acceptance
Criterion for `REQ-B5` and informs Tier 1 visual validation under `UN-04`
(`VAC-04.1`, `VAC-04.2`). It defines measurable geometric and typographic rules
for node and container layout, exhaustive catalog stencil classification,
connector routing hygiene, and direction-aware edge and endpoint label
placement across all visual render surfaces.

## Scope, Enforcement Classes and Precedence

1. **Automatic vs. authored geometry:** All `DRQ-*` rules govern Coral's
   automatic layout, sizing, routing, and label placement. Explicit authored
   coordinates, pins, ports, waypoints, or label placements take precedence per
   `REQ-B4`, except where they violate hard collision or validity contracts.
2. **Enforcement classes and release-target tags:** Dense or cyclic graphs can
   force geometric trade-offs. Every normative clause carries an explicit
   inline enforcement and target tag:
   - **`[MUST 0.2.10]` / `[MUST Post-0.2.10]` (Hard Invariant):** Zero
     violations allowed on valid automatic renders within that release
     baseline, except where a route explicitly emits a bounded
     `layout.route.degraded` warning under `REQ-B3` or an explicit exemption
     listed in the rule applies.
   - **`[SHOULD 0.2.10]` / `[SHOULD Post-0.2.10]` (Bounded Objective):**
     Prioritized layout quality goal verified on canonical fixtures and seeded
     multi-notation corpora using measurable regression bounds and the
     precedence hierarchy below.
3. **Objective precedence hierarchy (highest to lowest when constraints compete):**
   1. Hard collision freedom and text legibility (no node/caption overlaps, no
      text over dense artwork, zero distinct-port collinear edge overlap).
   2. Authored geometry and explicit spatial constraints (`REQ-B4`).
   3. Flow-direction consistency and semantic port-side assignment.
   4. Edge-crossing minimization and outer back-edge return channels.
   5. Visual center/middle alignment and branch symmetry.
   6. Bend parsimony, centered split/merge channels, and compact aspect ratio.
   7. Deterministic source-declaration ordering (mental-map stability).
4. **Routing profile applicability:**
   - **Orthogonal profiles** (`flowchart`, `aiml`, `data-engineering`, `bpmn`,
     `code`, `uml-class`, and any diagram explicitly requesting `ORTHOGONAL`
     routing) apply all `DRQ-01`–`DRQ-22` rules, including strict orthogonality.
   - **Polyline and spline profiles** (`block`, `architecture`, `sketch`) apply
     all node, text, clearance, exit, crossing, multi-edge, and label rules
     plus anti-hairpin checks; orthogonal-axis constraints apply only when
     `ORTHOGONAL` routing is explicitly requested.
   - **Specialized sequence layout** (`uml-sequence`) applies `REQ-D1`
     sequence integrity plus `DRQ-06` (sequence clause), `DRQ-10`, `DRQ-11`,
     `DRQ-15` (exempting lifeline stems, activation bars, and `alt`/`opt`/
     `loop` fragment borders that messages legitimately cross), `DRQ-20`
     (exempting compact `< 24 px` self-message loopbacks), and `DRQ-22`.
   - **Non-visual / disabled profiles:** `uml-state` (character-only) and `erd`
     (disabled) are excluded per
     [supported-diagram-types.md](supported-diagram-types.md).

## 1. Node, Symbol and Container Layout

| ID | Rule | Normative Criterion and Tagged Sub-Clauses |
| --- | --- | --- |
| **DRQ-01** | **Non-overlap and minimum node clearance** | `[MUST 0.2.10]` Unrelated leaf nodes and their outside captions maintain `0` bounding-envelope overlap in automatic layout across all visual profiles, with at least `16 px` separation between unconnected adjacent envelopes and at least `24 px` separation between facing sides connected by an automatic bent orthogonal route (supporting `DRQ-17` stubs). |
| **DRQ-02** | **Primary-axis 1-to-1 and column/row alignment** | `[MUST 0.2.10]` In unconstrained acyclic flows and pipelines, directly chained 1-to-1 nodes and vertically/horizontally paired rank neighbors align on their visual symbol middle (`abs(visualCenterY(a) - visualCenterY(b)) <= 1 px` in `RIGHT`/`LEFT`) or visual symbol center (`abs(visualCenterX(a) - visualCenterX(b)) <= 1 px` in `DOWN`/`UP`). `[SHOULD 0.2.10]` Preserve alignment under competing cyclic or multi-rank constraints per the precedence hierarchy. |
| **DRQ-03** | **Glyph-center alignment for outside-captioned and asymmetric symbols** | `[MUST 0.2.10]` For active outside-captioned catalog stencils and fixed-size BPMN `48 x 48` events/gateways with outside captions, flow-axis and rank alignment MUST anchor on the **glyph visual center** (not the caption-skewed composite bounding box), so mixed chains (`database -> tokenizer`, `training -> model`) and peer symbols in the same rank align cleanly on symbol centers with dead-level straight connectors when unconstrained. `[SHOULD Post-0.2.10]` Extend the same glyph-center alignment to document-local user symbols (`REQ-D2`) whose label sits `above`, `below`, `left`, or `right`. |
| **DRQ-04** | **Parent/child bisection, branching symmetry and balanced entries** | `[MUST 0.2.10]` In unconstrained acyclic pipelines and trees, `N -> 1` join nodes bisect the visual midpoint of their immediate upstream parent glyphs (`abs(visualCenter(join) - midpoint(visualCenters(parents))) <= 2 px`), `1 -> N` fork nodes bisect the visual midpoint of their immediate downstream child glyphs (`abs(visualCenter(fork) - midpoint(visualCenters(children))) <= 2 px`), and connected join-to-fork spines align coaxially so upstream joins and downstream outputs stay symmetric; dual entries on one side attach symmetrically around the node center. `[SHOULD 0.2.11]` When an upstream `N`-parent layer feeds a join node whose downstream spine shifts its center, translate the upstream parent column/row rigidly as a block so the middle parent connects to the join with a dead-straight `0`-bend connector rather than introducing a small offset jog. `[SHOULD Post-0.2.10]` Under competing decision/cyclic constraints, align straight with the primary continuation branch (affirmative branch on labeled decisions, or first declared outgoing edge in source order when unlabeled) while secondary branches offset cleanly. |
| **DRQ-05** | **Nested containers, sibling groups and BPMN pools/lanes** | `[MUST 0.2.10]` Automatically laid-out container children maintain `>= 16 px` uniform inner padding (preserving `0` top/left relative origin for explicit authored child coordinates per `REQ-B4`), `>= 8 px` title-to-child clearance, `>= 12 px` separation between nested parent and child container borders, and `0` sibling container overlap. `[MUST 0.2.11]` Peer leaf nodes stacked within the same rank inside a group align on their **visual glyph center** (`<= 1 px` cross-axis drift), matching flat-diagram alignment (`DRQ-02`/`DRQ-03`) rather than aligning caption-skewed composite boxes. `[SHOULD Post-0.2.10]` Sibling containers align cleanly with peer ranks, and BPMN pools and lanes stack as contiguous aligned swimlane bands sharing a common header axis. |
| **DRQ-06** | **Mixed-size ranks and specialized notation semantics** | `[SHOULD 0.2.10]` UML sequence lifelines maintain readable uniform horizontal spacing, top-aligned participant headers, monotonic vertical message order, centered activation bars, and fragment header clearance `>= 8 px`. `[SHOULD Post-0.2.10]` Heterogeneous ranks align consistently along their cross-axis centerline (or top/start baseline for structured UML class compartments), UML inheritance hierarchies place superclasses above subclasses, and annotations/notes/comments sit adjacent to their attached subject without inflating global rank gaps. |
| **DRQ-07** | **Uniform inter-rank rhythm** | `[SHOULD 0.2.10]` Consecutive layers maintain consistent inter-rank spacing governed by notation defaults with no inter-rank gap below the notation's minimum `nodeNode`/`layerSpacing` floor without authored pin overrides. |
| **DRQ-08** | **Disconnected components and multi-root packing** | `[SHOULD Post-0.2.10]` Two or more disconnected subgraphs pack deterministically with consistent separation (`>= 40 px`), aligned start margins, and balanced overall aspect ratio rather than an unbounded single-axis strip. |
| **DRQ-09** | **Deterministic ordering and mental-map stability** | `[MUST 0.2.10]` Identical inputs produce identical deterministic layout ordering and coordinates. `[SHOULD Post-0.2.10]` Source-declaration order breaks layout symmetry ties so minor local label edits or appended leaf nodes preserve unrelated sibling ordering. |

## 2. Symbol-Text Legibility and Exhaustive Catalog Stencil Classification

| ID | Rule | Normative Criterion and Tagged Sub-Clauses |
| --- | --- | --- |
| **DRQ-10** | **Uniform symbol sizing and exhaustive stencil classification (zero text over dense artwork)** | `[MUST 0.2.10]` Every catalog stencil in the table below is classified under Coral's Option 2 notation-aware placement rule. Outside-captioned symbols normalize into a **uniform canonical `100 x 80` glyph box** (`max(glyphW / 100, glyphH / 80) = 1`, independent of caption length, eliminating 2x–3x size mismatches between databases, models, neural nets, evaluators, and inference nodes in domain diagrams) via `REQ-B1` two-box geometry with `0` intersection between label ink and internal artwork strokes. Domain notations (`aiml`, `architecture`, `data-engineering`) apply outside captions to all non-container iconic stencils while keeping compact interior text in `rectangle`, `text-box`, and `note`; general flow notations (`flowchart`, `bpmn`, `erd`, `code`, `sketch`) retain interior text inside diamonds, pills, cylinders, hexagons, clouds, parallelograms, and boxes. |
| **DRQ-11** | **Open-interior text containment and padding** | `[MUST 0.2.10]` For all open-interior stencils (and for domain-adaptive stencils when rendered in `flowchart`, `bpmn`, `erd`, `code`, or `sketch`, plus UML class compartments), rendered text ink stays strictly inside the declared safe interior region with `>= 6 px` padding from outer border strokes and decorative headers/caps (such as cylinder top ellipses, document waves, and sidebars). |

### Normative Classification of All 32 Catalog Stencils

Every shape registered in `@coral-viz/render` carries one explicit text
placement class under Option 2:

| Text Placement Class | Catalog Shape IDs (32 total) | Target & Safe-Text Contract |
| --- | --- | --- |
| **Outside-captioned (always, all notations)** | `actor`, `brain`, `funnel`, `neural-net`, `cube`, `chip`, `chat-bubble`, `shield`, `gear`, `warehouse`, `lake`, `pipe`, `wave`, `dashboard` (14) | `[MUST 0.2.10]` Uniform canonical `100 x 80` glyph + below-glyph caption box (`REQ-B1` / `ISC-1`–`ISC-8`); zero text drawn inside artwork. |
| **Outside-captioned in domain notations; open-interior in general notations** | `cylinder`, `diamond`, `hexagon`, `cloud`, `parallelogram` (5) | `[MUST 0.2.10]` Uniform canonical `100 x 80` glyph + below-glyph caption in `aiml`, `architecture`, and `data-engineering` (`aiml-*`, `arch-*`, `data-*` symbols); centered or region-inset interior text in `flowchart`, `bpmn`, `erd`, `code`, and `sketch` (`DRQ-11`). |
| **Open-interior (region-inset)** | `document`, `stadium`, `subroutine`, `note` (4) | `[MUST 0.2.10]` Fixed-point wrap width inside declared open body sub-region clearing decorative waves, caps, sidebars, or corner folds (`ISC-6`, `DRQ-11`). |
| **Open-interior (standard)** | `rectangle`, `ellipse`, `trapezoid`, `triangle`, `text-box`, `sketch-rounded-rect`, `sketch-rect`, `sketch-oval`, `sketch-diamond` (9) | `[MUST 0.2.10]` Centered text inside open shape interior with `>= 6 px` stroke padding (`DRQ-11`). |

## 3. Connector Geometry, Orthogonality and Routing Hygiene

| ID | Rule | Normative Criterion and Tagged Sub-Clauses |
| --- | --- | --- |
| **DRQ-12** | **Strict orthogonality and anti-hairpin geometry** | `[MUST 0.2.10]` In `ORTHOGONAL` layouts without authored diagonal waypoints, every generated connector segment—including first and last contour-contact segments—satisfies `min(abs(dx), abs(dy)) <= 0.1 px`, **exempting only:** (a) bounded segments wholly inside their own endpoint node's box (`VerAC-B3.1`), (b) outward diagonal ray escapes from `REQ-D2` user-symbol interior anchors, (c) documented BPMN gateway diamond contour departures, and (d) routes carrying an explicit `REQ-B3` `layout.route.degraded` warning. `[MUST Post-0.2.10]` In `POLYLINE` and `SPLINES` profiles, generated interior bends prohibit sharp hairpin turns (`< 30°`). |
| **DRQ-13** | **Anti-sawtooth, anti-micro-jog, zero U-turns and clamped elbows** | `[MUST 0.2.10]` Generated routes merge collinear vertices (`<= 0.5 px`), contain `0` `180°` backtrack U-turns, prohibit multi-step sawtooth/staircase micro-jogs (`>= 2` consecutive opposite-turn bends with intervening segment `< 12 px`) and prohibit avoidable `< 12 px` S-jogs on alignable free ports—exempting a single unavoidable Z-step whose cross-axis length equals a constrained endpoint offset `Delta in (0.1 px, 12 px)` (such as fixed multi-port pitch or pinned nodes) and bounded interior-anchor contour escapes. `[MUST 0.2.10]` Softened elbow corner radii clamp to `<= 0.5 * min(adjacent segment lengths)` so arcs never invert or overshoot. |
| **DRQ-14** | **Zero distinct-port collinear overlap and crossing readability** | `[MUST 0.2.10]` Distinct connectors that do **not** share an identical fixed source port or identical fixed target port MUST have `0` collinear overlapping segment length (exempting routes carrying an explicit `REQ-B3` `layout.route.degraded` warning; intentional shared-port split/merge trunks are permitted). `[SHOULD Post-0.2.10]` Orthogonal crossings intersect at `90°` at least `8 px` from bends, arrowheads, and labels, and total crossings are minimized per the objective hierarchy. |
| **DRQ-15** | **Clearance from nodes, captions and container borders** | `[MUST 0.2.10]` Outside an endpoint's own approach segment, generated connectors maintain `>= 8 px` clearance from unrelated node contours and node captions (with `0` intersections through node bodies or captions, unless `layout.route.degraded` warns under `REQ-B3`). `[MUST Post-0.2.10]` Maintain `>= 8 px` clearance from group title bars; cross-boundary connectors cross container borders perpendicularly, never run collinearly atop a container border stroke, and never dip through unrelated sibling containers. |
| **DRQ-16** | **Direction-general captioned-glyph exit hygiene (No Chin-Bar)** | `[MUST 0.2.10]` Across **all** layout directions (`RIGHT`, `LEFT`, `DOWN`, `UP`) and external caption sides (`above`, `below`, `left`, `right`), free/automatic ports on a captioned node MUST attach to non-caption-facing glyph contours (e.g., `EAST`/`WEST`/`NORTH` for bottom captions) and MUST NOT exit a caption-facing glyph edge only to cut horizontally or vertically across the narrow glyph-to-caption gap. `[MUST Post-0.2.10]` When an explicit named/semantic or authored port sits on a caption-facing side (such as `aiml-llm.tools` on `SOUTH` or a user-symbol side port), anchor on the caption-cleared outer side boundary or displace the caption away from that port side rather than trapping routes in the `6–10 px` gap. |
| **DRQ-17** | **Semantic port-side selection, multi-port distribution and square stubs** | `[MUST 0.2.10]` Every generated connector enters and exits its visible contour on a straight stub of length `>= min(10 px, 0.4 * availableCorridorGap)` aligned with the arriving lane/port side so arrowheads sit flush and upright. `[MUST 0.2.10]` When `K` automatic edges attach to one node side, anchors distribute symmetrically with `>= 10 px` port-to-port spacing and `>= 8 px` corner inset where side length permits, compressing symmetrically to no less than a `>= 4 px` pitch floor (or growing an auto-sized side) so high-fan-in ports never collapse onto one coordinate. `[SHOULD 0.2.10]` Forward edges prefer flow-consistent sides (`EAST -> WEST` in `RIGHT`, `SOUTH -> NORTH` in `DOWN`, subject to `DRQ-16`). `[SHOULD Post-0.2.10]` Decisions and gateways assign primary and alternate branches to distinct sides. |
| **DRQ-18** | **Distinct shaft separation, parallel multi-edges and centered split/merge channels** | `[MUST 0.2.10]` Distinct-port parallel or converging shafts in shared corridors maintain `>= 8 px` separation without hugging neighboring node silhouettes (exempting `layout.route.degraded` warnings). `[MUST Post-0.2.10]` Multi-edges (`A -> B` twice) and bidirectional pairs (`A <-> B`) use distinct offset tracks (`>= 12 px` or separated port contacts) with non-overlapping arrowheads. `[SHOULD Post-0.2.10]` Orthogonal `1 -> N` fan-out and `N -> 1` fan-in split/merge trunks center cleanly in the inter-rank channel rather than crowding either endpoint. |
| **DRQ-19** | **Self-loops, back-edge return channels and bend parsimony** | `[SHOULD 0.2.10]` Aligned 1-to-1 neighbors use `0` bends and unobstructed single-axis offsets use `<= 2` bends. `[MUST Post-0.2.10]` Self-loops (`A -> A`) exit externally with `>= 16 px` loop clearance, separated source/target stubs, and `0` body/caption intersection. `[SHOULD Post-0.2.10]` Cyclic back-edges route along a dedicated outer return channel rather than weaving across forward layers. |

## 4. Connector and Endpoint Label Placement

| ID | Rule | Normative Criterion and Tagged Sub-Clauses |
| --- | --- | --- |
| **DRQ-20** | **Direction- and side-aware mid-edge label placement** | `[MUST 0.2.10]` Explicit authored `labelPlacement` (`side`, `at`, `offset`) overrides defaults per `REQ-B4`. Automatic mid-edge labels anchor on an unobstructed straight span at least `12 px` from 90° bends and arrowheads when span length `>= labelExtent + 24 px`; if authored node positions (`REQ-B4`) narrow the span below `labelExtent + 24 px`, center the label on the longest available segment and offset perpendicularly by `>= 4 px` to clear strokes and arrowheads. `[SHOULD 0.2.10]` Default side offsets follow segment orientation deterministically: above horizontal segments (`>= 4 px` gap) and unobstructed right or outside-flow side of vertical segments (`>= 6 px` gap). `[SHOULD Post-0.2.10]` Opposite-side placement for bidirectional pairs and longest-middle-span optimization. |
| **DRQ-21** | **Endpoint role and multiplicity label placement** | `[MUST Post-0.2.10]` Domain endpoint labels (UML class, architecture, and relationship `role` and `multiplicity` at source/target ends) anchor adjacent to their endpoint stub on opposite sides of the connector, maintaining `>= 4 px` clearance from arrowheads, node borders, node captions, and sibling endpoint labels. |
| **DRQ-22** | **Global label collision freedom** | `[MUST 0.2.10]` Placed connector labels maintain `>= 4 px` clearance from connector strokes, arrowheads, unrelated node contours, and node captions. `[MUST Post-0.2.10]` Placed mid-edge and endpoint labels also maintain `>= 4 px` clearance from group title bars and all sibling connector/endpoint labels. |
| **DRQ-23** | **Global visual balance, whitespace symmetry and readable aspect** | `[SHOULD 0.2.11]` Automatically laid-out diagrams balance their visual center of mass near the viewport center (`symmetrySkew <= 0.15` along the cross-axis on balanced DAGs), avoid sprawling voids (`fillRatio` within healthy readability bounds for node count), and maintain readable aspect proportions (`0.35 <= width / height <= 4.0` unless dictated by a linear chain). |

## 5. Mechanical Quality Gate and Structured Visual Inspection (`0.2.11`)

Every layout verification run evaluates rendered scenes through the mechanical
quality gate (`packages/render/src/quality/diagramQuality0211.ts`) across three
tiers:

| Gate Tier | Scope | Measured Signals & Linked Rules |
| --- | --- | --- |
| **Tier 1 — Hard Invariants (0 allowed)** | Automated fail-fast check on every rendered scene | `nodeNodeOverlaps` (`DRQ-01`), `edgeNodeCrossings` (`DRQ-15`), `edgeTextCrossings` (`DRQ-15`, `DRQ-22`), `textTextOverlaps` (`DRQ-01`, `DRQ-22`), `coincidentEdgeSpans` (`DRQ-14`, `DRQ-18`), `collidingPortContacts` (`DRQ-17`), `nonOrthogonalSegments` (`DRQ-12`), `microJogs` (`DRQ-13`), `clippedElements` (`DRQ-11`). |
| **Tier 2 — Layout Aesthetics (0–100 score)** | Automated quantitative regression score | `edgeCrossings` (`DRQ-14`), `bendsPerEdge` & `straightEdgeRatio` (`DRQ-19`), `avoidableJogs` (`DRQ-02`, `DRQ-04`), `normalizedWireLength`, `minCorridorGap` (`DRQ-18`), `intraGroupAlignmentMaxPx` (`DRQ-05`), `globalAlignmentMedianPx` (`DRQ-02`, `DRQ-03`), `fillRatio`, `symmetrySkew`, and `aspectRatio` (`DRQ-23`). |
| **Tier 3 — Structured Visual Rubric** | Mandatory human/agent review on Chromium PNGs | Explicit per-diagram log covering: (1) every fan-in with degree `>= 2`, (2) every fan-out with degree `>= 2`, (3) every group's internal alignment and border crossings, (4) every node caption and edge label, and (5) overall flow clarity and balance. |

## Linked Human Validation (Tier 1)

Automated `DRQ-01`–`DRQ-22` checks verify Tier 2 geometry contracts (`REQ-B5`)
but do not replace human visual review. Release sign-off requires inspecting
true-font Chromium renders of the validation diagrams under
[VAC-04.1 and VAC-04.2](../user-needs.md#un-04-scannable-publication-ready-visual-legibility-and-layout-reliability).
