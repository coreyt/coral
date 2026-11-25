# Canvas object creation positioning

Status: accepted after independent Slice 35 design review; no medium/high
finding remains.

## Decision

Coral 0.2.5 creates objects through the existing Create Node command and
authoring dialog. A user can open it from the command palette or with
Ctrl/Command+Alt+N. The dialog derives choices from the live notation registry
and commits through the canonical GraphIR controller described by
[pointer-free authoring](pointer-free-authoring.md).

The canvas remains the place where the result appears and where existing
objects can be selected, moved and connected. Coral 0.2.5 does not ship or
claim a notation-library palette, dragging a symbol into the canvas, or
double-click-to-create.

## Why this is the complete 0.2.5 design

R-038 already supplies a keyboard-native creation path with exact validation,
history, focus, announcements, persistence/export agreement, and production
browser evidence. A second gesture would not close an unmet requirement. It
would add new discovery, registry browsing, drag payload, drop-coordinate,
container targeting, touch/pointer, focus and failure contracts immediately
before onboarding and documentation work.

The command-driven path is also usable from a blank diagram without depending
on a symbol shelf. Slice 40 can expose or name that existing action in Welcome;
Slice 50 can pair the application action with equivalent DSL. “Place an
object” describes the user outcome, not a promise that placement begins with a
drag gesture.

## Ownership and content contract

| Owner | Responsibility |
| --- | --- |
| R-038 and its existing design | Creation behavior, validation, canonical state, history, focus and announcements |
| Slice 35 | Select and freeze the shipped creation model; correct current guidance and active handoffs |
| Slice 40 / R-048 AC-1 | Lead a blank-diagram user to Create Node without duplicating the authoring workflow |
| Slice 50 / R-049 AC-1 | Document the command/dialog and DSL paths without inventing a canvas gesture |
| Slice 80 / R-008 | Recheck final application, docs, artifact and release claims against shipped behavior |

Current and future end-user creation instructions must name **Command palette >
Create Node** and may also give Ctrl/Command+Alt+N. They may say the created
object appears on the canvas and can then be dragged. They must not say or imply
that a symbol is dragged from a palette to create it.

The earlier post-Slice-20 decision and `039dcac` correction that removed Slice
35 remain historical. The user's later instruction reopens and requires the
gate. The Slice 35 resolution restores the slice in the active plan, appends a
superseding note to the decision register and Slice 6 status, and updates every
non-archived allocation/handoff record. It does not edit the original decision
text or archived records.

## Failure and compatibility boundaries

If the command is unavailable or creation validation fails, existing R-038
failure behavior remains authoritative. Documentation does not invent a
fallback gesture. The decision changes no component, command ID, shortcut,
public export/declaration, dependency, GraphIR/DSL shape, document schema,
storage, service worker or static artifact format.

The focused Slice 35 contract checks only active creation claims and handoffs.
It does not scan archived records and does not reject legitimate drag language
for moving an existing object or creating/reconnecting a connection.
