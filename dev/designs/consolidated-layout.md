# Consolidated Layout Design

Status: implemented shared engine in 0.2.4 Slice 60;
final spatial geometry and waypoint integration extended for 0.2.9 Slice 20.

## Decision

Publish one generic, non-React ELK owner at `@coral-viz/render/layout`. It owns
ELK graph construction, invocation and result decoding. Existing viz, position
stability, private editor and MCP functions remain adapters and preserve their
0.2.3 signatures, defaults, coordinate frames, fallbacks and result shapes.

Only the reference editor's initial-layout and explicit-reflow paths use a
worker. Stateless public viz helpers, Node callers and MCP invoke the shared
engine directly. There is no module-global "latest layout" state and no public
API cancellation change in this slice.

The render root does not re-export layout, so ordinary shape, notation and SVG
imports do not eagerly load ELK. Viz and MCP retain their published direct
`elkjs` dependencies for 0.2.3 compatibility even after their runtime calls
delegate to render. This is a behavior-preserving consolidation, not a new
layout framework.

## Final spatial geometry (0.2.9)

`@coral-viz/render/layout` owns measured rectangles, contour contacts, engine
adaptation, route repair, and final validation. Scene consumers use the same
contour resolver; a finished route is checked again against the actual painted
bodies after fitting. Parent-local positions stay local in source and editor
nodes. Routers receive graph-absolute rectangles, contacts, and checkpoints;
flattened SVG nodes retain parent identity so ancestor frames are not mistaken
for unrelated obstacles. Rectangular container frames stretch to those measured
bounds and reserve a measured title band above child content; their captions
also remain routing obstacles. Child coordinates retain their source/adapter
frame; generated title padding does not move authored local positions.

Absent and empty port lists impose no fixed contacts. Named fixed ports retain
their exact point; free semantic ports retain their accepted side/corner class
and derived choice. An implicit authored-route endpoint faces its adjacent
vertex; a single-incident automatic free port may make the same derived choice. Generated elbows can be simplified or repaired; exact authored vertices
and their order remain unchanged. A deliberate coincident checkpoint join is
allowed when the route also contains nonzero travel. Conflicting exact geometry
produces an edge diagnostic rather than a successful current scene or export.

ELK remains the placement owner. libavoided-js repairs generated corridors and
routes transient editor checkpoints between independently obstacle-routed legs.
Its direct fallback and pinned-waypoint bypass are not accepted as proof of
clearance. Endpoint escapes preserve exit/arrival direction; final checks catch
body penetration, discontinuity, non-finite coordinates, missing identities,
and explicitly requested routing-style conflicts. Repair occurs before typed
edge/label constraints are accepted. Sequence retains its specialized layout.

Clear orthogonal checkpoint legs can bypass grid construction after validating
contacts, directions, and the preferred obstacle clearance. Other short repairs
try a local engine grid before rebuilding a diagram-wide grid. Every candidate
still checks the full obstacle set; omitted obstacles retain explicit preferred
clearance checks. Global preferred-margin routing precedes any zero-margin
local retry, and the original global narrow-corridor fallback remains available.
Final route and painted-scene validation apply to every path.

Only connectors with transient waypoint edits receive waypoint overrides.
Durable source routes go through the shared source resolver. Cached overrides
include dimensions, absolute parent geometry, obstacles, ports, checkpoints,
and routing options; a failed recomputation cannot return an older success.
Controller revision/cancellation checks remain the authority for worker
publication, including when a precomputed candidate bypasses engine invocation.

The production-source spatial fixtures are shared by renderer and browser/MCP
consumer tests. Run `npm run test:run -w @coral-viz/render` and
`npm run test:run -w @coral-viz/viz`; normal workspace tests discover the
regressions. `e2e/spatial-quality029.spec.ts` checks the editor, Reflow, and
exported SVG. Complete-operation and gesture timing use the existing
[performance budgets](../../docs/contribute/reference/performance-budgets.md).

### Readability defaults and regressions

The [rendering specification](visual-rendering-specification.md#diagram-readability)
owns the visual requirements. Shared code supplies the following current
measurements; they are layout defaults and regression tolerances, not new
source syntax or universal distances for every diagram.

- `stencilLabelSizing028` defines usable text regions for capsules, slanted IO,
  documents, and cylinders. Shared sizing and drawing use the same region and
  glyph ink metrics. Automatically sized nodes grow to fit; exact authored
  dimensions retain their existing contract.
- Text-region and caption stencils (the capsule, slanted IO, document,
  cylinder and hexagon bodies, and the brain, actor and funnel captions) keep
  their proportions. Automatic sizing picks the smallest frame whose own text
  box holds the label wrapped at that box's width, never narrower than the
  stencil's default column, so sizing and drawing wrap identically and area
  grows at most linearly with label length. A 100-character brain caption is
  212×276, not the 543×706 of 0.2.9.
- Generated orthogonal routes keep their lane at a free contact: the contact
  slides along the arriving segment's axis to the visible outline
  (`laneContourContact029`). Final validation squares a diagonal leg in a bent
  generated route when a clear elbow exists. Direct shortcuts, all-diagonal
  polylines and decision or gateway branch departures stay as drawn.
- For an automatic labeled edge between distinct nodes in a horizontal layout,
  without an exact authored route, reserve at least its measured label width
  plus 48 px between layers. Self-loops do not use this reservation. Horizontal
  classifier-label candidates leave 24 px at each end of the shaft section
  and an 8 px gap above or below it. Collision checks still decide whether a candidate is usable;
  other routing topologies retain the general placement search. Larger explicit
  spacing and authored label placements retain precedence.
- The ELK adapter passes normalized spacing into each compound subgraph, with
  local overrides taking precedence. A container must not revert its children
  to ELK's smaller internal layer-spacing default.
- Code layout defaults to 28 px of edge-to-node spacing between layers so branch
  traversals clear their source frame. Editor load/Reflow and direct rendering
  use `codeBranchRoutingDefaults028` before computing candidates. Explicit
  caller/default options and exact authored routes keep precedence.

The ordinary workspace tests already discover these executable examples:

| Example or property | Regression owner |
| --- | --- |
| Start, Send response, Receipt, and Store ink within usable shape bodies in both styles | [Safe label regions](../../packages/render/test/labelSafeRegions029.test.ts) |
| Text-region stencil area grows at most linearly; sizing and drawing use one wrap | [Sizing](../../packages/render/test/sizing.test.ts) |
| Generated routes draw in all four directions with no slanted legs across a seeded corpus | [Route robustness](../../packages/render/test/routeRobustness0210.test.ts) |
| Social Network labels within widened column gaps, near shafts and clear of bodies; larger configured spacing retained | [Rendered scenes](../../packages/render/test/renderScene028.test.ts) |
| Nested production layout at 80 px and 160 px; inherited spacing, local overrides and unchanged source | [Layout engine](../../packages/render/test/layout.test.ts) |
| Code spine/order, final branch clearance, parallel shafts, obstacle checkpoints and crossings in both styles | [Spatial corpus](../../packages/render/test/spatial-corpus029.test.ts) |
| Explicit Code branch spacing wins over defaults | [Branch spacing](../../packages/render/test/codeBranchSpacing029.test.ts) |
| Code branch clearance during initial load and Reflow | [Editor layout](../../packages/diagram-editor/test/diagramLayout.test.ts) |

Keep these behavior assertions when refactoring. Add a reduced failing case to
its existing test owner when new feedback exposes a gap. Inspect current renders
when text or route appearance changes; numeric success is necessary but cannot
settle optical centering by itself.

## Shared boundary

The structured-clone-safe model is intentionally small:

```ts
interface LayoutRequest {
  id: string;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  options?: LayoutOptionInput;
  defaults: LayoutDefaults;
}

interface LayoutNode {
  id: string;
  width: number;
  height: number;
  position?: Point;
  pinned?: boolean;
  ports?: Array<{
    id: string;
    side: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
    position?: number;
  }>;
  layoutOptions?: NodeLayoutOptionInput;
  children?: LayoutNode[];
}

interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
}

interface LayoutResult {
  nodes: Array<{
    id: string;
    parentId?: string;
    position: Point;
    absolutePosition: Point;
    width: number;
    height: number;
  }>;
  edges: Array<{ id: string; sections: LayoutSection[] }>;
  width: number;
  height: number;
  effectiveOptions: Record<string, string>;
  diagnostics: LayoutDiagnostic[];
}
```

`defaults` is required. A direct subpath caller must choose its behavior rather
than inherit a new global Coral default. It contains a valid algorithm and
direction; spacing, routing and hierarchy keys are optional so a wrapper may
continue using ELK defaults. `LayoutOptionInput` accepts algorithm, direction,
spacing, routing, hierarchy and primitive advanced ELK options. Normalization
returns a complete effective ELK option map plus stable diagnostics. Invalid
input falls back to the last valid value from required caller defaults.

Supported algorithms are `layered`, `mrtree`, `stress`, `force`, `radial`,
`box` and `fixed`; `tree` aliases to `mrtree`. Directions are UP, DOWN, LEFT
and RIGHT. Routing accepts current GraphIR/ELK spellings. Positive finite
spacing maps as follows:

| Input | ELK option |
| --- | --- |
| GraphIR `nodeNode` / editor `nodeNode` | `elk.spacing.nodeNode` |
| GraphIR `nodeEdge` / editor `edgeNode` | `elk.spacing.edgeNode` |
| GraphIR `edgeEdge` | `elk.spacing.edgeEdge` |
| `layerSpacing` | `elk.layered.spacing.nodeNodeBetweenLayers` |

Advanced reserved keys are parsed through the same validators so typed and
effective options cannot disagree. Other primitive ELK options pass through as
strings. GraphIR node options map without loss: padding, port constraints,
port alignment, minimum size and each size constraint. Per-node options win at
the node boundary and do not leak to graph defaults.

`computeElkLayout(request, { signal?, engine? })` checks cancellation before
construction, before invocation and after resolution. Abort rejects with a
DOM-compatible `AbortError`. Engine rejection throws `LayoutExecutionError`
with one sanitized `layout.engine.failed` diagnostic; it never includes graph
content or an upstream error message. The injectable engine is for focused
tests. `getElkLayoutEngine()` owns the production singleton.

ELK ports use ordinal internal IDs with explicit lookup maps; canonical node or
port IDs are never concatenated and guessed apart. An explicitly supplied
`ports` field is authoritative, including `ports: []`. When absent, the editor
adapter supplies the exact notation registry ports, and only a node with no
registry entry receives the existing legacy anchors. Invalid positions use
0.5 with a diagnostic. A missing referenced port diagnoses and attaches to the
node boundary. View-only inout suffixes are canonicalized by the editor before
the shared boundary.

One recursive decoder retains parent-relative coordinates, calculates
absolute coordinates and retains every edge section. Adapters project that
result into their existing form.

## Compatibility adapters

| Adapter | Preserved contract |
| --- | --- |
| viz `layoutGraph` | layered/DOWN and 150x50 defaults; GraphIR recursion and absolute positions; rejection remains rejection |
| viz `layoutFlowNodes` | layered/DOWN and 150x50; parent-relative React Flow nodes; existing call/result shape |
| viz `layoutFlowNodesWithEdges` | same node behavior and existing first-section routing map |
| viz `incrementalLayout` | node 50/layer 70; existing positions restored and only missing nodes placed; existing direct-call deterministic fallback |
| private editor `layoutNodes` | DOWN, node 50, edge 15, layer 70; measured sizes, registry ports, parent-relative nodes and first-section routing |
| MCP `computeLayout` / `coral_layout` | layered/RIGHT, node/layer 50, 150x60, INCLUDE_CHILDREN; absolute flattened response and unchanged envelope |
| MCP render geometry | complete geometry bypass; partial position overlay and conservative discard of all computed routes; RIGHT, node 50/layer 80 and current measured/default size |

`getElk()` delegates to the shared singleton and retains its published type.
`extractEdgeSections` remains a pure compatibility projector. The adapters do
not acquire new callbacks, signals, diagnostics fields or result fields unless
the current API already has an extension location. Shared diagnostics are used
internally by the editor; existing public rejection behavior remains intact.

Pin and explicit-position overlays remain adapter policy. MCP partial render
continues discarding every computed ELK route when any supplied position is
overlaid. The editor uses changed-endpoint invalidation described below. The consolidation
does not resize containers, shift negative children, normalize existing group
bounds or otherwise add geometry behavior. After an adapter restores a node or
ancestor position, it compares raw and final absolute rectangles and removes
sections incident to every changed endpoint, including descendants displaced
by a restored ancestor. Explicit reflow clears waypoints only in the existing
successful history transaction. Failure or abort retains graph, routes,
waypoints and history.

## Notation profiles

Each of the eight installed render notation definitions registers plain layout
metadata. The engine remains notation-agnostic. Profiles deliberately use the
deterministic layered algorithm for this initial release; differences are
direction, spacing, routing and applicable layered ordering hints:

| Notation | Direction | node/edge/layer | Routing | Ordering |
| --- | --- | --- | --- | --- |
| flowchart | DOWN | 50/20/70 | ORTHOGONAL | model order + force node order |
| BPMN | RIGHT | 60/25/90 | ORTHOGONAL | model order + force node order |
| ERD | RIGHT | 80/20/80 | POLYLINE | model order |
| code | DOWN | 50/20/80 | ORTHOGONAL | model order |
| architecture | DOWN | 90/25/90 | POLYLINE | model order |
| AI/ML | RIGHT | 60/20/90 | ORTHOGONAL | model order |
| data engineering | RIGHT | 70/25/100 | ORTHOGONAL | model order + force node order |
| sketch | DOWN | 60/20/80 | SPLINES | model order |

Model order means exactly
`elk.layered.considerModelOrder.strategy = NODES_AND_EDGES`; force order means
`elk.layered.crossingMinimization.forceNodeModelOrder = true`. A closed-schema
test rejects unknown profile fields, unsupported ELK keys and invalid values.

`LayoutSettings` gains optional `profile: 'notation'` and sparse
`profileOverrides`. With no profile, the complete existing concrete layout is
used unchanged. Profile resolution is global profile defaults, notation
metadata, then sparse overrides. Scalars replace; spacing and `elkOptions`
merge per key; `undefined` does not erase an inherited key. Unknown profile,
unknown notation or any invalid override emits exactly one stable diagnostic
and returns the complete pre-profile legacy settings—never a partial profile.

The settings UI adds an opt-in toggle. In profile mode, edits create sparse
overrides; selecting a generic preset clears profile mode. Toggle, edit,
save/load and recovery remain covered by existing settings/file boundaries.
The toggle and notation changes never initiate layout. Profiles are resolved
only by initial layout of unpositioned content or explicit Apply/Reflow.

## Editor worker and cancellation

The private editor adapter sends the shared request to a Vite module worker.
The current Slice 40 owner holds its `AbortController`; edit, newer layout,
load, recovery replacement, format change, notation change, undo, redo and
unmount each abort the owned job. Its revision token remains the final
authority against late commits. Settlement clears loading/reflow state only if
the request still owns it.

Abort settles once, removes listeners, terminates once, is not announced as an
error and never falls back. Worker construction, cloning, message or execution
failure returns a sanitized diagnostic. It may run the shared engine on the
main thread only when recursive node count is at most 100. Larger requests
retain existing geometry and report `layout.worker.unavailable`. Browser
incremental/public helpers are not routed through this client, so their legacy
direct fallback cannot bypass the editor cap.

## Focused performance evidence

The shared deterministic connected fixture has 100, 500 and 2000-node tiers.
For each tier, record 20 cold samples using a newly constructed engine and 20
warm samples from the singleton. Cold samples receive no engine warm-up; the
warm series receives one unrecorded warm-up. Record raw values, median,
nearest-rank p95 and a 200-versus-2000 growth ratio. Enforce p95 completion
budgets of 500 ms, 2 s and 10 s.

A separate serial Playwright config with `retries: 0`, run on the attributable
controlled release machine rather than a GitHub-hosted shared runner, loads one production-path
500-node editor fixture. It measures 20 node-drag and 20 zoom
input-to-double-animation-frame samples after one warm-up. Each iteration restores the same
viewport and node position through production undo/reset controls before the
next sample, waits for the newer recovery checkpoint containing that restored
position, and settles two frames. Drag-threshold crossing likewise settles two
frames before the timed steady-state move; setup time is excluded. Record raw values, median, p95, browser,
OS/hardware and long tasks. Drag p95 must be at most 45 ms and zoom p95 at
most 55 ms.
Playwright trace and video recording are disabled for this benchmark because
both instrument the browser continuously even under retain-on-failure mode;
the separate functional Chromium configuration retains those diagnostics.
Selection, connection, waypoint, keyboard-authoring and text editing retain
functional tests and may be observed, but acquire no new timing gate.

R-026 parse/print/SVG budgets keep their existing thresholds and shape tests.
Their performance document is corrected to record the actual current sampling
method; this slice does not expand them into a second calibration project.

## Alternatives and exclusions

- Keeping four ELK owners leaves the known port/default divergence unfixed.
- A new layout package adds release surface without improving dependency flow.
- Moving all public browser helpers into workers changes bundling, cancellation
  and fallback behavior for little interactive benefit; rejected.
- Stress/force profile experimentation and automatic container resizing are
  potentially useful but behavior-changing; deferred beyond 0.2.4.
- A broad browser timing matrix is fragile and duplicates functional coverage;
  only shared ELK and 500-node drag/zoom are hard gates.

No new notation, algorithm, GraphIR/schema version, parser syntax, public
cancellation API, React Flow rewrite, sequence/class/swim-lane semantics or
publication action is part of R-039.

## Verification and release closure

- AC-1/2: common engine tests, GraphIR graph/node option tests, wrapper parity,
  packed API comparison and static direct-ELK-owner check.
- AC-3: eight-profile closed-schema, precedence, invalid fallback, UI and file
  round-trip tests.
- AC-4: nested ports/pins/explicit positions/sections and stale-route tests plus
  existing waypoint/history suites.
- AC-5: worker settlement/failure/cap tests and explicit tests for all nine
  superseders.
- AC-6/7: focused package suites, deterministic ELK benchmark and isolated
  zero-retry 500-node Chromium gate on the controlled release machine.
- AC-8: exact Node 24.19.0/npm 12.0.2/TypeScript 6.0.3 clean install, unit rows
  for all six workspaces, required R-030 coverage for viz/MCP/editor,
  observational language/render coverage, and the remaining local/external
  release ledger.

The atomic 0.2.4 version change happens only after the behavior is green.
GraphIR remains 0.2.0/schema 1.0.0. Three-platform CI, OIDC publication,
registry-only verification, tag and issue closure remain real external gates;
local success cannot satisfy them. Slice 50 NVDA/VoiceOver targets remain
experimental and untested but are non-blocking for 0.2.4.
