# Canvas precision interactions

Status: implemented and independently verified in C20, including all reviewed
integration deltas. See the completion record. Implements [REQ-C2](../requirements/system-requirements.md#req-c2-precision-canvas-and-connection-gestures) and [ENG-03](../requirements/engineering-constraints.md#eng-03-automated-quality-coverage-and-benchmark-gates) (legacy `R-015`, `R-029`).

## Scope and ownership

C20 closes the existing Shift-drag and manual waypoint contracts (#52/#59).
Keep the current React Flow 12.11.6, React, ELK, GraphIR, file schema and public
exports. Do not add a router or implement spatial LLM commands. Font geometry,
pins, canonical fields and asynchronous layout invalidation from C10 remain
in force. Tests need no provider, credentials or `.env` access.

- `useAxisConstrain` owns modifier state and constraints on position changes.
- `useLayoutHistory` owns immutable bounded before/current snapshots and redo.
- `App` owns gesture transactions, layout invalidation, undo/redo application,
  document replacement, serialization/recovery and reflow.
- `CanvasPane` passes node gesture boundaries through to React Flow if needed.
- `CompatibilityEdge` owns waypoint pointer capture and screen/graph mapping;
  existing optional movement callback remains compatible. Add optional start,
  end/cancel callbacks to edge data rather than changing the released callback.
- `useWaypointManager` owns waypoint maps and routing; `setWaypoints` restores
  IDs and metadata exactly. Route caches must follow nodes, edges and waypoints.
- `e2e/interchange-gestures029.spec.ts` owns browser acceptance for GraphIR
  interchange documents; saved Coral source refuses waypoint gestures, and
  `e2e/acceptance028-spatial-source.spec.ts` covers its node drags. Existing
  font/recovery tests remain unconditional regression coverage.

## C20.2 browser delta: Shift capture

Real baseline Chromium pointer tests fail before any node movement. Installed
React Flow 12.11.6 `Pane.onPointerDownCapture` starts Shift box-selection even
above nodes and prevents the mouse drag; its documented-in-source `.nokey`
exception bypasses that capture for interactive descendants. Use an outer CanvasPane `onPointerDownCapture` listener, which runs before the
nested React Flow Pane capture listener. For a Shift primary pointer-down whose
target is inside a `.react-flow__node`, temporarily add `.nokey` to that node
wrapper for the current capture dispatch, then remove only the class we added
in a microtask. This scopes the exemption to pointer capture, with no persistent
class, state render, new tab stop or focus change. Never remove a preexisting
`.nokey` class. No input text/key events are modified.

A permanent class on SymbolNode is rejected: React Flow also treats `.nokey`
as an input in its keyboard handlers and would suppress keyboard actions. The
transient outer capture solution must pass real Chromium Shift-drag, blank-pane
Shift selection, Control multi-selection, and keyboard node selection/movement/
delete checks, and leave no added `.nokey` class after pointer dispatch. If event
ordering disproves this approach, return to design review rather than remap
selection globally. Test listener behavior and cleanup at the CanvasPane boundary.
This medium integration delta requires independent design acceptance before code.

## Axis and node transaction

The threshold is five diagram-space units (the existing public hook behavior),
not viewport pixels. Freeze the constrained node until either absolute delta
exceeds five; choose x on a tie. Lock the perpendicular coordinate to the
position when Shift-constrained movement starts. Keyup immediately clears the
lock; the next event is unrestricted. Blur clears Shift and the lock, avoiding
a stuck modifier. Repressing Shift starts a fresh constraint from current state.
Only drag position changes are constrained; selection/dimensions pass through.
The final `dragging: false` event must retain the constrained final position;
it must not replay React Flow's unconstrained internal coordinate. Track each
dragged node independently so selected-node batches do not reset one another.

At the first actual node drag change capture the entire before geometry; after
the terminal change is applied capture the actual constrained current geometry.
A gesture is one undo step, regardless of intermediate move count. Prefer the
controlled `onNodesChange` boundary to raw `onNodeDragStop` positions: installed
XYDrag emits its internal, potentially unconstrained positions on stop. Preserve
all unaffected positions, pin flags and waypoints. No-op gestures add no history.
Blur cancels node movement: restore before positions, add no history, and reject
trailing XYDrag move/stop changes until a fresh gesture starts. A node drag-start
callback may establish ownership, while constrained controlled changes remain
the authority for committed coordinates.
Document replacement cancels pending gesture ownership so stale events cannot
write positions/history into another document. Existing layout generations are
invalidated on actual edits, preventing in-flight ELK from overwriting a drag.

### Keyboard changes and stale-pointer fences

Installed React Flow `useMoveSelectedNodes` emits `dragging: false` for arrow
keys without a drag-start callback. Therefore a blanket rejection of such
changes after pointer cancellation breaks the released keyboard control.
CanvasPane may identify a keyboard move through outer key capture: for arrow
keys on a node focus owner (excluding input/textarea/select/contenteditable),
cancel any active gesture, then permit only the synchronous React Flow keyboard
change dispatch. End permission from CanvasPane's outer bubble listener after
React Flow handles the key; bind it to the originating native KeyboardEvent
and require nonzero `eventPhase` while consuming changes. This event-lifetime
check expires even when propagation is stopped. Do not clear keyboard permission
in a capture-scheduled microtask: trusted browser events can run it before the
separate React bubble listener. Late pointer updates remain rejected. Because React Flow's internal lookup can lag the synchronous rollback, App
re-bases the resulting selected-node keyboard position changes on its restored
`nodesRef` baseline using the captured direction and existing editor step
(5 units, multiplied by four with Shift; the editor does not enable snapGrid).
This narrowly applies in the editor adapter, not the public axis hook. Bypass
pointer-axis constraints for the identified keyboard dispatch. Do not
manufacture pointer history from these keyboard changes or change the step. A normal completed drag also must not leave
keyboard movement blocked. Verify keyboard movement after both completion and
cancellation and ensure a still-held pointer cannot overwrite the keyboard move. Required
exact case: x=100 → drag to150 → ArrowRight gives105 → late release stays105.
Also Shift+Right then Shift+Down must move 20 on each axis. Focusable descendants
inside a node are supported; input/textarea/select/contenteditable remain native.

## History contract

Keep `saveSnapshot`, undo/redo and exported result shapes compatible. Snapshot
capture deep-copies positions, waypoint arrays and waypoint records. Returning
undo/redo state also cannot let callers mutate stored snapshots. Same-geometry
adjacent saves coalesce; a before/current pair therefore yields exactly one
step even after earlier operations. A changed save after undo truncates redo;
a no-op save does not. Update stack/cursor atomically so two saves in one React
batch work and immediate undo/edit is not swallowed by a timeout guard. Retain
the existing bounded default of 50 entries.

App always supplies complete waypoint maps for new geometry snapshots, including
an empty map after reflow. Legacy omitted waypoint data retains its optional API
meaning; App restores new snapshots through `setWaypoints`, preserving identity.
Document load/recovery/new text graph replacement clears obsolete geometry
history and pending transactions. Do not redesign the separate LLM DSL history.

### C20.3 kickoff interface reconciliation

C20.2 already supplies shared cancellation/epochs, immutable/coalesced history,
exact waypoint restore, and complete empty reflow snapshots. C20.3 adds waypoint
ownership to that existing cancellation point, without a second history stack.

`useWaypointManager` mutations calculate from a private current-map ref, publish
state and call the existing `onChange` synchronously outside React updaters.
App mirrors that callback into a current-map ref solely for synchronous snapshot
capture and rollback-before-reflow reads. No new manager API is needed. Deep-copy
incoming restore maps and points so before snapshots cannot be mutated later.

`CompatibilityEdgeProps` gains an optional screen-to-flow conversion function.
A stable CanvasPane-local edge wrapper, inside the existing React Flow provider,
gets `screenToFlowPosition` from `useReactFlow` and injects it. Direct exported
CompatibilityEdge consumers retain the existing provider-free coordinate fallback
(SVG CTM for SVG events; viewport transform or untransformed coordinates for
standalone HTML handles). Tests cover both injected nonidentity mapping and
standalone behavior. No new required provider or root export is introduced.

Add optional lifecycle callbacks in edge data: start returns an epoch token,
move keeps its existing first three arguments and optionally receives that token,
and end/cancel receive the matching token. A handle captures the callback/token
at start; later renders cannot grant an old pointer a newer epoch. Legacy
movement-only consumers keep receiving movement callbacks without implementing
lifecycle callbacks. App rejects a missing/stale token for its managed drags;
its own tests drive the lifecycle. Add/remove each cancel a conflicting gesture
before taking a before/current snapshot.

## Waypoint lifecycle and rendering

The visible BaseEdge stroke and its wider transparent hit path must both invoke
the same double-click handler. The original handler existed only on the earlier
transparent sibling, so an exact visible-stroke click selected the edge but
never added a waypoint. Handle the visible path as well; prevent propagation
that would trigger unrelated viewport double-click behavior. The browser samples
an actual visible SVG path point, never an offset that dodges the defect.

Primary left pointer-down captures the pointer, prevents canvas panning and
records start coordinates plus the current pointer ID. Move converts client
coordinates through React Flow `screenToFlowPosition` (no snap), updates only
that waypoint, and renders the current route. Use the same conversion for
edge double-click; the viewport transform is never applied twice. `nodrag`,
`nopan`, `touch-action: none` and propagation guards isolate handle gestures.
Secondary pointers and context clicks cannot start or finish the primary drag.

Pointer-up commits the final position once. Pointer-cancel, unexpected lost
capture, blur or unmount cancels, restores the before map, and adds no undo step.
App owns a gesture epoch shared by node and waypoint transactions. Before
Undo, Redo, Reflow, document/text replacement or a new conflicting gesture,
cancel/rollback the active transaction synchronously, invalidate its epoch, then
perform the requested action. Rollback occurs before reading reflow/history
inputs. A later move/up/cancel from an old epoch is ignored even if entity IDs
are unchanged; it cannot roll back newer edits. React Flow drag-start and
waypoint start boundaries mint new ownership; terminal events never do.
Normal release clears ownership before releasing capture so lost capture cannot
cancel a committed operation. App rejects stale callbacks after document/edge
replacement. No-op movement creates no history. Right-click removes a waypoint
as its own before/current transaction; double-click adds one at the click point.
Existing movement-only consumers still receive position updates; lifecycle
callbacks are optional and no extra wrapper provider is imposed on them.

Selected edges show handles; unselected edges do not. Route rendering must pass
through current waypoint coordinates while attaching to current React Flow
handle endpoints. Cached routing from old node bounds must not hide a manual
route. Keep compatibility stroke, dash, marker, tooltip and accessible edge
name. Use existing routing behavior; no standalone routing dependency.

Save/load, text geometry and recovery use the canonical current waypoint map;
rollback restores that map too. Explicit reflow clears all manual waypoints;
undo restores their exact IDs/coordinates and redo clears them again. Font
changes and node drags recompute route endpoints without discarding waypoint
anchors. No per-pointer history snapshots or new global document listeners
without cleanup. Browser-only DOM use remains inside components/effects.

## Evidence and implementation order

| Unit | RED first | GREEN scope | Gate |
| --- | --- | --- | --- |
| C20.1 | Documentation consistency/current caller audit (no production change) | R-015, R-029, this design, revised slice and status; define browser selectors using existing IDs and live bounds | Independent design review, documentation/diff and plan verification |
| C20.2 | Hook tests for terminal lock, blur, multi-node, batched/deep history; App transaction and real browser horizontal/vertical/unlock/undo/redo failures | Axis/history and App node transaction boundary only | Independent code review, fresh focused/browser verification |
| C20.3 | Pointer lifecycle and App add/move/remove transaction tests; real waypoint browser failure | Edge/manager/App lifecycle, rendering, restore/reflow fixes | Independent design delta check, code review, fresh focused/browser verification |
| C20.4 | Intentional temporary failing browser probe exposes missing retained artifacts | Playwright retain-on-failure trace/video, only-on-failure screenshots, HTML report, CI upload report plus test-results | Code review, fresh full regression/Chromium/coverage/docs and artifact verification |

For every implementation increment record actual failing assertion and passing
command/count. Do not accept compile errors or setup failures as RED. Tests
may add component event fixtures for branches but never substitute direct
handler calls for browser acceptance. Review and verify each unit before the
next starts. If integration exposes a material design delta, revise and obtain
review before implementing that delta.

The browser harness loads an explicit Coral graph through the visible DSL
editor; obtains node boxes and SVG path sample points through read-only DOM
inspection, and uses actual mouse/keyboard input. Selectors use React Flow
`data-id`, existing waypoint IDs and accessible toolbar controls; scoped edge
hit-path metadata may be added if an existing selector is ambiguous. Read DOM
transforms or saved document coordinates to assert graph-space outcomes at a
nondefault zoom and pan. No app state mutation or window test API.

Required cases: horizontal/vertical locks including final mouseup; release
Shift during movement; blur reset; exactly one undo/redo per gesture; waypoint
selection visibility, add/move/remove and changed paths; pointer capture beyond
the tiny handle; cancel/lost capture/no-op/secondary pointer behavior; redo
invalidation; save/load and real reload/banner/restore; reflow undo/redo;
compatibility styling on a manually routed incompatible/warning edge. Browser
cancellation can dispatch a DOM pointercancel/lostcapture event only after a
real pointer-down/capture; assert ownership and rollback, rather than call a
React handler. Unit tests cover unmount, stale replacement, identity, isolation,
boundary/tie and immutable history cases that are difficult to induce natively.
Explicit interruption tests cover node move → blur → late stop → fresh drag,
node drag → reflow, and real captured waypoint → Ctrl+Z → late up/cancel.

Run exact Node 24.19.0/npm 12.0.2/TypeScript 6.0.3 focused viz/editor suites,
build, ordinary Chromium, `npm run verify`, existing viz/MCP coverage gate and
editor coverage report, docs/diff. No manifest/lock changes. C20 does not add a
new public export/schema or require a new consumer matrix; existing builds and
public type checks remain mandatory. CI upload is inspected locally; hosted
CI execution is separately identified, never claimed from a local run.

## Primary-source research (2026-09-08)

- [React Flow component API](https://reactflow.dev/api-reference/react-flow)
  and [testing guidance](https://reactflow.dev/learn/advanced-use/testing):
  controlled change callbacks own application state; browser tests exercise
  measured nodes and real gestures. Inspected installed `@xyflow/system`
  `dist/esm/index.mjs` XYDrag stop path: it calls `updateNodePositions` before
  the stop callbacks, motivating constrained change handling at that boundary.
- [React Flow changelog](https://reactflow.dev/whats-new): current online docs
  are guidance, not an upgrade instruction; pinned 12.11.6 source/behavior wins.
- [Playwright mouse](https://playwright.dev/docs/api/class-mouse) and
  [keyboard](https://playwright.dev/docs/api/class-keyboard): mouse positions
  use viewport CSS coordinates; explicit down/move/up and modifier release
  exercise the gesture lifecycle. Read live DOM boxes rather than hard-code it.
- [Playwright locator API](https://playwright.dev/docs/api/class-locator)
  and [page API](https://playwright.dev/docs/api/class-page): bounding boxes
  are relative to the main-frame viewport; register the download promise before
  triggering save, and use reload followed by the visible recovery control.
  Supplemental source check during C20.2 confirms the existing browser plan.
- [Playwright configuration](https://playwright.dev/docs/test-use-options)
  and [trace viewer](https://playwright.dev/docs/trace-viewer): retaining on
  failure covers the first failure even with zero retries. Generate an HTML
  report and upload it together with raw test artifacts.
- [W3C Pointer Events](https://www.w3.org/TR/pointerevents3/): pointer capture
  retains event delivery outside the hit target; cancellation and capture loss
  require separate lifecycle handling. Use explicit touch-action and release.

Rejected alternatives: raw stop callback coordinates can restore the unlocked
axis; per-move snapshots break one-step undo; mouse-down-only handles cannot
move; reconstructing waypoint IDs on undo loses identity; changing routers,
public file schemas, or introducing keyboard creation expands another slice.


## C20.3 browser delta: durable text-projection origin

Browser persistence RED proves that `syncDiagramToText` prints two-decimal
coordinates, clears its internal-update flag in a microtask, and the later
passive DSL effect can reparse that projection. This replaces full-precision
waypoints and IDs, including recovery data and font-change saves. Impact high:
R-015 exact restoration/persistence and C10 canonical geometry remain mandatory.
Do not change the printer, grammar, file schema or accept rounded persistence.

App records the exact canvas/document-owned text with format and notation before
publishing it. The debounced text effect suppresses only the matching projection;
the marker survives microtasks and passive-effect scheduling. An explicit editor
change clears that marker and the legacy transient internal-update flag before
setting text. Increment an explicit input revision so an event with the same
text value still schedules the authoritative parse. Cancel any pending
canvas-to-text timer at this boundary so it cannot overwrite the user edit.
LLM/generated input, explicit format conversion and legacy text recovery clear
the marker; their existing application paths remain authoritative. File load
marks its placeholder as document-owned text, preserving the loaded canonical
graph. Modern document recovery then marks its final recovered displayed text
with recovered format and loaded notation, replacing the placeholder marker.

Notation changes must still reproject through the existing layout/materialization
path. If the displayed text is document/canvas-owned, capture the current graph
using existing Flow-to-Graph conversion and current full-precision waypoint map,
and supply it as an optional internal source to `updateDiagram` instead of parsing
the placeholder or rounded display text. Preserve waypoint identity for this
projection source. Refresh the origin notation after application. Keep existing
notation layout policy, async invalidation, diagnostics and compatibility checks;
genuine source text still uses the parser. Explicit format conversion clears the
marker and retains its existing parse path. No exported API is added.
Font changes are geometry projection changes and must preserve manual anchors.
This correction does not preserve old waypoints over genuine user `via` edits.

Required focused evidence: fractional anchors and identities survive the actual
500ms diagram-print plus 300ms parse window, recovery and font updates; a genuine
user `via` edit immediately after printing replaces the anchor as requested.
An explicit same-value input of the rounded displayed text must become
authoritative over the full-precision canonical coordinates. Loaded-placeholder
notation changes must preserve graph membership; fractional-anchor notation
changes must preserve exact anchors and identity while changing symbols.
Retain existing format, notation, generated-edit, file-load and recovery tests.
Real Chromium must compare exact saved/recovered GraphIR points, not rounded DSL
or CSS values. No timer extension is an acceptable correction.

Official React research (2026-09-08): [effect scheduling](https://react.dev/reference/react/useEffect)
does not promise that passive effects precede a queued microtask, while
[refs](https://react.dev/reference/react/useRef) retain non-rendering data between
renders. The origin record therefore identifies the update rather than guessing
its lifetime from elapsed time. Independent delta acceptance is required before
production correction.


### Canonical-only loaded routing

A valid document may contain GraphIR `routingPoints` without the optional
`edgeRouting.waypoints` view record. App load must initialize its authoritative
manager from exact explicit waypoint records when present, otherwise from the
loaded edge's canonical routing points, assigning deterministic local
`<edgeId>-loaded-<index>` corner identities. Explicit per-edge waypoint records
win, including an explicit empty entry. Inspect the original document record
presence because `deserialize` currently omits empty waypoint arrays from its
returned map. This preserves existing schema consumers
and does not add serialized fields. Modern document recovery uses the same load
boundary. Tests load canonical-only points, verify notation/recovery/save
precision, then remove/reflow and verify empty-map saves cannot resurrect points.


### Structural edge removal and geometry-history lifetime

React Flow `remove` or structural `replace` changes cancel current gestures,
remove the affected edge's waypoint entries synchronously, and clear obsolete
geometry history. Same-batch remove/add of an ID must start clean. Unaffected
edges retain their current anchors. Geometry snapshots cannot restore topology,
so retaining snapshots across removal would let undo resurrect orphan anchors
or apply them to a different edge reusing the same ID. Clearing those snapshots
is the bounded correction; topology undo remains outside C20. The direct App `onReconnect` caller must use the same boundary when endpoints,
handles or edge identity change; it currently bypasses `onEdgesChange`. Compare
null/undefined absent handles equivalently and preserve no-op reconnections.
Changed reconnects clear affected anchors/history, retain other edges and reject
old captured waypoint callbacks. Ordinary selection and new-edge addition do not
clear unrelated geometry history. Genuine empty
source replacement clears the entire current map in its current-result branch.

Tests require two edges to prove other-edge preservation, deletion during a
captured gesture, disabled geometry Undo after removal, empty/orphan-free save
and recovery, clean same-ID re-add, and rejection of captured late callbacks. Include changed and no-op direct
reconnect callers with preexisting waypoint history.
Independent design acceptance is required for this explicit history boundary.


## C20.4 artifact and aggregate gate

Use `trace: 'retain-on-failure'`, `video: 'retain-on-failure'`, and
`screenshot: 'only-on-failure'` for the existing Chromium project. Keep the
current retry count; a zero-retry temporary intentional failure must still yield
a nonempty trace ZIP, PNG and WebM. Add an HTML reporter with `open: 'never'`
alongside local list/CI GitHub reporting. Do not introduce a new artifact server.
Upload both `playwright-report/` and `test-results/` under the existing seven-day
artifact. Run upload on every non-cancelled job, including a retry that eventually
passes, so the retained first-attempt failure is not lost with a successful job
status. This refines the earlier failure-only upload condition; no workflow
permissions, action versions, dependencies or retry budgets change.

RED: temporary probe reaches the app and deliberately fails a named assertion;
then independently assert all four artifact kinds exist. The baseline fails the
artifact assertion. GREEN: after config changes, the probe still intentionally
fails, but all four artifacts must be nonempty and valid (ZIP entries, PNG/WebM
signatures and report HTML). Remove the probe and generated output after evidence
inspection, then run the ordinary suite without overrides. Fresh verification
repeats artifact proof, whole `verify`, viz/MCP coverage gate, editor coverage,
ordinary Chromium and docs/diff, distinguishing local evidence from hosted CI.

Official research (2026-09-08): [recording options](https://playwright.dev/docs/test-use-options#recording-options)
retain failed attempts even without retry; [reporters](https://playwright.dev/docs/test-reporters)
support concurrent HTML/console reporters and non-opening HTML;
[CI setup](https://playwright.dev/docs/ci-intro) and
[artifact upload](https://github.com/actions/upload-artifact) describe reports and
multi-path uploads. Inspect the repository's pinned versions rather than upgrade.
