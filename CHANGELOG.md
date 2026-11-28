# Changelog

Notable changes to Coral are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Entries under
Unreleased are planned for the named release and are updated when the owning
slice closes.

## 0.2.17

Release `0.2.17` builds directly on `0.2.15`.

### Added

- Standalone **`coral` CLI** (`bin.coral` on `@coral-viz/render`, keeping the
  six-package release inventory unchanged) with `coral validate [file]`,
  `coral render --format svg|html|ascii [file]`, and
  `coral convert --from auto|coral|mermaid|dot|plantuml --to coral|json [file]`,
  supporting stdin (`-` or omitted), strict exit codes (`0`/`1`/`2`), zero
  partial stdout on failure, and npm bin-resolution executable smoke coverage
  for both `coral` and `coral-mcp`.
- Documentation and capability-truth updates across `docs/use/reference/` and
  `docs/embed/` covering `0.2.14` Crow's Foot ERD, C4-grade architecture, cloud
  infrastructure, `parrotfish`/`anemone`, `0.2.17` visual UML State, public
  `npx` CLI/MCP workflows, and the deterministic Mermaid-to-Coral transpiler.
- Saved-source edition **`0.2.17`** (`@coralVersion "0.2.17"`, leaving `0.2.8`,
  `0.2.9`, and `0.2.14` catalogs immutable) enabling visual and hierarchical
  `@diagram uml-state` (`uml-state@1.1.0`):
  - Visual symbols for `state`, nested `composite` containers, `initial`,
    `final`, `choice`, `fork`, `join`, and `note`, plus `[description]`,
    `[style]`, `[annotation]`, and `layout` support across `lowfi`, `hifi`, and
    `anemone` themes.
  - Edition `0.2.17` U2 conformance ruleset (`CORAL.UML.STATE.*`) and full
    multi-consumer parity across `@coral-viz/browser`, `@coral-viz/mcp-server`,
    and `@coral-viz/diagram-editor`, while keeping the browser IIFE gzip bundle
    below the 800 KiB ceiling.
- Deterministic zero-LLM **Mermaid.js-to-Coral transpiler** across
  `@coral-viz/language`, `@coral-viz/render`, `@coral-viz/mcp-server`, and
  `@coral-viz/diagram-editor`:
  - Full 30-diagram-type Mermaid detection in `detect.ts` and direct 5-stage
    transpilation (`transpileMermaidToCoral` + Stage 4B verified
    `transpileAndVerifyMermaidToCoral`) for the Top 5 Mermaid diagram types:
    Flowchart (`flowchart` / opt-in `block` / `architecture`), Sequence
    (`uml-sequence`), Class (`uml-class`), ER (`erd`), and State (`uml-state`
    defaulting to Edition `0.2.17` visual hierarchical output, with `'0.2.8'`
    opt-in for legacy flat character-only output).
  - Upgraded MCP `coral_convert` (`from: "mermaid", to: "coral"`) with
    `flowchartTarget`, `edgeStyleMode`, and `stateTargetEdition` options while
    preserving backward-compatible `structuredContent`.
  - Explicit **Convert to Editable Coral** button and Command Palette action in
    `@coral-viz/diagram-editor` with pre-commit loss review, target-switching,
    fail-closed unsupported refusal, and single atomic Undo/Redo.

### Fixed

- Added `'inheritance'` to `KNOWN_RELATIONS_0214['uml-class']` in
  `@coral-viz/language` so `[inheritance]` annotations on UML class edges align
  with the `uml-class` catalog without emitting `coral.relation.unknown`.

## 0.2.15

### Fixed

- Start Properties closed in each session, including workspaces saved by an
  earlier version. Selection, inline editing, creation, and movement keep it
  closed until explicitly opened.
- Persist pointer and keyboard placement for objects without authored
  coordinates, using their displayed local positions and existing Coral
  coordinate syntax. Preserve comments, connections, grouping, pins, undo,
  redo, saving, and reopening.
- Restore focus to the current command-palette invoker after repeated opens,
  including the Properties workflow.

## 0.2.14

Release `0.2.14` intentionally skips `0.2.13`.

### Added

- Modeled presentation renderer **`parrotfish`** in `@coral-viz/render` to
  apply modeled visual treatments (style, colors, accents, decorative elements)
  strictly without modifying layout, flow, or edge routing.
- Saved-source edition **`0.2.14`** (`@coralVersion "0.2.14"`, leaving `0.2.8`
  and `0.2.9` catalogs immutable) with full `tree-sitter-coral` grammar parity:
  - Expanded freeform `@diagram block` (`box`, `rounded`, `circle`, `oval`,
    `triangle`, `diamond`, `cylinder`, `pill`, `note`, `group`) and inline node
    `[style: ...]`.
  - Overhauled `@diagram architecture` for C4-grade system design (`person`,
    `system`, `externalSystem`, `container`, `component`, `database`, `queue`,
    `storage`, `cdn`, `function`, `loadBalancer`, `gateway`, `boundary`,
    `systemBoundary`, `containerBoundary`) plus structured `technology:` and
    `description:` metadata on nodes and edges.
  - Dedicated cloud `@diagram infrastructure` (`users`, `cdn`, `dns`, `waf`,
    `gateway`, `loadBalancer`, `compute`, `container`, `kubernetes`, `function`,
    `database`, `cache`, `storage`, `queue`, `iam`, `monitoring`, `ml`,
    `boundary`, `vpc`, `subnet`, `region`, `account`, `zone`, `cluster`, `note`)
    with `[provider: "aws" | "azure" | "gcp" | "generic"]`, Apache-2.0 built-in
    geometric glyphs, and `scripts/convert-cloud-icons.mjs` for converting
    official vendor SVGs into Coral `@symbol` definitions.
  - Revived Crow's Foot `@diagram erd` (`entity`, `weakEntity`, `table`, `view`,
    `note`, tabular `columns { ... }` with `pk`/`fk`/`uk`/`null` flags, Crow's
    Foot operators `||--o{`, `||-.-|{`, `||..o{`, and `[firstLabel: ...,
    secondLabel: ...]`), explicitly retiring legacy Chen notation with
    `coral.erd.chen.retired`.
  - Completed `approvedTypeWords` across `aiml`, `data-engineering`, `code`,
    and `sketch`; camelCase catalog relation terms with hyphen diagnostics
    (`coral.syntax.bracket.relation-hyphen`); and `-`, `#`, `~` unnamed UML
    class attributes.

### Changed

- Improved core multi-stage layout and alignment quality to `95.06 / 100`
  composite mean across all 40 `LAYOUT_CORPUS_0211` diagrams (`40/40` Tier-1
  pass, `0` hard defects). The 12-case competitor benchmark now averages
  `96.91 / 100`, with all 12 Coral cases passing without hard defects.
- Enabled orthogonal batch routing by default for edition `0.2.14` `block`,
  `architecture`, `infrastructure`, and `erd` diagrams when no explicit
  `edgeRouting` option is set.

### Fixed

- Refreshed React Flow handle measurements when a same-sized prepared scene
  changes, keeping keyboard-created connections visible and focusable.
- Fixed Crow's Foot SVG endpoint markers (`crow-foot`, `zero-or-one`,
  `zero-or-many`, `one-or-many`) so zero circles center on `y = 8` and toes
  flare outward into entity borders.
- Prevented omitted edge port stamping on edition `0.2.14` fan-out nodes so
  multi-slot orthogonal routing distributes connections cleanly.

## 0.2.12

### Added

- Public open-source repository launch for `coreyt/coral` (Apache-2.0),
  including revamped `README.md` with rendered diagram previews and quick-start
  guides, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, and GitHub
  issue and pull request templates.
- Complete npm package metadata (`homepage`, `bugs`, and `keywords`) across all
  six public packages (`@coral-viz/language`, `@coral-viz/render`,
  `@coral-viz/browser`, `@coral-viz/viz`, `@coral-viz/mcp-server`, and
  `tree-sitter-coral`).

### Changed

- Decoupled runtime, test, documentation, and audit fixtures from internal
  development directories into `packages/`, `docs/`, `e2e/`, and `scripts/`.
- Renamed internal-era verification scripts and Playwright configs to clean,
  capability-oriented names (`playwright.robustness.config.ts`,
  `scripts/fuzz-model.mjs`, `scripts/api-docs.mjs`, `scripts/check-icons.mjs`,
  `scripts/packed-package.mjs`, `scripts/braces-risk-policies.mjs`, and related
  verification helpers).
- Updated release policy (`dev/release-policy.json`) for public repository
  visibility and verified Sigstore provenance publication.

## 0.2.11

### Added

- Unified multi-stage layout, alignment, and batch orthogonal connector routing
  pipeline in `@coral-viz/render` (`BRANDES_KOEPF` default node placement,
  contour-aware multi-slot port allocation across all 32 catalog shapes,
  painted SVG ink-bounds measurement, flowchart main-spine alignment,
  intra-group & cross-rank glyph-center alignment, and coordinated
  `libavoided-js` `0.1.3` batch routing with crossing minimization, parallel
  corridor separation, and container-border clearance).
- Compact `hifi` layout typography, canonical `72×56` iconic glyph boxes,
  tighter inscribed decision diamonds, and right-side icon captions in
  `DOWN`/`UP` flows so vertical connectors attach cleanly without caption
  detours.
- Sequence diagram visual modes via additive `SequenceGroupStyle` (`'shaded'`
  default and `'bordered'`, exposed on `SvgOptions.sequenceGroupStyle`),
  full-height vertical participant group columns, uninterrupted vertical
  lifelines painted above groups/regions/fragments, tight participating-lifeline
  horizontal scoping for regions and combined fragments (`alt`/`loop`/`opt`),
  and paper backdrop halos behind message labels crossing intermediate lifelines.
- Strict automated diagram-rendering quality analyzer (`DRQ-01`–`DRQ-23`) and
  40-diagram stratified layout verification corpus across 9 notations.
- Experimental on-device editing model (coralsmol), in the editor app only
  and off until turned on in Preferences. It turns a short English request
  into a proposed edit of the open flowchart: add, connect, label, delete,
  and place, arrange or align objects. Every result opens for review and
  changes nothing before **Apply**, which is one Undo step. The model is a
  separate download of about 219 MB from a pinned Hugging Face revision,
  verified by SHA-256 and stored in this browser; requests run in the browser
  and nothing is reported. It is licensed under the LFM Open License v1.0,
  not Apache-2.0. Known issues: it uses about 1.2 GB of memory while working
  (the target is 1 GB), and it can add, drop or invent edits. See
  `docs/use/explain/on-device-editing-model.md`.
- Shared AI edit-plan pipeline in the editor, with no public package API:
  the `coral-plan/1` operation registry and strict decoder, a snapshot
  adapter over the source projection, a semantic executor and source
  compiler that preserve unrelated source bytes, detached staging with a
  computed change list and one-step Apply and Undo, and source-safe spatial
  placement with sibling anchoring and a bounded overlap repair.
- `npm run test:route-robustness` runs the seeded generated-route corpus with
  more seeds and both styles. `npm test` runs the default corpus.
- `layout.route.degraded` and `layout.route.retried` layout diagnostics
  (warnings).

### Changed

- Upgraded `libavoided-js` from `0.1.2` to `0.1.3`.
- Upgraded Transformers.js from `4.3.0` to `4.3.2`.

### Fixed

- Generated orthogonal connectors eliminate coincident parallel segments,
  colliding same-side port contacts, micro-jogs, wrong arrowhead approaches,
  container-border hugs, and container-caption overlaps across flat and nested
  grouped diagrams.
- Generated orthogonal connectors keep their lane at a free contact on every
  shape, not only rectangles. Contacts no longer follow a centre ray that
  tilted the final segment into a neighbouring node and failed the render
  with "route penetrates node". Diagonal legs left by caption detours and
  dropped engine elbows are squared when a clear elbow exists. Deliberate
  direct shortcuts and decision/gateway branch departures are unchanged.
- Text-region and caption stencils no longer balloon with long labels, and
  orthogonal generated routes on captioned icons stay crisp and legible.
  Captioned glyphs (`actor`, `brain`, `funnel`, `neural-net`) now separate
  painted glyph geometry from their caption box via `captionedStencilFrame029`,
  keeping the glyph and glyph-relative ports invariant (`scale = 1`) as
  captions grow and preventing text from drawing over dense `neural-net` mesh
  artwork.
- A generated connector the router cannot verify no longer fails the whole
  diagram on its own. Layout tries again with 1.5× spacing, then with the
  other ELK node placement; a blocked caption detour falls back to the full
  obstacle router, which can leave a captioned icon from its glyph's sides.
  The editor canvas re-runs its layout worker for the same retries, so it
  draws what the staged preview measured, and a `layout.route.retried`
  warning names the change. As a last resort a connector shares a corridor
  with its generated parallel connector and the drawing carries a
  `layout.route.degraded` warning naming it. Authored geometry still refuses,
  no connector passes through a node, and none shares an authored route's
  shaft.
- Route failure messages name the connector and its two ends, for example
  `Connector "e1" (a → b) passes through node "c"`.

## 0.2.9

### Added

- Document-local user symbols in explicitly pinned Coral source edition 0.2.9,
  with bounded SVG artwork, outlines, boundary/interior anchors, inherited
  ports, port labels and connection limits. The default source edition remains
  0.2.8; artwork does not supply notation semantics.
- **My Icons** imports individual SVGs or icon bundles into browser-local
  storage, previews them and places self-contained definitions in a document.
  Library revisions require an explicit document update. The source palette,
  Properties panel and symbol editor support undoable edits and preserve
  definition/instance port ownership.
- Frozen `coral.svg-artwork` profile 1, packaged specification/vectors and
  verified GraphIR 4 candidate export/import through the shared APIs. Portable
  symbols retain their profile, canonical artwork and digest. Raw GraphIR 4
  remains unsupported by editor opening and `coral_convert`; `coral_validate`
  supports its schema, catalog and artwork validation.
- A source-owned user-symbol example in the shared editor/website catalog.
  Flowchart character output uses an explicit labelled process-box fallback
  for local symbols, with notices.

### Changed

- Language Specification 1.3.0 reconciles default source edition 0.2.8 and the
  explicit 0.2.9 extension, normative assets, conformance and public guidance.
  Existing removed-syntax diagnostic wording remains unchanged.
- Browser and HTML diagrams use isolated shadow roots so host CSS cannot
  restyle symbols. Portable font exports retain their embedded faces.
- Adopted public GraphIR Core 0.2.4 and MonoTrue v0.2.0 integration. Release
  builds use Node 26.8.2/npm 12.0.2; packaged consumers retain Node 24.19.0 as
  their minimum runtime and TypeScript 6.0.3 compatibility.
- Built-in AI features and composer voice are deferred to 0.2.10. The new
  general deterministic Mermaid-to-editable-Coral mechanism is also deferred
  to 0.2.10, separately from AI. Existing Mermaid parsing/preview and bounded
  sequence conversion remain available. AI/ML diagram notation is retained.

### Fixed

- User-symbol canvas artwork now shares the correct SVG identifier namespace.
  Artwork admission retains the calibrated working set to avoid repeated
  parsing at supported document limits.
- Pending Properties edits retain drafts and keyboard focus; source Undo/Redo
  can supersede their own pending parse. Saved-source Shift drag constrains
  the intended axis, and newly created connections receive selection/focus.
- Generated routes reserve clearance across arranged nodes, contact painted
  BPMN gateway contours and avoid AI/ML captions. Authored routes retain their
  exact intent and explicit style restrictions.
- Keyboard focus is visible on nodes and connections; field borders meet the
  checked light/dark contrast minimum, and compact controls retain usable
  targets. Static example builds are reproducible.
- Compatible dependency patches address the reported high-severity advisories.


## 0.2.8

Status: private candidate prepared for review; not tagged or published.
Exact GraphIR Core/Tools 0.2.3 candidate archives remain distinct from registry
publication identities. Publication and deployment require separate approval.

### Added

- Coral 0.2.8 saved documents preserve authored source across supported edits,
  history, Reflow, save and recovery. Portable placement includes finite spatial
  references, routes, labels and recursive sequence layout with explicit refusal
  when required constraints cannot be satisfied.
- Character output covers architecture, flowchart, BPMN, ER, UML class and
  UML state in ASCII and capability-checked MonoTrue modes. UML state is a
  character-only edition; SVG and visual editing remain unavailable.
- Bounded U2 conformance cards report notation findings separately from graph
  integrity and rendering capability failures. These cards do not claim full
  external-standard conformance.
- Generated public API documentation describes installed package exports.
- Source-owned 0.2.8 diagram rendering uses installed catalog identities,
  explicit semantic ports, located capability diagnostics and a shared prepared
  scene across browser, MCP and editor projections.
- Both lowfi/hifi styles and light/dark themes have six-family topology
  fixtures, font/marker coverage and native/640/480 visual checks.
- All 176 installed base/variant choices have source contracts. Generic
  explicit symbol choices retain their authored type; artwork does not imply
  canonical profile semantics. Chen ownership/cardinality and BPMN scope retain
  subject-linked notices while their owner contracts remain unverified.

### Fixed

- UML class compartment sizing and classifier connector-label clearance;
  sequence text now uses the shared font rendering policy.
- Node alignment and generated forward/branch/return routing, including
  excessive BPMN bends and crowded horizontal flowchart cycles. Authored ports,
  positions and waypoints retain their authority.
- Source/presentation revision races, diagnostic transport and accessible
  connection names on settled/transient scene edges.

### Changed

- Coral package identities and internal pins are 0.2.8. Core is pinned exactly
  to the private 0.2.3 artifact set; GraphIR 3 compatibility APIs remain
  separate from the reviewed GraphIR 4 successor contract.
- Supported diagram entry points select shared scene parts, including failure
  and transient states. Direct low-level compatibility exports remain explicit
  and tested; they are not an automatic fallback for diagram rendering.
- Release workflows select the 0.2.8 package set and reviewed notes; current
  archive verification checks exported files, inventories and dependency pins.
  The private dependency bridge remains blocked from publication.
- Active candidate CI binds version, exact source SHA, package inventory and
  candidate ref independently of historical 0.2.6 release-operation evidence.

## 0.2.6

### Added

- `@coral-viz/browser`, a new public package, renders Coral source to
  accessible SVG in an ordinary web page, with no React or editor dependency.
  It ships as an ES module (`render` and `renderTo`) and as a self-contained
  script that defines one `Coral` global with `Coral.scan()` for
  `[data-coral]` elements and an opt-in `<coral-diagram>` custom element.
  Nothing renders or registers automatically. The version-pinned script is
  `https://cdn.jsdelivr.net/npm/@coral-viz/browser@0.2.6/dist/coral-browser.iife.js`.
- UML class notation (`uml-class`): structured classes, interfaces, and enums
  with ordered members and a finite relationship set, authored in Coral
  source or imported from Mermaid class diagrams. Complete UML, packages,
  templates, association classes, arbitrary stereotypes, UML export, and AI
  UML generation are not supported.
- UML sequence notation (`uml-sequence`): participants and actors;
  synchronous, asynchronous, and return messages; message-bounded
  activations; participant and message notes; and flat `loop`, `alt`, and
  `opt` fragments, authored in Coral source or imported from Mermaid sequence
  diagrams. Nested fragments, `par`, `critical`, `break`, groups, and
  participant creation or destruction are not supported.
- The editor canvas and SVG output draw notation symbols, edge styles,
  relationship-end markers and fills, endpoint roles and multiplicities, and
  eight accessible glyphs (`globe`, `api`, `cog`, `shield`, `user`, `gear`,
  `code`, and `hand`) through one shared resolver, so an exported SVG matches
  the canvas. `@coral-viz/render` exports the resolver as
  `resolveRenderScene` and the glyphs as `glyphRegistry`.
- Coral Language 1.1.0: edge `data.sourceEnd` and `data.targetEnd` carry full
  relationship ends, with role, multiplicity, navigability, and every endpoint
  marker kind and fill.
- New semantic node types `queue`, `load_balancer`, `cdn`, `storage`,
  `document`, `relationship`, `subprocess`, and `event`, so every advertised
  notation symbol is reachable from Coral source.
- The `@graph` header's `metadata.notation` is authoritative in the editor,
  and document settings mirror it.
- Coral Language 1.1.0: compact relationship ends such as
  `a (1 "owner" diamond+ nav) -> b (0..*)`, covering multiplicity, roles,
  every marker/fill combination, and navigable (`nav`) or non-navigable
  (`nonav`) navigability without inference. Each end has one spelling: parts
  are written in the order multiplicity, role, marker, navigability, and a
  bound is plain integer digits up to 9007199254740991, with equal bounds
  written once (`1`, not `1..1`). Out-of-order parts
  (`coral.edge.end.order.invalid`) and noncanonical bounds such as `1.0`,
  `1e0`, `01`, or `+1` (`coral.edge.end.invalid`) are errors that name the
  canonical spelling. Only spaces and tabs may separate parts, and an end
  with any error stores nothing. An end that the compact form fully
  expresses is an error in `data.sourceEnd` or `data.targetEnd`, and the
  error gives the compact spelling. `data` holds only ends that the compact
  form cannot express: empty ends, explicit `unspecified` navigability, and
  bounds above the safe-integer maximum.
- Diagnostics can carry related source locations. A field given twice is
  reported once, with every other spelling as a related location, and the
  editor and MCP tools show every detected error rather than only the first.
  A blocked export names the error count and points to the full diagnostics
  list.
- File open behaves the same at every entry point: header **Load**, Welcome
  **Open local file**, Ctrl+O (also **Open File** in the command palette),
  and dropping one file on the app. The editor opens Coral source (`.coral`),
  Coral documents, bare GraphIR JSON, Mermaid, DOT, and PlantUML. One format
  detector in `@coral-viz/language` (`detectFormat`) decides the format for
  the editor and every MCP tool, and never guesses silently.
- Coral source with errors opens with its exact text and the graph the
  parser recovered. Every error is listed, export stays blocked, and the
  canvas is view-only while any source, opened or typed, has errors, so a
  canvas edit never prints over unreadable text. A save of source with
  errors, or of text not yet parsed, writes a `format: "dsl"` document with
  the exact text, which reopens unchanged.
- A blocked open lists every reason in a visible notice, and current work is
  unchanged. Opening an older GraphIR document reports each migration change
  and loss, attributed to the file.
- MCP: `coral_validate` migrates GraphIR 2 before validating it, and every
  graph-reading tool accepts detected Mermaid, DOT, and PlantUML content.
  Unrecognized input reports `mcp.input.unrecognized`.

### Changed

- Coral uses GraphIR 3.0 through `@graph-ir/core` 0.2.2, and its public
  GraphIR APIs accept validated GraphIR 3. The editor migrates GraphIR 1 and
  2 documents when it opens them. Library callers migrate stored GraphIR 1 or
  2 data first with `migrateIR` and `migrateGraphIR2To3` from
  `@graph-ir/core`, as the GraphIR migration guide describes.
- Coral is an online-hosted web application. The first visit from a 0.2.5
  bookmark still shows 0.2.5 and removes only Coral's old offline data; save
  your work and reload, or open `/coral/?online=0.2.6` once.
- Chrome desktop is the supported browser for the web application. Edge,
  Safari, and Firefox desktop are experimental, as are accessibility support
  (keyboard operation and NVDA or VoiceOver screen readers) and voice input.
  Mobile browsers are not supported.
- Saved Coral documents, recovery snapshots, and GraphIR exports now
  materialize complete notation-symbol port sets for referenced implicit
  handles. The resulting GraphIR passes the standard validator and remains
  consumable outside the editor; exact symbol-owned sets are hidden again
  from Coral source after open.
- Coral Language 1.1.0: a field given by two spellings on one object is an
  error, even when both give the same value. For example, an edge attribute
  and a structured `data.properties` value with the same key previously kept
  the attribute with a warning.
- Coral Language 1.1.0: a repeated spelling on one object is an error. This
  covers a repeated line-style token, named attribute, node body property,
  constraint parameter, and duplicate JSON object key, including keys that
  differ only in escapes. Each previously kept the last value.
- Coral Language 1.1.0: the parser reports only errors. Input it previously
  dropped or replaced with a warning is now an error: an unknown, readable,
  or wrong-shaped key in `data` or the `@graph` header, such as
  `data {"label":"x"}` or `data {"style":{"lineStyle":"dotted"}}`, and a
  duplicate or empty explicit `as` id.
- Coral Language 1.1.0: a reserved key beginning `_` in a node body property,
  an edge attribute, or edge `data.properties` is an error. It was previously
  dropped with an information diagnostic. The codes are renamed
  `coral.node.reserved-key.invalid` and `coral.edge.reserved-key.invalid`.
- Coral Language 1.1.0: a `[required]` or `[preferred]` flag is accepted only
  on a `constraint id:` line. With `require` it previously overrode the
  prefix, and on `arrange` it set the strength.
- Coral Language 1.1.0: an unquoted attribute value must be a number,
  `true`, `false`, or `null`, so `[k: hello]` is an error. Write
  `[k: "hello"]`. A constraint `alignment` or `direction` keyword is written
  bare, so `alignment: "start"` is an error. Write `alignment: start`.
- Coral Language 1.1.0: edge attributes are ordered. A relation type or line
  style after a named attribute, such as `[label: "x", dashed]`, and a relation
  type after a line style, such as `[dashed, event]`, are errors
  (`coral.attribute.relation.invalid`). Each was previously accepted. The
  error gives the whole list in canonical order, such as
  `[event, dashed, label: "x"]`.
- Coral Language 1.1.0: a scalar value in edge `data.properties` is an error
  unless its key is `label` or `description`. Write it as an attribute,
  `[k: v]`.
- Printing never emits a field value that the parser's field checks reject.
  An invalid programmatic value, such as an unknown line style, a non-finite
  number, `pinned` without a printed position, or a duplicate edge id, is
  omitted or renamed and reported as print loss. An empty node type prints
  as `service` with a warning. A reference to a missing node or port is
  printed as given.
- `coral_validate` includes the diagnostic code on each Coral parse error.
- Source that was valid under Coral Language 1.0.0 may be rejected under
  1.1.0 because of these changes.

### Fixed

- A Coral edge that names a port its node does not have, or uses a port
  against its direction, is now reported in source and blocks rendering,
  export, and graph save; Save keeps the exact text as a draft. Previously
  such a diagram could be saved as a document that would not reopen, or
  silently lost the connector. An authored `ports` list is complete, and its
  `properties.direction` (`in`, `out`, or `inout`) now drives canvas handles
  and connection checks. A symbol that declares no ports (such as a group,
  pool, lane, namespace, or catalog) keeps canvas connection handles that
  carry no port id, so a connection dragged to or from it, or added in the
  authoring dialog, saves as a port-less edge that reopens. Connection
  checking rejects a port id
  the node does not have, so a third-party caller whose handle ids do not
  name ports now sees those edges as incompatible. The
  `NodeConnectionInfo` type gains an optional `ports` field, and
  `IncompatibilityReason` gains `port-not-found`. Switching notation drops
  port references the new notation does not define.
- An edge without explicit ports is no longer dropped from the canvas when its
  source has no output port or its target no input port, such as an edge from
  an architecture database.
- An AI change's `@graph` header (notation, name, and layout options) now
  applies, as a typed header does.
- The Inspector now reflects pinned and exact positions, Pin captures the
  current position, and Release clears position and pin together.
- An AI change is no longer rejected as "diagram changed" when the layout
  quality check compared it with an unlaid-out baseline. Rejected changes now
  state their real reason, and a repeated submit no longer cancels the
  request in progress.
- Fit keeps diagrams clear of the canvas toolbar, minimap, and Properties
  panel, and can zoom out to 10% so large diagrams fit.
- Opening a Mermaid, DOT, or PlantUML file notes that it was converted to
  Coral, and an unsupported `gateway` node suggests `load_balancer`.
- Saved documents, recovery snapshots, and GraphIR exports carry an edge's
  line style only as `style.lineStyle`. They previously also wrote a flat
  edge `lineStyle`, which GraphIR rejects, so a diagram with a dashed or
  dotted edge could not be reopened or recovered. Opening a file that still
  has the flat field, including 0.2.5 files, moves it into `style.lineStyle`
  and reports the move as a migration notice.
- The editor's layout Web Worker works. The bundled ELK library took over
  the worker's message handling and failed every layout, so layout always
  fell back to the main thread and graphs over 100 nodes could not be laid
  out.

### Removed

- The installable offline application, its service worker and web app
  manifest, and the offline ZIP download with its checksum file are retired.
  Coral no longer offers installation or an offline application shell.
- Coral Language 1.1.0: edge `data.style.sourceArrow` and
  `data.style.targetArrow` are no longer accepted or printed. Write the marker
  in `data.sourceEnd` or `data.targetEnd`.
- Coral Language 1.1.0: `=` in edge attributes and constraint parameters,
  accepted for Language 0.2 compatibility, is no longer accepted. Use `:`.
  The Coral repair rewrites it.
- Coral Language 1.1.0: edge `data.description` is no longer accepted. Write
  `[description: "…"]`.
- Coral Language 1.1.0: `layoutOptions.algorithmOptions` in the `@graph`
  header is an error rather than a warning.
