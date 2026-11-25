---
name: coral-convert
description: Convert supported diagram input through Coral's verified source boundary
---

# /coral-convert

Use `coral_convert` for a format conversion. The tool accepts Coral,
Mermaid, Graphviz DOT, or PlantUML text and targets either Coral or JSON.
It does not offer `to-mermaid` or `to-dot`, and it does not accept GraphIR
JSON as an automatic input. State the input and target formats explicitly
when detection could be ambiguous.

## Current 0.2.9 release boundary

- Saved `@diagram` Coral to Coral retains the exact source bytes. Saved
  Coral to JSON emits a source-verified GraphIR 4 candidate.
- A bounded Mermaid UML sequence subset can become Coral source: declared
  participants and actors, synchronous/asynchronous/return messages,
  participant notes before the first message, and successive nonoverlapping
  flat `alt`, `loop`, or `opt` fragments with representable guards. The tool
  reparses and verifies the generated source against its exact catalog.
- Nested Mermaid fragments, activations, unsupported note placement, and
  other meaning outside that subset receive a capability refusal with no
  partial Coral. Other Mermaid, DOT, and PlantUML inputs may produce JSON,
  but do not claim a lossless Coral rewrite unless the tool returns one.
- A conversion diagnostic never authorizes silently changing a label,
  connector, port, relation, order, or source text. Show it to the author.

The new general deterministic Mermaid-to-editable-saved-Coral mechanism is
deferred to 0.2.10. It is separate from AI; existing parsing/preview and the
bounded sequence conversion above remain available. Both default edition 0.2.8
and explicit 0.2.9 saved source retain exact bytes on Coral-to-Coral conversion.
Never flatten a document-local definition into a display-only graph.

## Saved Coral example

```coral
@diagram architecture
api service as "API"
store database as "Store"
api -> store [reads]
```

For exact Coral identity, submit this text with `from: coral, to: coral`.
For a portable candidate, submit the same text with `from: coral, to: json`
and validate the resulting GraphIR 4 JSON through `coral_validate`. Raw
GraphIR 4 input remains unsupported by `coral_convert` and editor opening.

## Mermaid sequence input

```text
sequenceDiagram
participant A
participant B
A->>B: request
alt accepted
B-->>A: ok
else rejected
B-->>A: denied
end
```

Request `from: mermaid, to: coral`. Accept the returned Coral only when the
tool confirms exact source projection and model verification. Unsupported
variants remain in their original input format with an explicit finding.
