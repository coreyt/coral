# Editor transactions and retention

Status: approved on 2026-09-15 after independent review and one final
`gpt-6-astra` medium review with no P1/P2 finding.

## Boundaries

The editor owns source drafts, accepted canonical GraphIR, display publication,
gesture interpretation, operation history, camera/selection continuity, AI
revision acceptance, and rollback. Language packages continue to parse/print;
render owns deterministic layout/SVG/HTML; the worker remains an adapter over
render layout; MCP remains a headless consumer. No public API, document schema,
GraphIR version, provider protocol, or plugin framework changes here.

## Revision envelope

One editor envelope distinguishes the current source revision from the last
successfully displayed revision. It records `sourceRevision`, `displayRevision`,
and status `pending | current | blocked`. Source input increments the source
revision before parsing. Only a current successful parse/layout can publish its
token as the display revision. Diagram export is allowed only when
`status === current && sourceRevision === displayRevision`. Pending,
unsupported, parse, layout, routing, and render failures retain the last-good
canvas and block GraphIR/SVG/HTML/PNG/JPEG with an explicit current-source
diagnostic owned by the controller. Late work cannot change status or
diagnostics. Valid empty source publishes an empty current revision and exports
an empty representation where the format supports it. Source-draft document
save remains enabled and independent of rendered exports.

Open is prepared atomically before any live mutation: deserialize, print the
canonical graph to Coral, parse the printed text, and compare supported envelope,
nested nodes, properties/data/style, ports, positions, pins, edge identity,
routes and waypoints. A blocking print/parse/equivalence failure leaves the old
document and history untouched. Success sets the source format to Coral and
commits the printed definition. Attributable loss diagnostics name fields the
text cannot represent while the accepted canonical graph/waypoint sidecar
remains authoritative until the first explicit source edit; that edit exposes
the same loss before it can commit. A placeholder comment is never an editable
definition.

## Transaction history

Transactions use a process-local monotonic sequence, never debounce timing.
Each record has an operation label, stable entity/property IDs, affected
document settings, optional AI annotation, and before/after snapshots containing
raw source/format, canonical graph, node positions, pin fields, waypoint IDs/
types/order, diagnostics/validity, the complete source/display revision envelope
including status, and the published display node geometry plus routed edge
sections/fallback. The existing content and geometry storage may remain separate
internally only if Undo/Redo compares their sequence heads; UI exposes one
chronological history. Render publications never create transactions. A smaller
snapshot is allowed only where deterministic provider-free reconstruction is
covered by equivalence fixtures for every omitted display field.

A continuous source edit session is one transaction while edits retain the same
stable entity/property and active text span. Caret/selection leaving the span,
target/entity change, focus loss, paste, cut, another command/operation, Undo or
Redo closes the session. IME composition commits atomically. Unknown attribution
uses a raw-text `Other` transaction. Identical edit sequences under different
elapsed-time schedules group identically; parse/render success and debounce do
not split or merge history.

Source and property drafts are not canonical authority. A source input event is
undoable even while invalid. Properties use explicit field sessions: choices
commit once, single-line/numeric fields commit on Enter or valid blur,
multiline fields on blur, Escape cancels, invalid input never mutates.

Exact drag/keyboard movement is available only in Coral and commits one atomic
source+graph+geometry transaction writing `@`. Mermaid offers an explicit
convert-to-Coral action; declining or unsupported conversion leaves source,
graph, geometry, and history unchanged. `pinned` is an independent transaction.
Release removes only `@` and leaves the node at its current displayed coordinate
until a later operation needs layout. Successful Reflow atomically updates
authored source/constraints and removes manual `via` routes; failure changes
nothing.

## AI and Fix state machine

Requests are classified before provider dispatch. Help is non-mutating. Any
unresolved or mutating request acquires the editor mutation lock before revision
revalidation or local Fix and holds it through provider transport/backoff,
validation, layout and apply. The lock rejects source/format; Properties fields,
settings and presets; drag/keyboard/delete/connect/reconnect/waypoints;
authoring-dialog commits; Reflow; Open/New/recovery; Undo/Redo; and explicit
candidate Retry. Selection, pan/zoom, panels and Cancel remain available. Save
and export are read-only and apply the current-revision rule above.

Syntax details capture the exact source revision. Opening details performs no
repair or provider call. Fix revalidates the revision, runs only deterministic
safe repairs with provenance, and otherwise starts one provider transaction.
Ambiguous repair returns unresolved. A valid result commits once and is one
undo transaction; cancellation, stale response, invalid candidate, unsupported
format, layout failure, or provider failure commits nothing.

Before dispatch and again on the candidate, the format gate admits Coral or only
Mermaid `flowchart` with TD/TB/BT/LR/RL, safe ASCII identifiers, process/
database/decision shapes, `-->` and `-.->`, optional labels, chains, blank lines
and comments. It rejects `graph`, subgraphs, directives, HTML, click/class/style,
advanced shapes/arrows, and non-flowchart kinds. Coral candidates must parse
without silent opaque-field loss.

Candidate rejection is terminal and returns an explicit user-retry action.
Only typed retryable transport/provider failures replay automatically, using a
bounded count, cancellable backoff, Retry-After cap, and telemetry. Semantic
advice is neither a product diagnostic nor chat suffix. Context for each request
is rebuilt from the actual current document first and then a bounded relevant
message window; archived assistant DSL is untrusted. Undo therefore cannot leave
an applied result as assumed authority.

Activity is a bounded in-memory session log, not transcript persistence. A
successful Fix or AI commit appends exactly one operation/outcome record only
after atomic publication. Failed, cancelled, stale, unsupported, or rejected
candidates may record failure but never claim application. Undo/Redo marks or
records the related transaction as reverted/reapplied. Activity stores operation
labels, time and counts only—never prompts, transcript text, full source,
credentials, provider payloads—or initiates a provider call.

## Material layout selection

A pure evaluator matches exact stable node IDs and stable edge IDs; an explicit
one-to-one rename map is the sole rename exception. It records added/removed
nodes, authored field changes, edge multiset/topology changes, constraint
changes, p50/p95/max displacement, overlaps, route validity, pins, waypoints,
and latency independently. It never combines these into a node-loss threshold.

Initial generation and explicit Reflow may use full layout. Field-only edits
preserve geometry, remeasure, and reroute only if deterministic quality fails.
Edge-only additions/removals/redirects preserve node geometry and reroute the
affected edges first. Additions, containment, or an invalid affected neighborhood
use anchored incremental placement while retaining unrelated authored routes.
An authorized broad restructure may use full layout only after deterministic
preserve/incremental quality failure; otherwise the editor reports the failure
and leaves the document unchanged. Named constants use pixels, ratios, counts,
or milliseconds for overlap tolerance, route inflation/crossing, displacement
outliers, small-graph reporting and latency budgets. Latency is an observed
outcome, never an input known before strategy execution.

## Transcript archive

Archive persistence is off by default. The active request window, Activity,
and archive are different stores. IndexedDB records use random opaque IDs,
schema version, record revision, created/updated/opened instants, nullable
expiry, messages with unique IDs, transaction annotations, and explicit local
identity claims. Credentials, source, recovery, camera/panels, and telemetry are
forbidden as separate fields. Messages may naturally contain user-supplied DSL;
that text is transcript content, not a hidden source snapshot.

Expiry uses `effectiveNow = max(wallNow, lastObservedWallNow)` and checks the
deadline before renewal. Thirty days is the default; zero means no age deadline,
not unlimited size. The private editor owner caps one archive at 1,000 messages
and 2 MiB and all archives at 100 records and 20 MiB. Startup/open/scheduled
checks purge expired data. Shortening retention recalculates from the last
successful open and purges expired records; lengthening never revives or renews.
Failed/cancelled Open never renews. Quota,
corruption, denial, and revision conflicts stop the write and surface a warning;
they never evict silently or block editing.

Open and Save As create a separate conversation by default. A digest can suggest
candidates in an explicit chooser whose preselected outcome is New conversation;
it never selects an archive. Association/continue is an explicit user action.
Archive writes compare record revision inside the same read/write IndexedDB
transaction and conflict rather than overwrite. Disabling persistence stops
access immediately and deletes only after confirmation. Clear current, delete
associated, and delete all are distinct.

Only new transcript enable/retention settings belong to a private editor
preference record. Existing exported `@coral-viz/viz`
`UserPreferences.showMinimap/showControls` remain the sole UI13 authority through
the existing `useSettings` persistence. UI13 consumes them by wiring Show minimap
to the React Flow minimap and Show controls to the complete C1 floating toolbar.
Commands remain available when C1 is hidden. Defaults are on, and changes
persist/reload with labels and accessible state.

## Rendering-boundary feasibility

The reviewed consumer disposition is:

| Consumer | Operation/defaults | Pin/route policy | Cancel/error policy | Slice 47 adoption |
| --- | --- | --- | --- | --- |
| Editor initial/incremental/Reflow | worker; direct fallback at at most 100 nodes; operation-specific settings | editor overlays pins; Reflow alone clears authored routes on success | AbortSignal + revision rejection; retain last good | existing adapter, conformance tests only |
| Public `viz.layoutGraph` | explicit headless full layout | render contract; no editor post-layout overlay | promise rejection; no browser worker | none |
| Render SVG/HTML | serialize positioned geometry only; never implicit layout | serialize supplied geometry/routes | synchronous diagnostic/error | none |
| MCP layout | explicit headless layout tool | tool request policy, no editor history | MCP error result; no worker cancellation machinery | none |
| MCP render | preserves supplied complete geometry; may explicitly layout incomplete geometry under the tool contract | preserves supplied pins/routes where supported | MCP error result | none |

Matching consumers use fixtures/assertions for stable IDs, hierarchy, measured
dimensions, absolute and parent-relative coordinates, every edge section plus
fallback, ports, pins, diagnostics, defaults, unsupported capabilities, and
cancellation. Compare worker/direct output and only applicable headless output;
operation-policy differences are asserted rather than normalized.

The compatible seam is the existing render `LayoutRequest`/result plus editor
worker adapter and shared fixture comparisons for identity, hierarchy,
dimensions, coordinates, pins, route sections/fallback, diagnostics and
cancellation. SVG/HTML serialization of positioned geometry and MCP render must
not acquire editor history or implicitly relayout. Migrating every consumer,
extracting neutral routing, or changing public packages has broad impact and is
rejected for Slice 47; it requires a separately reviewed Slice 51–59. Slice 47
migrates no consumer and adds no runtime dependency or bundle payload.
