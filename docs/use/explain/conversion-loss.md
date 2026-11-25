# Understanding conversion loss

Conversion preserves the structure both formats can represent and reports what
the target format cannot encode.

## Formats have different vocabularies

Coral carries GraphIR metadata, nested objects, settings, exact geometry,
constraints, routes, and typed properties. Mermaid, DOT, and PlantUML each have
different diagram families and styling or layout concepts.

## Loss is directional

A Mermaid flowchart import can produce graph interchange for rendering without
carrying every style directive. The editor retains the Mermaid source; this
is not a general flowchart-to-Coral source writer. Printing an imported graph
into another format cannot reconstruct discarded syntax, comments, ordering
or unsupported metadata.

## Changing a saved-source notation

When you change a saved Coral diagram's type, its
explicit types and symbols remain authored.
Coral edits the header and checks the body against the new profile. Inferred
appearance can change; an unavailable explicit symbol receives a finding rather
than being silently replaced. Save retains the authored source even when the
new profile cannot render it. Use **Undo** to restore the earlier header.

Graph interchange conversion and foreign-format export have separate loss
rules. Keep the original source when a conversion reports fields that the target
cannot represent; a display fallback is not a new source master.

## Related

- [Conversion support](../reference/conversion-support.md)
- [How to convert from Mermaid](../how-to/convert-from-mermaid.md)
- [How to save, open, and recover](../how-to/save-open-and-recover.md)
