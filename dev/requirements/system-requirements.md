# Coral Tier 2: System Requirements and Verification Acceptance Criteria

Tier 2 defines **what the Coral system must do** to satisfy Tier 1
[User Needs](user-needs.md), paired with deterministic, machine-verifiable
Verification Acceptance Criteria (`VerAC`).

**Core rules:**

1. Every `REQ` traces to at least one `UN`. Engineering/CI/release governance
   belongs in Tier 3 [engineering-constraints.md](engineering-constraints.md).
2. `REQ` statements specify observable system contracts and invariants, never
   internal file paths, hook layouts, or build-tool prescriptions (those belong
   in [ARCHITECTURE.md](../ARCHITECTURE.md) and slice designs).
3. Declarative tables in `dev/requirements/specs/` operate directly as
   **Specifications-as-Acceptance-Criteria** referenced by `VerAC` entries.
4. Release-gating tags:
   - **Primary (Release-Gating):** Must pass on the release candidate unless
     explicitly scoped to a future release (`Target` / `Post-0.2.10`).
   - **Catch-Up (Non-Blocking):** Tracked for dedicated accessibility catch-up
     releases (`REQ-C3`); does not hold up regular feature releases.

## Domain A: Source Language, Identity and Persistence

### REQ-A1: Saved Source Authority and Editioned Language Contract

- **Traces to:** `UN-02`, `UN-05`, `UN-08`, `UN-09` | **Gate:** Primary
- **Decomposed Spec-as-AC:**
  [budgets-and-ceilings.md](specs/budgets-and-ceilings.md)
- **Requirement:** Coral saved markup is the sole authored source of truth,
  governed by normative Language Specification 1.3.0 whose saved-source
  editions (`0.2.8`, `0.2.9`), explicit graph-interchange grammar, GraphIR
  schemas, and npm package versions evolve independently.
- **Verification ACs:**
  - **VerAC-A1.1:** Root saved-source reader requires a valid explicit header,
    retains exact UTF-16 ranges, rejects illegal Unicode separators outside
    space and tab consistently across runtime and Tree-sitter parsers, and
    satisfies parse regression ceilings in
    [budgets-and-ceilings.md](specs/budgets-and-ceilings.md).
  - **VerAC-A1.2:** Saved-source reader and explicit graph-interchange reader
    (`/parser`) reject each other's incompatible headers rather than silently
    misparsing.
  - **VerAC-A1.3:** Document `schemaVersion` (`1.0.0`), GraphIR graph-only
    (`3.0.0`), portable successor (`4.0.0`), language spec version, source
    edition, and package version remain independent across package bumps.

### REQ-A2: Deterministic Identity, Source-Preserving Edits and Fixpoint Round-Trip

- **Traces to:** `UN-02`, `UN-03`, `UN-09` | **Gate:** Primary
- **Decomposed Spec-as-AC:**
  [budgets-and-ceilings.md](specs/budgets-and-ceilings.md)
- **Requirement:** Node/edge IDs, labels (distinguishing empty from absent),
  typed scalar properties, nesting, relation types, line styles, and authored
  geometry survive parse/print round-trips deterministically; source-owned
  edits change only the targeted text span.
- **Verification ACs:**
  - **VerAC-A2.1 (Fixpoint & Identity):** Across the round-trip corpus,
    `print(parse(print(g))) === print(g)`, arbitrary valid IDs survive without
    collision, duplicate explicit IDs fail with an error, empty vs. absent
    labels stay distinct, and print timing satisfies
    [budgets-and-ceilings.md](specs/budgets-and-ceilings.md).
  - **VerAC-A2.2 (Source Preservation):** Every source-owned edit preserves
    unrelated comments, blank lines, quotes, explicit defaults, and indentation
    byte-for-byte.
  - **VerAC-A2.3 (Catalog Relation Spelling):** Every edge style declared by a
    supported notation catalog (including hyphenated relations such as
    `data-flow`, `tool-use`, `stream-flow` after HITL review per `ENG-06`) has
    a valid parseable spelling and canonical printed form; unknown bracket
    relations emit a located diagnostic rather than silently drawing an
    unstyled edge.

### REQ-A3: Located Diagnostics, Draft Survival and Local Recovery

- **Traces to:** `UN-02`, `UN-07`, `UN-09` | **Gate:** Primary
- **Requirement:** Every parse, semantic, layout, routing, or capability
  failure produces a structured diagnostic with severity, stable code, source
  range, subject identity, and plain-language message; invalid or unsupported
  drafts remain saveable and locally recoverable.
- **Verification ACs:**
  - **VerAC-A3.1:** Diagnostics across language, render, editor, and MCP are
    ordered by source position, preserve related locations, never allow
    warnings to fail a parse, and name the failing subject explicitly (such as
    connector ID and endpoints on routing failures).
  - **VerAC-A3.2:** On a saved-header parse failure, the editor withholds
    partial-graph mutation, preserves exact text, permits saving the draft, and
    restores unsaved text plus accepted geometry after reload via an explicit
    recovery prompt.

## Domain B: Visual Legibility, Layout and Routing Reliability

### REQ-B1: Independent Symbol and Caption Geometry

- **Traces to:** `UN-04`, `UN-05`, `UN-07` | **Gate:** Primary (0.2.10)
- **Decomposed Specs-as-AC:**
  [independent-symbol-caption.md](specs/independent-symbol-caption.md),
  [budgets-and-ceilings.md](specs/budgets-and-ceilings.md)
- **Requirement:** For outside-captioned glyph stencils (`0.2.10`: `actor`,
  `brain`, `funnel`, `neural-net`; `Post-0.2.10`: `dashboard`, `gear`, `wave`
  per [diagram-rendering-quality.md](specs/diagram-rendering-quality.md)),
  painted glyph dimensions and glyph-relative port geometry remain independent
  of caption length; open-interior region-inset stencils size to a stable
  fixed-point wrap width without quadratic ballooning.
- **Verification ACs:**
  - **VerAC-B1.1:** Changing caption text across empty, 5, 26, 67, and 100
    characters (plus multiline and long unbroken tokens) keeps painted glyph
    width, height, and relative port positions invariant within the same sizing
    mode and authored dimensions.
  - **VerAC-B1.2:** Node area grows at most linearly with label length across
    all catalog stencils; sizing wrap width equals painting wrap width so line
    breaks and measured ink bounds agree exactly.
  - **VerAC-B1.3:** Caption ink clears its own glyph and surrounding diagram
    content; generated routes attach to non-caption-facing glyph contours (per
    `DRQ-16`) and treat the caption box as occupied obstacle space.
  - **VerAC-B1.4:** All `0.2.10` criteria in
    [independent-symbol-caption.md](specs/independent-symbol-caption.md) and
    direction-specific AI/ML pipeline viewport bounds in
    [budgets-and-ceilings.md](specs/budgets-and-ceilings.md) pass (`RIGHT <=
    1,600 x 600 px`, `DOWN <= 700 x 1,600 px`).

### REQ-B2: Deterministic Text Measurement and Cross-Surface Scene Parity

- **Traces to:** `UN-04`, `UN-07`, `UN-08`, `UN-09` | **Gate:** Primary
- **Requirement:** One DOM-free, deterministic font-metric and scene-resolution
  pipeline drives editor canvas, standalone browser rendering, SVG/HTML/raster
  export, and MCP rendering.
- **Verification ACs:**
  - **VerAC-B2.1:** Within the bundled Latin font repertoire, identical inputs
    produce equivalent glyph bounds, caption bounds, anchor contacts, route
    polylines, marker positions, and text line breaks across editor canvas,
    `@coral-viz/browser`, `@coral-viz/render` SVG/HTML, and `coral_render` MCP
    output.
  - **VerAC-B2.2:** Bundled deterministic font metrics produce zero drift
    between headless Node and Chromium renders for all glyphs in the bundled
    font repertoire; out-of-repertoire Unicode scalars (such as CJK, Cyrillic,
    or emoji) use deterministic fallback width estimation without crashing or
    producing NaN/unbounded layout coordinates.

### REQ-B3: Notation-Aware Layout and Generated-Route Resilience

- **Traces to:** `UN-04`, `UN-05`, `UN-09` | **Gate:** Primary (0.2.10)
- **Decomposed Spec-as-AC:**
  [budgets-and-ceilings.md](specs/budgets-and-ceilings.md)
- **Requirement:** Automatic layout and routing respect diagram notation
  profiles (generic layered/orthogonal + deterministic sequence layout), keep
  contour contacts aligned with arriving lanes, and apply bounded recovery
  fallbacks so generated-route flaws do not needlessly fail valid diagrams.
- **Verification ACs:**
  - **VerAC-B3.1 (Lane-Preserving Contacts):** For all non-rectangular catalog
    shapes, final segments of orthogonal generated routes stay horizontal or
    vertical (except bounded segments wholly inside their own endpoint node's
    box, interior-anchor ray escapes, or explicitly warned degraded routes),
    and layout route validation agrees 100% with final scene validation.
  - **VerAC-B3.2 (Zero Hard-Failure Corpus):** Across the seeded multi-notation
    robustness corpus (`flowchart`, `architecture`, `aiml`, `data-engineering`;
    grouped and ungrouped; all 4 directions; no conflicting authored geometry)
    in [budgets-and-ceilings.md](specs/budgets-and-ceilings.md), layout and
    routing achieve zero hard render failures.
  - **VerAC-B3.3 (Bounded Degraded Warning):** When bounded repair/reroute
    retries cannot clear a generated route (while never penetrating a node
    body), Coral renders the diagram with a `layout.route.degraded` warning
    naming the exact connector ID and endpoints located to source position.

### REQ-B4: Authored Geometry Precedence and Spatial-Constraint Honesty

- **Traces to:** `UN-03`, `UN-04`, `UN-07` | **Gate:** Primary
- **Requirement:** Authored coordinates (`@ (x, y)`), pins (`pinned`), ports,
  routes/waypoints (`via` / `route`), explicit dimensions, and required
  constraints take precedence over automatic layout; unsatisfiable authored
  constraints, undersized hard dimensions that cannot fit measured text ink, or
  authored route collisions fail explicitly with located diagnostics.
- **Verification ACs:**
  - **VerAC-B4.1:** Opening or revalidating a document never silently replaces
    accepted geometry with a fresh layout; explicit Reflow moves only unpinned
    nodes and clears only automatic/unpinned routing per contract.
  - **VerAC-B4.2:** Derived bends and painted bounds are never written back as
    authored source; incompatible authored geometry or undersized explicit
    dimensions (`render.capability.hard-size-text-conflict`) produce a located
    diagnostic rather than silent clipping or rewrite.

### REQ-B5: Diagram Rendering Aesthetics, Alignment and Connector Hygiene

- **Traces to:** `UN-04`, `UN-05`, `UN-07` | **Gate:** Primary (`0.2.10` core
  invariants; full aesthetic suite tracked by per-clause target tags in spec)
- **Decomposed Spec-as-AC:**
  [diagram-rendering-quality.md](specs/diagram-rendering-quality.md)
- **Requirement:** Automatic layout, container placement, symbol rendering,
  connector routing, and edge/endpoint label placement satisfy the tagged
  Hard Invariants and prioritized Bounded Objectives defined in
  [diagram-rendering-quality.md](specs/diagram-rendering-quality.md):
  nodes, outside-captioned symbols, custom icons, and nested containers align
  cleanly without overlap; label text never obscures dense internal symbol
  artwork; orthogonal connectors remain free of accidental diagonals,
  sawtooth/micro-jog bends, U-turns, distinct-port collinear overlaps, and
  chin-bars; parallel, converging, self-loop, and cyclic connectors maintain
  clean spacing and square contour stubs; and mid-edge plus endpoint labels sit
  cleanly on unobstructed direction-aware spans.
- **Verification ACs:**
  - **VerAC-B5.1 (Node, Symbol & Container Layout):** Non-overlap clearances,
    1-to-1 and column/row visual center alignment, glyph-center alignment for
    outside-captioned and asymmetric symbols, parent/child bisection on forks
    and joins (`<= 2 px` on unconstrained DAGs/pipelines), symmetric dual
    entries, nested container/swimlane padding, mixed-size rank rules,
    disconnected packing, and deterministic ordering satisfy `DRQ-01`–`DRQ-09`
    for their declared release targets.
  - **VerAC-B5.2 (Uniform Symbol Sizing, Stencil Classification & Text Separation):**
    All 32 catalog stencils follow their normative class in
    [diagram-rendering-quality.md](specs/diagram-rendering-quality.md); active
    outside-captioned symbols render at one uniform canonical glyph scale
    independent of caption length with zero text-over-artwork overlap, and
    open-interior text stays within its padded safe region (`DRQ-10`–`DRQ-11`).
  - **VerAC-B5.3 (Strict Orthogonality, Anti-Sawtooth & Crossing Hygiene):**
    For their declared release targets and explicit exemptions (endpoint-box
    interiors, interior-anchor ray escapes, shared-port trunks, and
    `layout.route.degraded` warnings), orthogonal generated routes contain zero
    accidental diagonal segments (`min(abs(dx), abs(dy)) <= 0.1 px`), zero
    U-turns, zero prohibited sawtooth/micro-jogs, clamped elbow radii, and zero
    distinct-port collinear overlaps (`DRQ-12`–`DRQ-14`).
  - **VerAC-B5.4 (Clearance, Exits, Ports & Complex Topologies):** For their
    declared release targets, generated connectors maintain `>= 8 px` clearance
    from unrelated nodes and captions, obey direction-general No Chin-Bar exit
    hygiene, distribute multi-port sides symmetrically (with `>= 4 px`
    compressed pitch floor) and `>= min(10 px, 0.4 * gap)` square lead-in
    stubs, separate distinct parallel/converging shafts (`>= 8 px`), and handle
    multi-edges, self-loops, back-edges, and container boundaries per
    `DRQ-15`–`DRQ-19`.
  - **VerAC-B5.5 (Direction-Aware Edge & Endpoint Labels):** For their declared
    release targets, automatic mid-edge labels place deterministically on
    unobstructed straight spans (with authored-short-span fallback) using
    consistent orientation-based side offsets, endpoint `role`/`multiplicity`
    labels sit cleanly on opposite sides of endpoint stubs (`Post-0.2.10`), and
    placed labels satisfy collision clearance (`DRQ-20`–`DRQ-22`).

## Domain C: Interactive Editing, Parity and Accessibility

### REQ-C1: Bidirectional Source-Canvas-Inspector Parity and Atomic History

- **Traces to:** `UN-02`, `UN-03`, `UN-07` | **Gate:** Primary
- **Requirement:** Source pane, canvas/sequence pane, inspector, and
  diagnostics share one revision-owned document state; each completed user
  action commits atomically as one Undo/Redo transaction, and stale async
  worker results never overwrite newer edits.
- **Verification ACs:**
  - **VerAC-C1.1:** Every supported canvas or inspector mutation compiles to
    valid canonical source, updates all panes coherently, and reverses cleanly
    in one Undo step (restoring exact text and accepted geometry).
  - **VerAC-C1.2:** Late layout, icon-import, or AI worker replies carrying an
    older revision token are discarded without mutating state or unlocking a
    newer pending operation.

### REQ-C2: Precision Canvas and Connection Gestures

- **Traces to:** `UN-03`, `UN-05` | **Gate:** Primary
- **Decomposed Spec-as-AC:**
  [budgets-and-ceilings.md](specs/budgets-and-ceilings.md)
- **Requirement:** Canvas gestures support axis-constrained dragging (`Shift`),
  graph-coordinate waypoint manipulation, live port-compatibility feedback,
  and refusal of notation-disallowed connections within controlled interaction
  budgets.
- **Verification ACs:**
  - **VerAC-C2.1:** Shift-constrained node drag constrains movement along the
    dominant axis and handles mid-drag Shift press/release cleanly; each
    completed drag or waypoint gesture creates one history entry.
  - **VerAC-C2.2:** Dragging off a handle reports live handle compatibility,
    creates an edge on valid drop, and refuses disallowed connections.
  - **VerAC-C2.3:** Layout and interactive p95 latencies satisfy the controlled
    budgets in [budgets-and-ceilings.md](specs/budgets-and-ceilings.md).

### REQ-C3: Keyboard Operability, Focus Management and Accessible Semantics

- **Traces to:** `UN-12` | **Gate:** **Catch-Up (Non-Blocking)**
- **Release Gating Note:** Satisfies Persona P4 (`UN-12`). Tracked and tested
  continuously, with formal sign-off gated in dedicated accessibility catch-up
  releases; does not block regular feature releases.
- **Requirement:** All editor authoring, navigation, dialog, export, and opt-in
  AI workflows are operable by keyboard; nodes and edges expose accessible
  names and states, dialogs restore focus on close, and status changes announce
  via live regions without relying on color alone.
- **Verification ACs:**
  - **VerAC-C3.1:** Nodes expose roles, labels, and selection states; edges
    expose endpoints, labels, and validity; review aids never rely solely on
    color.
  - **VerAC-C3.2:** Keyboard-only browser journeys cover node/edge creation,
    inspector editing, reflow, undo/redo, dialog focus restoration, export, and
    opt-in AI review/apply/discard without pointer events or focus traps.

## Domain D: Notations, Custom Symbols and Migration

### REQ-D1: Bounded Visual Notations and Specialized Sequence Semantics

- **Traces to:** `UN-01`, `UN-05` | **Gate:** Primary
- **Decomposed Spec-as-AC:**
  [supported-diagram-types.md](specs/supported-diagram-types.md)
- **Requirement:** Coral supports the diagram types, validators, and explicit
  exceptions tabulated in
  [supported-diagram-types.md](specs/supported-diagram-types.md), including
  shared U1 symbol/port interpretation, advisory U2 conformance findings, and
  deterministic specialized layout for UML Sequence.
- **Verification ACs:**
  - **VerAC-D1.1:** Every enabled diagram type in
    [supported-diagram-types.md](specs/supported-diagram-types.md) parses,
    validates against its declared validator/exceptions, and renders its shared
    catalog examples consistently across editor, browser, and SVG export.
  - **VerAC-D1.2:** UML Sequence preserves ordered messages, lifelines, scoped
    activations, notes, and recursive fragments; targets unable to preserve a
    construct emit an explicit capability finding and withhold lossy output.
  - **VerAC-D1.3:** Explicit authored symbol choices survive diagram-type
    changes with a finding rather than silent substitution; disabled types
    remain saveable as source while refusing visual rendering.

### REQ-D2: Self-Contained Document-Local User Symbols

- **Traces to:** `UN-05`, `UN-07` | **Gate:** Primary
- **Requirement:** Authors can import sanitized SVG icons into browser storage
  and embed self-contained symbol definitions in saved edition `0.2.9` Coral
  documents so they render identically on any host with zero external fetches,
  isolated from local library mutations and host page styles.
- **Verification ACs:**
  - **VerAC-D2.1 (Sanitization & Isolation):** Imported SVGs pass bounded
    artwork-profile validation and sanitization (rejecting scripts, external
    refs, and oversized inputs) before storage or embedding; rendered custom
    artwork is style-isolated from host CSS and keeps `tint stroke` legible in
    both light and dark themes.
  - **VerAC-D2.2 (Portability & Library Independence):** Saved documents with
    document-local symbols open, render, and export identically in a fresh
    profile with empty local storage and zero network requests; editing or
    deleting an icon in browser storage never silently mutates an existing
    saved document without an explicit undoable update action.
  - **VerAC-D2.3 (Edition, Port Cap & GraphIR Fidelity):** Edition `0.2.9`
    custom symbol declarations and port `maxConnections` limits are enforced
    and isolated cleanly from edition `0.2.8` diagnostics; GraphIR 4 (`4.0.0`)
    round-trips preserve custom symbol definitions while GraphIR 3 (`3.0.0`)
    exports refuse them explicitly rather than silently dropping them.

### REQ-D3: Non-Destructive Foreign-Format Migration and Loss Reporting

- **Traces to:** `UN-06`, `UN-09` | **Gate:** Primary (Shipped Baseline for
  library converters & Chrome preview; P5 interactive `.coral` adoption, batch
  CLI, similarity scoring, and side-by-side report scoped as P5 Target per
  spec)
- **Decomposed Spec-as-AC:**
  [migration-conversion.md](specs/migration-conversion.md)
- **Requirement:** Foreign-format importers (Mermaid, Graphviz/DOT, PlantUML)
  operate non-destructively through one shared language implementation, report
  every dropped/unsupported construct explicitly, refuse unsupported diagram
  kinds by name, and support P5 single-diagram Chrome migration plus CLI batch
  migration with deterministic similarity scoring, safe external renderer
  execution, and side-by-side reporting.
- **Verification ACs:**
  - **VerAC-D3.1 (Shipped Baseline):** All importers convert their declared
    subsets from [migration-conversion.md](specs/migration-conversion.md),
    Chrome opens `.mmd`/`.dot`/`.gv`/`.puml` files for non-destructive preview
    with structured conversion-loss diagnostics (and converts pasted headerless
    Mermaid on tab switch), unsupported diagram kinds are refused by name, and
    saved-header Coral text is never silently overwritten.
  - **VerAC-D3.2 (P5 Target — Adoption, Batch, Similarity & Report):** Chrome
    adopts opened Mermaid/DOT/PlantUML files non-destructively into editable
    saved `.coral` drafts; CLI batch migration converts directories without
    modifying source files using collision-free output naming, computes
    deterministic structural (`0–100%`) and optional safe-sandboxed visual
    similarity scores, and emits a complete side-by-side report per
    [migration-conversion.md](specs/migration-conversion.md).

## Domain E: Export, Character Output and GraphIR Interchange

### REQ-E1: Faithful SVG, Raster and Standalone HTML Export

- **Traces to:** `UN-07`, `UN-04` | **Gate:** Primary
- **Decomposed Spec-as-AC:**
  [budgets-and-ceilings.md](specs/budgets-and-ceilings.md)
- **Requirement:** Editor and headless exporters generate accessible SVG, PNG,
  JPEG, and self-contained standalone HTML from the shared render scene with
  embedded typography/styles, deterministic raster scaling, opaque background
  compositing for alpha-free and themed exports, and zero external runtime
  dependencies.
- **Verification ACs:**
  - **VerAC-E1.1:** Semantic exports refuse invalid graphs explicitly, retain
    semantic IDs and accessible descriptions in SVG, embed no external script
    or stylesheet fetches in standalone HTML, composite opaque theme
    backgrounds on `JPEG` and themed raster outputs at deterministic pixel
    scale (`1x`/`2x`), match canvas scene geometry, and satisfy SVG
    serialization ceilings in
    [budgets-and-ceilings.md](specs/budgets-and-ceilings.md).

### REQ-E2: Character Output (Portable ASCII and Controlled MonoTrue)

- **Traces to:** `UN-10` | **Gate:** Primary
- **Decomposed Spec-as-AC:**
  [supported-diagram-types.md](specs/supported-diagram-types.md)
- **Requirement:** A parallel character composer renders admitted source for
  the character-supported families in
  [supported-diagram-types.md](specs/supported-diagram-types.md) into printable
  ASCII + LF or controlled MonoTrue v0.2.0 Diagram Set 1 when exact host font
  capability matches, refusing unsupported spatial/family constructs explicitly.
- **Verification ACs:**
  - **VerAC-E2.1:** Portable output contains only printable ASCII + LF;
    controlled MonoTrue emits only generated Diagram Set 1 scalars on exact
    face/hash/role match and otherwise falls back **as a whole picture** to
    ASCII.
  - **VerAC-E2.2:** Unsupported authored geometry, ports, routes, constraints,
    or out-of-subset constructs refuse before composition with typed findings;
    document-local symbols follow the family-specific fallback/refusal rule in
    [supported-diagram-types.md](specs/supported-diagram-types.md).

### REQ-E3: Portable GraphIR Interchange and Coordinated Schema Evolution

- **Traces to:** `UN-09`, `UN-04`, `UN-06`, `UN-07` | **Gate:** Primary
- **Decomposed Specs-as-AC:**
  [independent-symbol-caption.md](specs/independent-symbol-caption.md),
  [migration-conversion.md](specs/migration-conversion.md)
- **Requirement:** `@graph-ir/core` is the canonical authored GraphIR contract;
  legacy GraphIR 1/2 inputs cross explicit named migration adapters without
  relabeling; when new authored visual or layout semantics (including
  independent symbol and caption sizing) benefit from explicit IR portability,
  Coral coordinates the schema change cleanly across `graph-ir`,
  `graph-ir-tools`, and Coral packages.
- **Verification ACs:**
  - **VerAC-E3.1:** Legacy GraphIR `1 -> 2 -> 3` migrations run explicitly with
    zero silent casts or relabeling; supported GraphIR round-trips preserve
    authored symbol, caption, label placement, and geometry semantics.
  - **VerAC-E3.2 (Coordinated GraphIR Decision for `REQ-B1`):** Automatic
    independent symbol/caption sizing (`G-1`/`G-2`) derives deterministically
    from existing GraphIR 3/4 fields in `0.2.10` with zero schema break; when
    explicit authored glyph-size or caption-width controls (`G-3`/`G-4`) enter
    scope, Coral adopts the coordinated additive RFC recorded in
    [independent-symbol-caption.md](specs/independent-symbol-caption.md) across
    `graph-ir`, `graph-ir-tools`, and Coral with migration and round-trip tests.

## Domain F: Embedding, Browser, MCP and Syntax Tooling

### REQ-F1: Standalone Zero-Framework Browser Renderer

- **Traces to:** `UN-08` | **Gate:** Primary
- **Decomposed Spec-as-AC:**
  [budgets-and-ceilings.md](specs/budgets-and-ceilings.md)
- **Requirement:** `@coral-viz/browser` renders Coral source to accessible SVG
  via ESM, self-contained IIFE, DOM scan, and custom element with zero React or
  editor dependency, safe handling of invalid or foreign inputs, and zero
  global pollution in ESM.
- **Verification ACs:**
  - **VerAC-F1.1:** Packed bundle contains zero React/editor dependencies,
    registers zero globals on ESM import, and satisfies the IIFE/ESM gzip size
    (`<= 770 KiB`), zero runtime fetch, and controlled-Chrome 25-node latency
    budgets in [budgets-and-ceilings.md](specs/budgets-and-ceilings.md).
  - **VerAC-F1.2:** Invalid Coral source in a DOM scan or custom element
    surfaces an isolated diagnostic without breaking sibling diagrams; foreign
    inputs (Mermaid, GraphIR JSON) are refused explicitly by naming the import
    workflow, and hostile XML-illegal characters/markup are rejected safely.

### REQ-F2: Composable Public Libraries and React Integration

- **Traces to:** `UN-08`, `UN-09` | **Gate:** Primary
- **Requirement:** All six public packages install from packed archives on
  Node.js >= 24.19.0, expose typed documented entry points, preserve additive
  `0.2.x` API compatibility against the prior published baseline, and support
  React 18.3 and React 19 in `@coral-viz/viz`.
- **Verification ACs:**
  - **VerAC-F2.1:** Packed consumer smoke tests pass on Linux x64, Windows x64,
    and macOS arm64 under Node 24.19.0 and React 18.3/19.
  - **VerAC-F2.2:** Automated public API diff reports zero breaking removals or
    signature regressions against the published compatibility baseline.

### REQ-F3: General-Purpose MCP Server and Tree-Sitter Grammar

- **Traces to:** `UN-09`, `UN-08`, `UN-02` | **Gate:** Primary
- **Requirement:** `@coral-viz/mcp-server` provides general diagram validation,
  conformance, conversion, heuristic generation, layout, rendering, and
  explanation over stdio using shared language/render engines;
  `tree-sitter-coral` provides native syntax parsing aligned with saved-source
  editions without acting as a second semantic authority.
- **Verification ACs:**
  - **VerAC-F3.1:** Built `coral-mcp` starts over stdio, reports exact release
    version, uses shared validation/layout/render engines on nested graphs,
    labels generation as heuristic, and exposes zero repo-indexing or
    workspace-management tools.
  - **VerAC-F3.2:** `tree-sitter-coral` compiles natively on supported
    platforms and matches runtime saved-source grammar over the parity corpus.

## Domain G: Opt-In On-Device AI Editing (0.2.10 `coralsmol`)

### REQ-G1: Explicit Opt-In, Verified Local Weights and Zero-Exfiltration Privacy

- **Traces to:** `UN-11` | **Gate:** Primary (0.2.10 opt-in)
- **Decomposed Spec-as-AC:**
  [budgets-and-ceilings.md](specs/budgets-and-ceilings.md)
- **Requirement:** On-device AI editing exists exclusively inside the private
  editor app, starts off by default, checks hardware/quota capability and shows
  full pre-download disclosures (size, host, privacy, scope, memory, and
  offline-bundled LFM Open License v1.0 commercial-use terms), verifies
  manifest byte counts and whole-file SHA-256 hashes in OPFS before reporting
  ready, recovers cleanly from storage eviction or manifest rotation, and
  transmits or persists zero diagram content, prompts, or telemetry.
- **Verification ACs:**
  - **VerAC-G1.1:** When off (or on Cancel), zero model/runtime chunks load,
    zero off-origin requests occur, and the AI tab stays hidden; failing WebGPU
    or OPFS/quota probes refuse download with a clear reason; pre-download
    disclosure names the LFM Open License v1.0 commercial-use limitation with
    the full license text bundled offline one activation away.
  - **VerAC-G1.2:** Download fetches each manifest file once (no referrer, no
    credentials), verifies whole-file SHA-256 and frozen contract hash before
    writing the OPFS verified marker, deletes partial files on error, enforces
    single-tab Web Lock ownership, detects OPFS eviction or manifest rotation
    on load and cleanly re-offers download, and makes zero host requests once
    ready.
  - **VerAC-G1.3:** Network interception across enable -> ask -> review ->
    apply -> remove records zero bytes of prompts, snapshots, replies,
    documents, or telemetry sent anywhere; prompts and replies remain
    session-only (zero persistence in `localStorage`, OPFS, or crash recovery);
    weights never enter npm tarballs; `LICENSE` and `LICENSE.md` accompany the
    model and UI disclosures.

### REQ-G2: Detached Staged Review, Single-Transaction Apply and Resource Ceilings

- **Traces to:** `UN-11`, `UN-12`, `UN-03` | **Gate:** Primary (0.2.10 opt-in;
  keyboard sub-clauses follow `REQ-C3` catch-up gating)
- **Decomposed Spec-as-AC:**
  [budgets-and-ceilings.md](specs/budgets-and-ceilings.md)
- **Requirement:** The on-device model operates only on valid open flowcharts
  within manifest input bounds (refusing ineligible docs, unmapped node types,
  and oversized prompts before inference), never mutates live state directly,
  rejects malformed replies without repair, stages previews on a detached
  document, commits Apply as one Undo transaction, and honors its
  memory/worker lifecycle ceiling.
- **Verification ACs:**
  - **VerAC-G2.1:** Prompts exceeding the manifest input cap and open
    flowcharts containing unmapped node types (such as `REQ-D2` `local.*` user
    symbols) are refused before inference; malformed, truncated, or
    unexpected-token replies are rejected whole; live source, canvas, and
    history remain unchanged until explicit whole-plan Apply; Discard, Stop,
    timeout, GPU/worker loss, or stale-revision edits cleanly abort with zero
    mutation.
  - **VerAC-G2.2:** One request runs at a time (mutation locked during
    inference, unlocked while awaiting the single allowed clarification with
    revision recheck on answer); Apply rechecks revision and creates one Undo
    entry; review displays request text, change count, and text-marked
    removals.
  - **VerAC-G2.3:** Incremental memory satisfies the ceiling and documented
    0.2.10 worker-termination exception (`CS-10`) in
    [budgets-and-ceilings.md](specs/budgets-and-ceilings.md).

## Domain H: Product Boundary and Capability Truth

### REQ-H1: General-Purpose Boundary and Evidence-Backed Capability Truth

- **Traces to:** `UN-01`, `UN-08`, `UN-09` | **Gate:** Primary
- **Requirement:** Coral remains a general-purpose diagramming tool with no
  repository indexing, IDE ownership, or server-side document lifecycle; public
  docs (Use, Embed, Contribute), in-app Help/About, and READMEs accurately
  distinguish supported, experimental, planned, and unsupported capabilities
  and contain zero retired offline/installable claims.
- **Verification ACs:**
  - **VerAC-H1.1:** Automated documentation link, portable Markdown
    conformance, executable-example, and capability-truth checks pass with zero
    broken links or anchors, zero retired offline or downloadable-archive
    claims, and accurate platform/feature support tables.
