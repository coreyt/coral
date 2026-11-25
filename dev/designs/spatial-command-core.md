# Deterministic spatial-command core

Status: accepted for C30 implementation after independent review

## Scope and ownership

C30 implements R-040 as a pure internal module under
`packages/diagram-editor/src/llm/spatial/`. It owns recognition, reference and
scope resolution, immutable geometry capture, transforms, preservation checks,
and independent outcome evaluation. C35 will adapt live React Flow state,
provider candidates, Coral printing, Mermaid conversion, retries, and editor
commit/history behavior to this core. C40 continues to own transport retry,
backoff, cancellation, and telemetry.

The spatial core imports only GraphIR types re-exported by
`@coral-viz/language`. It must not import React, React Flow, ELK, provider
adapters, browser globals, parsers/printers, hooks, or components. Its barrel is
`llm/spatial/index.ts`; the existing private editor package may re-export that
barrel through `llm/index.ts` without changing a published package.

## Current-state audit and research

Plan baseline is `3c366b5` (2026-09-08); implementation starts from `fff98e8`.
Issue #60 remains open and asks for relative placement, left/right extremes,
row/column arrangement, and composition with content changes. R-025 and commit
`b67bd05` currently send id, label, top-left x/y, pin state, endpoints and
waypoints to a model, validate syntax/notation, and use a greater-than-50%
node-loss drift check. They neither capture measured bounds nor prove an
outcome. C10 subsequently made measured dimensions/font sizing deterministic;
C20 made node and waypoint gestures transactional and canonical geometry
lossless. C30 must preserve both authorities and must not enter their live
state/history paths.

Primary-source review performed 2026-09-09:

- React Flow's current Node documentation defines `parentId`, `measured`, and
  `origin`; NodeOrigin defines `[0,0]` as top-left and `[0.5,0.5]` as center.
  Its sub-flow guide says a child position is relative to its parent's top-left
  and moving the parent moves the child. The installed release dependency is
  exactly `@xyflow/react@12.11.6`; C35 must adapt that installed shape into the
  neutral input below rather than letting the core inspect React Flow objects.
  Sources: <https://reactflow.dev/api-reference/types/node>,
  <https://reactflow.dev/api-reference/types/node-origin>, and
  <https://reactflow.dev/learn/layouting/sub-flows>.
- ELK documents parent-relative shape coordinates by default and configurable
  ROOT/PARENT JSON coordinate modes. Its option registry exposes algorithm and
  hierarchy options, but support depends on the selected layout algorithm.
  Whole-graph ELK is therefore rejected for C30 transforms: it cannot establish
  the exact allowed-change boundary and may reposition unrelated nodes. C30
  uses direct rectangle transforms. C35/Slice 60 may still use ELK outside this
  engine for ordinary reflow. Sources:
  <https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/coordinatesystem.html>,
  <https://eclipse.dev/elk/reference/options.html>, and
  <https://eclipse.dev/elk/documentation/tooldevelopers/usingalgorithmsdirectly.html>.
- Installed `@graph-ir/core@0.2.0` defines node `position`, `dimensions`,
  `parent`, `children`, and `pinned`, plus edge `routingPoints`; positions do
  not carry viewport state or an origin. The core therefore takes a separate
  captured geometry input and writes only GraphIR parent-relative `position`.

## Versioned command grammar

`recognizeSpatialRequest(text)` implements grammar version 1. Matching is
case-insensitive; leading/trailing whitespace and terminal punctuation are
ignored, while returned offsets refer to the original string. References are
either unquoted IDs matching `[A-Za-z_][A-Za-z0-9_.-]*` or double-quoted labels
with JSON string escaping. Whitespace outside quoted references is
insignificant. The closed forms are:

```text
(move|put|place) SUBJECT (above|below|left of|to the left of|right of|to the right of) TARGET
(move|put|place) SUBJECT (at|on) the (top|bottom|left|right) [side] [of the diagram | (inside|within) GROUP]
arrange MEMBER_LIST (in|into|as) [a] (row|column) [DIRECTION]
arrange (members|children) of GROUP (in|into|as) [a] (row|column) [DIRECTION]
```

`MEMBER_LIST` contains at least two references: either `A and B` or a
comma-separated list with optional final `and`.
Row directions are `left to right` (default) and `right to left`; column
directions are `top to bottom` (default) and `bottom to top`. A missing boundary
scope means the diagram. An explicit boundary scope must resolve to a group.
Group arrangements use direct children in their current graph order.

The recognizer lexes quotes before separators. A spatial clause is either the
whole trimmed request or one segment delimited by `;` or a line boundary;
terminal `.`, `!`, or `?` belongs to that segment but is excluded from its
consumed range. A whole command is `spatial-only`; exactly one command segment
plus another non-spatial segment is `mixed`, with the remainder opaque for
C35. `move A above B and rename C` has no legal clause boundary and is
unsupported; `move A above B; rename C` is mixed. `move "A and B" above C`
retains the quoted label. More than one spatial segment, malformed/unterminated
quotes, pronouns, direction/axis mismatches, or other spatial-looking text is
`unsupported` with `spatial.unsupported`. `of the diagram` always selects the
built-in diagram scope and is never resolved as a group. Text without spatial
trigger tokens outside quotes is `non-spatial`. Consumed `{start,end}` offsets
are UTF-16 string offsets into the original request with `end` exclusive. C30
does not build general NLP or infer additions such as "it".

## Interfaces and immutable data flow

The public internal types are JSON-serializable readonly records:

```text
text -> recognizeSpatialRequest -> SpatialRecognition
graph + captured geometry + recognition -> resolveSpatialPlan -> SpatialPlan
original + candidate + plan -> applySpatialPlan (includes preservation)
graph + plan -> evaluateSpatialPlan (geometry evidence only)
successful graph + plan -> materializeSpatialSnapshot (explicit save helper)
```

`CapturedNodeGeometry` contains `id`, the view's parent-relative anchor
`position`, `width`, `height`, optional `origin` (default `[0,0]`), and optional
`parentId`. Resolution validates finite positive geometry, unique IDs,
agreement between the graph hierarchy and captured `parentId`, and an acyclic
complete parent chain. It computes canonical parent-relative top-left as
`viewAnchor - origin * size`, then absolute top-left by accumulating canonical
parent-relative top-left through the parent chain. Both canonical position and
absolute rectangle are frozen into the plan. GraphIR has no origin, so every
written GraphIR position is canonical top-left; the view origin is never added
back on persistence. On reload, current `projectDiagramNodes` therefore
projects the stored top-left correctly with its default origin. Viewport
transforms never enter this interface.

Captured geometry, not optional GraphIR `position`, is the authority for the
planned revision. An absent or different GraphIR position is valid: the canvas
may contain computed layout that text does not persist. For evaluation,
non-subject nodes and parents use captured canonical positions, while every
operation subject uses its GraphIR position. The transform always writes a
canonical position for every subject, including a pinned arrangement anchor or
the stationary first member of an unpinned arrangement, so the evaluator never
has to infer whether a subject position came from the transform. The snapshot
also records each baseline GraphIR position (including absence) for freshness
and preservation. A candidate cannot move a pinned arrangement anchor: unlike
other planned subject positions, its candidate position must equal the
`original` argument's position for that apply call before transform. It is not
permanently compared with the initial captured GraphIR position, so an accepted
canonicalized result can be reapplied.

Preservation still compares candidate GraphIR fields with the original GraphIR
fields, so a candidate cannot add or alter an unplanned position merely because
captured geometry exists. Before applying, the core validates that every
baseline graph id/version, node and edge still exists with protected hierarchy,
dimensions, pins, endpoints, and captured membership. Baseline entities are a
protected subset for a mixed plan: permitted later additions neither make the
plan stale nor join its frozen group membership or diagram-boundary scope.
Removal, reparenting, or protected-field changes fail as stale rather than
targeting a different revision.

`SpatialPlan` has `version: 1`, classification, one resolved operation, ordered
subject IDs, optional target/scope ID, the complete captured snapshot, gap,
tolerance, pin policy, and ordered `positionDependencies`. Relative placement
depends on subject and target; group boundary placement on subject and group;
diagram-boundary placement on the captured diagram members that define its
extent; arrangement on all members. Defaults are a 24 diagram-unit gap and
0.5-unit tolerance; callers may supply finite non-negative overrides at
resolution. Dependencies include the transitive ancestor closure needed to
reconstruct each absolute rectangle and are deterministically deduplicated in
preorder graph order.
Reference resolution searches all nested nodes: exact case-sensitive ID first,
then a case-folded, trimmed, whitespace-collapsed label that must be unique.
Self-reference, duplicate arrangement members, a target inside a moved subject
group, and a moved subject inside its target are contradictory because their
absolute relation cannot be changed independently. V1 also rejects an
arrangement containing any ancestor/descendant pair. A direct move of a group
changes the absolute location of its subtree by normal containment semantics;
descendant relative positions and pins remain byte-for-byte unchanged.

## Auto-layout and saved coordinates

An R-040 command is a transient, one-shot layout constraint. It is not stored
as a live rule such as “A must always remain above B.” Diagrams that do not
need fixed geometry may continue omitting every GraphIR `position` and using
ordinary auto-layout. Apply writes concrete canonical positions for every
operation subject; it does not silently materialize or pin the rest of an
auto-laid-out diagram.

The plan's `positionDependencies` make faithful persistence an explicit C35
choice. If the user saves the computed spatial snapshot, C35 must use transformed
canonical positions for operation subjects and captured canonical positions for
all other dependencies and ancestors before printing/saving. It overwrites an
older differing GraphIR position as part of that explicit snapshot-save choice;
otherwise reload would not reconstruct the geometry the user chose to save. A
relation whose anchor remains transient is valid for the current revision but
is not claimed to survive reload/reflow.
The pure `materializeSpatialSnapshot(successfulGraph, plan)` helper performs
exactly that explicit copy without changing pins or non-position fields; C30
tests it, while C35 decides when the user-visible save path invokes it.
For a diagram-boundary command, faithful snapshot persistence can therefore
mean materializing the whole captured extent; C35 may expose that consequence
rather than doing it silently. A later explicit reflow follows the editor's
existing position/pin policy. Persisting relational constraints or teaching
all future auto-layouts to maintain them requires a future versioned GraphIR
feature and is outside C30/C35.

Every API returns a discriminated result and stable `SpatialDiagnostic`
records ordered by operation/member order. Codes cover unsupported syntax,
missing/ambiguous reference, invalid scope/geometry, duplicate member,
contradiction, pinned-anchor alignment/order/space, preservation violations,
and unsatisfied outcomes. Messages are deterministic and contain IDs rather
than serialized graph/provider content. No exception is used for expected
input failure.

## Transform rules

Relative placement moves only the subject. Above/below set its y so the two
rectangles have exactly `gap` separation and align their horizontal centers;
left/right do the symmetric operation and align vertical centers. A directly
named pinned subject may move and retains `pinned: true`.

Boundary placement uses the captured scope rectangle. For the diagram that is
the union of all captured top-level and descendant rectangles; for a group it
is the group's captured rectangle. Top/bottom changes y and preserves x;
left/right changes x and preserves y. The moved rectangle is inset by `gap`
for a group. For the diagram, where there is no enclosing frame, its outside
edge is placed on the captured union edge. Resolution rejects a subject that
cannot fit inside an explicit group after the inset. Evaluation requires the
subject edge to match the selected boundary within tolerance and remain within
the other scope axis.

Row/column arrangement is size-aware. The explicit/directed order is the axis
order. With no pinned member, the first ordered member retains its axis start
and center on the orthogonal axis; later members are placed with exact gaps.
With pinned members, their positions are immutable. Pinned centers must align
on the orthogonal axis within tolerance and occur in requested axis order.
Movable members before/after the outer anchors use exact gaps. Members between
two anchors share available surplus evenly; insufficient room is an error.
This makes every result deterministic without relying on object enumeration.

All moves are calculated in absolute diagram space, then converted to canonical
GraphIR position by subtracting the unchanged parent's captured absolute
top-left; no view-origin offset is added. The unchanged-parent premise is
enforced by the ancestry exclusions above. The transform recursively rebuilds
only subject GraphIR node paths and spreads all existing fields. It writes every
subject's resolved canonical position even when that subject was the stationary
arrangement anchor. It never
reparents, resizes, unpins, reroutes, or mutates its inputs. It re-evaluates
before returning success.

## Preservation, evaluation, and failures

The only authoritative mutation API is
`applySpatialPlan({ original, candidate, plan })`. It first validates plan
freshness and preservation, then transforms, then independently evaluates. A
separately exported `checkSpatialPreservation` is diagnostic convenience only;
callers cannot bypass the same check inside apply.

In `spatial-only`, deep structural equality is required after masking planned
subject positions, except that pinned arrangement-anchor positions are never
masked and provider changes to them are rejected. In `mixed`, the policy is
field-exact:

- graph `version`, `id`, `layoutOptions`, and unknown existing graph keys are
  protected; `name` and `metadata` may change;
- every existing node remains with the same id, parent/ancestry, relative order
  among existing siblings, dimensions, pin, ports, node layout options,
  unplanned position, and unknown existing node keys; known content fields
  `type`, `label`, `description`, `symbol`, `variant`, `properties`, and
  `sourceInfo` may change;
- every existing edge remains with the same id, endpoints/ports,
  `routingPoints`, and unknown existing edge keys; known content fields `type`,
  `label`, `properties`, `style`, and `sourceInfo` may change; and
- new top-level or nested nodes and new edges are allowed, provided existing
  children remain an ordered subsequence rather than requiring identical child
  arrays.

Thus unknown JSON-safe extensions on existing entities may not be removed or
changed incidentally. This is a geometry/identity safety boundary, not a claim
that C30 understood opaque prose; C35 owns ordinary candidate quality.

The geometry-only evaluator uses GraphIR positions for all subjects and
captured positions for every other baseline node, then emits one ordered
evidence record per predicate with
measured separation/alignment/boundary/order values and tolerance. It never
claims preservation and is subordinate to authoritative apply. Apply returns
the exact `original` reference on preservation, freshness, transform, or
evaluation failure; success returns `candidate` unchanged only when every
subject already has the resolved canonical position. Reapplying a successful
result with it as both original and candidate is a fixpoint. For mixed plans,
accepted additions remain outside frozen membership and scope, so their
presence does not make that reapplication stale.

## Compatibility, accessibility, security, and performance

The diagram editor is private, no existing LLM request/result type changes in
C30, no persisted schema changes, and GraphIR remains exactly 1.0.0 through
`@graph-ir/core@0.2.0`. C30 has no UI, so it creates no direct accessibility
surface; diagnostics/evidence are structured for C35 to announce. It performs
no network, credential, filesystem, logging, or environment access.

Resolution, preservation, transform, and evaluation are each linear in graph
entities plus reference-label matches; maps replace repeated tree scans.
Arrangement sorting follows explicit order and does not invoke ELK. Inputs are
treated as immutable, but the implementation does not recursively deep-freeze
user GraphIR because that would mutate ownership expectations and add avoidable
cost. A deeply nested fixture guards against repeated full ancestor walks;
absolute parents are memoized and each node chain is resolved once.

## Alternatives rejected

- Trust provider-emitted coordinates or explanations: not independent evidence.
- Change global ELK direction for row/column: can move unrelated nodes and does
  not express explicit membership/order.
- Run ELK with constraints for each command: algorithm support varies and the
  allowed-change boundary is not enforceable.
- Persist relational constraints in GraphIR: GraphIR 0.2.0 has no versioned
  contract for them; C30 needs transient commands and durable result positions.
- General natural-language/compound-command parsing: overbuilds issue #60 and
  makes deterministic classification impossible to audit.

## Requirement-to-test plan

| Requirement | RED/GREEN evidence |
| --- | --- |
| R-040 AC-1 | `intent.test.ts`, `resolve.test.ts`: every grammar spelling, UTF-16 ranges/classification, quotes/escapes/separators, `move A above B and rename C`, `move "A and B" above C`, explicit diagram scope, ID precedence, normalized labels, group members, ancestor-closed persistence dependencies, missing/ambiguous/unsupported/duplicate cases |
| R-040 AC-2 | `transform.test.ts`: all relations at failure/boundary/success; unequal sizes, negative coordinates, non-default-origin normalization through GraphIR reload projection, absent/mismatched GraphIR positions, nested parents, deep nesting, snapshot materialization overwriting stale dependency coordinates, diagram/group boundaries, reverse row/column directions |
| R-040 AC-3 | `transform.test.ts`: direct pinned group/subtree moves; zero/one/multiple anchor arrangements; pinned and first-member anchors whose GraphIR positions differ from capture; provider-moved pinned anchor rejection, misalignment, reversed anchors, insufficient space, relative and arrangement ancestry contradictions; original reference on failure |
| R-040 AC-4 | `preserve.test.ts`: spatial-only exact diff; mixed top-level/nested additions and known content edits; existing-child subsequence; removals, endpoint/hierarchy/dimension/pin/node+graph-layout/route/unplanned-position rejection; JSON-safe extension deletion/change and waypoint retention |
| R-040 AC-5 | `evaluate.test.ts`: apply cannot bypass preservation, post-check candidate alteration fails, independent numeric evidence, unsatisfied candidates, stable ordering, exact original-reference failures, immutability, mixed nested-addition reapply fixpoint versus stale removal/reparenting, no browser/provider imports |

Focused tests run under Vitest's Node environment, followed by the complete
diagram-editor suite, typecheck/build, root `npm run verify`, coverage, docs
link checking, and `git diff --check`. C30 intentionally has no browser or live
provider claim; those gates are C35.
