# Proposed GraphIR changes for Coral authored spatial intent

Status: candidate final contract for Graph-IR review. Breaking changes are
permitted because both Graph-IR and Coral are pre-1.0. Release-number allocation
is deliberately out of scope. This revision incorporates Graph-IR's semantic
review and closes its remaining normative geometry questions.

The [document-local user symbol additions](#proposed-graphir-4-additions-for-document-local-user-symbols)
are a separate proposal for Coral 0.2.9 Slice 60, added and reviewed
2026-10-28. They revise the GraphIR 4 candidate with enumerated tightenings
and do not reopen the accepted spatial contract above them.

## Purpose

Coral proposes a GraphIR contract that can represent a diagram's authored
meaning without requiring ordinary source files to contain computed geometry.
The normal Coral file should remain a simple definition of objects and
connections. Relative placement is exposed only when automatic layout needs a
hint. Exact coordinates are a last resort.

The proposed ownership boundary is:

```text
Coral DSL
  -> authored GraphIR
  -> transient Coral layout request
  -> engine-specific request
  -> candidate resolved geometry
  -> constraint verification and repair
  -> rendering and optional continuity cache
```

GraphIR owns portable graph meaning and authored layout intent. Coral owns the
textual projection and execution policy. Layout adapters own engine-specific
lowering. Computed geometry, diagnostics, partial solver state, camera,
selection, history, collaboration, and workspace navigation remain outside
authored GraphIR.

## Design principles

1. A graph with no spatial clauses remains complete and useful.
2. Relative intent is preferable to exact coordinates.
3. Portable meaning must not depend on an editor session or ELK option.
4. Authored intent and computed geometry are distinct representations.
5. Required constraints are observable guarantees, not best-effort hints.
6. Accepted preferred constraints are guarantees; rejected preferences may
   remain unsatisfied but must be reported by ID.
7. Stable identity is required for constraints and authored waypoints.
8. GraphIR defines meaning without prescribing a solver algorithm.

> **Review annotation — accepted:** Graph-IR's ownership boundary and feature
> inventory match Coral's proposal. The refinements below make the portable
> meaning deterministic without putting solver mechanics or engine options into
> GraphIR.

## Proposed GraphIR changes

### 1. Add first-class edge descriptions

```ts
interface GraphEdge {
  description?: string;
}
```

#### Coral justification

`GraphNode` already has a first-class description. Coral currently stores edge
descriptive text in `edge.properties.description` because GraphIR has no
equivalent edge field. That convention conflates a common semantic field with
opaque extension data and forces Coral's parser, printer, prompts, and UI to
treat node and edge descriptions differently.

A first-class field restores symmetry, makes the field discoverable to all
consumers, and removes the need for a Coral-only property convention.

### 2. Add edge-label placement

```ts
type PlacementSide = 'above' | 'below' | 'left' | 'right' | 'center';

interface EdgeLabelPlacement {
  side: PlacementSide;
  at?: number;
  offset?: number;
}

interface GraphEdge {
  labelPlacement?: EdgeLabelPlacement;
}
```

`at` selects a point by arc length from source to target along the resolved path
and is in the inclusive range `0..1`; omission means `0.5`. Placement is
page-relative and uses the label's measured bounding box:

- `above` places the label's bottom edge `offset` units above the selected
  point;
- `below` places its top edge `offset` units below the point;
- `left` places its right edge `offset` units left of the point;
- `right` places its left edge `offset` units right of the point; and
- `center` places the label center at the point.

`offset` is a finite non-negative distance in diagram units and defaults to
`0`. For `center`, it must be omitted or `0`.

> **Review annotation — accepted:** This replaces the contradictory combination
> of page-relative side words and a path-perpendicular offset. The bounding-box
> rule remains stable for diagonal and curved routes and can be implemented
> independently by Coral and headless renderers.

#### Coral justification

GraphIR currently carries edge-label text but no authored placement. Coral and
headless renderers therefore place labels at a computed midpoint, and a visual
label move has no portable destination. This field lets the DSL describe a
small intent such as `label below` without exposing path coordinates. The
normalized position and offset are available only when finer control is needed.

The field describes portable placement intent. Label measurement, collision
avoidance, and translation to ELK labels remain layout/rendering work.

### 3. Add node-label placement

```ts
interface NodeLabelPlacement {
  side: PlacementSide;
  offset?: number;
}

interface GraphNode {
  labelPlacement?: NodeLabelPlacement;
}
```

Node placement uses the same page-relative bounding-box convention against the
node bounds. For example, `below` places the label's top edge `offset` units
below the node's bottom edge. `center` aligns the label and node centers and
requires an omitted or zero offset. Offset defaults to `0`.

> **Review annotation — accepted:** Reusing one bounding-box convention avoids
> renderer-specific interpretations and makes node and edge label syntax
> predictable.

#### Coral justification

Coral symbols are not all box-like. Icon-oriented and annotation-oriented
symbols often need a label outside the shape. Today node labels are effectively
fixed to a renderer-selected position. A first-class field gives every symbol
the same portable label-placement capability and avoids storing layout meaning
inside symbol variants or arbitrary properties.

The simple case is one side word. Offset is optional advanced control.

### 4. Add narrow typed references for constraints and routes

```ts
type ConstraintNodeReference = { kind: 'node'; nodeId: string };

type RouteAnchor =
  | { kind: 'source' }
  | { kind: 'target' }
  | { kind: 'node'; nodeId: string }
  | { kind: 'port'; nodeId: string; portId: string };
```

#### Coral justification

Coral's current placement operations are node/group relationships. In the
initial contract, relative and arrangement constraints therefore accept only
node references; container/groups are nodes. A boundary scope may be the graph
or a container node. Labels use their dedicated placement fields. Route intent
uses its own anchor union because ports and edge endpoints are meaningful there.

Typed references keep GraphIR independent of Coral's surface spelling and make
namespace and admissibility validation explicit.

> **Review annotation — accepted with intentional scope reduction:** A universal
> spatial-reference union permits circular cases, such as placing a node from an
> edge whose route depends on that node. Edge- and label-referencing constraints
> are deferred until a concrete use case supplies staged or fixed-point
> semantics. This does not block Coral's current node/group placement, label
> placement, or route-waypoint needs.

### 5. Add an ordered, identified spatial-constraint model

```ts
type ConstraintStrength = 'required' | 'preferred';
type ConstraintAlignment = 'start' | 'center' | 'end';

interface ConstraintBase {
  id: string;
  strength?: ConstraintStrength;
  sourceInfo?: SourceInfo;
}

interface RelativeConstraint extends ConstraintBase {
  kind: 'relative';
  subject: ConstraintNodeReference;
  relation: 'above' | 'below' | 'left-of' | 'right-of';
  target: ConstraintNodeReference;
  gap?: number;
  alignment?: ConstraintAlignment;
}

interface BoundaryConstraint extends ConstraintBase {
  kind: 'boundary';
  subject: ConstraintNodeReference;
  side: 'top' | 'bottom' | 'left' | 'right';
  scope: { kind: 'graph' } | { kind: 'node'; nodeId: string };
  inset?: number;
}

interface ArrangementConstraint extends ConstraintBase {
  kind: 'arrangement';
  subjects: ConstraintNodeReference[];
  axis: 'row' | 'column';
  direction?: 'forward' | 'reverse';
  gap?: number;
  alignment?: ConstraintAlignment;
}

type SpatialConstraint =
  | RelativeConstraint
  | BoundaryConstraint
  | ArrangementConstraint;

interface GraphIR {
  constraints?: SpatialConstraint[];
}
```

Constraint IDs are unique and stable. Omitted `strength` means `required`.
Required constraints form an unordered conjunction: all must hold in final
published geometry. Preferred constraints are considered in array order. A
preferred constraint is accepted only if it remains jointly satisfiable with
all required and all previously accepted preferred constraints. Rejection
produces a diagnostic naming the constraint ID. Arrangement subject order is
independently significant. No numeric priority is defined. Every accepted
preferred constraint must hold in final published geometry. Only rejected
preferred constraints may remain unsatisfied.

GraphIR defines these additional defaults and invariants:

- omitted `gap`, `inset`, and label `offset` mean `0`;
- omitted constraint `alignment` means `center`;
- an arrangement has at least two unique subjects;
- all distances are finite and non-negative;
- a node boundary scope is valid only when it names a transitive ancestor
  container of the subject;
- `pinned: true` without an authored position is invalid; and
- a required constraint that conflicts with a pinned anchor makes layout fail.

#### Normative rectangle semantics

All constraint equations are evaluated in graph-absolute coordinates, where
`x` increases rightward and `y` increases downward. For a resolved rectangle
`r = { x, y, width, height }`, define:

```text
L(r)  = r.x
T(r)  = r.y
R(r)  = r.x + r.width
B(r)  = r.y + r.height
CX(r) = (L(r) + R(r)) / 2
CY(r) = (T(r) + B(r)) / 2
```

For subject `s`, target `t`, and gap `g`, relative relations mean minimum
separation:

```text
above:   B(s) + g <= T(t)
below:   T(s) >= B(t) + g
left-of: R(s) + g <= L(t)
right-of: L(s) >= R(t) + g
```

For `above` and `below`, alignment adds `L(s) = L(t)` for `start`,
`CX(s) = CX(t)` for `center`, or `R(s) = R(t)` for `end`. For `left-of`
and `right-of`, alignment adds `T(s) = T(t)`, `CY(s) = CY(t)`, or
`B(s) = B(t)`, respectively.

For a boundary constraint, let `q` be the final outer layout box of the graph or
referenced ancestor container node. External node, edge, or port labels do not
enlarge `q` for boundary evaluation. A node scope must be a transitive ancestor
container of the subject; sibling, descendant, and unrelated node scopes are
invalid. The subject must be contained by `q`:

```text
L(s) >= L(q), T(s) >= T(q), R(s) <= R(q), B(s) <= B(q)
```

The selected side additionally means:

```text
top:    T(s) = T(q) + inset
bottom: B(s) = B(q) - inset
left:   L(s) = L(q) + inset
right:  R(s) = R(q) - inset
```

For arrangement subjects `[n0, ..., nk]`, omission of `direction` means
`forward`. A forward row is left-to-right and a forward column is top-to-bottom;
`reverse` uses the opposite page direction. Consecutive subjects have minimum
separation `g`:

```text
row forward:    R(ni) + g <= L(ni+1)
row reverse:    L(ni) >= R(ni+1) + g
column forward: B(ni) + g <= T(ni+1)
column reverse: T(ni) >= B(ni+1) + g
```

Row alignment makes every subject's `T`, `CY`, or `B` equal to the first
subject for `start`, `center`, or `end`. Column alignment similarly equates
`L`, `CX`, or `R`. Container-relative rectangles are converted to
graph-absolute coordinates before these equations are evaluated.

> **Review annotation — accepted:** These equations close the portable meaning
> of relative, boundary, alignment, and arrangement constraints. Minimum-gap
> inequalities preserve a layout engine's useful spacing while still making the
> requested non-overlap guarantee exact. The direction default is independent
> of engine conventions and locale.

> **Review annotation — accepted:** Restricting node scopes to ancestor
> containers makes `within` semantics match GraphIR containment and avoids
> treating arbitrary overlapping node rectangles as coordinate systems.
> Excluding external labels keeps a label measurement change from moving a
> boundary-constrained node.

> **Review annotation — accepted with an implementation qualification:** The
> ordered-acceptance rule gives independent implementations the same observable
> semantics. It does not imply that Coral's current sequential transforms are a
> satisfiability solver. Coral must choose or build a deterministic strategy
> capable of testing the accepted set before publishing geometry.

#### Coral justification

Coral can currently save only the coordinate result of commands such as “place
Auth above Orders.” Reflow discards the relationship because GraphIR has no
carrier for it. A constraint list lets the authored meaning survive parsing,
printing, save/reopen, headless use, and later layout.

Stable IDs are necessary for editing, diagnostics, source rewrites, and
cross-revision reconciliation. `required | preferred` provides the minimum
useful distinction without introducing an arbitrary numeric priority system.
Ordering supplies deterministic preferred-constraint acceptance, while
arrangement member order remains a separate part of arrangement meaning.

GraphIR validation should cover structural validity: unique IDs, valid
references, allowed subject kinds, valid boundary-scope ancestry, finite
non-negative distances, and contradictions that can be proven without layout.
Geometry-dependent unsatisfiability and rejected preferred constraints belong
to layout diagnostics.

### 6. Add authored route intent with stable waypoint identity

```ts
interface RouteIntent {
  waypoints: RouteWaypoint[];
}

interface RouteWaypoint {
  id: string;
  placement: WaypointPlacement;
}

type WaypointPlacement =
  | {
      kind: 'absolute';
      position: Position;
    }
  | {
      kind: 'relative';
      anchor: RouteAnchor;
      offset: Position;
    };

interface GraphEdge {
  routeIntent?: RouteIntent;
}
```

Waypoint IDs are unique within their containing edge. `source` and `target` mean
the resolved, port-aware edge attachment points. A node anchor means its center
unless an explicit port is named. Offsets are graph-axis vectors. The resolved
route must pass through the waypoints in array order. An anchor may not refer to
the containing edge or its label; cyclic route resolution is not part of this
contract.

The initial contract has no waypoint shape or smoothing field. A waypoint
guarantees incidence and order, not tangent continuity or a visible corner. A
future smoothing feature must define curve representation and tangent behavior
before becoming portable GraphIR.

> **Review annotation — accepted:** Omitting `smooth` avoids promising behavior
> that current routers cannot guarantee consistently. These rules complete the
> portable meaning of relative waypoints while keeping the common source/target
> case concise. Nested coordinate conversion remains layout work, not an
> ambiguity in the authored anchor.

#### Coral justification

Coral currently maps authored `via` points to `routingPoints`, the same shape
used for computed bends. Stable waypoint identity lives in a Coral document
side table instead of portable GraphIR. Consequently a
standalone DSL or GraphIR graph cannot distinguish the user's route definition
from a layout engine's output.

`routeIntent` makes authored routing portable. Relative placement lets a
waypoint remain near a source, target, node, or port after reflow without
requiring the source file to repeat absolute coordinates. Exact absolute
waypoints remain available as a last resort.

This is intentionally a breaking cleanup. Coral proposes that authored `via`
syntax map to `routeIntent`, not to computed route bends. No compatibility rule
for interpreting legacy `routingPoints` as authored intent is required.

### 7. Separate authored GraphIR from resolved layout geometry

Coral proposes that the authored GraphIR contract not require computed node
positions, edge bends, edge sections, or label bounds. Those belong in a
separate layout result or resolved-geometry artifact.

GraphIR should make these breaking field decisions:

- `GraphNode.position`, when present in authored GraphIR, is an explicit exact
  coordinate used directly until reflow. Reflow may replace an unpinned
  position in resolved geometry; it may not replace a pinned position.
- `pinned: true` is valid only with an explicit position.
- `GraphNode.dimensions`, when present, is an authored fixed size. Measured or
  computed node dimensions belong in the layout result.
- `GraphEdge.routeIntent` is authored route meaning.
- `GraphEdge.routingPoints` is removed from authored `GraphEdge`; resolved
  routes, edge sections, and label geometry belong in the layout result.
- raw `LayoutOptions.algorithmOptions` is removed from authored GraphIR and
  belongs at the transient layout-request boundary.
- automatic layout does not write its engine hints back into GraphIR.

> **Review annotation — accepted:** Structural separation only works if the
> legacy fields are assigned unambiguous meanings. Because this is a coordinated
> pre-1.0 breaking change, removal is cleaner than retaining canonical fields
> whose values could be mistaken for authored intent.

Graph-IR may define a separate resolved-geometry type, or Coral may continue to
own its transient `LayoutResult`. Coral does not request that engine-specific
result fields become part of authored GraphIR.

#### Coral justification

Structural separation keeps normal Coral source simple and avoids a provenance
field on every coordinate. Presence in authored GraphIR communicates authored
meaning; presence in a layout result communicates computed geometry. A document
may cache a layout result for continuity without making that cache part of the
diagram definition.

This approach provides stable reopen and incremental layout without causing the
printer to fill ordinary source files with computed `@ (x, y)` clauses.

## Changes Coral does not propose for GraphIR

### Geometry provenance fields

Coral does not initially propose `positionProvenance`, `routingProvenance`, or a
graph-level provenance record. The authored/result separation should be tested
first. Provenance fields should be added only if a concrete interchange case
cannot express its meaning structurally.

### Raw layout-engine options

Coral does not propose `NodeLayoutOptions.engineOptions`, persisted ELK maps, or
retention of graph-level `LayoutOptions.algorithmOptions` in authored GraphIR.
The Coral lowering adapter derives engine-specific options from portable intent
and places them in a transient request. An expert-only authored passthrough, if
ever provided, belongs in Coral document settings and is explicitly
non-portable.

### Application and workspace state

Undo/history, camera, selection, collaboration/presence, click-through workspace
navigation, runtime diagnostics, and partial solver state remain outside
GraphIR.

## Required behavior outside GraphIR

The fields above are necessary but not sufficient for Coral's feature. Coral
must also provide:

1. GraphIR-to-layout-request lowering.
2. Capability-aware engine hint generation.
3. Required-constraint enforcement.
4. Deterministic preferred-constraint handling.
5. Rerouting after node placement and waypoint resolution.
6. Label measurement and placement after routing.
7. Final-state evaluation before publication.
8. Atomic failure that retains the last successful render.

Required constraints must hold in final published geometry. An implementation
must not silently downgrade them because a selected layout engine lacks a
matching option. Every accepted preferred constraint must also hold in final
published geometry. Only rejected preferred constraints may remain unsatisfied,
and each rejection produces a diagnostic naming its constraint ID.

## Breaking-change and migration position

Coral prefers a clean pre-1.0 contract over compatibility machinery that keeps
ambiguous authored/computed geometry semantics alive. The coordinated change is
expected to update GraphIR types and validation, Coral DSL parsing and printing,
the layout request/result boundary, rendering, document persistence, conversion
diagnostics, examples, and tests together.

Package and serialized schema versions remain independent. The Graph-IR release
should assign both explicitly rather than inferring one from the other.

## Proposed GraphIR 4 additions for document-local user symbols

Status: revised 2026-10-28 after the
Astra-6 and Coral review;
the author accepted every recommended change and the answers to GQ-1 to GQ-7
on 2026-10-28, and they are incorporated below. Not implemented. Coral's
author approved the
[Slice 60 design](../releases/0.2.9/slice-60/design.md) and its source
notation on 2026-10-28. Decision D60-6 updates GraphIR so that GraphIR 4
interchange carries user-symbol definitions instead of Coral refusing the
export. Decision D60-11 makes the next `@graph-ir/core` an additive
candidate-contract release whose number the GraphIR release process assigns.
The GraphIR delivery plan owns
sequencing, release and adoption.

The baseline is the GraphIR 4.0.0 candidate published in `@graph-ir/core`
0.2.3, whose `graph-ir-tools` tag `v0.2.3` is commit `e74b2f1f`, and its
specification at `graph-ir` commit `706eec3c`. That candidate already has
`SemanticPort.label`, `SemanticAnchor {kind: 'symbol', id}`, closed record
schemas, catalog-free obligations for catalog-dependent checks, and
catalog-aware validation against an exact `SuccessorInterpretationSnapshot`.

### 8. Add a document symbol catalog

```ts
type CardinalSide = 'N' | 'E' | 'S' | 'W';

/** `local.` followed by one or more characters. */
type DocumentSymbolId = string;

type DocumentSymbolAnchor =
  | { id: string; kind: 'boundary'; side: CardinalSide; at: number }
  | { id: string; kind: 'interior'; x: number; y: number; exit: CardinalSide };

interface DocumentSymbolArtwork {
  mediaType: 'image/svg+xml';
  /** Identity of the admission profile that produced `text`. */
  profile: { id: string; version: string };
  /** Canonical admitted serialization, never the imported bytes. */
  text: string;
}

interface DocumentSymbolDefinition {
  id: DocumentSymbolId;
  name: string;
  description?: string;
  tags?: string[];
  size: { width: number; height: number };
  labelSide?: PlacementSide;
  outline?: 'rectangle' | 'rounded' | 'ellipse' | 'diamond';
  tint?: 'none' | 'stroke';
  provenance?: { source?: string; license?: string };
  artwork: DocumentSymbolArtwork;
  anchors?: DocumentSymbolAnchor[];
  ports?: SemanticPort[];
  digest: string;
}

interface GraphIRSuccessor {
  documentCatalog?: DocumentSymbolDefinition[];
}
```

A definition carries the bundled symbol contract that Coral's
[parity table](../releases/0.2.9/slice-60/design.md#parity-with-bundled-symbols)
requires. The fields map one to one onto Coral's `@symbol` lines:

| Coral `@symbol` line | GraphIR field | Default and constraint |
| --- | --- | --- |
| `@symbol <id>` | `id` | Required; Coral writes `local.<id>`; on import Coral refuses an ID whose suffix it cannot spell as a Coral identifier |
| `name` | `name` | Required, nonempty |
| `description` | `description` | Optional |
| `tags` | `tags` | Optional; when present, one or more nonempty, unique strings; order is not meaning |
| `size <w> x <h>` | `size` | Required; finite positive diagram units; default and minimum frame |
| `label` | `labelSide` | `below`; uses GraphIR's `PlacementSide` |
| `outline` | `outline` | `rectangle` |
| `tint` | `tint` | `none`; `stroke` paints the artwork with the theme stroke colour |
| `source`, `license` | `provenance.source`, `provenance.license` | Optional free text |
| `artwork svg` | `artwork` | Required; see artwork rules |
| `anchor` | `anchors` | Optional; when present, one or more records with unique IDs |
| `port` | `ports` | Optional; when present, one or more `SemanticPort` records with unique IDs |
| none (computed) | `digest` | Required; see digest rules |

**Identity and selection.** A node selects a document symbol with the
existing `GraphNode.symbol` field, whose value equals a definition `id`.
GraphIR reserves the `local.` prefix for document symbols: a pinned catalog
never defines an ID with that prefix, so catalog-free validation can classify
every `symbol` value without the catalog. A node's `type` keeps its profile
meaning; a document symbol supplies presentation, geometry and inherited
ports, never profile semantics. A document symbol is admissible under every
profile and therefore never needs a `conformanceExceptions` entry. It has no
variants, is never a container and carries no edge marker.

**Ports.** Definition ports are inherited by every node that selects the
symbol, exactly as catalog ports are inherited from a bundled symbol, and each
node instance has its own port identities. An authored node port with the same
ID as an inherited port remains invalid; override and subtraction stay outside
GraphIR 4. Unlike bundled catalog port sides, which are stencil hints, a
definition port's `anchor` is authored semantic intent and is preserved.

**Geometry.** All geometry is in the definition's frame, a `size.width` by
`size.height` rectangle with normalized coordinates `x` rightward and `y`
downward in `0..1`. A node's box is the frame, and consumers preserve the
frame's aspect ratio when they size the node. The outline is closed routing
and contact geometry in that frame:

- `rectangle` is the frame;
- `rounded` is the frame with quadratic corners: with `r = min(width,
  height) / 8` in frame units, each corner is a quadratic Bézier curve from
  the point `r` before the corner on one side to the point `r` after it on
  the other, with its control point at the frame corner (decision GQ-3).
  This is the curve Coral already draws for rounded rectangles;
- `ellipse` is the ellipse inscribed in the frame; and
- `diamond` joins the midpoints of the four frame sides.

Every outline is convex. Because `r` is proportional to the frame and the
frame keeps its aspect ratio, every outline scales uniformly with the node.

Artwork is drawn in the frame and clipped to the outline. The outline is never
painted by itself. The artwork's `viewBox` `(minX, minY, w, h)` maps into the
frame as SVG `preserveAspectRatio="xMidYMid meet"` does: translate by
`(-minX, -minY)`, scale uniformly by `min(width / w, height / h)`, and centre
the result. SVG `width`, `height` and `preserveAspectRatio` attributes on the
root never affect the mapping; the admission profile removes them. Anchors,
ports and the outline are defined on the frame, not on the artwork, so a
`viewBox` whose aspect ratio differs from `size` letterboxes the artwork
without moving any attachment.

**Anchors.** A boundary anchor names the point at fraction `at` along one
frame side, where `at` is the `x` coordinate on `N` and `S` and the `y`
coordinate on `E` and `W`. The point is projected inward along the side normal
to the first outline point; for example, `{side: 'N', at: 0.5}` on an ellipse
is the top of the curve. An interior anchor names the point `(x, y)`, which
must lie inside or on the outline, and an exit side. Its attachment point is
where a ray from `(x, y)` in the exit direction leaves the outline; because
every outline is convex, the ray leaves exactly once. When `(x, y)` is on the
outline, the exit must be strictly outward: the ray contains no other point
of the closed outline region. The attachment point is then `(x, y)` itself
and the escape segment has zero length. An exit that points into the outline
or runs along its boundary is `INVALID_ANCHOR_EXIT`, because a tangent ray
has no single point where it leaves the outline. Layout and routing attach
connectors at the attachment point. The escape segment from the interior
point to the attachment point is part of the connector's meaning: a consumer
that draws connectors draws it, and a consumer that cannot reports that
capability gap instead of omitting the segment silently. Anchor IDs match
`^[A-Za-z_][A-Za-z0-9_]*$` and may not be a generic anchor spelling:
`auto`, `side`, `corner`, `N`, `S`, `E`, `W`, `NE`, `NW`, `SE`, `SW`, `up`,
`down`, `left` or `right`.

**Artwork.** `text` is the canonical serialization produced by the admission
profile that `profile` identifies, as UTF-8 text with a single `svg` root
element that has a `viewBox`. GraphIR specifies the carrier, not the SVG
subset: the profile owns the element, attribute, reference, budget and
canonical-serialization rules. A profile version is immutable: it fixes both
what it admits and the exact canonical text it produces, so tightening a
budget or changing serialization requires a new profile version. GraphIR
imposes these consumer obligations:

- a consumer re-admits `text` with the named profile before using it;
- re-admission has three distinct failures: the consumer lacks the named
  profile version (`ARTWORK_PROFILE_UNSUPPORTED`), the profile rejects the
  text (`ARTWORK_ADMISSION_FAILED`), or the profile admits it but its
  canonical output differs from `text` (`ARTWORK_NONCANONICAL`);
- a consumer never rewrites `text` to its canonical form while keeping the
  definition's digest, never inserts `text` into a document object model or
  output without admission, even when the digest matches, and never
  substitutes a newer profile; and
- an admission check that throws or exceeds its own limits counts as
  `ARTWORK_ADMISSION_FAILED`, with the failure in its detail.

Coral publishes its profile, identified as `coral.svg-artwork` with an
immutable version, as a normative document covering admission and canonical
serialization, derived from the
SVG icon proposal, with
conformance vectors. GraphIR carries the profile identity and does not adopt
the profile normatively (decision GQ-2).

**Digest.** `digest` is `sha256:` followed by 64 lowercase hexadecimal digits,
computed over the UTF-8 bytes of the RFC 8785 canonical JSON of the
definition's digest input. The digest input is the definition with exactly
these changes:

- `digest` is removed;
- the three top-level defaults are removed when present with their default
  value: `labelSide: 'below'`, `outline: 'rectangle'` and `tint: 'none'`.
  No other field is ever removed, so an explicit port `anchor`, including
  `{kind: 'auto'}`, keeps its presence, and nothing inside a port's
  `properties` is altered;
- `tags` is sorted by code point, and `anchors` and `ports` are sorted by
  `id` in code-point order (not UTF-16 code-unit order). Empty arrays and an
  empty `provenance` object are schema-invalid, so absence is the only
  spelling of "none".

A definition whose digest input cannot be canonicalized, for example because
it contains a lone surrogate, is `DOCUMENT_SYMBOL_DIGEST_UNCOMPUTABLE`.
Canonical JSON uses an exact pinned RFC 8785 implementation, never a
hand-written serializer, because JCS number formatting is subtle.
Because `text` is canonical admitted output, two definitions with the same
admitted artwork and fields have the same digest, and changes to the
canonical digest input change the digest. The specification publishes shared
digest vectors, covering Unicode, numbers, defaults, explicit `auto`,
permutations and `properties`, before either implementation starts. Digest
vectors take artwork `text` as given, so they do not depend on any SVG
serializer. The artwork profile's own admission and canonicalization vectors
belong to the profile, which the specification references by identity. The
digest is the only digest of a definition: Coral computes, compares and
displays this value
(decision GQ-4).

**Order.** `documentCatalog` is identity-keyed storage. Entry order is not
meaning, and semantic diff treats permutations as quiet. Writers preserve
their authored order for stable output.

#### Coral justification

Coral 0.2.9 lets a document define its own symbols with the same contract as
bundled symbols: identity, name, description, tags, artwork, outline, size,
label side, named anchors and semantic ports. The GraphIR 4 candidate can
reference only symbols in a pinned bundled catalog, and its closed schemas
leave no carrier for a definition. Without this change Coral must either drop
the symbol's meaning on export or refuse the export. `metadata.custom` would
hide the definitions from every other consumer, which is why the Slice 60
design rejects it.

Carrying definitions inside the graph keeps documents self-contained: no
sidecar file, URL or library reference is needed to interpret one. A reserved
prefix keeps resolution decidable without the bundled catalog and matches the
reference Coral already writes. A profile-named, canonical artwork carrier
lets GraphIR remain independent of Coral's rendering code while making the
admission boundary explicit to every consumer. The digest gives editors and
reviewers a portable way to tell whether two documents hold the same
definition.

### 9. Resolve symbol anchors against document symbols

The existing `SemanticAnchor` variant `{kind: 'symbol', id}` gains a second
resolution source. When the port's owner is a node whose effective symbol is a
document symbol, or the port is a definition port, `id` resolves against that
definition's `anchors`. When the effective symbol is a bundled symbol,
resolution is unchanged and still requires the exact catalog snapshot.

Generic anchors keep their GraphIR 4 meaning, evaluated against the
definition's outline: `auto`, `side` and `corner` restrict or free the
attachment class. An `exact` side position pins to the boundary anchor point
with `at: 0.5` on that side, and an `exact` corner position pins to the point
where the line from the frame centre to that frame corner meets the outline.

Route anchors resolve the same way. A `RouteAnchorSuccessor` of kind `port`
whose node selects a document symbol resolves the port against the node's
authored ports and the definition's ports, without the catalog; an absent
port is the existing `UNKNOWN_ROUTE_SEMANTIC_PORT` at the route path, and no
`ROUTE_PORT_REFERENCE_REQUIRES_CATALOG` obligation is emitted for it.

#### Coral justification

Coral's `audit port [direction: out, anchor: keyhole]` pins a port to a named
anchor in the symbol definition, and a Coral route may be relative to that
port. GraphIR 4 already has the reference shapes; it lacks only a resolution
target that travels with the document. Resolving document symbols without the
catalog removes the catalog obligations for those references, which today's
obligation model cannot do.

### 10. Add connection limits to semantic ports

```ts
interface SemanticPort {
  /** Positive integer; omission means unlimited. */
  maxConnections?: number;
}

interface SnapshotPort {
  id: string;
  direction: 'in' | 'out' | 'inout';
  maxConnections?: number;
}

interface SuccessorInterpretationSnapshot {
  // Every existing member is unchanged; only the port records gain a field.
  symbols: Record<string, {
    ports?: SnapshotPort[];
    anchors?: string[];
    variants?: Record<string, { ports?: SnapshotPort[]; anchors?: string[] }>;
  }>;
}
```

A variant's `ports` list replaces the base symbol's list, as it does today,
so a variant port's limit is the variant's value.

A port's connection count is the number of edge endpoints, across all edges,
whose `node` and `port` name that port on that node. An edge that names the
same port at both ends counts twice. An endpoint without `port` never counts,
even when layout later attaches it near that port. A count greater than a
resolved `maxConnections` is a validation error (decision GQ-6). The limit
applies to authored node ports, document symbol ports and, through the
snapshot, bundled catalog and variant ports. A limit that cannot be resolved,
because the port is inherited from a bundled symbol and no snapshot is
supplied, is the obligation `PORT_LIMIT_REQUIRES_CATALOG`, never a guessed
pass or failure.

#### Coral justification

Bundled Coral symbols already declare limits such as a flowchart decision's
single `in` port, and Coral's editor enforces them. Slice 60 extends `label`
and `maxConnections` to every port so user symbols reach full parity
(D60-9). GraphIR 4 already carries `label`. Without `maxConnections` a limit
would silently disappear on interchange, and a GraphIR consumer could not
detect a graph that breaks it.

### 11. Validation and diagnostics

Schema validation adds closed records for every new type. It enforces the
required fields, the `local.` prefix, finite positive `size`, `at`, `x` and
`y` in the inclusive range `0..1`, the anchor ID pattern, the digest pattern,
integer `maxConnections` of at least `1`, at least one item in every present
array and at least one field in a present `provenance`. The specification
also sets whole-document limits on the number of definitions and the total
artwork text bytes, calibrated against Coral's artwork budgets; exceeding
them is `DOCUMENT_CATALOG_LIMIT_EXCEEDED` and stops further artwork
processing.

Semantic validation reports these findings with RFC 6901 paths. Existing
codes keep their meaning and gain the document-symbol cases noted.

| Code | Mode | Condition |
| --- | --- | --- |
| `DUPLICATE_DOCUMENT_SYMBOL` (new) | Catalog-free | Two definitions share an `id` |
| `DOCUMENT_SYMBOL_DIGEST_MISMATCH` (new) | Catalog-free | `digest` differs from the computed digest |
| `DOCUMENT_SYMBOL_DIGEST_UNCOMPUTABLE` (new) | Catalog-free | The digest input cannot be canonicalized |
| `DOCUMENT_CATALOG_LIMIT_EXCEEDED` (new) | Catalog-free | Definition count or total artwork bytes exceed the document limits |
| `DUPLICATE_SYMBOL_ANCHOR` (new) | Catalog-free | Two anchors in one definition share an `id` |
| `RESERVED_SYMBOL_ANCHOR_ID` (new) | Catalog-free | Anchor `id` is a generic anchor spelling |
| `INTERIOR_ANCHOR_OUTSIDE_OUTLINE` (new) | Catalog-free | Interior point lies outside the outline |
| `INVALID_ANCHOR_EXIT` (new) | Catalog-free | An interior anchor on the outline has an exit that is not strictly outward |
| `DOCUMENT_SYMBOL_CONTAINER` (new) | Catalog-free | A node that selects a document symbol has children |
| `PORT_CONNECTIONS_EXCEEDED` (new) | Both | Connection count exceeds a resolved port's limit |
| `PORT_LIMIT_REQUIRES_CATALOG` (new obligation) | Catalog-free | A connected bundled-symbol port's limit needs the snapshot |
| `ARTWORK_ADMISSION_UNVERIFIED` (new obligation) | Both | No admission check was supplied for the artwork profile |
| `ARTWORK_PROFILE_UNSUPPORTED` (new) | Both | The supplied checks do not include the named profile version |
| `ARTWORK_ADMISSION_FAILED` (new) | Both | A supplied admission check rejected `text`, threw, or exceeded its limits |
| `ARTWORK_NONCANONICAL` (new) | Both | The profile admits `text` but its canonical output differs |
| `UNKNOWN_SYMBOL` | Catalog-free for `local.` | A `local.` symbol has no definition |
| `UNKNOWN_VARIANT` | Catalog-free for `local.` | A node sets `variant` on a document symbol |
| `UNKNOWN_SYMBOL_ANCHOR` | Catalog-free for `local.` | A symbol anchor is absent from the definition |
| `DUPLICATE_SEMANTIC_PORT` | Catalog-free | Two definition ports share an `id` |
| `INHERITED_PORT_COLLISION` | Catalog-free for `local.` | An authored port repeats a definition port |
| `UNKNOWN_SEMANTIC_PORT` | Catalog-free for `local.` | An endpoint port is neither authored nor defined |
| `UNKNOWN_ROUTE_SEMANTIC_PORT` | Catalog-free for `local.` | A route-anchor port is neither authored nor defined; the existing GraphIR code is kept rather than reusing `UNKNOWN_SEMANTIC_PORT` (G3 specification review, 2026-10-30) |
| `PORT_DIRECTION_MISMATCH` | Catalog-free for `local.` | A definition port's direction contradicts the edge role |
| `INELIGIBLE_CONFORMANCE_EXCEPTION` | Catalog-free for `local.` | An exception names a document symbol |
| `INVALID_CATALOG_SNAPSHOT` | Catalog-aware | The snapshot defines a `local.` ID |

For a node that selects a document symbol, catalog-free validation emits no
`SYMBOL_ANCHOR_REQUIRES_CATALOG`, `PORT_REFERENCE_REQUIRES_CATALOG` or
`ROUTE_PORT_REFERENCE_REQUIRES_CATALOG` obligation for that node's ports and
anchors, because every inherited port and anchor is in the graph. Obligations
that do not depend on those references remain, including the profile,
catalog, direction-rule and artwork-admission obligations. Every definition
is fully validated, including its ports, anchors, digest and artwork, whether
or not a node selects it; being unused is not itself a finding.

GraphIR does not ship an SVG admitter. `validateGraphIRSuccessor` and
`validateGraphIRSuccessorWithCatalog` accept an optional admission check
keyed by artwork profile identity. A supplied check that accepts `text`
discharges `ARTWORK_ADMISSION_UNVERIFIED`; one that rejects it produces
`ARTWORK_ADMISSION_FAILED` with the profile's detail. Digest computation
needs a synchronous SHA-256 that runs without Node-only modules: an exact
pinned, audited, browser-compatible library such as `@noble/hashes`, verified
against the shared cross-runtime vectors, and never a bespoke implementation
(decision GQ-5). Core exports its digest function so that consumers can use
one implementation.

Semantic diff reports an added, removed or changed definition by `id`, a
changed digest, changed anchor or port records, a changed `maxConnections`,
and a node whose `symbol` moves between document and bundled symbols.
Definition, anchor, port and tag permutations, and explicit defaults versus
omission, are quiet.

#### Coral justification

Coral reports every equivalent condition from its own reader, with codes such
as `coral.symbol.local.duplicate`, `coral.symbol.local.anchor.invalid` and
`coral.port.connections.exceeded`. Matching GraphIR findings let Coral map an
import failure to a located Coral diagnostic instead of a generic schema
error, and let non-Coral consumers reject the same invalid graphs. The
admission hook keeps SVG policy in its owner while still letting a validator
state honestly whether a document is completely verified.

### 12. Migration and compatibility

- **Candidate revision with enumerated tightenings.** Every graph that is
  valid under the 0.2.3 candidate keeps its meaning, and remains valid except
  in exactly these cases, each covered by legacy-candidate and GraphIR 3
  migration fixtures with explicit findings and no invented definitions:
  1. a `local.` reference with no definition, in a node `symbol` or a
     conformance-exception `symbol`, becomes a catalog-free error
     (`UNKNOWN_SYMBOL` or `INELIGIBLE_CONFORMANCE_EXCEPTION`) instead of an
     unresolved catalog lookup (widened in the G3 code review, 2026-10-30);
  2. a catalog snapshot that defines a `local.` ID, which a third-party
     catalog could have done, is `INVALID_CATALOG_SNAPSHOT` (decision GQ-7);
     no bundled catalog that Coral has shipped defines one; and
  3. once a snapshot supplies bundled port limits, a graph whose explicit
     port endpoints exceed them is `PORT_CONNECTIONS_EXCEEDED` even though it
     uses no new field. Coral checks its shipped corpus for such graphs
     before release.
- **Fail closed in older consumers.** The 0.2.3 candidate schemas are closed,
  so a 0.2.3 validator rejects a graph that uses `documentCatalog` or
  `maxConnections` rather than silently dropping either field.
- **Serialized version.** The amendment keeps `version: '4.0.0'` as a
  revised candidate, with new candidate artifact identity digests and the
  enumerated tightenings above recorded in its release notes, because
  GraphIR 4 is not final (decision GQ-1).
- **GraphIR 3.** GraphIR 3 is unchanged and has no carrier. GraphIR 3-to-4
  migration never synthesizes `documentCatalog`, and it does not reinterpret
  GraphIR 3 `properties` or `metadata` as definitions. Coral continues to
  refuse GraphIR 3 export of a document that uses a user symbol, with
  `export.graphir.local-symbol.unsupported`.
- **Package identity.** The next `@graph-ir/core` version is assigned by the
  GraphIR release process (D60-11). Package version and serialized schema
  version remain independent.

### Changes Coral does not propose for user symbols

- **Variants, containers and edge markers** for document symbols. Coral
  defines another symbol instead of a variant.
- **Port override or subtraction** of bundled or document symbol ports.
- **External references.** Definitions are never resolved from a URL, file,
  library or other document.
- **Imported artwork bytes.** Only canonical admitted text is interchange;
  Coral's editor keeps original bytes as browser-local recovery data.
- **A second digest.** Coral's approved Slice 60 design originally hashed its
  admitted artwork model. The author adopted the GraphIR digest as the only
  digest (decision GQ-4), and the design was amended to match.
- **Admission budgets in the schema.** Budgets belong to the artwork profile
  version, so tightening them never requires a GraphIR schema change.
- **Document-local edge symbols or notation profiles.**

### Required behavior outside GraphIR

Coral must also provide the following; none of it belongs in GraphIR:

1. Raw SVG admission, its fuzzing, and the published `coral.svg-artwork`
   profile document with its admission and canonical-serialization rules,
   immutable versions and conformance vectors.
2. The `local.` source spelling and the `@symbol` block reader and printer.
3. The frame resolver, synthetic outline shapes, escape segments for interior
   anchors, and label placement around the frame.
4. `<symbol>` and `<use>` rendering with per-document ID namespaces and style
   boundaries.
5. The browser-local My Icons library, import, symbol editor and update
   prompts.
6. Digest computation and admission on every GraphIR 4 export and import,
   with a located Coral diagnostic for each GraphIR finding, and an import
   refusal for a `local.` ID whose suffix Coral cannot spell.
7. The explicit GraphIR 4 export refusal described in the delivery plan if
   the GraphIR release is not available in time.

### Graph-IR review decisions

The author, who maintains GraphIR, accepted these answers on 2026-10-28 from
the proposal review:

| ID | Question | Decision |
| --- | --- | --- |
| GQ-1 | Serialized version | Keep `4.0.0` as a revised candidate with new artifact identities and enumerated tightenings |
| GQ-2 | SVG profile ownership | Carry an immutable Coral-owned profile identity covering admission and canonical serialization, with conformance vectors |
| GQ-3 | `rounded` radius | Quadratic corners as Coral draws them, `r = min(width, height) / 8` in frame units |
| GQ-4 | One digest | The GraphIR digest is the only digest; Coral's design is amended |
| GQ-5 | SHA-256 implementation | An exact pinned, audited, browser-compatible library such as `@noble/hashes`, verified by shared vectors |
| GQ-6 | Limit severity | Error for a resolved explicit limit; `PORT_LIMIT_REQUIRES_CATALOG` obligation when unresolved |
| GQ-7 | `local.` prefix | Reserved, with the third-party catalog break enumerated as a tightening |
