# How to lay out and reflow

Recompute diagram geometry while preserving authored spatial meaning.
These steps apply to GraphIR interchange documents and accepted spatial Coral
source. Manual Reflow accepts verified spatial Coral source. It uses the
current accepted revision and keeps authored text unchanged. A pending,
malformed, or sequence Coral source cannot start Reflow; save still keeps its
exact text.

1. Save or inspect the current document before broad layout changes. The
   unsaved indicator reflects whether the document differs from its last save.
2. Open **Command palette** > **Reflow Layout**. Coral computes verified current
   geometry and keeps the last good view visible while work is pending.
3. Use **Canvas controls** to zoom, pan, or fit the result. Viewport changes do
   not change document geometry.
4. Inspect diagnostics if a required constraint cannot be satisfied. Coral
   refuses the new layout atomically instead of publishing partial geometry.

Authored Exact positions, pins, constraints, route intent, and authored
waypoints survive Reflow. Computed-only positions remain view state.

If the layout worker is unavailable, the bounded main-thread fallback refuses
a graph over 100 nodes with `layout.worker.unavailable` rather than blocking
the editor.

The experimental on-device editing model can also place and arrange
objects, and its performance is alpha-level; see
[How to edit with the on-device model](edit-with-the-on-device-model.md).
Otherwise, use authored constraints, positions and arrangements with Reflow;
see [Coral DSL](../reference/coral-dsl.md).

## Result

The canvas shows verified geometry or retains the prior verified result with a
diagnostic.

## Related

- [How to connect and route objects](connect-and-route-objects.md)
- [How to place and edit objects](place-and-edit-objects.md)
- [Troubleshooting](../reference/troubleshooting.md)
