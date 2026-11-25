# Coral visual-system implementation

Status: accepted after independent Slice 46 design review and amended by 0.2.6
Slice 30 for online-only delivery; subordinate to the approved
`coral-visual-system.md`, R-052, and the frozen Slice 46 contract.

## Ownership and control flow

`useEditorController` remains the sole document/revision/action owner. `AppView`
is the private composition root and owns only presentation geometry. A private
`visual-system.css` defines semantic tokens, themes, focus, motion, shared
control anatomy, responsive rules, and the small set of application layers.
Components select semantic classes and states; they do not derive a second
theme or invoke document actions during panel operations.

The root carries `data-coral-theme="light|dark"`. The existing resolved theme
object continues to provide authored-diagram, React Flow, and public-package
colors while the private application migrates to CSS roles. This adapter avoids
changing public package props or declarations. The bounded exceptions are
diagram-authored colors, source syntax/entity decorations, React Flow handles,
export markup, and browser-native UI.

The upper workspace is one horizontal `react-resizable-panels` group with
Source and Canvas panels. The bottom dock is outside that group and therefore
spans the application width. Properties is absolutely overlaid on Canvas and
uses a Coral-owned separator; it is never a sibling that resizes or remounts
Canvas.

A private `useWorkspacePreferences` store, backed by
`workspacePreferences.ts`, is the single runtime owner of presentation
preferences. `useEditorController` consumes that hook and forwards its values
and setters to `AppView`; the existing duplicate panel/tab/width `useState`
owners are removed. Document open/recovery never initializes or changes the
store. User panel/tab/resize changes update it; Reset atomically restores its
defaults. `AppView` owns pointer capture and derives clamps but does not retain
a competing requested value.

The adapter's local key is `coral.workspace.v1`; its versioned payload stores
requested source width as a percentage (default 34), requested Properties width
in CSS pixels, requested bottom height in CSS pixels, open/collapsed flags, and
the selected Properties and bottom tab IDs. Reads validate version, finite numeric
ranges, booleans and known tab IDs; unknown/corrupt/unavailable storage falls
back to defaults without rewriting storage or blocking the editor. Writes are
best-effort and a failed write does not change current in-memory presentation.
Effective values are derived per render from requested values, viewport/text
constraints, and the frozen min/max/safe-area policy; clamps never overwrite
requested values. Reset replaces only this payload with approved defaults.
Reset restores source to 34% at the then-current viewport; later viewport
changes preserve that requested percentage while min/max clamps alter only the
effective rendered width. `AppView` may own ephemeral pointer state and derived
effective sizes. `useEditorController` remains the separate owner of document
revisions and actions.

## Private interfaces

- Shared primitives accept Coral names, variants, state and callbacks only.
  Radix Dialog/Tabs may implement behavior internally; Radix types do not leave
  `@coral-viz/diagram-editor`.
- `EditorPane` renders Source only. Its former bottom-panel props are composed
  by `AppView` into `BottomPanel`, preserving the current controller-owned
  active tab/collapsed state and chat/diagnostic callbacks. The AI prompt draft
  remains local to `BottomPanel`; there is no current Activity owner.
- `InspectorPane` gains private presentation size/separator props and explicit
  Selection/Diagram tabs. It never traps or moves focus on selection changes.
- Separators expose `role=separator`, orientation, current/min/max values, and
  normal/fine keyboard steps. Pointer updates and key updates call only private
  sizing setters.
- Source exit is a private wrapper event state machine: Escape outside IME arms
  one unmodified Tab/Shift+Tab; that event focuses the source separator/format
  control and disarms. A second Escape, composition, or blur disarms; modifier
  chords neither exit nor consume the arm.
- A private Properties boundary captures the invoker when it is explicitly
  opened. Its child cancellation seam returns `consumed` when an active field,
  gesture, or popup handled Escape. A consumed Escape arms the boundary but
  never closes it; the next focus-scoped Escape closes once and explicitly
  restores the captured invoker. When the child seam returns `unhandled`, the
  first focus-scoped Escape closes immediately. Selection-driven opening or
  following never captures or moves focus. Until Slice 47 connects D02 drafts,
  existing fields retain their current commit owner and report `unhandled`;
  Slice 46 never synthesizes a commit or cancellation.
- The Coral dialog wrapper captures `document.activeElement` immediately before
  a controlled open and restores it after close/unmount. Restoration does not
  depend on a `Dialog.Trigger`, because controller-owned openings often have no
  colocated trigger.
- Activity Log, syntax Details/Fix, pending/stale, and Exact/pin/release are
  private presentational interfaces and deterministic fixture states only when
  their functional owners are absent. No inert misleading action ships: a
  visible action requires a real callback supplied later by Slice 47. UI13's
  existing Show minimap/Show controls preferences may be restyled but are
  neither wired, simulated, nor removed in Slice 46.

## Compatibility, failure, and cancellation

No public export, schema, file, grammar, rendering, AI provider, document or
conversation storage contract, or document transaction changes. The only new
storage is the private versioned workspace-presentation payload above. If a
third-party primitive fails the accepted
portal/focus/identity/build/budget tests, only that wrapper falls back to the
custom implementation. Panel size corruption or unavailable storage falls back
to defaults and never blocks document use. Effective clamps always keep close,
source editing, Save/More, bottom tabs, and C1 controls reachable.

Dialogs remain controlled. Closing the topmost modal invokes its existing close
callback once and the Coral wrapper restores its captured invoker. Properties
remains non-modal and selection never autofocuses it. A child-consumed Escape
cancels first; an unhandled Escape, or the subsequent Escape, closes the panel.
Reduced-motion CSS removes transitions and
rotation while retaining textual busy/network-error state. Invalid/pending
source remains owned by Slice 47; Slice 46 styles and labels existing state only.

## Security, privacy, performance, and accessibility

The dependencies are exact private pins with MIT notices already assessed in
E1. They add no hosted asset, telemetry, runtime fetch, credential handling, or
public dependency/type. Presentation preferences contain sizes/tabs only and no
diagram or conversation content.

The build gate compares clean main-entry JS/CSS gzip sizes, checks duplicate
React/Radix/resize runtimes, and confirms no retired service worker, manifest,
archive, or checksum output. Panel operations must dispatch no layout/reflow
action and preserve the mounted canvas identity. Native landmarks, named
controls, three-pixel focus-visible outlines, non-color text/state cues,
ARIA tabs/dialogs/separators,
and 200% overflow behavior supply accessibility evidence; unrun real screen
reader/platform combinations remain explicitly unclaimed.

## Alternatives rejected

- A new state/controller layer would duplicate the accepted owner.
- Making Properties a resizable-panel sibling would move Canvas and violate the
  overlay/camera contract.
- Styling public viz components through new public APIs would leak a private
  visual system and change package contracts.
- A custom modal/tab rewrite would discard the accepted E1 result; a full
  component kit would exceed the frozen dependency/scope decision.
- Pixel snapshots alone cannot prove semantics, focus, state or geometry.

## Rollback and dependency gates

Radix adoption is deliberately serial. The exact pin, notice, wrapper, and one
guidance-dialog call site form one rollback unit. That unit must pass portal,
focus, Escape, explicit invoker restoration, theme, production build, React
identity, bundle, duplicate-module, worker/public-output, and declaration
boundary checks before Tabs or another dialog migrates. Tabs/contextual forms
then form a second rollback unit. The exact resize dependency, notice, adapter,
outer vertical/inner horizontal groups, and focused geometry evidence form a
third unit; the Coral Properties separator remains independent. Remaining
dialogs and surfaces migrate only in the complete-surface unit after the shell.
Final bundle measurement repeats rather than defers the initial gate.

## Requirement-to-test traceability

| Requirement | Primary evidence |
| --- | --- |
| R-052 AC-1 | token/contrast/exception inventory; component state tests; both-theme production captures; independent UI review |
| R-052 AC-2 | panel DOM/keyboard/persistence tests; no-action spies; mounted-canvas/camera/world-geometry Chromium assertions; viewport/200% matrix |
| R-052 AC-3 | modal/tab/separator/source-exit tests; two-stage Properties Escape and explicit invoker restoration; visible Help assertion; focus/keyboard/reduced-motion/contrast review; baseline provenance |
| Preservation boundary | existing editor/controller, online delivery, recovery, file, authoring and public consumer suites; root verification |
| Budget and handoff | production bundle ledger, duplicate-module/public-declaration checks, deterministic fixture/capture manifest and Slice 60 handoff |
