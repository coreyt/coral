# Proposed Coral DSL changes for authored spatial intent

Status: proposal for Coral review. This proposal assumes a coordinated breaking
change to Coral DSL and GraphIR is acceptable because both are pre-1.0.
Release-number allocation and compatibility with the prior geometry spelling
are deliberately out of scope. This revision incorporates Graph-IR's semantic
review.

## Goal

Coral source should normally define a diagram without describing its computed
layout:

```coral
service "API" as api
database "Orders" as orders

api -> orders [label: "writes"]
```

Spatial syntax follows progressive disclosure:

1. Omit layout syntax and use automatic layout.
2. Add a concise relative hint only where layout needs guidance.
3. Mark a relationship required only when it must be guaranteed.
4. Add gap, alignment, label offset, or relative waypoints only when needed.
5. Use exact `@ (x, y)` or absolute waypoints as the last resort.

The parser produces authored GraphIR. Layout produces separate resolved geometry.
The printer never inserts computed layout coordinates into normal source.

> **Review annotation — accepted:** Graph-IR's refinements preserve this
> progressive-disclosure goal. They tighten the meaning produced by the parser;
> they do not require more syntax in ordinary Coral files.

## Enumerated DSL changes

### 1. Reserve first-class edge `description`

Add `description` as a reserved edge attribute:

```coral
api -> orders [
  label: "writes",
  description: "Persists a validated order"
]
```

It maps to `GraphEdge.description`, not
`GraphEdge.properties.description`. A user property with that name is no longer
ambiguous; custom data must use a different, preferably namespaced, key.

The printer emits `description` only when present. Node descriptions retain
their existing first-class GraphIR meaning; a later syntax cleanup may align
their readable spelling without blocking this proposal.

### 2. Add concise node-label placement

Add a node clause after identity and before spatial relation or exact geometry:

```coral
service "Worker" as worker label below
actor "Customer" as customer label right offset 12
```

Grammar:

```text
label <side> [offset <distance>]
```

`<side>` is `above | below | left | right | center`. Placement is page-relative
and uses measured bounding boxes. `above` places the label's bottom edge above
the node's top edge; `below`, `left`, and `right` use the analogous facing edges.
`center` aligns label and node centers. Offset is a finite non-negative number in
diagram units and defaults to `0`; for `center`, it must be omitted or `0`.

The clause maps to `GraphNode.labelPlacement`.

> **Review annotation — accepted:** A single bounding-box convention is precise
> for every symbol shape and prevents renderers from interpreting the same Coral
> source differently.

### 3. Add concise edge-label placement

Add an edge clause after readable attributes and before route intent:

```coral
api -> orders [label: "writes"] label below
api -> orders [label: "writes"] label below at 0.25 offset 12
```

Grammar:

```text
label <side> [at <fraction>] [offset <distance>]
```

`at` is in the inclusive range `0..1` and selects a point by arc length along the
resolved source-to-target route; it defaults to `0.5`. Sides are page-relative
and place the label's facing bounding-box edge against the selected point:
`above` uses the bottom edge, `below` the top, `left` the right, and `right` the
left. `center` aligns the label center with the point. Offset is a finite
non-negative page-axis distance in diagram units and defaults to `0`; for
`center`, it must be omitted or `0`.

The clause maps to `GraphEdge.labelPlacement`.

> **Review annotation — accepted:** Page-relative sides and a
> path-perpendicular offset contradict one another on diagonal or curved paths.
> Page-axis bounding-box placement gives `label below` stable literal meaning.

### 4. Add inline preferred relative hints

Add a single optional relation clause to a node declaration:

```coral
service "API" as api above orders
database "Orders" as orders
service "Cache" as cache right of orders
```

Initial readable relations are:

```text
above <reference>
below <reference>
left of <reference>
right of <reference>
```

The concise form maps to a relative constraint with explicit
`strength: 'preferred'`, omitted gap (`0`), and omitted alignment (`center`). It
is a layout hint, not a promise that can invalidate the diagram. If rejected by
ordered preferred-constraint acceptance, the application surfaces a warning
naming its derived constraint ID.

The parser resolves references after reading the complete source. Exact IDs
take precedence over unique normalized labels. Missing and ambiguous references
produce positioned diagnostics.

### 5. Add inline preferred boundary hints

Add a boundary relation for placement within the graph or an owning container:

```coral
service "Ingress" as ingress at the top
service "Worker" as worker at the left of backend
```

Grammar:

```text
at the (top | bottom | left | right) [of <container-reference>]
```

The concise form maps to a boundary constraint with explicit
`strength: 'preferred'` and omitted inset (`0`). The omitted scope means the
graph. A named scope must resolve to a transitive ancestor container of the
subject; sibling, descendant, and unrelated nodes are invalid scopes. Boundary
placement uses the graph or container's outer layout box and excludes external
labels from that box.

### 6. Add concise preferred arrangements

Add a top-level arrangement declaration:

```coral
arrange api, worker, orders as row
arrange children of backend as column top to bottom
```

The concise form maps to an arrangement constraint with explicit
`strength: 'preferred'`. An arrangement must contain at least two unique
subjects. Declaration order is member order. Omitted direction means `forward`:
left-to-right for a row and top-to-bottom for a column. `reverse` means the
opposite page direction. The printer does not add a direction keyword when the
portable `forward` default was not authored.

> **Review annotation — accepted:** Direction cannot depend on notation, locale,
> or layout-engine defaults if two GraphIR implementations are expected to
> produce the same ordering semantics.

### 7. Add an explicit required form

Expose hard constraints only when the user requests a guarantee:

```coral
require api above orders
require worker at the left of backend
require arrange api, worker, orders as row
```

Required constraints must hold in final published geometry. Failure produces a
deterministic diagnostic and retains the last successful render; it must never
silently degrade to a preferred hint.

GraphIR's omitted strength means `required`, but Coral's `require` spelling is
retained because the guarantee should be visible in source. Inline concise
relations always serialize explicit `preferred` strength.

Required constraints are an unordered conjunction. Preferred constraints are
considered in source/GraphIR array order and accepted only while jointly
satisfiable with every required and previously accepted preferred constraint.
Every accepted preferred constraint must hold in final published geometry. Only
rejected preferred constraints may remain unsatisfied, and each rejection
produces a diagnostic naming the constraint ID. Arrangement subject order
remains independently meaningful; there is no numeric priority.

> **Review annotation — accepted with implementation work remaining:** This is
> now the normative conflict rule. Coral still needs a deterministic
> satisfiability strategy; applying one transform at a time and observing the
> intermediate result is not sufficient.

### 8. Add an advanced identified constraint declaration

When stable external identity or non-default parameters are needed, add a
top-level declaration:

```coral
constraint auth_above_orders:
  auth above orders [required, gap: 24, alignment: center]
```

Candidate grammar:

```text
constraint <id>: <constraint-expression>
  [(required | preferred)]
  [gap: <distance>]
  [alignment: (start | center | end)]
```

The final one-line versus indented-block spelling remains a grammar-design
choice. The semantic requirements are stable ID, optional strength (omission
means `required`), optional gap/inset (omission means `0`), and optional
alignment (omission means `center`). All distances must be finite and
non-negative.

Simple inline constraints receive deterministic derived IDs. The printer adds
an explicit identified declaration only when the ID cannot be reproduced or
when advanced fields cannot use concise syntax.

### 9. Redefine `via` as authored route intent

The simple absolute form remains available:

```coral
api -> orders via (240, 80) (240, 180)
```

It now maps to `GraphEdge.routeIntent.waypoints`, not to resolved
`GraphEdge.routingPoints`. Automatic routing bends are never printed as `via`.

Simple waypoints receive deterministic derived IDs. Add an identified form when
stable identity must survive insertion, reordering, or external reference:

```coral
api -> orders via
  waypoint turn_1 at (240, 80)
  waypoint approach relative to target offset (-20, 0)
```

Candidate waypoint forms are:

```text
waypoint <id> at (<x>, <y>)
waypoint <id> relative to <anchor> offset (<dx>, <dy>)
```

Initial anchors are `source`, `target`, a node, or a port. `source` and `target`
mean resolved port-aware attachment points; a node means its center unless an
explicit port is named. Offsets are graph-axis vectors. Waypoint IDs are unique
within an edge, and the resolved route passes through waypoints in array order.
An anchor may not refer to its containing edge or label.

The initial DSL has no `corner` or `smooth` modifier. A waypoint requires the
route to pass through a point in order; it does not promise a discontinuous
corner or tangent continuity. A later smoothing feature must first define a
portable curve and tangent contract.

> **Review annotation — accepted:** Removing `smooth` is preferable to exposing
> syntax whose guarantee depends on the selected router. The narrower
> route-anchor set supplies all current Coral routing use cases without
> introducing cyclic edge/label geometry. Nested coordinate conversion remains
> implementation work.

No compatibility rule interprets legacy resolved routing bends as authored
waypoints. This is an intentional breaking cleanup.

### 10. Keep exact node coordinates as an explicit last resort

Retain the recognizable exact-position clause:

```coral
service "Legacy appliance" as legacy @ (120, 80) pinned
```

`@ (x, y)` is authored exact geometry. Automatic layout must not synthesize the
clause. The coordinate is used directly until reflow. Reflow may replace an
unpinned coordinate in resolved geometry; `pinned` marks an exact anchor that
ordinary reflow may not move. `pinned` without an authored position is invalid.
A direct user edit explicitly targeting a pinned node may author a new exact
position while retaining the pin; an indirect constraint may not move it.

> **Review annotation — accepted with Coral operation semantics:** GraphIR
> defines the durable position and pin. Coral defines which explicit editing
> transaction is authorized to replace that authored value. This preserves hard
> pins during reflow without making intentional drag/move commands impossible.

### 11. Fix declaration order and ambiguity rules

The proposed node order is:

```text
<type> <label>
[as <id>]
[label <side> [offset <distance>]]
[<inline relative or boundary hint>]
[@ (<x>, <y>) [pinned]]
[data <object>]
[{ properties/children }]
```

The proposed edge order is:

```text
<source> -> <target>
[as <id>]
[[readable attributes]]
[label <side> [at <fraction>] [offset <distance>]]
[via <route-intent>]
[data <object>]
```

Top-level `arrange`, `require`, and `constraint` declarations participate in
the same constraint array as inline clauses. Array order governs preferred
acceptance only; required constraints remain an unordered conjunction. Parsing
must not depend on declaration-before-use.

### 12. Print authored meaning, never effective layout state

Change the printer contract so normal Coral output includes:

- semantic graph, node, edge, port, and property data;
- label-placement clauses that were authored;
- preferred and required constraints;
- authored route intent;
- explicit exact positions and pins; and
- authored fixed node dimensions.

It excludes:

- automatically computed node positions;
- measured or computed node dimensions;
- generated bends and edge sections;
- measured label bounds;
- derived ELK options;
- runtime layout diagnostics and partial solver state;
- continuity-cache geometry.

This replaces the current behavior in which visual synchronization can print
computed positions as `@` clauses.

`GraphEdge.routingPoints` is no longer an authored GraphIR field. `via` prints
only `routeIntent`. `GraphNode.dimensions`, when present in authored GraphIR,
means a deliberately fixed size rather than a measured render result.

> **Review annotation — accepted:** These breaking meanings complete the
> authored/result separation. Retaining ambiguous geometry fields would defeat
> the reason for introducing `routeIntent` and a separate `LayoutResult`.

### 13. Keep engine-specific options out of Coral DSL

Do not add Coral syntax for raw ELK options as part of the portable diagram
definition. Coral lowers semantic hints into a transient layout request and may
use deterministic post-processing where the engine cannot guarantee them.

The coordinated GraphIR change removes existing graph-level
`LayoutOptions.algorithmOptions` from authored GraphIR as well as rejecting new
node-level engine-option maps. Raw options may exist only in a transient layout
request or explicitly non-portable document settings.

An expert-only ELK passthrough, if later approved, belongs in non-portable Coral
document settings and must be visibly distinguished from DSL semantics.

### 14. Add validation and diagnostics for new syntax

Add stable positioned diagnostics for:

- missing or ambiguous spatial references;
- duplicate constraint and waypoint IDs;
- invalid subject or scope kinds;
- invalid side, fraction, distance, offset, or alignment values;
- arrangements with fewer than two unique subjects;
- boundary scopes that are not ancestor containers of their subjects;
- `pinned` without an authored exact position;
- self-contradictions and statically provable required cycles;
- geometry-dependent required-constraint failure;
- rejected preferred constraints, with their IDs;
- conversion targets that cannot carry constraints, placement, or route intent;
- stale or conflicting exact geometry and intent.

Syntax and static reference failures belong to parsing/GraphIR validation.
Geometry-dependent satisfiability belongs to layout evaluation.

### 15. Update every Coral producer and consumer together

The breaking change must update:

1. The TypeScript parser and diagnostic ranges.
2. The canonical printer and its loss diagnostics.
3. The Tree-sitter tooling grammar.
4. Diagram-editor text/canvas synchronization.
5. Command and AI spatial-reference resolution.
6. The shared layout request/result boundary.
7. Routing and label rendering.
8. Save, open, recovery, and continuity caching.
9. Mermaid, DOT, PlantUML, and JSON conversion diagnostics.
10. MCP validation, conversion, layout, rendering, and generation.
11. Skills, examples, user documentation, and API documentation.
12. Round-trip, reflow, failure-atomicity, headless, and browser evidence.

No producer may hand-write a competing spelling or preserve new intent only in
editor memory.

## Examples by complexity tier

### Tier 1: structure only

```coral
service "API" as api
database "Orders" as orders
api -> orders [label: "writes"]
```

### Tier 2: preferred hints

```coral
service "API" as api label below above orders
database "Orders" as orders
api -> orders [label: "writes"] label below
```

### Tier 3: required and parameterized intent

```coral
constraint api_above_orders:
  api above orders [required, gap: 32, alignment: center]

api -> orders [label: "writes"] label below at 0.25 offset 12
```

### Tier 4: exact geometry

```coral
service "Legacy appliance" as legacy @ (120, 80) pinned
api -> legacy via
  waypoint turn_1 at (320, 80)
  waypoint approach relative to target offset (-20, 0)
```

## Appendix A: remaining design work

The following decisions must be completed before the proposal becomes an
implementation specification. Semantics resolved by Graph-IR's review have been
moved into the main proposal; this appendix now records only remaining design
and implementation choices.

> **Review annotation:** Label axes, constraint acceptance order, unpinned exact
> position meaning, and core relative-waypoint semantics are no longer open
> questions. The sections below narrow the remaining work rather than reopening
> those decisions.

### A.1 Preferred-constraint satisfiability strategy

The observable policy is settled: accept preferred constraints in array order
only while the accepted set remains jointly satisfiable with all required
constraints. The initial implementation direction is a deterministic linear
feasibility model over the GraphIR rectangle equations: require the entire
required set, then test each preferred constraint against the cumulative
accepted set. Every constraint in that accepted set must hold in the final
published geometry. Select among feasible geometries by minimizing displacement
from the layout-engine candidate with stable ID-based tie-breaking. Remaining
work is to select the solver, displacement norm, numeric tolerance, and
diagnostic evidence. Final evaluation detects a violation but does not by
itself construct or select a result.

### A.2 Static versus geometry-dependent validation

GraphIR now defines non-strict minimum-gap inequalities, alignment equations,
boundary equations, and arrangement ordering. Classify which contradictions can
be proven from those equations without resolved rectangles, including opposite
relations and directional cycles. Define numeric tolerances for resolved
geometry. Geometry-dependent impossibility must remain a layout diagnostic
rather than a claim that GraphIR validation is a solver.

### A.3 Stable waypoint identity in simple source

Determine when an anonymous `via (x, y)` waypoint receives a derived ID and
when the printer must promote it to an explicit `waypoint <id>` form. Identity
must survive movement, insertion, reordering, diagnostics, and visual editing
without making every hand-written route unnecessarily verbose.

### A.4 Relative waypoint syntax and coordinate frames

Offsets are graph-axis vectors, and legal anchors are source, target, node, and
port. Define the concise Coral spelling for node and port anchors, how nested
container coordinates are converted to and from graph coordinates, and how
endpoint or containment changes update diagnostics and cached resolved routes.

### A.5 Exact-position reflow and persistence transactions

An unpinned `@ (x, y)` is an authored exact coordinate used directly until
reflow; reflow may replace it in resolved geometry. Define whether accepting the
reflow result removes or rewrites the authored clause, which explicit command
freezes a resolved position into source, and how save/reopen distinguishes the
authored value from continuity-cache geometry.

### A.6 Direct commands targeting pinned nodes

Ordinary reflow treats a pinned node as an immutable anchor, while a direct user
command may intentionally author a new coordinate and retain its pin. Define the
exact operations and transaction boundary that authorize replacement, including
drag, command, Properties editing, undo, and text edits. A required constraint
that would move the node indirectly must fail atomically.

### A.7 Constraint identity and concise printing

Define deterministic IDs for inline relations and arrangements, duplicate
handling, identity across reorder and edits, and when the printer must use an
explicit `constraint <id>` declaration. Constraint order and arrangement member
order are independently meaningful.

### A.8 Multiple constraints on one subject

Define when multiple inline relations are legal, when they must be promoted to
standalone declarations, how required and preferred forms combine, and how the
printer preserves semantic order without producing busy node declarations.

### A.9 Label measurement, collisions, and clipping

Page-relative bounding-box semantics, defaults, and `center` behavior are
settled in sections 2 and 3. Define measurement timing, multi-line bounds,
collision and clipping behavior, and whether an unsatisfied placement produces
a warning or may enlarge graph/container bounds. Reflow preserves the authored
page side and never rewrites it because an edge changes direction.

### A.10 Route, constraint, and label precedence

Define the final reflow stages and invalidation rules. The proposed order is:

1. establish exact pinned anchors and initial conditions;
2. lower portable hints into applicable engine hints;
3. run automatic layout;
4. satisfy and evaluate required constraints;
5. accept preferred constraints in order while preserving joint satisfiability;
6. resolve authored waypoints;
7. route edges;
8. place labels; and
9. verify every required and accepted preferred constraint before publication.

Specify when node movement invalidates routes, when a waypoint forces a route,
and whether label placement can request rerouting or only move the label.

### A.11 Authored/result boundary and continuity cache

Define the concrete types and APIs separating authored GraphIR, transient layout
requests, resolved geometry, and optional document continuity caches. The type
boundary must remove authored `routingPoints`, treat authored `dimensions` as
fixed, and keep raw algorithm options in transient requests. Establish cache
revision keys, invalidation, save/open behavior, and whether an explicit “freeze
current layout” operation converts computed geometry into authored exact
positions and dimensions.

### A.12 Provenance reconsideration gate

Test whether structural separation fully distinguishes authored, computed, and
continuity geometry. Add per-carrier provenance only if a named interchange or
migration case remains ambiguous. Do not introduce provenance merely to record
which UI gesture produced an otherwise unambiguous authored field; gesture
history is not GraphIR meaning.
