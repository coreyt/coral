# Coral visual system

Status: approved authority from the 2026-09-14 Slice 45 human gate and amended
by 0.2.6 Slice 30 for online-only delivery. Slice 46 implements this design.
Functional source, rendering,
history, AI, file, recovery, and persistence contracts remain owned by their
requirements and designs.

## Product character

Coral is a quiet, text-first technical workbench. The authored definition and
the diagram are co-primary. Application chrome should help users create, inspect,
repair, and preserve a diagram without competing with its content.

The system is compact, rectangular, neutral, and information-led. Accent color
identifies selection, focus-adjacent emphasis, and a small number of primary
actions; it is not decoration. Borders establish structure before shadows.
Motion explains a state or spatial relationship and otherwise stays absent.

This document supersedes the active use of the historical
`coral_design_standard.md` where that reference prescribed a permanent
navigation rail, fixed three-pane shell, gradient/decorative treatment, or
unreviewed component recipes. It retains that reference's useful principles:
explicit Save/Open/Reflow, position stability, compact density, visible focus,
semantic landmarks, and a minimal top app bar.

## Workspace composition

The selected desktop composition is:

1. a minimal header for product/document identity and document-level commands;
2. a resizable source surface docked left;
3. one persistent canvas occupying the remaining upper workspace;
4. C1 canvas controls floating at the lower-right of the unobscured canvas;
5. contextual Properties overlaid from the right edge of the canvas; and
6. one full-width bottom dock with Diagnostics, AI Conversation, and Activity
   Log tabs, followed by a compact status bar.

There is no navigation rail, top canvas-control strip, file browser, diagram
outline, snippets library, account surface, or repository navigator in 0.2.5.
Commands provide object creation and infrequent actions. Properties is an
alternate editor of the same authored definition, never a parallel source of
truth.

Properties and the bottom dock do not change the controlled React Flow camera
or graph-object screen positions. Their safe areas move or wrap canvas controls.
Resizing the source moves the canvas edge, but still must not Fit, Reflow, or
mutate the document. The canvas stays mounted throughout shell changes.

## Sizing and responsive desktop behavior

| Surface | Default | Minimum | Maximum / clamp |
| --- | ---: | ---: | --- |
| Header | 50 px nominal | content | grows at text scale; never clips |
| Status | 28 px nominal | content | may scroll inline at extreme scale |
| Source | 34% | 240 px | 520 px |
| Properties | 320 px | 280 px | 440 px and leave 224 px uncovered canvas; 250 px at 200% |
| Bottom | 220 px | 120 px | leave 320 px upper workspace; 340 px at 200% |
| C1 controls | content | 224 px safe width | 430 px; 270 px at ≤1100 px |

The normal splitter step is 16 px and the modified fine step is 4 px. Stored
preferences retain requested sizes; constrained windows use effective clamped
sizes without overwriting the request. Reset restores the defaults in this table
and tab defaults only. It never changes diagram data, source, camera, selection,
exact geometry, activity, or conversation.

Source and bottom sizing use the approved resizable-panel primitive. Properties
is not a panel-group sibling: Coral owns a vertical separator on the overlay's
left edge. Pointer capture and keyboard operation share the 280–440 px clamps,
16 px normal step, 4 px fine step, requested/effective persistence, and Reset
behavior. Properties resizing changes only its occlusion/safe area; it leaves the
canvas bounds and controlled camera, world geometry, routes, and revision intact.

Desktop classes are evidence targets, not CSS breakpoint prescriptions:

- **wide:** 1440×900; full labels and default sizes;
- **standard:** 1024×768; less-used header actions collapse into More and C1
  controls may wrap; and
- **constrained:** 800×600; source reaches 240 px, overlays may occlude diagram
  content, internal panels scroll, and all primary close/edit/control actions
  remain reachable.

At 200% text on 1024×768, header commands reduce to Save and More, the upper
workspace retains 340 px, controls wrap, and panel contents scroll. Mobile is
excluded by R-050. No layout under 800×600 creates a 0.2.5 support claim.

## Foundations

### Typography

- UI: Inter when bundled, followed by the native system sans-serif stack.
- Source/code: the existing bundled or platform monospace stack.
- Base UI size: 14 px at 100%; secondary text 12 px; neither is fixed against
  user scaling.
- Weights: 400 for body, 500–650 only for labels, document identity, selected
  tabs, and headings. Avoid all-caps except short structural labels.
- Numerals for aligned coordinates, sizes, zoom, and counts use tabular figures.

### Spacing and shape

Use a 4 px base unit. Preferred spacing steps are 4, 8, 12, 16, 24, and 32 px.
Control height is 34 px nominal; compact canvas buttons may be 30 px visibly
while retaining approximately 44 px coarse-pointer targets. Panels use 8 px
radius only when floating/overlaid; ordinary docked surfaces are square. Controls
use 6 px radius. Avoid pill shapes except genuine compact status/count tokens.

### Elevation

Docked surfaces use borders without shadows. Properties uses one overlay shadow;
C1 controls, popovers, and menus use a smaller floating shadow. Modal backdrops
and dialogs form the highest layer. No component invents another elevation tier.

### Motion

Transitions are limited to short spatial opening/closing or focus-preserving
movement and must not delay input. Busy indicators may rotate. Under
`prefers-reduced-motion: reduce`, decorative transitions and rotation stop while
status text, progress, and cancellation remain clear.

## Semantic color tokens

The application owns semantic roles. Component code consumes roles and does not
introduce literal theme colors. Slice 46 may tune a value only with visual review
and contrast evidence.

| Role | Light | Dark | Usage |
| --- | --- | --- | --- |
| application | `#f4f6f8` | `#15191e` | outside primary surfaces |
| surface | `#ffffff` | `#1e242b` | source, panels, header |
| surface-subtle | `#f7f8fa` | `#242b33` | gutters, inactive structure |
| surface-raised | `#ffffff` | `#28313a` | floating controls, nodes where app-owned |
| canvas | `#fbfcfd` | `#181d22` | canvas background only |
| text | `#1c2530` | `#edf1f4` | primary application text |
| muted | `#5b6877` | `#aeb8c2` | secondary but readable text |
| border | `#cdd5dd` | `#3c4651` | quiet structure |
| border-strong | `#9ca8b5` | `#667483` | separation and interactive bounds |
| accent | `#b94835` | `#e07a66` | selection and limited emphasis |
| accent-foreground | `#ffffff` | `#1e242b` | text/icons on filled accent controls |
| accent-strong | `#9e3728` | `#f18e79` | accent text/border on surface |
| accent-soft | `#f7e7e2` | `#492b28` | selected background/ring support |
| focus | `#1769aa` | `#68b6f2` | keyboard focus outline |
| warning | `#8b5b00` | `#f0c369` | stale or caution state |
| error | `#a92929` | `#ff9393` | blocking invalid/failure state |
| success | `#246b45` | `#7fd1a3` | current/complete state |

The selected evidence verifies at least 4.5:1 for tested normal text/token pairs
and at least 3:1 for focus/component boundaries. Authored diagram colors are
document content and do not automatically inherit application accent semantics.
Every state also has text, iconography, shape, or structure so color is never the
only cue.

## Component ownership

Coral wrappers own names, variants, tokens, and application callbacks. Native
HTML remains preferred for buttons and ordinary form fields. If the approved E1
dependency prototype passes, unstyled behavior primitives may sit behind private
wrappers for Dialog, Alert Dialog, Tabs, Tooltip/Popover, Radio Group, and
resizable panels. No third-party type crosses a public package boundary.

| Family | Required variants and states |
| --- | --- |
| Button | primary, secondary, quiet, destructive, icon; default/hover/active/focus/disabled/busy |
| Field | label, control, optional help, inline error; clean/draft/invalid/disabled/locked/mixed |
| Tabs | Properties and bottom; selected/focus/disabled, arrow/Home/End, manual activation when needed |
| Notice | information, stale warning, blocking error, network failure, recovery; concise summary plus optional details |
| Dialog/menu/popover | controlled open state, initial focus, containment where modal, topmost Escape, invoker restore |
| Separator | horizontal/vertical, pointer/keyboard resize, value announcement, clamp and reset |
| Toolbar | labelled C1 group, wrapping controls, disabled/busy explanation, no top strip |
| Status | current/pending/stale/failed/empty/dirty, always in text as well as color |
| Empty state | explanation plus an existing command-driven next action; no invented drag-to-create affordance |

Iconography uses one reviewed self-hosted family or existing Coral assets,
16–20 px nominal, `currentColor`, and visible labels where meaning is not
universally recognizable. Icons never replace accessible names. Emoji and
mixed ad-hoc SVG styles are not the production icon system.

## Surface behavior

### Header and status

The header contains Coral identity, current document identity/dirty state, Save,
Open, Export when allowed, and command access. In constrained/large-text states,
less-used actions move into More while Save and More remain. The document
summary names format, graph summary, notation, and relevant current/stale
condition without duplicating an active error notice.

### Source

The source surface has a visible name, format control, editor, and current status.
Invalid text stays editable and retains the last successful diagram with a stale
label. Diagram export is blocked for invalid, pending, unsupported, or failed
current revisions; source-draft save is separate. Quiet typing does not select or
navigate canvas objects.

Unmodified Tab indents source. Escape outside IME composition arms exactly the
next unmodified Tab or Shift+Tab to leave the editor: forward reaches the source
splitter and backward reaches the format control. Modifier chords do not consume
the arm; another Escape disarms it; composition and blur clear it. Source Escape
never closes an unrelated panel or modal. Visible Help text explains this
one-shot exit model.

### Canvas and C1 controls

The canvas remains the largest flexible surface. C1 contains Undo, Redo, Reflow,
zoom out/current/in, and Fit. It is lower-right within the unobscured safe area,
wraps before overlapping a panel, and does not become a full-width top strip.
Reflow stays explicit and undoable. Fit is view-only and never substitutes for
Reflow.

Diagram content follows the
[rendering readability requirements](visual-rendering-specification.md#diagram-readability).
Application density does not override the space needed for readable labels and
connections.

### Properties

Properties is a non-modal right overlay with Selection and Diagram tabs. It
shows empty, node, edge, and mixed selection states. It does not steal focus when
selection changes. Field drafts commit/cancel under D02 and never mutate through
a presentation primitive. In 0.2.5, position UI distinguishes exact coordinate,
pin, and explicit release; it does not label absolute `@` publication as Intent.
Its Coral-owned left-edge separator is pointer and keyboard resizable under the
shared sizing rules; it must not be implemented as a resizable-panel sibling of
the canvas.

### Bottom dock

The bottom panel spans the whole workspace. Diagnostics, AI Conversation, and
Activity Log preserve draft/scroll state when switching. Syntax notices open
full details and offer explicit Fix; semantic lint is silent/internal. AI busy
state identifies the operation, exposes Cancel/Stop, and locks every authored
mutation entry while leaving view operations available.

## Accessibility and focus

- Use native landmarks and headings for header, source, canvas, Properties,
  bottom tabs/content, dialogs, and status.
- Maintain native tab order. Opening non-modal Properties does not move focus;
  modal surfaces trap focus and restore the invoker.
- A three-pixel focus outline with two-pixel offset remains visible in both
  themes and is not clipped by overflow containers.
- Escape cancels the active field draft first, then closes only the topmost
  dismissible surface. Invalid blur/selection/tab transitions follow D02 rather
  than bypassing validation.
- Splitters report orientation and current/min/max values. Keyboard resizing
  uses 16 px normal and 4 px fine steps; pointer and keyboard share clamps.
- Tab lists implement the ARIA keyboard model and retain their panel content or
  explicitly persist draft/scroll before unmounting.
- Busy, error, empty, network-failure, selection, and disabled meaning never
  relies only on color, hover, animation, or pointer input.

## State composition

The complete production matrix combines both themes and each desktop class with
normal, hover, focus, active, selected, disabled, mixed, dirty, loading, empty,
pending render, invalid/stale render, render failure, network failure,
recovery, and AI-mutation states as applicable. It also includes Properties
alone, bottom alone, both together, modal over each, and 200% text.

The authoritative interaction rules remain D01–D12 in the Slice 45 decision
sheet/log, the approved lint/retry policy, and the frozen Slice 46 implementation
contract. Visual styling must not alter document transactions or failure policy.

## Exceptions and deferrals

Allowed exceptions must be named in the Slice 46 evidence ledger with owner,
reason, scope, and removal condition. Expected candidates are diagram-content
colors, source-editor syntax tokens, React Flow interaction handles, generated
export markup, and external/browser-native controls that cannot consume Coral
CSS. An exception is not permission for a second component system.

Deferred beyond 0.2.5: mobile support; persistent navigation/outline; preview/
accept AI review; semantic-lint UI; autocomplete/autocorrect; cloud or
collaboration surfaces; and broad component-suite adoption. Durable relational
intent was originally allocated to 0.2.6. The later S50-F1/F2 scope reopening
assigns only the minimum node-referencing GraphIR/Coral vertical slice to 0.2.5
Slices 51/52 while preserving the completed Slice 47 Exact baseline. Connector-
referencing constraints, label execution/gestures, and the broader backlog remain
deferred. Any portable representation still requires a coordinated versioned
GraphIR dependency and Coral DSL update.

## Evidence and change control

Slice 45 E4 evidence
records options, captures, measured composition, contrast, and the human gate.
Slice 46 must replace prototype evidence with production component, browser,
accessibility, camera, performance, bundle, online-delivery, and deterministic visual
evidence. A material change to layout, workflow, dependency family, platform
support, token character, sizing policy, or functional state returns to human
review; minor implementation tuning remains within documented tolerances.
