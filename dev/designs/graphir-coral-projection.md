# Lossless GraphIR projection in Coral DSL

Status: historical implementation in
0.2.4 Slice 20. The old pins,
public root-reader semantics and graph-print spellings below describe that
release. Current [Language Specification 1.2.0](../../packages/language/SPEC.md),
[canonical IR ownership](canonical-ir.md) and
[source architecture](../ARCHITECTURE.md#source-portable-meaning-and-display)
govern the distinct saved-source and deliberate-interchange contracts. This
record does not authorize graph-print replacement of current saved source.

## Boundary

Coral keeps exact `@graph-ir/core@0.2.0` and schema version `1.0.0`. The DSL
gains spellings for the fields explicitly allocated by R-035 when their values
are valid JSON data. It does not preserve `sourceInfo`, comments, whitespace,
original formatting, reserved `_...` properties, non-JSON runtime values, or
undeclared top-level fields. Edge descriptive text is the ordinary
`edge.properties.description` string convention; undeclared
`edge.description` remains a diagnosed loss.

The public `parse`, `print`, and `printWithDiagnostics` signatures do not
change. Existing Coral source remains accepted. Canonical printed text may add
new clauses because fidelity, not byte compatibility with the 0.2.3 printer,
is this slice's purpose.

## Surface syntax

Existing readable spellings remain authoritative for labels, ids, position,
pinning, hierarchy, scalar properties, endpoints, relation type, line style,
edge label, and waypoints.

Node grammar is exactly
`<type> <label> [as <id>] [@ (<x>, <y>)] [pinned] [data <object>] [{ ... }]`.
`<type>` accepts the existing bare token or a quoted non-empty string. Nesting
owns `parent`: a child re-parses with its enclosing id. A top-level parent or a
child parent inconsistent with nesting is diagnosed as dropped/degraded; this
does not invent a second flat-hierarchy syntax.

Edge grammar is exactly
`<source> -> <target> [as <id>] [[attributes]] [data <object>] [via ...]`.
All clauses are optional but occur in that order.

```coral
@graph {"id":"checkout","name":"Checkout","metadata":{"tags":["prod"]},"layoutOptions":{"direction":"RIGHT"}}

service "API" data {"description":"Entry point","dimensions":{"height":80,"width":160},"layoutOptions":{"portConstraints":"FIXED_SIDE"},"ports":[{"id":"out","side":"EAST"}],"symbol":"process","variant":"default"} {
  retries: 3
  rules: ["authenticated", {"region":"us-east-1"}]
  nullable: null
}

api -> db as writes [data_flow, label: "writes"] data {"properties":{"payload":{"kind":"order"}},"sourcePort":"out","style":{"routing":"orthogonal","targetArrow":"arrow"},"targetPort":"in"} via (10, 20)
```

- `@graph <json-object>` is optional, occurs at most once, and must precede
  declarations. It carries required `id` plus optional `name`, `metadata`, and
  `layoutOptions`. Present header fields override `ParseOptions` defaults. A
  duplicate, late, malformed, or id-less header is diagnosed and ignored.
  Malformed/id-less attempts do not consume the slot; the first valid header
  before any declaration wins, and every later header is a duplicate/late one.
- Node `data` carries only `description`, `dimensions`, `layoutOptions`,
  `ports`, `symbol`, and `variant`.
- Edge `as` uses the same quoted-or-bare id spelling as nodes. The printer
  omits it when replaying the document-wide edge allocator derives the id.
- Edge `data` carries `sourcePort`, `targetPort`, non-line `style` members, and
  `properties` containing values that cannot use scalar attributes.
- Node property lines retain the current quoted-string escape parser and add
  JSON `null`, arrays, and objects. Edge scalar properties retain the existing
  sorted attribute spelling. On a duplicate edge property, the readable
  scalar wins, the structured duplicate is ignored, and a positioned
  diagnostic is emitted.

Structured wrappers have closed keys. Unknown wrapper keys and wrong-shaped
known values are diagnosed and ignored individually, so the entity and other
fields survive. `style.lineStyle` is owned only by the readable attribute and
is rejected inside edge data. Nested `metadata.custom`, properties, port
properties, and algorithm options remain opaque JSON objects, matching their
GraphIR contracts rather than creating a second schema.

“JSON-safe” means `null`, strings, booleans, finite numbers, dense arrays, and
acyclic plain objects (prototype `Object.prototype` or `null`) whose own keys
are enumerable strings and values recursively satisfy this definition.
`undefined`, bigint, functions, symbols, accessors, symbol/non-enumerable keys,
sparse arrays, cycles, non-plain instances, and non-finite numbers are rejected
at any depth. `-0` prints as `-0` and remains negative zero. One invalid nested
member drops and diagnoses its containing first-class field or individual
property; printable siblings remain.

Objects print as compact JSON with recursively sorted keys; arrays retain
order. The text fixpoint is independent of object insertion order. Empty data
clauses are omitted.

## Parsing and failure behavior

The TypeScript parser remains the authoritative line-oriented runtime parser.
It recognizes the graph directive before declarations and uses quote-aware,
balanced-delimiter scanning for optional clauses. Structured clauses use
`JSON.parse`; legacy strings retain their existing escape behavior. Malformed
JSON or a non-object clause is ignored while its base node/edge survives with a
positioned `coral.*.unparsed` diagnostic. Unknown/wrong-shaped fields and
conflicts are ignored individually with positioned diagnostics. An empty or
duplicate explicit edge id is replaced through the allocator with
`coral.edge.id.degraded`. Other lines still parse and partial graphs return.

The printer recursively validates before emitting. It never relies on
`JSON.stringify` silently omitting a value. Reserved property diagnostics keep
their current codes. Existing field-loss codes disappear only for fields that
now have a spelling; both node and edge `sourceInfo`, noncanonical `parent`, and
undeclared edge description remain explicit.

Tree-sitter changes only for quoted node types and optional node `data`, both
inside the node-declaration syntax it already tracks. It does not gain graph or
edge structured clauses or become the runtime parser.

## Shared printer ownership

- `@coral-viz/language` owns all Coral text emission.
- The diagram-editor adapter may normalize its legacy `lineStyle`, then
  delegates without post-processing. App diagram synchronization uses its
  diagnostic wrapper and replaces the existing format diagnostics each time,
  including clearing them after a lossless projection.
- Editor LLM conversion continues to build GraphIR and delegate.
- `@coral-viz/viz` preserves required `PrintFunction = (graph) => string`.
  `SyncOptions` and `SplitEditorProps` add optional `printWithDiagnostics` and
  `onPrintDiagnosticsChange`. When supplied, the hook uses the result and
  replaces print diagnostics on every visual update without mixing or
  reordering parse-error state/callbacks. Print-only hosts behave unchanged.
- MCP `coral_convert` retains combined importer/printer diagnostics.
- MCP `coral_generate` builds one typed GraphIR. JSON serializes that object;
  DSL delegates to `printWithDiagnostics`, appends notes when present, and
  returns additive `structuredContent` counts and diagnostics. It uses
  `node.description` and `edge.type`, never invalid `node.metadata` or
  `edge.relation`.

Mermaid, DOT, and PlantUML emitters stay separate and keep target-specific loss
diagnostics.

## TDD and evidence matrix

| Contract | RED/GREEN location | Focused evidence |
| --- | --- | --- |
| R-035 AC-1–AC-4; R-009/R-010 fixpoint and identity | `packages/language/test/projection.test.ts`, `roundtrip.test.ts`, fixture corpus | full field matrix, quoted type, canonical/inconsistent parent, nested JSON, parallel edges, object-order fixpoint |
| R-035 AC-5; R-011 loss channel | projection and diagnostics tests | malformed/non-object/late/duplicate headers; wrong/unknown/conflicting fields; empty/duplicate edge ids; both sourceInfo kinds; every rejected JSON category; undeclared edge description; partial recovery |
| R-035 AC-4 native compatibility | existing parser/corpus plus `tree-sitter-coral/test/corpus/nodes.txt` | old sources and legacy unknown string escape; optional node data and quoted type only |
| R-035 AC-6 producers | diagram-editor printer/LLM tests, `viz/test/text-editor.test.ts`, MCP convert/generate tests | quote/control characters, diagnostics replace/clear, old print-only host, DSL/JSON graph equivalence, valid description/type, surfaced diagnostics |
| R-035 AC-7 | Slice 10 API fixture and package manifests | unchanged signatures/dependencies and target-specific importer diagnostics |

Focused RED/GREEN commands select those Vitest files plus native grammar tests.
Final independent verification runs focused suites, exact-toolchain lint,
typecheck, build, `npm run api-compat`, docs/diff checks, and one mandatory
`npm run verify`. Browser/performance/platform matrices remain for Slice 60
because this slice changes no browser interaction.

## Rejected expansion

No public recursive `JsonValue` type, GraphIR extensions, first-class edge
description, constraints, route sections, multiple labels, pages/layers,
hyperedges, styling system, new runtime parser, or GraphIR dependency update is
introduced.
