# Coral Visual Rendering Specification

Status: consolidated rendering direction and current-behavior reference,
recorded 2026-09-13 during Slice 45; diagram readability requirements extended
by the 2026-10-17 review of 0.2.9 Slice 20. User-approved principles are
separated below from released contracts and future implementation. Open policy
details still require requirements reconciliation; this document does not
silently change 0.2.x APIs, file formats, geometry precedence, or reflow
behavior.

## Product purpose and authority

Coral is text-first/text-primary diagramming. Users and LLMs should express
meaning and layout intent in lightweight Coral DSL and obtain a readable diagram
through layout and rendering. Source embedded in Markdown, architecture/design
documents, or code comments should be useful to compatible renderers without an
original editor session. IDE helpers are consumers of Coral; repository indexing
and ownership of an IDE/workspace remain outside Coral.

GraphIR remains the internal interchange and application-state boundary. That
technical role does not make the text a secondary user experience. The text
definition must express representable authored meaning and intent; hidden editor
state must not be its unexplained semantic authority. Round-trip compatibility
and conversion-loss reporting remain governed by R-035 and the existing design.

## Rendering preference

### Agreed principles

- Coral text, based on Coral DSL, expresses the diagram and its authored layout
  intent.
- Rendering produces geometry.
- Exact geometry may be preserved for continuity or explicit user constraints,
  but must not become an invisible prerequisite for understanding or reproducing
  the diagram.
- Coral hints, intents, and deliberate waypoints are the preferred canonical
  textual ways to guide layout; the rendering system must interpret supported
  guidance rather than relying on editor-only effects.
- Do not serialize everything. The renderer owns documented defaults; ordinary
  source need not enumerate every effective setting or generated coordinate.
  Shape-aware label placement follows [Diagram readability](#diagram-readability).

These principles define the target, not a claim that every intent is already
expressible in the current DSL or obeyed by every rendering path.

Prefer automatic layout guided by spatial commands/intents and deliberate
waypoint usage over manually specifying exact coordinates. Reflow, ELK, and
supported routing mechanisms should produce a good-looking diagram from text.
Precise placement remains supported for users who need it, but is an explicit
advanced technique, not the default authoring burden imposed on users or LLMs.

Distinguish these categories conceptually; this distinction does not introduce
new persisted provenance fields in 0.2.5:

| Category | Examples | Treatment |
| --- | --- | --- |
| Authored meaning | Identity, nodes, edges, labels, grouping, relevant metadata | Represent in source where supported; preserve canonical data and diagnose conversion loss |
| Authored layout intent | Direction, spacing, supported node spatial intents, deliberate waypoints, explicit pins | Prefer readable guidance and expose constraints clearly; do not equate transient commands with durable rules |
| Computed geometry | Engine-generated positions, dimensions, routed bends | Preserve for continuity and undo; do not promote every computed coordinate into a mandatory authored constraint |
| Exact authored geometry | Explicit fixed positions and routes | Honor existing contracts and user intent; do not silently discard or reinterpret old data |
| Workspace state | Panels, selected tab, camera pan/zoom | Separate from diagram meaning; follow local-preference and view-state policies |

A generated routing bend is not necessarily a user-authored waypoint. Likewise,
a stored coordinate alone does not prove its provenance or explain whether it
should become a durable constraint. Audit the available distinction before
changing save/print or layout behavior.

## Diagram readability

The 0.2.9 Slice 20 diagram review establishes these visual requirements for
future placement, text fitting, and routing work. They govern the rendered
content in both lowfi and hifi. Compact application chrome does not require
compressed diagrams: allocate space when it improves reading and association.
These requirements do not assert completion of every rendering path or case.

| Area | Required result |
| --- | --- |
| Text inside symbols | Fit the visible glyph ink inside the usable content region, including clearance from strokes and internal decoration. For centered shape labels, center the ink within that region; preserve semantic alignment for classifier rows and headings. A bounding-box center alone is insufficient. Account for the actual font's ascent, descent, and italic ink. |
| Shape meaning | Center Start inside its capsule; keep Send response clear of both slanted sides; place Receipt in the document body above its wave; place Store below the cylinder cap. Apply the same geometry rules to other labels using those shape primitives. |
| Space for content | Let automatically sized nodes and layout gaps grow to fit readable text. Preserve the selected typography. Do not clip labels or push them against outlines to achieve a smaller diagram. |
| Relationship labels | In horizontal class diagrams, reserve measured label room between successive columns. Prefer a clear horizontal section of the associated connection, with the label close to it and wholly inside the available corridor. Keep labels clear of node bodies, other labels, connections, and markers. |
| Nested layout | Apply configured node and layer spacing inside containers as well as outside them. Preserve explicit local overrides. Internal connected nodes need readable connection length, not a compressed gap introduced by engine defaults. |
| Branch departures | Give a generated connection visible outward travel before its first corner. Horizontal branch traversal must clear the source frame; avoid a tiny stub followed by a traversal pressed against the node. |
| Contacts and routes | Attach endpoints to the visible contour, keeping an orthogonal connector's lane at a free contact. Keep feasible parallel connections distinguishable, preserve deliberate shared-port junctions, avoid unnecessary bends and avoidable crossings, and respect obstacles and exact authored waypoints. When no generated alternative exists, a connector may share a corridor with a named `layout.route.degraded` warning; it never passes through a node body. |

The approved Social Network diagram exemplifies room for relationship labels in
both column gaps. The Code containment tree exemplifies a straight module/class
spine, ordered children, and clear branch departures. The parallel-connection
and pinned-obstacle examples establish distinct shafts and faithful routed
checkpoints. Preserve these qualities when improving other diagrams; their
rendered pixels are examples, not permanent coordinate templates.

Exact authored dimensions, ports, pins, routes, and supported constraints keep
their existing precedence. Automatic readability defaults must not silently
rewrite them. Report an incompatible authored requirement through the existing
diagnostics rather than hiding text or changing meaning to make it fit.

The [layout design](consolidated-layout.md#readability-defaults-and-regressions)
owns current measurements, implementation locations, and executable examples.
Future changes to sizing, fonts, layout engines, ports, or routing must retain
those geometric properties under the affected editor and export paths. Extend
an existing fixture for a new failure; use fresh renders of representative
cases to judge optical placement alongside the measured assertions. Screenshots
alone do not enforce these requirements, and a successful engine call alone
does not establish a readable diagram.

## Current implementation and compatibility boundary

- [Architecture](../ARCHITECTURE.md) defines current geometry precedence: direct
  Coral geometry, incremental placement for missing positions, explicit reflow,
  document/recovery side tables, and synchronized save behavior.
- [Lossless projection](graphir-coral-projection.md) and R-035 enumerate canonical
  metadata/geometry fields that must survive Coral parse/print. Preserve those
  promises; text-first does not authorize dropping them or claiming original
  comments/formatting survive canonical printing.
- [Spatial commands](spatial-command-core.md) are currently one-shot operations,
  mostly for nodes. They materialize positions, not persistent relationships
  automatically enforced by later reflows. Snapshot persistence has explicit
  dependency rules; do not describe it as live constraint persistence.
- [Consolidated layout](consolidated-layout.md) defines the shared ELK boundary,
  notation profiles, position/pin overlays and stale-route invalidation. In the
  current editor contract, successful explicit reflow clears manual waypoints;
  failure/abort retains graph, routes, waypoints and history. The preferred
  waypoint-guided direction does not retroactively change this behavior.
- [Spatial AI integration](spatial-generation-integration.md) governs current
  generation-to-spatial-operation behavior. Rendering-engine presence alone does
  not establish support for every desired spatial relation or connector hint.

## Editor and rendering-service reconciliation

The user approved the Editor as a functional superset of rendering: it adds
visual and text interactivity and must remain in known synchronization with the
rendering system. Geometry belongs to rendering, not a second editor-only layout
implementation. The Editor must use abstractions/translations for Coral intent,
ELK layout, and supported routing so that authored changes have a known rendering
interpretation. This is an architectural target requiring migration planning.

Dependency direction approved for evaluation, not yet architecture selection:
the Editor receives a
rendering-service capability through dependency injection/an adapter; that
service does not depend on React, the Editor, or an editor session. Engine
adapters live behind that boundary. The Editor consumes capability descriptions,
results, and diagnostics rather than directly maintaining its own DSL-to-engine
translations. Plugin architecture does not imply a plugin marketplace, runtime
code loading, or a public extension API in 0.2.5.

The code-backed assessment
finds this direction viable with a small internal interface and adapters, but
identifies visualization-coupled routing, direct position updates, and differing
application/public-component responsibilities that require migration evidence.

Distinguish the conceptual rendering service (interpret intent, measure, lay out,
route, and produce geometry/presentation) from today's package functions.
`@coral-viz/render` is browser/React-independent; its `./layout` subpath owns shared
ELK layout, while SVG serialization does not itself run layout. Shared layout
adapters are a foundation, not proof of an integrated injected service or complete
editor/headless equivalence. Preserve existing package contracts during migration.

Proposed synchronization contract, pending selection in Slice 45:

- Associate source, validated semantic state, rendering configuration, and the
  displayed result with a known document revision. Distinguish pending, invalid,
  unsupported, failed, and current states; never label stale geometry as current.
- For a visual edit, resolve a supported authored operation, update the source
  and model coherently, then render through the same interpretation path.
  Transient drag feedback is not itself a newly persisted authored constraint.
- Check capability support before claiming an intent can round-trip. Diagnose
  unsupported, conflicting, or unrepresentable intent; do not silently pretend
  an exact-coordinate fallback is equivalent to a relational constraint.
- Test editor/headless semantic and geometry agreement under the same renderer,
  fonts, configuration, and tolerances. Do not promise pixel identity across
  different renderer versions or reproduce editor interaction chrome headlessly.

### Defaults, authoring, and fidelity

The user explicitly confirmed that omitting computed geometry and implicit
defaults from normal authored text must not discard existing explicit constraints
or weaken lossless save/undo.

Minimal authored text and lossless persistence are different responsibilities.
An omitted default means inherit; an explicitly authored override can carry
intent even when its current value equals that default. Do not strip explicit
values merely because they happen to match today's effective values.

Proposed policy: normal authoring emits supported intent and deliberate overrides,
not a dump of the effective render state. Computed geometry can remain a cache or
continuity snapshot; undo and existing document fidelity still preserve it where
required. Existing canonical GraphIR printing retains R-035 guarantees until an
explicitly reviewed change is approved. Do not silently redefine the lossless
printer as a minimal-source printer or add a second user-facing source mode.

Defaults must have named owners and a documented resolution order. How portable
source declares a rendering profile/version remains unselected; gesture policy
is approved below but its compatible intent representation needs evidence.
No new serialized profile or
provenance schema is approved here.

### Dragging: approved release behavior

E2 found that the current Coral DSL and GraphIR 0.2.0 cannot durably represent an
arbitrary soft Intent drag. In 0.2.5, dragging is disclosed Exact `@` movement.
Pin state and explicit release are independent; unpinned Exact may move under the
documented Reflow policy, while pinned Exact remains preserved by the editor's
post-layout operation policy. Unsupported Intent never silently becomes Exact or
editor-only authored state.

The later scope-reopening decision allocates a minimum node-referencing authored
intent vertical slice to 0.2.5 Slices 51/52. Slice 51 must first freeze the Coral
language and reviewed GraphIR mapping; Slice 52 then owns coordinated dependency,
syntax/parser/printer, validation, layout/routing, round-trip, and migration work.
This does not change completed Slice 47 Exact-drag behavior or allocate label
gestures, connector-referencing constraints, or the broader intent backlog.

#### Historical Intent-default proposal — superseded

The following paragraphs record the earlier D03 proposal and are not active
0.2.5 behavior.

Dragging has a configurable interpretation: positioning intent or exact
positioning. The user approved a locally remembered default, initially Intent,
with selection Properties choices Use default / Intent / Exact. Changing the
default affects future gestures, not existing constraints. Loading explicit
positions preserves them; Exact-mode dragging honors exact positioning. A local
Intent preference does not authorize releasing authored exact constraints.
A drag must not automatically impose exact positioning for every user.
An existing exact constraint keeps the object in Exact behavior until explicitly
released, including when the global default is Intent. Changing gesture policy
does not release that constraint. Explicit constraint release participates in
undo/redo; Properties must distinguish the effective constraint from the default.
Selection gesture overrides are session-only in 0.2.5; mixed selections expose
shared supported fields and Mixed values under D01. D03 approves explicit
undoable constraint release without immediate reflow, retaining current geometry.
The precise compatible intent mapping remains an E2 evidence gate. Gesture policy
and constraint release are distinct concepts; implicit release on mode change is
not approved.
Current one-shot commands are not proof that an
arbitrary drag can become a durable textual relation. Unsupported intent needs
an explicit disposition, never an undisclosed exact-position fallback.

### Invalid-source behavior

Invalid Coral source retains the last successful render and visibly announces
that source and diagram are out of sync. Pan/zoom and source correction remain
available. Do not clear or replace the valid diagram merely because current text
contains a syntax error. Distinguish current draft and displayed revision, and
only remove the stale indication after a successful current render. Define
first-render failure and save/export behavior separately. The user approved
deliberately clearing the entire definition as a valid empty diagram, with one
undoable change; it must not be confused with invalid text. Last-valid-render
retention is approved, not a claim that all current
partial-parse paths already implement it.

The 2026-09-14 decision resolves invalid-state export: block diagram export while
source has blocking errors and explain that the diagram text must be corrected.
The retained prior render is for continuity, not an export fallback. Require the
current valid source's successful render before export; source-draft saving is
distinct. While typing, do not automatically highlight/select/navigate to diagram
objects. Publish current valid results after a named validated quiet period,
without accepting stale responses. Render scheduling is independent of undo
grouping: D08 approves non-timing operation/entity/property edit boundaries,
with reversible raw text for uncertain or invalid edits. Implementation evidence
remains pending; elapsed idle time must not define undo groups.
Context-menu Show in diagram and Show in source remain specification stubs for
0.2.5 and are assigned to 0.2.6, not implemented in the current release.

## Release disposition

### 0.2.5

Completed Slice 47 uses existing node spatial commands and waypoint/routing
facilities with disclosed Exact visual movement. The later Slices 51/52 may add
only the reviewed minimum coordinated GraphIR/Coral authored-intent vertical
slice after language, package, migration, capability, and conformance gates.
Unsupported operations remain explicit; no editor-only semantic substitute or
silent loss is permitted.

Slice 45 must assess authored-versus-computed geometry behavior across source,
load/save, canvas edits, Properties, AI, reflow and undo. Its handoff must assign
functional fixes to Slice 47, separately
from Slice 46 visual-system implementation. Slice 48
retains internal semantic assessment only: semantic lint neither notifies nor
corrects source in 0.2.5. Syntax notification opens full details and explicit Fix;
no autocorrect/autocomplete. Slice 47 owns this behavior and manual retry UX tests
under the approved policy. In particular:

- restore a meaningful text definition after loading without silent data loss;
- specify what a drag or waypoint edit means under existing contracts;
- define intent-oriented layout controls, with exact positions treated as advanced;
- assess the proposed 50% material-change policy using semantic/topology diffs,
  not generated coordinate churn or text-line counts;
- preserve current geometry during routine UI changes, while allowing the
  explicitly designed AI layout-reconciliation transaction;
- distinguish syntax errors, semantic concerns, and geometry-quality issues;
- provide robust undo for content, layout, routing and supported constraints.

Any change to current explicit-reflow waypoint handling must be separately
reconciled and approved; do not claim preservation that the current engine lacks.

Slice 45 must deliver a current-to-target boundary map for the injected rendering
direction, source/default/provenance behavior, and synchronization states. Map
each gap to code ownership, tests, compatibility impact, and release/slice owner.
Slice 47 owns compatible source/history/transaction integration; Slice 48 owns
internal future semantic assessment. Shared rendering-boundary refactoring that
exceeds those contracts requires an explicitly allocated slice, not an
undocumented expansion of Slice 46 or Slice 47. Slices 51/52 own the reopened
minimum node-referencing vertical slice. Required GraphIR changes are not
optional or editor-local: the implementation must update the versioned GraphIR
dependency and Coral DSL contracts together. Connector-referencing constraints
and label-placement execution remain deferred.

Slice 50's accepted
design decision reconciles the
spatial proposals with this specification and maps the bounded handoff. Mere
proposal inclusion is not implementation evidence. Mechanically merged Slice 49
supplies accuracy/repair evidence, not semantic rule ownership. See the
integration task list.

### Before 0.3.0

Perform the AI interaction exploration
after 0.2.5. Compare automatic application with review/accept/discard using the
specified task and latency tests. No preview/review-mode implementation is implied
for 0.2.5.

### Deferred spatial-intent remainder

After the bounded Slices 51/52 target, connector/edge-referencing constraints,
label-placement rendering and gestures, general reference expansion, and raw
solver/engine controls remain unallocated future work. Existing manual waypoints
do not constitute those features. Any later slice must preserve the coordinated
GraphIR/language boundary and specify conflict handling, route/constraint
precedence, migration, and reproducible Reflow behavior before implementation.

## UX/UI implications and acceptance direction

Text and canvas are primary. Properties is an alternate editor for the same
authored definition, not an unexplained parallel source of truth. Layout controls
should foreground intent and good automatic results. Do not expose engine output
as mandatory coordinate-heavy source or silently erase exact user placement.

Portable rendering should preserve meaning and supported intent, producing a
readable result from text plus declared notation/layout configuration. Identical
pixels across engine/font versions are not promised. Where extra data is needed
for exact reconstruction, describe it explicitly.

Test text-only generation, supported spatial guidance, manual routing, explicit
reflow, exact legacy geometry, save/reload, AI material changes, and mixed undo.
Verify that copied Coral source remains useful to headless/embedded consumers.
Current-source formatting and comments, geometry provenance, pin/waypoint policy,
and unsupported-format transitions remain explicit design questions.

Session decisions and superseded proposals are retained in the
Slice 45 decision log.
