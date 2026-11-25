# Pointer-free authoring

Status: implemented in 0.2.4 Slice 50
after independent review.

## Decision

Pointer-free creation is a private reference-editor workflow composed from the
existing command palette, registries, canonical GraphIR controller, connection
validator, and canvas. One pure authoring model owns structural validation and
immutable graph transforms; one modal owns keyboard form behavior; the live
controller owns sessions, history, projection, and focus requests.

No new public package surface or general command framework is introduced.

## Ownership

| Owner | Authoritative responsibility | Must not own |
| --- | --- | --- |
| `authoringModel.ts` | Registry-derived choices; ID/position policy; live endpoint/port/container checks; immutable node/edge create and selected-entity delete transforms | React state, focus, layout, persistence, JSX |
| `AuthoringDialog.tsx` | Native form controls, local drafts, focus trap, Escape/Cancel, inline/live-region error presentation | Graph mutation, registry lookup, canonical history, canvas focus |
| `CommandPalette.tsx` | Command search/selection plus optional original-invoker context for follow-on private workflows | Authoring state or graph operations |
| `useEditorController.ts` | Session state, current GraphIR capture, shared connection-creation policy, content-history transaction, active-format projection, announcement and focus request | Form rendering or a duplicate registry/validator |
| `CanvasPane.tsx` | Disable the parallel React Flow delete-key owner, forward selected deletion, and fulfill tokenized node/edge focus requests inside its DOM boundary | Graph/history mutation or authoring validation |

`App.tsx` remains only the 12-line controller/view composition root.

## Authoring session and commands

The private session is either closed, `{ kind: 'node', invoker }`, or
`{ kind: 'edge', invoker }`. Palette commands are additive:

- `create-node`, advertised as `Ctrl+Alt+N`;
- `create-edge`, advertised as `Ctrl+Alt+E`, disabled when fewer than two live
  nodes can participate.

On macOS the mounted listener accepts Command in place of Control. Existing
commands continue accepting zero arguments; the palette may optionally supply
`{ invoker }` to an action. Authoring commands carry a private focus-transfer
marker so palette cleanup does not refocus the old element during handoff. The
invoker is the element focused before the palette opened, not the palette
search field. A direct shortcut captures the then-focused element.

One shared `isAuthoringShortcutEligible` predicate runs before `preventDefault`
or invoker capture. It rejects events targeting `input`, `textarea`, `select`,
or any editable descendant, and rejects while a command/preferences/authoring
modal is already open. The same native-editing predicate guards Delete and
Backspace. This keeps browser/editor input behavior intact instead of adding
exceptions independently to each listener.

The modal uses native `input`, `select`, and `button` controls. It focuses its
first control after the palette unmount cleanup, cycles Tab/Shift+Tab within
the dialog, and handles Escape at the modal boundary. Cancel returns to the
recorded invoker. A successful submit does not return there; it publishes a
new tokenized canvas focus request.

## Registry-derived choices

Node choices come from `symbolRegistry.getByNotation(currentNotation)` in
registry order. Each option carries the exact symbol ID/name and stores that
symbol ID as both the new node's open GraphIR `type` and explicit `symbol`.
This avoids an invented reverse mapping and remains legal under the current
arbitrary node-type grammar.

Parent options are current graph nodes whose effective symbol is registry
marked `isContainer`. The pure commit rechecks that the parent still exists,
is still a container, and is not the node being created. A child receives a
relative position; a top-level node receives a deterministic non-overlapping
suggestion after current top-level bounds. IDs are a normalized label slug
with a positive suffix chosen against all nested node IDs. The operation does
not overwrite an existing node.

Edge endpoint choices come from current live nodes. Port choices use the
effective symbol and variant and only expose `out`/`inout` for a source and
`in`/`inout` for a target. An `inout` port keeps its canonical registry ID;
React Flow handle suffixes remain a view concern. The commit re-derives choices
from the current graph rather than trusting values captured when the dialog
opened.

Source and target selectors contain only role-capable nodes. The command is
disabled unless at least one distinct source/target pair exists; a direct
shortcut may still open the disabled dialog so its live status can explain
that no viable pair is available. Missing registries and ports never acquire
synthetic defaults.

## Shared connection-creation policy

Both pointer `isValidConnection`/commit and keyboard submit call one controller
policy. It translates a React Flow suffix only when the unsuffixed candidate is
a current registry-owned `inout` port in that endpoint direction, then requires
live endpoints and explicitly selected directional ports before calling the
existing `useEdgeCompatibility.checkConnection` result. Opaque canonical IDs
such as `check-in` or `fan-out` are preserved unchanged. The canonical IDs are
also used for duplicate/capacity evaluation and the created GraphIR edge;
verified suffixed `inout` view handles never enter canonical state. Existing
loaded edges retain their compatible/warning/incompatible rendering.

For a *new* connection the policy rejects:

- missing source or target;
- self connection;
- a duplicate source/target pair (the existing validator's contract);
- a port absent from the endpoint's current effective symbol/variant or with
  the wrong direction;
- any validator result with `valid: false`;
- `max-connections-exceeded`, even though the reusable validator represents
  that existing-edge condition as a warning.

That last wrapper policy makes the release requirement explicit without
changing public validator types or how pre-existing over-capacity graphs are
diagnosed. Pointer and keyboard creation therefore have the same commit
decision and reason. A unique edge ID is derived from endpoints and suffixed
defensively, although endpoint duplication normally rejects first.

## Canonical transition and active text

Before a successful structural mutation, the controller captures one complete
entry containing active text/format, deeply cloned canonical GraphIR including
positions/pins/nesting, and deeply cloned waypoint records. Failed validation
and cancellation return before this capture.

The pure transform returns a new GraphIR and waypoint map. Publication and
restore always pass that authoritative cloned map explicitly into the existing
canonical projection/update boundary. They never fall back to
`projectCanonicalGraph`'s routing-point-derived waypoint IDs or `corner` type.
Publication then:

1. invalidates older edit/layout/LLM work and active gestures;
2. clears geometry history and content redo;
3. replaces canonical GraphIR and the flat parser/diff projections;
4. projects font-aware nodes and edges while retaining all supplied positions;
5. prints Coral with `printCoralDSLWithDiagnostics`, or Mermaid with
   `convertToMermaidDslWithDiagnostics`;
6. marks that text as an internal projection so it is not reparsed as a user
   edit;
7. updates visible diagnostics, recovery/save inputs, counts, selection,
   announcement, and focus request in the same accepted transition.

Mermaid cannot express every symbol, port, hierarchy, ID, or geometry field.
Those losses use the existing visible conversion-diagnostic channel while the
canonical graph remains live. If the user edits the projected Mermaid text,
that explicit source edit accepts the represented subset under the existing
Slice 20/40 conversion contract; lost fields are not reconstructed.

The existing complete-content undo/redo stack is generalized from “LLM” to
all content-changing transactions. Each entry also snapshots the displayed
format-conversion diagnostics so a restored Mermaid graph cannot inherit loss
messages from the graph being undone. Geometry-only history remains separate.
Undo/redo continues restoring complete graph/text/waypoint/diagnostic snapshots
through the revision-owned canonical projection path and applies the same
registry-aware canonical-to-view port mapping as initial load and structural
publication. A new content mutation after undo clears content redo.

## Keyboard deletion

React Flow receives `deleteKeyCode={null}` so it cannot mutate controlled state
in parallel. `CanvasPane` intercepts eligible Delete and Backspace before
React Flow, excludes native/editable controls with the shared predicate, and
calls `onDeleteSelection`. The controller reads selected nodes and selected
edges from current refs—not stale render-time arrays—and performs one immutable
transform:

- selected nodes and every nested descendant are removed;
- all incident edges are removed;
- explicitly selected remaining edges are removed;
- waypoint entries are removed only for removed edges;
- untouched ordering, fields, and waypoints remain exact.

An empty selection is a no-op. A successful deletion is one content-history
entry and one projection/announcement transition.

## Focus and announcements

A focus request is `{ token, kind, id }`. `CanvasPane` fulfills it within its
own root after React Flow renders by matching the exact `data-id` wrapper and
calling `focus()`. Node/edge IDs are never interpolated into an unescaped CSS
selector. The controller also marks the created entity selected. The token
allows consecutive requests for the same ID.

The modal contains an atomic assertive live region for validation failures.
Messages come from the pure policy/validator and remain bounded to structural
facts; they contain no document text. The existing canvas polite live region
announces successful node/edge creation and deletion. Validation failure keeps
the draft and dialog open.

## Concurrent and failure behavior

- Every submit rechecks the current notation, registry, graph, endpoints,
  parent, symbol/variant ports, duplicates, and capacity.
- A late parse/layout/LLM result is invalidated before an accepted mutation and
  cannot replace it.
- A stale choice produces a named error, no graph/text/history/focus mutation,
  and an assertive announcement.
- Escape, Cancel, an empty selection, and an already-invalid command are
  history-free.
- Unsupported/empty registry choices disable submission and explain why.
- Projection exceptions leave the pre-commit graph and history unchanged; the
  controller validates and serializes the candidate before publishing state.

## Verification

Focused unit/component evidence covers pure transform immutability, nested
deletion, exact waypoint retention, ID suffixing, registry options, every edge
rejection, common pointer/keyboard policy, dialog focus trap/return/live error,
active-format text projection, complete history, and stale choices.

Playwright starts from a production build and uses keyboard input only after
page load: open each shortcut, fill native controls, commit, assert exact
focus/live status/text/canvas/save state, delete, undo, and redo. No
`page.mouse`, pointer event, or direct state injection is permitted in the
Slice 50 journey.

Optional experimental evaluation follows one committed script on:

- Windows: NVDA with current Chrome or Edge;
- macOS: VoiceOver with Safari.

When executed, each records OS/browser/screen-reader versions, palette discovery, form names
and values, validation announcement, cancellation return, success focus,
created entity semantics, deletion, undo/redo, result, blockers, and accepted
limitations. Both integrations are untested and experimental in 0.2.4; these
passes are not required for slice verification, acceptance, publication, or
release closure.

## Alternatives considered

- Extending `@coral-viz/viz` with a public headless command API was rejected:
  only the private reference editor needs this workflow, and a public surface
  would expand Slice 10 compatibility obligations without another caller.
- Letting React Flow own deletion and observing `onNodesChange`/`onEdgesChange`
  was rejected because one user deletion can arrive as split callbacks and
  cannot be captured reliably as one complete topology/waypoint transaction.
- Reusing geometry history for creation/deletion was rejected because its
  contract intentionally stores positions/waypoints but not membership or
  topology.
- Switching to Coral automatically before a command mutation was rejected
  because format selection is user-owned. The current diagnostic Mermaid
  projection preserves that contract explicitly.
- Treating capacity as a public validator error was rejected because it would
  change public validator and loaded-edge warning behavior. One private common
  creation policy hard-rejects that warning for both pointer and keyboard
  commits.

## Requirement-to-evidence matrix

| Requirement | Focused evidence | Integration evidence |
| --- | --- | --- |
| AC-1 commands/shortcuts | palette action-context and shared shortcut-eligibility component/controller tests | keyboard-only Playwright opens both modals; complete shortcut regression |
| AC-2 node creation | pure ID, symbol, parent, position, immutability, stale-parent tests; modal form tests | Playwright creates, focuses, announces, and saves a node |
| AC-3 edge creation | exact port/direction/missing/self/duplicate/capacity tests; shared pointer/keyboard policy parity including suffixed `inout` | Playwright rejects and accepts edges with live messages and exact focus |
| AC-4 deletion/history | nested deletion and waypoint-map pure tests; controller single-entry undo/redo with opaque smooth waypoint IDs | Playwright Delete/undo/redo without pointer input |
| AC-5 focus/announcements | modal focus trap/return/error tests; canvas token focus component tests | Playwright exact active element and live-region assertions; optional experimental manual scripts |
| AC-6 active formats | controller Coral/Mermaid projection and diagnostic tests | Playwright text/canvas/save agreement in the default Mermaid flow |
| AC-7 evidence | focused suites plus committed optional manual script | complete Chromium is required; NVDA/Windows and VoiceOver/macOS remain untested experimental records |
| AC-8 compatibility/scope | typecheck, build, coverage, source boundary, declaration/diff checks | root verify and complete pre-existing Chromium suite |
