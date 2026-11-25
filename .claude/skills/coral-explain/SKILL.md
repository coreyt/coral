---
name: coral-explain
description: Explain verified Coral diagrams while preserving authored meaning
---

# /coral-explain

Use `coral_explain` to summarize a diagram for documentation or review.
Pass the exact saved source for either installed Coral saved-source edition (default 0.2.8 or explicit 0.2.9). The source must
begin with `@diagram <type>` and use ID-first declarations. The tool may
also accept named import formats or GraphIR input, but those are separate
boundaries; do not present an imported graph as authored Coral text.

## Example

```coral
@diagram architecture
gateway service as "API Gateway"
auth service as "Auth Service"
store database as "PostgreSQL"
gateway -> auth [calls]
auth -> store [reads]
```

An explanation may name the three components and the two written
connections. It must keep the authored `calls` and `reads` relations distinct
from labels or inferred implementation details. Written connector endpoints
retain their identity even when a visual arrow points backward.

## Document-local meaning

Read supplied `@symbol` metadata and authored node kinds separately. Artwork is
appearance, not evidence of inferred semantics or notation conformance. Keep
raw SVG and source bytes unchanged. A capability refusal is not an invitation
to reconstruct definitions from a display graph. Use `coral_validate` for
portable GraphIR 4 validation; input support is specific to each MCP tool.

## Reporting

- Explain the selected diagram profile, explicit symbols, labels, and
  relations from the verified input. Mark any inference as an inference.
- If a source construct cannot be represented by the explanation path,
  report the capability finding. Keep the author's text available for save
  and later edits.
- For profile conformance, use `coral_check_conformance` separately. A
  narrative explanation is not a conformance certificate; partial 0.2.8
  rule cards retain unverified obligations.
