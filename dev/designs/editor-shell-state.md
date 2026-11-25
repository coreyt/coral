# Reference editor shell state

Status: implemented in 0.2.4 Slice 40.
Implements R-037 while preserving R-012, R-015, R-027, R-030, R-031, R-036,
R-041, and R-042 behavior.

## Ownership and flow

`App.tsx` is the composition root. It calls one live `useEditorController`
hook and renders `AppView`. `AppView` owns only shell markup and prop routing to
`AppHeader`, `EditorPane`, `CanvasPane`, `InspectorPane`, command palette,
preferences, and recovery banner.

The controller is the single orchestration boundary for canonical GraphIR,
text, React Flow projection, selection, settings, layout/history, persistence,
recovery, generation, and exports. `sourceGraphRef` is authoritative for graph
content and envelope fields. React Flow nodes/edges plus the waypoint map are
the authoritative working geometry projection; they are overlaid onto
`sourceGraphRef` at every visual-to-text, save/export, LLM-context, and DSL
history boundary. `dsl` is either editable source or a tagged derived
projection. `lastParsedRef` and `previousGraphRef` are derived layout caches,
never independent content owners. Pending generated/recovery values are
single-use transition inputs.

Extraction is initially behavior-equivalent: state and callbacks move together
so closures, refs, ordering, and React hook lifetimes do not change. It returns
a typed view model; no second store or mirrored reducer is introduced. A live
`editorRevision` owner replaces the loose edit/LLM/layout counters and is used
by every parse/layout/LLM editor-revision commit check. Raster attempts, font
rebases, and gesture transactions retain their narrower specialized epochs.

Pure GraphIR/editor projection and port-compatibility functions live in an
internal `editorProjection` module. The private font-aware `diagramUtils`
adapter remains the reference editor's only general layout entry: it owns both
full `layoutNodes` and an editor wrapper over position resolution/incremental
layout. The controller does not call public layout primitives directly. The public
viz converter and MCP layout adapter stay in place: they are live external API
boundaries with different projection/output contracts, and Slice 60 owns their
algorithm/budget consolidation. This is explicit retention, not accidental
parallel shell ownership.

`useWaypointManager` retains its state/callback interface but delegates add and
remove transforms to the already-public pure waypoint operations. The hook
continues to own React state, routing, restoration, and change notification.

## Revision and failure model

Each async/edit origin uses the monotonic `editorRevision` authority. The
canonical commit point is a synchronous controller transition after its token
passes; derived React state is scheduled from that same transition.

| Origin | Revision/cancellation | Canonical commit and derived updates | History/failure cleanup |
| --- | --- | --- | --- |
| user text | advance edit, LLM and layout; abort generation and active gesture | successful parse commits content/envelope to `sourceGraphRef`, then nodes/edges/waypoints and caches | valid empty text commits an empty graph; any parse with errors and zero parsed nodes updates diagnostics only and preserves the entire last-good canvas/canonical graph; partial parse with at least one node adopts that partial graph as required by R-009 |
| visual/inspector/connection/waypoint | advance edit, LLM and layout for substantive mutation; abort generation; gesture transaction owns its epoch | update working projection, overlay it onto canonical content, print a tagged internal text projection | node/waypoint gestures save one before/after geometry transaction; cancellation rolls back; selection-only input has no revision/history effect |
| format/notation/layout setting | advance edit, LLM and layout; abort generation/gesture | convert/capture current canonical projection, record explicit loss diagnostics, then commit through the current layout token | clear incompatible geometry history; accepted target-format loss becomes the new canonical content and is never reconstructed |
| font setting | advance LLM and font revision; abort generation; an in-flight layout retries against current font | update settings, dimensions, edge font metadata; content/positions/waypoints stay authoritative | no history entry and no reflow; stale font projection cannot commit |
| document load/recovery | advance document key, edit, LLM, layout and font; abort generation/gesture | one successful deserialize commits envelope/content/settings/text projection, nodes/edges and exact waypoints; legacy recovery commits source plus latest position override through layout | clear both obsolete histories; deserialize failure leaves current document intact and clears the loading guard |
| LLM | submission advances edit/layout while retaining its active LLM token; supersession aborts | accepted current result stores one canonical graph, tagged text projection and derived full-layout input | push one DSL snapshot containing prior text/format/full canonical graph; aborted/stale result is silent and cannot clear newer loading/chat state |
| undo/redo | advance edit, LLM and layout; abort generation/gesture | DSL history restores its stored text/format/full graph through the normal current transition; otherwise geometry history restores positions plus exact waypoint map over unchanged content | DSL and geometry stacks remain intentionally separate and priority-ordered; each individual entry is coherent for the state it owns, and document replacement clears both |

- text input invalidates older edit/layout/LLM intent before its debounced
  parse can commit;
- visual/inspector/gesture updates refresh canonical GraphIR and print only
  through the guarded internal-text path;
- format/document/recovery replacement cancels gestures and generation and
  advances the document/edit revision;
- layout results commit only for the latest request and document/edit owner;
- LLM results commit only for the active LLM/edit revision; supersession and
  unmount abort transport and remain silent;
- failed or partial parsing reports diagnostics without blanking the last good
  canvas;
- undo/redo and recovery restore complete snapshots, including exact geometry
  and waypoint records, rather than mixing revisions.

The pure transition/token helper is required and must be the live
coordinator's authority. A test-only state machine or a second canonical graph
is prohibited.

## Interfaces and compatibility

All new modules are private to `@coral-viz/diagram-editor`; no package export,
declaration, dependency, grammar, GraphIR shape, or Coral document schema
changes. `App` remains the default export. Existing pane props and user-visible
commands, labels, focus, shortcuts, downloads, and errors remain stable.

Named constants stay beside their owning behavior: synchronization debounce
and internal-update guard in the controller, font/recovery delays with those
transitions, layout spacing in the layout owner, keyboard movement steps with
keyboard intent, and gutter defaults/bounds with the view/controller resize
boundary. Values do not change in this slice.

## Accessibility, privacy, and performance

Moving ownership must not replace semantic elements, focus behavior, live
regions, diagnostic keyboard access, or shortcut input exemptions. Generation
telemetry remains opt-in and redacted; no new persistence or network boundary
is added. Extraction must not introduce render-driven synchronization,
additional ELK requests, or new deep clones. Slice 36 Chromium journeys and
the existing paint observation are the user-boundary regression evidence;
Slice 60 owns formal browser/layout budgets.

## Alternatives

- Reviving the deleted first-generation hooks is rejected because their state,
  history, layout, and shortcut contracts predate the live path.
- A new global store/reducer is rejected because it changes scheduling and
  creates migration risk without a public requirement.
- A single 2,000-line controller is acceptable only as the behavior-preserving
  first ownership boundary if its critical branches meet per-file coverage;
  pure projection and presentation must still be separate, and no duplicate
  owner may remain.
- Cross-package ELK unification is deferred to Slice 60 because doing it here
  would change public/MCP geometry and expand the regression surface.

## Test traceability

| Contract | Evidence |
| --- | --- |
| composition root and live adoption | source-boundary test, default App render, no disconnected production owner |
| origin/stale behavior | pure live-token tests plus App text/visual/format/layout/LLM cancellation tests |
| canonical history/recovery | App undo/redo, font, gesture, waypoint, load/recovery tests |
| projection/compatibility | direct `editorProjection` tests and existing App export/save/connection tests |
| waypoint operation adoption | hook parity/notification tests and App waypoint characterization |
| accessibility/user behavior | pane suites and complete Chromium suite |
| coverage floors | package all-source gate; explicit per-file 80/75/80/80 thresholds for `src/useEditorController.ts` and `src/editorRevision.ts`; temporary 100/100/100/100 per-file threshold RED, then restored floor |
| compatibility and quality | typecheck/build, root verify, docs/diff, public declaration inspection |
