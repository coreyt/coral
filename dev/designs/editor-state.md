# Text, IR, and Visual State

Status: historical 0.2.4 implementation description, retained with the
Slice 40 completion. The graph-print
flow below does not govern current saved Coral. Current
[REQ-C1 source authority](../requirements/system-requirements.md#req-c1-bidirectional-source-canvas-inspector-parity-and-atomic-history)
and [architecture](../ARCHITECTURE.md#editor-assembly-and-publication) require
source-owned transactions, exact unrelated-byte preservation and coherent
revision/history/layout publication. Do not save a display/staging graph as
replacement source. The [Language 1.2.0 contract](../../packages/language/SPEC.md) names each reader,
formatter and writer boundary. The remaining text records the original design.

Text edits parse into GraphIR, validate, then update visual nodes. Visual edits serialize the current GraphIR and print Coral text when Coral is active. Feedback-loop guards identify the update origin. ELK reruns only for initial load, explicit reflow, notation changes, or structure that cannot retain stable positions.

Format changes convert the current graph. They never replace user content with examples. Documents save as versioned `.coral.json`; GraphIR export is a separate JSON artifact. Recovery data is browser-local and does not claim collaborative persistence.
