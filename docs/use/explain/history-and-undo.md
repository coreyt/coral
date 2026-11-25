# Understanding history and undo

Undo and redo restore complete accepted document transactions rather than
isolated visual fragments.

## One ordered history

Text commits, Properties edits, Exact movement, pin and release, waypoints,
and Reflow enter one sequence. Undo restores source,
canonical graph, displayed geometry, diagnostics, publication state, and
settings together.

## Draft text stays in its editor

While focus is in the DSL editor, browser text undo handles uncommitted typing.
Once a source edit commits, document Undo and Redo own the resulting transaction.

## Failed work adds no history

Cancelled, stale, invalid or rejected layout candidates do not mutate the
document. An applied on-device edit is one history entry, and Undo restores
the prior source exactly. The
[on-device editing model](on-device-editing-model.md) is now available as an
experimental release, and its performance is alpha-level.

## Source ownership boundaries

In a source-owned Coral document, a supported canvas edit changes the relevant
authored span and preserves untouched comments and formatting. If Coral cannot
preserve the source or verify the resulting meaning, it refuses the edit.
Manual Reflow is available for verified spatial Coral source. It derives
geometry from the current accepted revision without rewriting authored text
or adding a source Undo entry. Pending, malformed, and sequence source cannot
start Manual Reflow; ordinary text save remains available.
Undo and Redo restore the exact source text. A draft with syntax or
conformance findings remains saveable as text.

For GraphIR interchange documents, Reflow preserves authored route-intent
waypoints while updating derived geometry.

## Related

- [How to place and edit objects](../how-to/place-and-edit-objects.md)
- [How to generate with AI](../how-to/generate-with-ai.md)
- [Keyboard shortcuts](../reference/keyboard-shortcuts.md)
