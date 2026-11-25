# Coral 0.2.9 Slice 60 — User symbol design

Status: **approved** 2026-10-28 (revision 3), amended in revision 4 the same
day. Revision 2 resolved the first Fable medium-effort review; revision 3
resolves the second, independent Fable 5 medium-effort review. The author
decided every open question and approved the before/after source notation on
2026-10-28, recorded in the slice status. Revision 4
applies the author-accepted GraphIR proposal review
and re-evaluates dependencies; see [Revision 4](#revision-4-graphir-alignment).
It changes no source spelling or canonical print; the author confirmed its
four diagnostic changes on 2026-10-29. Nothing is implemented.
Owner: Slice 60 plan. Inputs: the
SVG icon proposal (storage, admission profile and
budgets, adopted unless this design says otherwise), the
user-defined node survey, and a read-only inventory of
`release/0.2.9` at `e4b15ba4`.

## Decision summary

1. A **user symbol** is a document-local catalog entry with the same contract
   as a bundled node symbol: identity, display name, description, tags,
   artwork, outline, default size, label placement, named anchors and semantic
   ports with labels and connection limits. Deliberate differences are listed
   in [Parity](#parity-with-bundled-symbols) and nowhere else.
2. Definitions live **in the saved Coral source**, once per document, in
   `@symbol` blocks. Nodes select one with the existing `[symbol: "…"]` field
   and a reserved `local.` prefix. No sidecar, URL or library reference
   satisfies a document.
3. Artwork is **raw SVG text** in the source (author decision 2026-10-28),
   admitted through a Coral-owned bounded profile: parsed into a typed
   artwork model and re-serialized from that model, never emitted from input
   bytes. The same admission runs in every consumer.
4. Document-local definitions form an **overlay catalog layer** resolved
   after the pinned bundled catalog. The frozen bundled registry and its
   pinned header digests are unchanged.
5. **Geometry is frame-based.** The node box is the artwork frame. Each user
   symbol gets a synthetic outline in frame coordinates — `rectangle`,
   `rounded`, `ellipse` or `diamond` — and artwork is clipped to that outline.
   Boundary and interior anchors are defined on the frame.
6. **Ports gain optional `label` and `maxConnections`** for every port, user
   symbol or node-local, matching the bundled `SymbolPort` contract (author
   decision 2026-10-28).
7. The new syntax requires **source edition `0.2.9` and Language
   Specification 1.3.0** (author decision 2026-10-28), as a version-gated
   extension of the `028` reader family. Documents that do not use the new
   syntax keep edition `0.2.8` and stay readable by 0.2.8.
8. **GraphIR is updated as needed** (author decision 2026-10-28): the GraphIR
   4 candidate gains a document symbol catalog and port connection limits,
   released in a new `@graph-ir/core` that Coral adopts in this slice when
   it is published in time; until then GraphIR 4 export refuses explicitly.
9. The editor gains a browser-local **My Icons** library, an import and
   symbol editor, an inspector view, and tag search in the palette. Placing a
   symbol copies its definition into the document. Library changes never
   propagate silently.

## Author decisions — 2026-10-28

| ID | Decision |
| --- | --- |
| D60-1 | `@symbol` block spelling |
| D60-2 | Reserved `local.` reference prefix |
| D60-3 | Artwork is stored as raw SVG text, not base64 |
| D60-4 | Interior anchors are in Slice 60 scope, not deferred |
| D60-5 | Optional single-colour `tint` is included |
| D60-6 | GraphIR is updated as needed to carry definitions; Coral does not ship a permanent export refusal |
| D60-7 | Character `flowchart` profile uses a labelled-box fallback with a notice |
| D60-8 | Source edition `0.2.9` and Specification 1.3.0 are accepted; documents using user symbols are refused by older readers |
| D60-9 | Port labels are in scope; `maxConnections` is included for full parity with bundled ports |
| D60-10 | `ellipse` and `diamond` outlines are in scope, not deferred |
| D60-11 | Next `@graph-ir/core` approved as recommended: an additive candidate-contract release numbered by the GraphIR release process |
| D60-12 | Interior anchor `[x:, y:, exit:]` and port `label:`, `maxConnections:` spellings |
| Notation | Before/after source notation, canonical print and diagnostics approved |

## Inventory findings that shape the design

| Finding | Location | Consequence |
| --- | --- | --- |
| Language 1.2.0 states document-local symbol definitions are outside the edition | `packages/language/SPEC.md` §3 L139 | New edition and specification minor version |
| Node fields are closed: `symbol`, `variant`, `conformanceException`, each `key: quoted`; there is no node size field | `spec/grammar-028.ebnf` `node_field` | Reuse `symbol:`; add no node field; `aspect` is not authorable (see [Geometry](#geometry)) |
| Port grammar is `id port [direction: …, anchor: …]` | grammar `port` | Extend with optional `label` and `maxConnections` |
| Bundled `SymbolDefinition` carries name, description, shape, tags, variants, defaults, ports, named anchors, marker, container flag; ports may carry `label` and `maxConnections` | `packages/render/src/types.ts` L104–166; `symbols/flowchart.ts` L53–56 | Parity target |
| `NamedSymbolAnchor {id, side, position}` exists but no bundled symbol uses it | `symbolAnchors028.ts` | First production consumer; extend with interior anchors |
| U1 drops catalog `SymbolPort.anchor` sides as stencil hints and keeps `label` | `interpretation028.ts` L66–70 | User-symbol port anchors are authored semantics and are kept (see [Resolution](#semantic-model-and-resolution)) |
| U1 rejects a symbol outside `catalog.allowedSymbolIds` with `coral.symbol.foreign-profile`, and an unknown one with `coral.symbol.unknown` | `interpretation028.ts` L53–59 | Snapshot admits `local.*` IDs; reuse `coral.symbol.unknown` |
| `stencilFit028` applies an SVG `meet` fit to a bundled shape's viewBox; the scene draws `shapeId` and throws `render.capability.unknown-shape` for an unregistered shape; U1 exposes `effectiveShapeId: symbol.shape` | `stencilAnchorGeometry028.ts` L67–89; `scene.ts` L83–125, L266, L507–536; `interpretation028.ts` L113 | Frame-based resolver and a synthetic outline shape; an artwork scene part replaces the shape path |
| There is no `rounded` shape; rounding is `rectangle` plus `cornerRadius` | `shapes/index.ts` L19–27; `stencilAnchorGeometry028.ts` L92 | `outline rounded` maps to that pair |
| Editor and viz resolve through global registries in nine files | `authoringModel.ts`, `notationSemantics.ts`, `hooks/diagramUtils.ts`, `useEditorController.ts`, `compatibility/validateConnection.ts`, `compatibility/useEdgeCompatibility.ts`, `waypoints/router.ts`, `layout/elk.ts`, `components/SymbolNode.tsx` | Each takes the per-document snapshot |
| Each notation digest hashes every bundled symbol, shape and glyph; digests are pinned in the header manifest keyed by Coral version | `notations/index.ts` L55–93; `header-manifest028.ts` | User symbols never enter the frozen registry |
| The header scanner treats every `@` line before the body as a directive and masks consumed lines from `body`; unpinned documents use `runtime.currentVersion`, hard-coded `'0.2.8'` | `header028.ts` L236–256, L282, L320; `installedDocument028.ts` L23; `llm/generate.ts` L36 | The header scanner owns definition regions; see [Edition mechanics](#edition-mechanics) |
| The source writer prints `@coralVersion "0.2.8"` unconditionally; `prepareHeaderForSave028` refuses a pin that changes interpretation | `successorSourceWriter028.ts` L111; `header028.ts` L331 | Writer emits the effective version; placement has its own header edit |
| The Tree-sitter grammar is line-oriented, directives are a closed token set, and no external scanner exists | `tree-sitter-coral/grammar.js` L22, L43–47; `tree-sitter-coral/src` | New `scanner.c` for raw blocks |
| Only the browser DOM path prefixes IDs; only the `<coral-diagram>` element has a shadow root, while `renderTo` replaces an arbitrary host's children | `browser/src/dom.ts` L83–116, L216; `browser/src/element.ts` L76 | Namespaces move into the serializer; `renderTo` gains a boundary |
| Character profiles are `block` and `flowchart`; `block` rejects any explicit symbol | `characters028.ts` L53, L155 | Fallback stated per profile |
| "icon" names the 8-glyph registry that R-057 AC-2 restricts | `glyphs/index.ts`; `dev/requirements.md` R-057 | Term "user symbol"; amend R-057's scope |
| Palette uses `getByNotation`; tag search has no product consumer | `authoringModel.ts` L113; `symbols/index.ts` L83–122 | Palette search is new and also serves bundled symbols |
| `appendSourceOwnedNode028` writes only `id type` | `sourceOwnedEdits028.ts` L558 | Symbol-aware placement edit |
| GraphIR 3 and 4-candidate schemas are closed; GraphIR 4 `SemanticPort` already has `label` but no connection limit | `spec/upstream/*.json`; `@graph-ir/core` `graph-ir-4.candidate.d.ts` | [GraphIR updates](#graphir-updates) |
| `coral.symbol.unknown`, `coral.port.duplicate`, `coral.port.anchor.symbol-unknown` and `coral.port.reference.*` are emitted but unregistered | `spec/diagnostics.json`; `packages/render/src` | Register them |
| `status/slice-30.md` L87 still assigns local symbols to 0.2.12 | status record | Correct on approval |

"Anchor" has five meanings in the code. This design uses **anchor** only for
named attachment geometry on a symbol and the generic side tokens a port may
name.

## Parity with bundled symbols

| Attribute | Bundled symbol owner | User symbol |
| --- | --- | --- |
| Identity | `SymbolDefinition.id` | `local.<id>`, unique in the document |
| Display name | `name` | `name` line (required) |
| Description | `description` | `description` line |
| Tags for search | `tags` plus normalized name tags | `tags` line plus the same normalized name tags |
| Artwork | Shape path in a viewBox; optional variant glyph | Admitted SVG artwork |
| Outline for routing and contacts | Shape path contour | `outline rectangle` (default), `rounded`, `ellipse` or `diamond` |
| Default size | `ShapeDefinition.defaultSize` | `size` line (required); imports default to fit 64 by 64 |
| Resize behavior | Shape `sizing` | Aspect ratio always preserved |
| Label placement | Hard-coded per shape ID | `label` line using node-label sides; default `below` |
| Named anchors | `namedAnchors` (boundary) | Boundary and interior `anchor` lines; cardinal sides always available |
| Semantic ports | `ports` with direction, label, connection limit | `port` lines with the extended port grammar |
| Default appearance | `defaults` (fill, stroke, radius) | Artwork keeps its explicit colours; optional single-colour `tint stroke` |
| Accessible name | Node label, symbol name | Same; artwork is decorative |
| Palette entry | Notation list | Thumbnail at 24 pixels; accessible name is the symbol name |
| Inspection | Node inspector shows symbol and ports | Also provenance, license and digest |
| Provenance | Bundled, versioned catalog | `source` and `license` lines; content digest |

**Deliberate differences in Slice 60.** User symbols have no variants (define
another symbol instead), are never containers, carry no edge marker, and have
no profile semantics: the node's kind word keeps its profile meaning. In
0.2.9, a document in which at least one node selects a `local.` symbol is not
conformance-checked: its effective conformance level is `none`, so no
notation-profile connection rules or conformance findings apply anywhere in
it, and MCP `coral_check_conformance` reports it as not checked. Port
direction and `maxConnections` stay enforced. Enabling conformance for such
documents is later work (author decision 2026-10-30). User
symbol port anchors are authored pins, whereas bundled catalog port sides are
stencil hints that U1 drops. Port override or subtraction of a bundled symbol
remains out of scope.

## Source notation proposal

This is the before/after review that
[contributor guidance](../../../../CLAUDE.md) requires. The author approved
it on 2026-10-28; the approval is recorded in the
slice status.

### Before

```coral
@diagram flowchart
check decision as "Valid?" {
  yes port [direction: out, anchor: S]
  no port [direction: out, anchor: E]
}
done terminal as "Done"
check:yes -> done
```

Edition `0.2.8` cannot define a symbol, put a label or connection limit on a
port, or anchor inside a shape.

### After

```coral
@diagram architecture
@coralVersion "0.2.9"

@symbol shield {
  name "Shield"
  description "Security boundary or policy enforcement point"
  tags "security" "auth"
  size 48 x 56
  label below
  outline rounded
  source "Drawn in-house"
  license "CC0-1.0"
  anchor crest [side: N, at: 0.5]
  anchor keyhole [x: 0.5, y: 0.55, exit: S]
  login port [direction: in, anchor: W, label: "Sign-in", maxConnections: 1]
  token port [direction: out, anchor: E, label: "Token"]
  audit port [direction: out, anchor: keyhole]
  artwork svg """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28">
  <path d="M12 0 L24 4 L24 14 C24 21 18 26 12 28 C6 26 0 21 0 14 L0 4 Z" fill="#2f6f4f"/>
</svg>
"""
}

gate service [symbol: "local.shield"] as "Auth gateway"
vault database as "Secrets" {
  ingest port [direction: in, anchor: W, label: "Writes"]
}
gate:token -> vault [reads]
gate:audit -> vault:ingest [type: writes, secondEnd: arrow]
```

### Block contract

- `@symbol <id> {` opens a definition; `}` alone on a line closes it.
  Definitions follow the directives and precede the first body statement. A
  directive after a definition is the existing `header.directive.late`.
  Order among definitions is not significant; the printer keeps authored
  order.
- Every attribute is one body line. Values reuse existing forms: quoted
  strings (`name`, `description`, `source`, `license`), space-separated
  quoted tags, bare closed words (`label`, `outline`, `tint`), and
  `size <width> x <height>` using the grammar's finite positive `coordinate`
  numbers in diagram units.
- `label` takes `above | below | left | right | center`; `outline` takes
  `rectangle | rounded | ellipse | diamond`; `tint` takes `none | stroke`.
  Defaults are `below`, `rectangle` and `none`.
- **Boundary anchor:** `anchor <id> [side: N|E|S|W, at: <0..1>]`, the point at
  fraction `at` along that side of the outline's bounding frame, projected
  onto the outline along the side normal.
- **Interior anchor:** `anchor <id> [x: <0..1>, y: <0..1>, exit: N|E|S|W]`, a
  point in normalized frame coordinates with an explicit exit direction.
- Generic sides `N E S W` and `auto` stay valid port anchors without
  declaration. Anchor IDs follow the `symbolAnchors028.ts` rules, including
  the ban on generic names.
- **Ports**, inside `@symbol` and on any node, accept two new optional keyed
  fields: `label: "<text>"` and `maxConnections: <positive integer>`. Existing
  port lines are unchanged and keep their meaning.
- `name`, `size` and `artwork` are required; other lines appear at most once,
  except `anchor` and `port`.
- References use the unchanged quoted `[symbol: "local.shield"]` field. The
  `local.` prefix is reserved: no bundled ID may start with it, and a
  `local.` reference never resolves to the bundled catalog. Because the
  reference is a quoted value, a node whose ID is `local` and a dotted node
  reference `local.shield` in an edge are unaffected.

### Raw block contract

`artwork svg """` ends its line. Every following line is raw content until a
line consisting of exactly `"""`. One component owns definition regions:

| Consumer | Responsibility |
| --- | --- |
| Header scanner `header028.ts` | **Owner.** In edition `0.2.9`, recognizes `@symbol` lines as definition regions, finds each region's end (skipping raw content), masks the whole region from `body`, and returns exact region spans. Reports `coral.symbol.local.edition` instead of `header.directive.unknown` in edition `0.2.8` |
| New definitions parser `symbolDefinitions029.ts` | Parses region spans into definitions; raw content goes only to artwork admission |
| Candidate tokenizer `candidate028.ts` | No change: masked regions never reach it |
| Tree-sitter `grammar.js` plus new `src/scanner.c` | External scanner recognizes the raw block; `@symbol` joins the definition grammar, not the closed directive token |
| Source writer `successorSourceWriter028.ts` | Prints definitions and copies raw content byte for byte, never re-indenting it |
| Source-owned editors `sourceOwnedEdits028.ts` | Treat a region as one span for offsets, insertion points and replacement |
| Conformance fixtures | Exact-source cases with comment markers, braces, `@` and `//` inside raw content |

A raw block with no closing line is one located
`coral.symbol.local.artwork.unclosed` at the opening line; the rest of the
document is not parsed as body. Raw content cannot contain a line that is
exactly `"""`; the admission serializer never produces one, and a hand-written
one closes the block early, which admission reports as a parse failure.

### Canonical print

The writer prints a definition in this order: `name`, `description`, `tags`,
`size`, `label`, `outline`, `tint`, `source`, `license`, anchors, ports,
artwork. Defaults are omitted. Port fields print as `direction`, `anchor`,
`label`, `maxConnections`. Ordinary save preserves authored bytes; canonical
form applies only where the writer already emits canonical text. Artwork
written by the editor is the canonical admitted serialization.

### Diagnostics

| Code | Condition |
| --- | --- |
| `coral.symbol.unknown` (existing) | `local.` reference with no definition |
| `coral.symbol.local.duplicate` | Two definitions share an ID |
| `coral.symbol.local.unused` (notice) | Definition with no referencing node |
| `coral.symbol.local.late` | `@symbol` after the first body statement in an edition `0.2.9` document; in an edition `0.2.8` document a late block reports only `coral.symbol.local.edition` and is masked (author-approved 2026-10-29) |
| `coral.symbol.local.edition` | `@symbol` in an edition `0.2.8` document |
| `coral.symbol.local.field.required` | Missing `name`, `size` or `artwork` |
| `coral.symbol.local.field.duplicate` | A single-use line repeated |
| `coral.symbol.local.field.invalid` | Malformed or out-of-range size, label, outline, tint or tags |
| `coral.symbol.local.field.unknown` | Unrecognized line inside a definition |
| `coral.symbol.local.anchor.duplicate` / `.invalid` | Anchor ID repeated or generic; `at`, `x` or `y` outside 0..1; interior anchor outside the outline; missing `exit`; an interior anchor on the outline whose `exit` is not strictly outward |
| `coral.symbol.local.artwork.unclosed` | Raw block without a closing line |
| `coral.symbol.local.unclosed` | `@symbol` block without a closing `}`; the region runs to the end of the file (author-approved 2026-10-29) |
| `coral.symbol.local.syntax` | Malformed `@symbol` opening line: missing or invalid ID, or no `{` (author-approved 2026-10-29) |
| `coral.symbol.local.reserved-prefix` | Bundled catalog contains a `local.` ID (catalog build failure) |
| `coral.syntax.port.label.invalid` / `.max-connections.invalid` | Port label not quoted or missing, or limit missing or not a positive integer |
| `coral.syntax.port.label.duplicate` / `.max-connections.duplicate` | A port repeats `label` or `maxConnections` (author-approved 2026-10-29) |
| `coral.port.connections.exceeded` | More connectors on a port than its `maxConnections`; reported on read in edition `0.2.9` documents only, for every resolved limit |
| `coral.artwork.svg.parse` / `.element.unsupported` / `.attribute.unsupported` / `.reference.unsupported` / `.reference.cycle` / `.budget.exceeded` / `.geometry.invalid` / `.viewbox.invalid` | Admission failures; `budget.exceeded` names the exceeded budget in its detail |
| `coral.symbol.local.conformance-unsupported` (warning) | An explicit `@conformanceLevel typical` or `strict` in a document where at least one node selects a `local.` symbol; conformance is not checked there in 0.2.9 (author-approved 2026-10-30) |
| `character.symbol.local-fallback` (notice) | Character output drew a fallback box for a user symbol; the detail lists each escape segment it could not draw |
| `export.graphir.local-symbol.unsupported` | GraphIR export of a user symbol or port limit the target cannot carry; the detail names the format version |
| `export.graphir.port-limit.exceeded` | GraphIR 4 export, after adoption, of a document whose explicit endpoints exceed a resolved port limit |
| `import.graphir.local-symbol.id-unsupported` | GraphIR import of a `local.` ID whose suffix Coral source cannot spell |
| `import.graphir.local-symbol.digest-mismatch` | GraphIR import of a definition whose digest differs from the computed digest |
| `import.graphir.artwork.profile-unsupported` / `.rejected` / `.noncanonical` | GraphIR import of artwork whose profile version Coral lacks, that admission rejects, or that is admissible but not canonical |

Existing `coral.port.duplicate`, `coral.port.anchor.symbol-unknown`,
`coral.port.reference.missing` and `coral.port.reference.direction` apply
unchanged. Older readers refuse `@coralVersion "0.2.9"` with the existing
`header.version.unavailable`. Slice 60 registers every code above and the
existing unregistered codes it relies on in `diagnostics.json`.

## Edition mechanics

Edition `0.2.9` is a version-gated extension of the `028` reader family.

- **Default edition stays `0.2.8`.** `runtime.currentVersion` remains
  `'0.2.8'` in `installedDocument028.ts` and `llm/generate.ts`, so an
  unpinned document is read as `0.2.8`, saved documents without new syntax
  keep their header, and 0.2.8 readers still open them.
- **New syntax requires a pin.** An unpinned or `0.2.8`-pinned document that
  uses `@symbol` gets a located `coral.symbol.local.edition`; one that uses
  port `label` or `maxConnections` keeps today's
  `coral.syntax.port.field.invalid` or `.field.unknown`, so `0.2.8`
  diagnostics do not change (author decision 2026-10-29). The editor offers a
  quick fix that pins `0.2.9`. Text is never reinterpreted silently.
- **Header rewrite is its own edit.** `prepareHeaderForSave028` refuses a
  pin that changes interpretation, so placement and the quick fix use a new
  undoable header edit that inserts or rewrites `@coralVersion "0.2.9"` as
  part of the same transaction as the definition.
- **The writer emits the effective version** instead of the hard-coded
  `"0.2.8"` in `successorSourceWriter028.ts` L111.
- `header-manifest028.ts` gains a `0.2.9` entry with the same per-type
  profiles, catalogs and digests as `0.2.8`; the effective version is passed
  to the header scanner, definitions parser, port parser, Tree-sitter
  queries, writer and source-owned editors.
- `grammar-028.ebnf` gains the definition and port-field productions,
  annotated as edition `0.2.9`. Specification 1.3.0 owns the normative text.

## Semantic model and resolution

1. The definitions parser produces `UserSymbolDefinition` values: the
   bundled `SymbolDefinition` fields plus `size`, `label`, `outline`, `tint`,
   `artwork` (admitted model), `source`, `license` and `digest`.
2. Resolution builds a per-document catalog snapshot: the pinned bundled
   catalog plus an overlay keyed by `local.<id>`. The snapshot's
   `allowedSymbolIds` adds every overlay ID. The overlay never mutates the
   frozen registry.
3. U1 treats a resolved user symbol like a bundled one except for port
   anchors: user-symbol ports enter `mergeSemanticPorts028` with their
   authored anchors, labels and limits preserved. `effectiveShapeId` is the
   symbol's synthetic outline ID, `local.<id>`, registered only in the
   snapshot's shape overlay.
4. The snapshot is threaded to every consumer that resolves symbols today:
   the nine editor and viz files in the inventory, the scene builder,
   layout, character renderer, MCP and CLI. Each renders or validates a user
   symbol only through the snapshot and reports the unresolved state when
   the overlay lacks the ID; none falls back to a global registry.
5. `digest` is the GraphIR document-symbol digest (decision GQ-4): SHA-256
   over the UTF-8 bytes of the RFC 8785 canonical JSON of the definition's
   GraphIR form, with canonical admitted artwork text, the three top-level
   defaults removed and tags, anchors and ports sorted, exactly as the
   [GraphIR proposal](../../../designs/proposed-graphir-changes-for-coral.md#8-add-a-document-symbol-catalog)
   specifies. Authored artwork that is not canonical is canonicalized by
   admission before hashing, so the digest does not depend on authored
   whitespace or attribute order. Until adoption Coral computes the digest
   with the same exact pinned RFC 8785 and SHA-256 libraries as core; at
   adoption (C7) it switches to core's exported digest function. Both
   implementations pass the shared digest vectors permanently. Changes to the canonical
   digest input change the digest by design; the editor compares digests only
   when placing from the library or on an explicit sync. The digest is not
   authored or printed.
6. `maxConnections` on any port is enforced by the existing connection
   compatibility path (`validateConnection.ts`) in the editor. On read, only
   endpoints that name the port count. In edition `0.2.9` documents an excess
   is the error `coral.port.connections.exceeded` for every resolved limit:
   authored, user-symbol, bundled and bundled-variant. Edition `0.2.8`
   documents cannot author limits, and Coral reads them exactly as today:
   nothing checks connection limits on read, so their diagnostics are
   unchanged. This scoping applies only to Coral's read diagnostics; GraphIR
   validation follows decision GQ-6 unchanged. Coral validates its GraphIR
   export catalog-aware, so after adoption GraphIR 4 export of a `0.2.8`
   document that exceeds a bundled limit refuses with
   `export.graphir.port-limit.exceeded` instead of emitting a graph the
   GraphIR validator rejects; before adoption, export of such a document is
   unchanged. U1 carries `maxConnections` from catalog and variant ports
   (`interpretation028.ts` today carries only `label`) and
   `semanticPorts028.ts` gains the field, so the GraphIR snapshot adapter can
   supply base and variant limits.

## Artwork admission

Admission follows the SVG icon proposal profile,
budgets and tiers, with these decisions:

- The rules are published as the `coral.svg-artwork` profile, version 1: a
  normative document fixing what is admitted, the budgets, and the exact
  canonical serialization, with conformance vectors shared with GraphIR
  (decision GQ-2). A profile version is immutable; a tightened budget or
  changed serialization is a new version.
- A dependency-free parser in `packages/render` (R-019: no React, no DOM)
  tokenizes the bounded XML subset, rejects DTDs and entities, and builds a
  typed model: groups, transforms, paths, basic shapes, fills, strokes,
  opacity, local gradients and bounded clip paths. The tokenizer is fuzzed.
- Source artwork is authored text and need not be canonical; ordinary save
  keeps its bytes. Rendering, digests and GraphIR export always use the
  canonical serialization of the admitted model. GraphIR import requires
  canonical text and reports noncanonical, unsupported-profile and rejected
  artwork distinctly, mapping each GraphIR finding to a located diagnostic.
- Output is serialized from the model with Coral's escaping; input bytes are
  never inserted into a DOM or output. DOMPurify is unnecessary.
- Every painted primitive is serialized with explicit `fill`, `stroke`,
  `stroke-width` and `opacity`, so no inherited host value crosses a style
  boundary.
- Each definition is serialized once per rendered document as a `<symbol>`
  with a namespace `coral-sym-<local ID>-…` for its gradient and clip IDs.
  Instances are `<use>` elements sized to the frame. `tint stroke` artwork
  paints with `currentColor`, set per instance on the `<use>`, so no
  per-instance copies are needed. The browser `isolateIds` prefix adds a
  per-embed layer.
- The same admission runs on parse in the editor, browser package, MCP
  server and CLI.
- Pinned, conservative SVGO runs only in the editor import flow before
  admission; admission re-validates its output.
- SVG element IDs are never anchors or ports. Budgets are calibrated by the
  proposal's corpus and benchmarks before release.

## Geometry

- **Frame resolver.** User-symbol geometry goes through a new frame resolver,
  not `stencilFit028`. The node box is the frame; the aspect ratio of `size`
  is always preserved by layout, minimum sizing and resize, so the outline,
  anchors and ports never float. `aspect free` is not offered: saved source
  has no node size field to carry a stretched size.
- **Artwork placement.** The artwork `viewBox` maps into the frame as
  `xMidYMid meet`: origin translated, scaled uniformly, centred. Admission
  removes root `width`, `height` and `preserveAspectRatio`. A `viewBox` whose
  aspect ratio differs from `size` letterboxes only the artwork; outline,
  anchors and ports are frame geometry. Import sets `size` from the `viewBox`
  aspect, so imported symbols are not letterboxed.
- **Synthetic outline.** Each definition gets a `ShapeDefinition` whose
  viewBox is `0 0 <width> <height>` from `size`, so a `meet` fit is the
  identity, and whose path is the outline in absolute `M L Q C A Z` commands.
  `rounded` generates the same quadratic `Q` corners that `resolveShapePath`
  emits for the bundled `rectangle`, with radius `min(width, height) / 8` in
  frame units (decision GQ-3), so the corner scales with the frame. Because
  the analytic rounded-corner code applies only to the bundled `rectangle`
  ID, user-symbol corners resolve through the sampled path contour; Slice 20
  cases bound the sampled-versus-analytic corner tolerance. `ellipse` and
  `diamond` paths are generated. Every outline is convex. Contacts, contour
  attachment and ELK port sides use this path through the existing contour
  sampler.
- **Drawing.** The scene gains an `artwork` part; when present, the
  serializer and canvas skip the shape path and draw only the artwork,
  clipped to the outline path. The outline itself is routing geometry. The
  import preview shows the clip.
- **Boundary anchors** project the side point onto the outline along the
  side normal, so an `at: 0.5` north anchor on an ellipse sits on the curve.
  Ports pin through them as through bundled named anchors; free ports use
  `portAttachment028.ts` policy.
- **Interior anchors.** An interior anchor resolves to an attachment point on
  the outline where a ray from the anchor in its `exit` direction leaves the
  outline; convexity guarantees exactly one such point. Layout and routing
  treat that boundary point as the port, exactly as for a boundary anchor.
  Every renderer draws the fixed escape segment from the interior point to
  the boundary point as the first or last segment of every connector using
  that port; it is part of the connector, not optional decoration. An anchor
  on the outline has a zero-length escape, and its exit must be strictly
  outward: the ray contains no other point of the closed outline region.
  Validation rejects an anchor outside the outline and an inward or tangent
  exit with `coral.symbol.local.anchor.invalid`. This keeps Slice 20
  placement, contour contact and routing algorithms unchanged.
- **Label reservation.** A definition's `label` side is reserved in layout:
  the user-symbol node's layout box grows on that side in both the SVG and
  editor layout inputs, so neighbours and passing connectors keep clear, while
  ports stay on the body. The side is skipped when the node's ports or exits
  use it, and a label that cannot use its side falls back to a clear side or
  inside the frame; it never refuses (author decisions 2026-10-31, step C4
  Q-C4-6).
- **Sizing.** `size` is the default and minimum frame. Labels never resize
  the frame: `above`, `below`, `left` and `right` place the label outside it
  with the existing node-label placement code; `center` places it over the
  artwork with the existing wrapping and overflow rules. An authored node
  `label … offset` still overrides the default.
- **Slice 20 checks.** Placement, contour contact and routing tests gain
  user-symbol cases for each outline, boundary and interior anchors, pinned
  and free ports, and connection limits.

## Rendering targets

| Target | Behavior |
| --- | --- |
| Shared scene and SVG serializer | `<symbol>` definitions and `<use>` instances clipped to the outline; escape segments for interior anchors; port labels drawn as bundled port labels are |
| Editor canvas (`SymbolNode.tsx`) | Same scene parts; handles at anchors and ports; unresolved state when the snapshot lacks the ID |
| `<coral-diagram>` element | Existing shadow root; verified against a hostile host stylesheet |
| `renderTo` | Attaches a shadow root to its host when the host has none, so it gets the same boundary; verified with the same fixture |
| HTML, PNG and JPEG export | From the same SVG; HTML export wraps the drawing in the same boundary; no network access |
| Character renderer, `flowchart` profile | Labelled process box with a `character.symbol.local-fallback` notice; interior anchors attach at their boundary points, and the notice lists each escape segment it could not draw |
| Character renderer, `block` profile | Existing refusal of explicit symbols applies unchanged |
| Dark themes | Explicit artwork colours are kept; `tint stroke` follows the theme stroke colour with the 0.2.7 dark-legibility fallback |

The character fallback is checked against the frozen 0.2.8 character
quality criteria before acceptance.

## Editor and My Icons library

1. **My Icons** is an IndexedDB store on the editor origin, following the
   `transcriptArchive.ts` pattern, holding admitted definitions, optional
   original bytes as opaque recovery data, and bundle import and export. The
   proposal's quota, eviction and document-only fallback rules apply.
2. **Import** offers Add SVG, file picker and drag and drop; runs SVGO and
   admission in a cancellable worker; previews at 24, 48, 96 and 256 pixels on
   light and dark backgrounds; lists every removal or refusal.
3. **Symbol editor** sets name, description, tags, provenance, size, label
   side, outline and tint; places boundary and interior anchors with handles
   or numeric values, showing each interior anchor's exit ray; and adds ports
   with direction, anchor, label and limit.
4. **Palette** lists My Icons and document symbols beside bundled symbols
   with thumbnails, and searches names and tags over all of them using
   `searchSymbols`.
5. **Inspector** shows, for a node using a user symbol, the symbol name,
   description, tags, provenance, license and digest, with a link to the
   symbol editor. Port labels and limits are editable for any port.
6. **Placement** is one undoable transaction: the header edit pinning
   `0.2.9` when needed, the `@symbol` block when the document lacks it, and
   the node with its `symbol` field, via a symbol-aware extension of
   `appendSourceOwnedNode028`.
7. **Updates.** When a library digest differs from the document's, the
   editor offers update, keep, or save as a new ID. Updating is one undoable
   edit; removed ports or anchors list affected connectors first. Library
   changes never alter a document.
8. **Undo and Redo** use the existing content-snapshot history.

## Interchange

- **Saved `.coral.json`** carries definitions in its source text.
- **Internal projection.** `sourceOwnedGraphForExport028` and other internal
  projections carry the snapshot so rendering and layout work.
- **GraphIR 4 candidate export** refuses, from the start of delivery, any
  document that uses a user symbol or a port `maxConnections`, with
  `export.graphir.local-symbol.unsupported` naming the format version in its
  detail (author decisions P-1 and P-4). Adoption of the updated
  `@graph-ir/core` (see [GraphIR updates](#graphir-updates)) replaces the
  refusal with export of the document symbol catalog and port limits.
  GraphIR 4 import then reads them back with the same admission and digest
  checks, and refuses with `import.graphir.local-symbol.id-unsupported` a
  `local.` ID whose suffix Coral source cannot spell. Round trip preserves
  definitions, including unused ones.
- **GraphIR 3 export** is a legacy format with no slot for definitions; it
  refuses a document that uses a user symbol with
  `export.graphir.local-symbol.unsupported` instead of dropping meaning. The
  MCP and CLI paths behave the same.
- `metadata.custom` is not used: saved source marks it unsupported and it
  would hide meaning from other consumers.
- Mermaid, DOT and PlantUML imports produce no user symbols.

## GraphIR updates

GraphIR's specification is maintained in `~/projects/graph-ir` and its
`@graph-ir/core` package in `~/projects/graph-ir-tools`
(`packages/core`). Published 0.2.3 was built from the
`*-coral-028-package-freeze` worktrees while both repositories' `main`
branches still record 0.2.2; reconcile those branches before new work. The
GraphIR delivery plan owns the sequence and records the
author's decisions P-1 to P-5; the reviewed contract is the
[GraphIR proposal](../../../designs/proposed-graphir-changes-for-coral.md#proposed-graphir-4-additions-for-document-local-user-symbols).
The list below is the summary.

1. **Reconcile.** Bring both GraphIR `main` branches up to their published
   `release/0.2.3` state. The specification gets its own `v0.2.3` tag and
   release record first, after its tests and verification (P-2). The same
   reconciliation adds the next-interaction work (full Mermaid 12 sequence
   support) to the GraphIR roadmap for the release after this one (P-5).
   Coral sessions may open these and later GraphIR pull requests (P-3).
2. **Proposal.** The reviewed
   [proposal](../../../designs/proposed-graphir-changes-for-coral.md#proposed-graphir-4-additions-for-document-local-user-symbols)
   adds the GraphIR 4 `documentCatalog`, local resolution of symbol and route
   anchors, `maxConnections` on semantic and snapshot ports, the artwork
   carrier and digest, and enumerated tightenings. The author accepted its
   review recommendations and GQ-1 to GQ-7 on 2026-10-28.
3. **Shared vectors.** The `coral.svg-artwork` profile version 1 and its
   admission, canonical-serialization and digest vectors are written before
   either implementation, because both the GraphIR specification and Coral's
   admission step consume them.
4. **GraphIR repositories.** Specify the schema and types in `graph-ir`;
   implement types, validation, digest, snapshot limits and migration
   fixtures in `graph-ir-tools`, each on its own release branch with that
   repository's review and release process.
5. **Release.** Publish the next `@graph-ir/core`, an additive
   candidate-contract release numbered by the GraphIR release process
   (D60-11), with exact identity and integrity.
6. **Adoption.** Coral pins the release, re-runs Slice 10's public Core
   declaration, lock, source-integrity and installed/packed identity checks,
   and only then replaces the export refusal with GraphIR 4 export and
   import of user symbols and port limits.
7. **Baseline refusal.** Until step 6, GraphIR 4 export of user symbols or
   port limits refuses explicitly (P-1, P-4); the gap stays visible in the
   slice status and Slice 70.

## Requirements changes

- Add a user-symbol requirement with acceptance criteria drawn from the
  plan and the parity table: definition, resolution, admission, geometry
  including interior anchors and all four outlines, port labels and limits,
  rendering parity, library, update and interchange behavior.
- Amend R-057 AC-2 so the finite glyph registry governs bundled glyphs only;
  user artwork is user content admitted by the profile, and Coral still ships
  no vendor logos.
- Extend R-063 AC-1's reachability rule to user symbols, including the AI
  generation path it names. R-043 is immutable historical evidence, so its
  retention rule reaches user symbols through the 0.2.9 interpretation table
  in the requirements instead of an edit. Done 2026-10-29 as R-065.
- Correct `status/slice-30.md` L87 to point at Slice 60.
- Specification 1.3.0 replaces the §3 exclusion with the `@symbol` and port
  field contract, with valid, invalid, canonical, round-trip and exact-source
  conformance cases for each diagnostic and the raw block contract.

## Delivery plan

Each step is RED, then GREEN, then reviewed. Coral steps C0 to C8 and GraphIR
steps G1 to G5 run as two tracks joined at C7.

| Step | Work | Depends on |
| --- | --- | --- |
| G2 | **Review the revised proposal** with a Fable medium-effort review and resolve its findings | Revised proposal; done 2026-10-28 when its findings are resolved |
| C0a | **Digest vectors:** definitions with expected digests over exact pinned RFC 8785 and SHA-256 libraries, covering Unicode, numbers, defaults, explicit `auto`, permutations and `properties`; artwork `text` taken as given | G2 |
| C0b | **`coral.svg-artwork` profile version 1:** document with admission rules, budgets and canonical serialization, plus provisional admission and canonicalization vectors | G2 |
| C1 | **Language:** edition gating and manifest entry, header-scanner region ownership, definitions parser, port `label` and `maxConnections`, EBNF, Tree-sitter grammar and external scanner, writer effective-version output, source-owned region spans and header edit, diagnostics registry, conformance fixtures | Approved notation |
| C2 | **Admission:** artwork model, parser, canonical serializer, `<symbol>`/`<use>` output with namespaces and explicit paint, budgets, digest, fuzzing, malicious, budget-edge and two-instance fixtures. The serializer must reproduce the C0b vectors; any mismatch is resolved in the profile document, and the vectors become final, before the profile version is frozen | C0a, C0b |
| C3 | **Resolution and geometry:** snapshot and shape overlay, U1 port anchors and limits from catalog and variant ports, threading through the nine editor and viz files, frame resolver and artwork placement, synthetic outlines with quadratic rounding, boundary and interior anchors, escape segments, edition-scoped connection limits, route anchors relative to user-symbol ports, Slice 20 routing cases with corner tolerance, and the GraphIR 4 export refusal baseline | C1, C2 |
| C4 | **Rendering:** scene artwork part, canvas, SVG, browser element and `renderTo` boundaries with hostile-stylesheet fixtures, exports, character fallback with escape-segment detail | C2, C3 |
| C5 | **Editor:** palette search and thumbnails, inspector, placement transaction, symbol editor with anchor and port authoring, Undo/Redo | C1 to C4 |
| C6 | **My Icons:** store, import worker that sets `size` from the `viewBox`, bundle import and export, update prompts by digest | C2, C5 |
| G1 | **Reconcile GraphIR:** branch reconciliation, specification `v0.2.3` tag after verification, next-interaction roadmap entry | P-2, P-3, P-5 |
| G3 | **Specify in `graph-ir`:** schema, types, prose, the C0a digest vectors, and tightening fixtures; the artwork profile is referenced by identity, not vendored | G1 reconciliation and specification tag (the roadmap entry need not precede it), G2, C0a |
| G4 | **Implement in `graph-ir-tools`:** candidate types, validation, exported digest function, snapshot limits, admission hook, diff, migration fixtures | G3 |
| G5 | **Release** the next `@graph-ir/core` | G4 |
| C7 | **GraphIR adoption:** pin and Slice 10 identity checks; snapshot adapter limits and the `sourceOwnedGraphForExport028` projection; switch to core's digest function; export and import with admission and digest; import refusals; tests for bundled variants, authored versus inherited ports, self-loops and every edge direction; round trips for unused definitions, mixed catalogs and unsupported profiles; GraphIR 3 refusal; `0.2.8` export refusal over bundled limits; shipped-corpus limit check | G5, C2, C3 |
| C8 | **Guidance and AI:** examples, Specification 1.3.0 reference, user guidance, capability statements, the AI generation prompt and validation in `llm/generate.ts`, and both skill trees (`skills/`, `.claude/skills/`), updated independently; feed journeys into Slice 70 | C1 to C6; C7 when available |

G2 completes with this revision. C0a, C0b, C1 and G1 then start in parallel.
Digest vectors depend on no SVG serializer, which removes the cycle between
the profile vectors and C2; profile vectors stay provisional until C2
reproduces them. C1 to C4 are the release-critical core. If G5 is not
published when C1 to C6 and C8 are complete, Slice 60 can close with the C3
refusal baseline and C7 stays open as a visible gap. Under schedule pressure
the first cuts are `tint` and the "save as new ID" update path; palette search
stays because it also serves bundled symbols.

## Open decisions

None. Every decision is recorded in
[Author decisions](#author-decisions--2026-10-28).

## Risks

- **Scope.** With interior anchors, four outlines, port fields and a GraphIR
  release in scope, this is the largest slice in 0.2.9. The raw block
  contract touches every line-oriented consumer and adds an external
  Tree-sitter scanner.
- **Cross-repository dependency.** GraphIR changes follow another
  repository's review and release; the fallback keeps Coral shippable.
- **Security.** Artwork is the first user-supplied markup Coral renders. The
  parse-to-model boundary, fuzzing, namespaces and style boundaries need
  independent review.
- **Performance.** `<symbol>`/`<use>` reuse limits markup growth; repeated
  detailed artwork still dominates paint cost, so aggregate limits come from
  the proposal's benchmarks.
- **Edition churn.** Documents that use the new syntax require 0.2.9 readers
  by design; all others remain 0.2.8.

## Revision 4: GraphIR alignment

On 2026-10-28 the author accepted every recommendation in the
GraphIR proposal review and decided P-1 to P-5.
Revision 4 applies them to this design and re-evaluates dependencies:

| Change | Sections | Source |
| --- | --- | --- |
| The digest is the GraphIR digest over canonical admitted text, not a model digest | [Resolution](#semantic-model-and-resolution) item 5 | GQ-4, A-1 |
| `rounded` uses quadratic corners with `r = min(width, height) / 8` in frame units; every outline is convex | [Geometry](#geometry) | GQ-3, C-1, C-2 |
| Artwork maps into the frame as `xMidYMid meet`; outline, anchors and ports stay frame geometry | [Geometry](#geometry) | A-2 |
| Escape segments are part of the connector; boundary-point anchors have zero-length escapes and a strictly outward exit | [Geometry](#geometry), [Rendering targets](#rendering-targets) | A-2 |
| `coral.svg-artwork` version 1 is a published, immutable profile with canonical serialization and shared vectors | [Artwork admission](#artwork-admission) | GQ-2, A-6 |
| Connection limits carry through U1 from catalog and variant ports; the read-time error is edition-scoped | [Resolution](#semantic-model-and-resolution) item 6 | GQ-6, A-4, A-5 |
| GraphIR 4 export refuses from the start; adoption replaces the refusal; import refuses unspellable `local.` IDs | [Interchange](#interchange) | P-1, P-4, A-7 |
| Delivery gains C0a and C0b and an explicit two-track dependency table without the vector cycle | [Delivery plan](#delivery-plan) | A-1, A-7, F4-2 |

**Diagnostics changes, author-confirmed 2026-10-29.** Contributor guidance
requires a before/after review for any change to the approved diagnostics.
Revision 4 changes no source spelling or canonical print. The author
confirmed two refinements on 2026-10-28, but the Fable review of revision 4
found that the confirmed `coral.port.connections.exceeded` wording misstated
today's behavior, and it found further changes that were not listed. These four
items replace that confirmation; the author confirmed all four on 2026-10-29,
recorded in the slice status:

| Code | Approved in revision 3 | Proposed in revision 4 |
| --- | --- | --- |
| `coral.symbol.local.anchor.invalid` | Anchor ID generic; `at`, `x` or `y` outside 0..1; interior anchor outside the outline; missing `exit` | Also an interior anchor on the outline whose `exit` is not strictly outward (inward or tangent) |
| `coral.port.connections.exceeded` | More connectors on a port than its `maxConnections` | Reported on read in edition `0.2.9` documents only, for every resolved limit. Edition `0.2.8` documents get no new diagnostic: Coral checks no limit on read today |
| `character.symbol.local-fallback` | Character output drew a fallback box for a user symbol | Its detail also lists each escape segment it could not draw |
| Interchange codes | `export.graphir.local-symbol.unsupported` only | Adds `export.graphir.port-limit.exceeded`, `import.graphir.local-symbol.id-unsupported`, `import.graphir.local-symbol.digest-mismatch` and `import.graphir.artwork.profile-unsupported` / `.rejected` / `.noncanonical`; all are outside source notation |

## Review

### Fable medium-effort design review — 2026-10-26

Verdict: approve with changes; 11 findings, resolved in revision 2. Finding 2
(outline frame) was later found incomplete and is re-resolved below.

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | P1 | Raw block not safe for line-oriented readers | Resolved; ownership corrected in revision 3 (F5-3) |
| 2 | P1 | Outline and anchor frame contradicted letterboxing | Re-resolved in revision 3 (F5-1) |
| 3 | P1 | ID scoping only in the browser path | Resolved; refined to `<symbol>`/`<use>` (F5-7) |
| 4 | P1 | Profile gate and global canvas registries | Resolved; threading widened (F5-5) |
| 5 | P2 | Bracket value shapes under-specified | Resolved: one body line per attribute |
| 6 | P2 | Parity gaps | Resolved; port label and limits now in scope (author D60-9) |
| 7 | P2 | Edition mechanics unstated | Resolved; refined (F5-2) |
| 8 | P2 | CSS isolation deferred to Slice 70 | Resolved; refined (F5-6) |
| 9 | P3 | Digest input and hand edits | Resolved |
| 10 | P3 | `local.` versus dotted node references | Resolved |
| 11 | P3 | Internal projection versus interchange | Resolved |

### Fable 5 medium-effort design review — 2026-10-28

Verdict: approve with changes. Inventory references confirmed accurate.

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| F5-1 | P1 | Bundled contours through `stencilFit028` letterbox anchors; the scene draws and requires a registered shape | Resolved: frame resolver, synthetic outline with identity viewBox, scene artwork part |
| F5-2 | P1 | `currentVersion` and the writer's hard-coded pin unaddressed | Resolved: default stays `0.2.8`, writer emits effective version, explicit header edit |
| F5-3 | P1 | Raw block owned by two readers | Resolved: header scanner owns and masks regions; tokenizer unchanged |
| F5-4 | P2 | Symbol port anchors would be dropped by U1 | Resolved: user-symbol port anchors are kept as authored pins |
| F5-5 | P2 | Snapshot threading wider than the canvas | Resolved: nine files inventoried and in delivery step 3 |
| F5-6 | P2 | CSS isolation over-claimed for `renderTo`; inherited paint | Resolved: `renderTo` shadow root; explicit paint on every primitive |
| F5-7 | P2 | Per-instance inlining cost | Resolved: `<symbol>` per definition, `<use>` per instance |
| F5-8 | P2 | `coral.symbol.local.unknown` duplicated `coral.symbol.unknown` | Resolved: existing code reused |
| F5-9 | P2 | `aspect` not representable in saved source | Resolved: `aspect` removed; ratio always preserved |
| F5-10 | P3 | Diagnostic spellings should follow catalogued patterns | Resolved: `unclosed`, `budget.exceeded`, `reference.unsupported` |
| F5-11 | P3 | Directive after a definition | Resolved: existing `header.directive.late` |
| F5-12 | P3 | Character fallback per profile | Resolved: `flowchart` fallback, `block` refusal, criteria check |
| F5-13 | P3 | No `rounded` shape exists | Resolved: `rectangle` plus `cornerRadius` |
| F5-14 | P3 | AI generation and skills omitted | Resolved: delivery step 8 |
| F5-15 | P3 | Header pin refused by `prepareHeaderForSave028` | Resolved: explicit header edit (F5-2) |

The author decided every open question and approved the before/after
notation on 2026-10-28; see the slice status.

### Fable medium-effort review of revision 4 — 2026-10-28

Verdict: approve with changes. It confirmed the code claims behind revision 4
and that A-1 to A-4, A-6, C-1, C-2, GQ-1 to GQ-5, GQ-7 and P-1 to P-5 were
rolled in consistently.

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| F4-1 | P1 | "0.2.8 diagnostics unchanged" was false: no read path checks limits today, so a notice would be new; edition scoping narrowed GQ-6 silently; the 0.2.8 export refusal had no code | Resolved: no read-time limit diagnostic for 0.2.8; scoping stated as Coral-only with GQ-6 unchanged; `export.graphir.port-limit.exceeded`; author re-confirmed 2026-10-29 |
| F4-2 | P1 | C0 vectors needed C2's serializer and preceded the proposal review | Resolved: digest vectors (C0a) independent of SVG; profile vectors (C0b) provisional until C2 reproduces them; both after G2; G3 vendors digest vectors only |
| F4-3 | P2 | Diagnostics change list incomplete | Resolved: fallback detail and every interchange code listed for re-confirmation |
| F4-4 | P2 | Status record did not reflect revision 4 | Resolved in the slice status |
| F4-5 | P2 | A-5 test enumeration and projection not carried | Resolved in C7 and the GraphIR plan |
| F4-6 | P2 | `rounded` wording misstated the code path | Resolved: same `Q` corners, sampled contour, tolerance cases |
| F4-7 | P2 | RFC 8785 implementation unpinned; two digest implementations | Resolved: pinned canonicalizer; Coral switches to core's exported digest at C7; both pass vectors |
| F4-8 | P2 | Tangent exits undefined for routing | Resolved: strictly outward exits only |
| F4-9 | P3 | Editorial: G-step count, proposal heading, C7 unsupported-profile round trip, review citation, adoption wording | Resolved |
