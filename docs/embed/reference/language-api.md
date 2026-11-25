# Language API

Coral 0.2.9 source parsing and explicit graph interchange;
governed by [Language Specification 1.3.0](language-specification-1.3.0.md).

| Entry point | Main exports | Use it for |
| --- | --- | --- |
| `@coral-viz/language` | `parse`, `parseDocument028`, `formatDocument028`, header helpers, importers, diagnostics | Saved Coral source, default 0.2.8 or explicit 0.2.9; root `parse` aliases `parseDocument028` |
| `@coral-viz/language/parser` | graph-only `parse`, `labelToId` | Deliberate GraphIR 3 text interchange, separate from saved-source authority |
| `@coral-viz/language/sequence` | structural sequence helpers and validation | Narrow graph-level sequence consumers |
| `@coral-viz/language/printer` | `print`, `printWithDiagnostics`, formatting | Explicit bounded graph-to-text generation and loss reporting |
| `@coral-viz/language/formats` | Mermaid, DOT, and PlantUML importers | Explicit format import into its documented graph subset |

## Install the package

Install the verified 0.2.14 archive with its exact published GraphIR Core pin:

```sh
npm install @graph-ir/core@0.2.4 ./coral-viz-language-0.2.14.tgz
```

## Read saved source

<<< ../examples/read-coral-source.mjs

The reader requires an exact installed header/catalog runtime. The result has
`header`, recovered `syntax`, and an optional GraphIR 3 staging `graph`.
Inspect both diagnostic collections before semantic use. Absence of that graph
does not mean the text cannot be saved: successor-only meaning is projected
separately by render's source pipeline. A staging graph is not portable export
authority, and successful parsing is not a conformance or rendering claim.

Retain `result.header.source` for exact save/reopen. Ordinary save does not
call a printer, normalize quotes, inject version pins, or repair the text.

## Deliberate graph-only interchange

The explicit `/parser` entry reads its graph-only input edition, with a
`success` flag, `graph` and diagnostics. This input is not saved 0.2.8 Coral:

<<< ../examples/read-graph-interchange.mjs

A saved `@diagram` document passed to this entry receives
`coral.source.reader.unsupported` and no graph. Use the root saved reader for
those documents; do not replace their exact text with graph-generated output.

## Diagnostics and repair

`formatDocument028(source, runtime)` explicitly expands each indentation tab to
two spaces, retaining all other bytes, fields, labels and line endings. It
requires a resolved header and valid body syntax; malformed drafts are refused
without repair. It uses the same installed runtime as the saved reader and does
not require a GraphIR 3 staging graph. Label insertion through
`setCandidateLabel`
uses escaped double quotes; existing authored label quotes remain unchanged.

Header diagnostics carry codes, messages and ranges; any header finding
prevents resolved header identity. Body diagnostics additionally use the
closed severities `error`, `warning`, and `info`. The explicit graph-only
printer reports data it cannot represent through `printWithDiagnostics`.
It is not a general formatter for source-owned 0.2.8 documents.

`repairCoralDsl` conservatively repairs its declared legacy input subset,
byte-preserves parser-valid input, records each applied fix and leaves
ambiguous defects unresolved. Review its result before replacing authored
text; do not treat it as an automatic 0.2.8 source repair operation.

## Parser ownership and older packages

The specification owns syntax and meaning; the TypeScript reader implements
reference resolution and semantic diagnostics. Tree-sitter supplies syntax
tooling and does not establish another authority. Language 1.3.0 joins the
saved-source and explicit graph-interchange contracts, with distinct editions
and representation mappings. `CORAL_LANGUAGE_VERSION` exposes that contract
version; package and source/header versions remain independent.

Published `@coral-viz/language@0.2.6` used a different root `parse` result and
GraphIR 3 interchange contract. Use its matching documentation when consuming
that immutable package; those examples are not the current API.

Reference owners: [Language Specification
1.3.0](language-specification-1.3.0.md), [Language evolution
policy](../../contribute/reference/language-evolution.md).

## Related

- [Render a diagram](../how-to/render-a-diagram.md)
- [Tree-sitter grammar](tree-sitter.md)
- [Render API](render-api.md)
- [Coral DSL for application users](../../use/reference/coral-dsl.md)
