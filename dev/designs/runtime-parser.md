# Runtime Parser Evaluation

Status: historical 0.2.2 evaluation. Grammar counts and omissions below are
dated observations, not current capability claims. The
[language specification](../../packages/language/SPEC.md),
[evolution policy](language-design-and-evolution.md) and
[current architecture](../ARCHITECTURE.md#source-portable-meaning-and-display)
own current contracts. TypeScript remains runtime parsing; Tree-sitter is
syntax tooling. Retain this record without using its old limits to reject
currently supported source.

Coral ships two parsers. The runtime one is portable TypeScript in `@coral-viz/language`; `tree-sitter-coral` is generated, tested against a corpus, and used by nothing at runtime. The question this records is whether the second should replace the first.

It should not, in this release. The gap is wider than it looks: the grammar knows six node types where the runtime parser accepts any identifier and the editor ships forty-six; it accepts only string property values where the runtime parser takes numbers and booleans; it requires a leading bare relation type in an attribute list, so `[label: "x"]` — the spelling the printer now emits — does not parse; and it has no notion of the `as`, `@` or `via` clauses beyond what was added to keep it tracking the node declaration. Closing that gap is a grammar rewrite, not an adoption.

The reasons to want it are real and unchanged: incremental reparsing on keystroke, error recovery that yields a tree rather than a line-oriented diagnostic list, and one grammar shared with editor tooling. But two of the three are already partly answered. The runtime parser now returns the graph it built alongside a failure, so a bad line no longer blanks the canvas, and diagnostics carry positions and machine-readable codes. What remains genuinely better about Tree-sitter is incrementality, and no measured problem currently demands it: parsing is not the cost in the editor's keystroke path, and there is no performance budget recorded to say otherwise.

The cost is not only the grammar. Tree-sitter at runtime in the browser means shipping and instantiating a WASM build, which `tree-sitter-coral` does not currently produce — it builds a native binding for Node and nothing for the web. The MCP server and the editor would need different loading paths for the same grammar, and `@coral-viz/language` would acquire a binary asset it does not have today.

The decision for 0.2.2 is therefore to keep the portable parser as the supported runtime surface and keep the grammar as editor-tooling syntax only, tracking the node declaration rather than the full language. Revisiting this needs two things first: a recorded interaction budget that parsing actually violates, and a WASM build in the grammar package. Neither exists, and inventing them to justify the swap would be the wrong order.
