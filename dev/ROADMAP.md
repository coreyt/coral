# Coral Roadmap

## Shipped in 0.2.3

0.2.2 was an unpublished engineering baseline. The following capabilities were
first supported and published in 0.2.3:

- manual positions and edge waypoints in the text DSL, through
  `@ (x, y)`, `pinned` and `via (x, y)` clauses;
- live port-compatibility colours during connection gestures — and connection
  gestures at all, which did not previously exist: dragging off a handle never
  created an edge, because no `onConnect` handler was wired anywhere;
- PlantUML import as a structured, diagnostic line importer with an explicitly
  claimed subset, and conversion-loss reporting across every importer;
- SVG, PNG, JPEG and HTML export from one serializer shared by the editor and
  the MCP server, with deterministic text measurement;
- spatial feedback, one shared retry budget, and output-format control in the
  optional LLM generation;
- accessible semantics for the graph, keyboard operability, focus management,
  and the shortcuts the command palette advertised but never mounted;
- the reference shell composed from its extracted panes;
- browser-level Playwright coverage for format switching, save and export,
  recovery, keyboard focus, and the lazy speech worker;
- `@coral-viz/viz` and `@coral-viz/mcp-server` at 80% statements, lines and functions
  and 75% branches, enforced in CI;
- recorded and enforced large-graph performance budgets;
- a decision on Tree-sitter as the runtime parser, and a design for opt-in
  collaboration and hosting.

## 0.2.3 post-release completion

The published artifact is immutable. These tasks close implementation or
evidence gaps in work already attributed to 0.2.3; changed packages ship in
0.2.4 or later. See the archived
0.2.3 completion plan.

- Completed: the end-to-end font path behind issue #33 now covers the document,
  canvas and layout, recovery, shared editor/MCP exports, portable assets,
  real-browser behavior, and packed React 18.3/19 consumers.
- Completed: canvas precision interactions
  now have complete node/waypoint gestures, exact history and persistence,
  36 passing Chromium cases, and first-failure artifact retention.
- Completed issues #60 and #61 beyond R-025's narrower spatial-context and
  shared-budget contract: spatial outcomes, distinct retry strategies,
  backoff, and opt-in telemetry.
- Completed the #58 AI/data/sketch library and #62 Mermaid-generation evidence
  closure with current render/editor browser boundaries and the exact release
  gate; all 0.2.3 post-release completion slices are accepted.

## 0.2.4 released

Published as `v0.2.4` on 2026-09-11. All planned slices and required release
closure gates are complete.

- **Coral DSL fidelity.** Give every valid JSON-safe GraphIR field currently
  reported by `printWithDiagnostics` a lossless Coral spelling, except derived
  source information, internal reserved properties, and invalid runtime values;
  migrate the remaining silent or hand-written in-repo Coral emitters to that
  shared diagnostic printer.
- **The 0.2.x compatibility gate.** Permit additive public API changes only;
  compare against the published 0.2.3 declarations and exports, execute packed
  consumers on React 18.3 and 19, and retain `@graph-ir/core@0.2.0`.
- **The shell's state.** Completed in Slice 40: the live coordinator and
  presentational shell are extracted, `App.tsx` is a 12-line composition root,
  and revision-owned transitions protect text, layout, recovery, LLM, and
  undo/redo state. The editor keeps one private
  font-aware adapter while cross-package ELK consolidation and budgets remain
  in Slice 60.
- **Editor coverage.** Slice 35 gates `@coral-viz/diagram-editor` at 80%
  statements, lines, and functions and 75% branches after removing unreachable
  code. Slice 40 completed the same floor per new critical state owner.
- **Pointer-free creation.** Slice 50 implementation, design review, code
  review, and automated gates are complete for keyboard node/edge creation,
  structural history, focus, and live feedback. NVDA/Windows and
  VoiceOver/Safari compatibility are experimental, untested targets in 0.2.4;
  their optional manual records do not block verification or release.
- **Browser interaction and ELK budgets.** Slice 60 consolidates one
  compatibility-focused shared ELK engine, enforces cold/warm layout budgets at
  100, 500, and 2000 nodes, and adds one serial 500-node drag/zoom gate on the
  attributable controlled release machine. GitHub-hosted shared runners do not
  enforce hard timing budgets. Broader
  interaction timing remains functional evidence rather than a release budget.
- **Notation-aware reflow (#51).** Slice 60 adds conservative opt-in layout
  profiles with sparse explicit document overrides taking precedence. Only the
  reference editor's initial/reflow path moves ELK to a worker; public viz,
  Node, and MCP calls retain their direct execution contracts.
- **Structured text editing (#63 and #64).** Add range-based parse-error
  decorations first, then optional deterministic entity highlighting on the
  same editor foundation.

## Planned for 0.2.5

0.2.5 productizes Coral as an installable static desktop web application while
preserving all five public package contracts. The release ladder delivers the
Node 26/npm 12 foundation and governance prerequisites; credential persistence
remediation; PWA/offline/update behavior with preferred, verified Whisper
caching or an honest online-required fallback; canonical Pages/ZIP/integrity;
Welcome, examples, Help/About; audience-separated documentation; package
embedding and compatibility evidence; archive cleanup; and exact external
release closure. Node 24 remains the public minimum-runtime consumer control.

The UX collaboration allocates Slice 45 to design/assessment, Slice 46 to the
visual system, Slice 47 to text-first editing, AI transactions, robust undo and
layout reconciliation, and Slice 48 to internal semantic-lint assessment/future
handoff. Semantic lint does not ship or notify users in 0.2.5. Syntax findings
offer notification → full error → explicit Fix, with no autocorrect/autocomplete;
Slice 47 owns manual HITL retry/Fix UX validation. End-user documentation is now
Slice 60 (formerly 50); library
documentation is Slice 65 (formerly 60). Slice 49's LLM accuracy/corpus/repair
work is complete at its bounded scope. Slice 50 owns spatial-intent architecture
reconciliation and the versioned handoff, not the entire proposed spatial
implementation. Slice 51 completed the packaged Coral Language Specification
1.0.0 authority, total GraphIR 2.0 disposition, and conformance boundary. Slice
52 owns the named implementation deltas and minimum coordinated GraphIR/Coral
spatial-intent vertical slice; Slices 53–59 remain unallocated.
See the release plan and
integration task list.

## Assigned to 0.2.7

These allocations are earlier planning records, not automatic 0.2.8 release
gates. The 0.2.8 working plan controls that release's
proposed scope.

- **Port-reference shorthand.** Directed by the user on 2026-09-27: naming a
  port through `data {"sourcePort":"interact","targetPort":"in"}` is too
  clumsy. Coral source gains a concise endpoint spelling (candidates
  `user:interact -> api:in` or `user.interact -> api.in`), chosen at a
  before/after HITL notation review. See 027-R4 in the
  0.2.7 requirements and Slice 5 of the
  0.2.7 plan.

- **Map Mermaid ER cardinality into relationship ends.** Deferred from Slice
  52 (D52-3) by the user on 2026-09-23. The importer
  (`packages/language/src/formats/mermaid.ts` `parseER`) still stores
  `sourceCardinality`/`targetCardinality` strings in edge properties, so
  imported ER diagrams render no cardinality, and about 270 LLM corpus files
  under `packages/diagram-editor/test/llm/fixtures/corpus` inherit that
  spelling. Scope, measured in the Slice 52 analysis:
  - map `||`, `|o`/`o|`, `}o`/`o{`, `}|`/`|{` to the fixed GraphIR markers
    (`one`, `zero-or-one`, `zero-or-many`, `one-or-many`), marker only
    (recommended), or record a decision to add multiplicity;
  - teach the syntax-defect injector's edge pattern compact ends, so the
    corpus keeps its 570 defects;
  - regenerate `coral/`, `defects/syntax/`, and `manifest.json` in the same
    commit as the importer change (corpus-integrity compares them);
  - rewrite the 9 hand-authored semantic defects and 5 explanations, and the
    `semantic-defect-taxonomy.ts` cardinality text;
  - record offline `accuracy-scoring` and `verify-corpus-repairs` baselines
    before and after (no live LLM run is needed);
  - note in `CHANGELOG.md` that Mermaid ER JSON output gains
    `sourceEnd`/`targetEnd` instead of the properties, and decide whether the
    `..` non-identifying lines and word aliases join the supported subset.

- **Restrict runtime spacing to space and tab.** This earlier 0.2.7 assignment
  is implemented on the 0.2.8 branch. Header, body, and graph-only interchange
  readers locate illegal Unicode token separators at exact UTF-16 ranges;
  runtime/native Tree-sitter parity and editor/MCP propagation are recorded in
  the D5 closure checkpoint.
  The `runtime-unicode-spacing` implementation delta now records the resolved
  branch state.

- Explicit context-menu **Show in diagram** and **Show in source** navigation.
  Slice 45 records behavior stubs only for 0.2.5. Text editing must remain quiet:
  no automatic diagram highlighting or navigation from typing/caret movement.
  See D05.

- **Spatial-intent remainder.** Connector/edge-referencing constraints,
  label-placement execution/gestures, general reference expansion, and raw
  solver controls require coordinated GraphIR/DSL, routing, validation,
  migration, and round-trip evidence. See the
  [Visual Rendering Specification](designs/visual-rendering-specification.md).

- **Remove the 0.2.6 sunset worker.** Delete
  `packages/diagram-editor/public/sw.js`, forbid `sw.js` again in
  `scripts/online-delivery.mjs`, drop `delivery.sunsetWorker` from the release
  policy, and restore the e2e absence assertion.

- **Re-evaluate the gitleaks gate.** In 0.2.6 the scanner tests skip when no
  binary is present, detection uses a fixture-only configuration rather than
  `.gitleaks.toml`, and the pinned version is not tied to the CI install.
  Decide whether to fail in CI, scan the fixture with the repository
  configuration, and verify the installed version.

- **Enforce declared notation validation rules.** Architecture
  `mustConnectTo`/`notDirectlyConnectedTo` and rule-level `variant` are
  declared but not enforced by `validateNotation`; Slice 50 verified only
  their catalog references.

- **Unify symbol and variant resolution.** Render `validateNotation`
  `effective()`, viz `extractNodeInfo`, and editor `effectiveSymbolId` /
  `buildNodeConnectionInfo` hand-copy the legacy symbol/variant rules, and
  render `renderSymbolId` resolves legacy symbol-ID types differently. In
  particular, the editor canvas projects a legacy symbol-ID `type`, while the
  SVG render scene currently leaves that legacy node without a symbol.

## Outside 0.2.8 — future allocation

- **Animated GIF export.** Pursue in a future release, not as a 0.2.8 gate.
  Export authored connector motion—including its resolved `animated`
  direction, line treatment, and end decoration—as an animated GIF after
  the portable animation model and shared scene behavior are established.
  Define frame timing/looping, deterministic capture, output size and quality,
  static fallback, and capability/accessibility notices before assigning a
  release. The 0.2.8 static-export policy is recorded in the
  connector operator/style review.
- **UML sequence lost/found rendering.** In 0.2.8, the recursive GraphIR
  successor reserves a portable message representation with one known and
  one explicitly missing endpoint; this does not make lost/found renderable.
  A later release must lay out and render the missing-end black dot in the
  shared sequence scene, then verify canvas, SVG, browser, accessibility,
  and export behavior without inventing a participant or silently treating
  the message as ordinary. Decide the corresponding Coral source and import
  authoring contract as part of that work. See the
  0.2.8 plan and
  sequence appearance review.
- **Explicit port override/subtraction.** A future language and resolver
  design may let an author deliberately replace or remove a catalog port,
  with unmistakable source syntax and diagnostics. In 0.2.8, authored ports
  are additive and same-ID collisions are errors; ordinary port declarations
  must never silently override a bundled symbol's ports. This is distinct
  from the 0.2.8 conformance-exception mechanism.
- **Opt-in generated relation captions.** Reserve this as a future
  language/render extension, not 0.2.8 grammar. A setting (candidate name
  `common_notation`) would be off by default. When enabled, a selected
  notation profile could display generated captions such as `«calls»` and
  `«reads»` (U+00AB/U+00BB) on rendered connectors only; the guillemets are
  not Coral source syntax. An explicitly authored connector label must
  override the generated caption. Before implementation, decide whether the
  caption comes from an authored relation or profile-specific inference,
  define its provenance and diagnostics, and test default-off behavior and
  override precedence. Do not silently invent graph relationship meaning.
- **AI/LLM language reliability and preservation-first editing.** The
  LLM–language reliability scope
  is the primary proposal. The
  diagram-editing scope is its
  companion for bounded, source-preserving modification of existing diagrams;
  the [research synthesis](designs/llm-coral-language-reliability.md) provides
  supporting evidence. All need further review, including interaction and
  transaction granularity. Neither a new AI edit protocol nor review/accept/
  discard UI is a 0.2.8 gate; the 0.2.8 transaction authority must still handle
  the existing AI path correctly.
- **Full Mermaid 12 sequence compatibility.** The 0.2.8 recursive sequence
  import is a frozen, named subset with explicit unsupported-form diagnostics.
  Complete Mermaid 12 construct, configuration, safe-action, and cross-surface
  parity need a separate importer matrix and release allocation.
- **Mermaid ER cardinality mapping.** Move ER end tokens into GraphIR markers,
  regenerate the affected corpus, and review JSON compatibility. The earlier
  detailed allocation remains above; it is not a 0.2.8 gate.
- **Show in diagram / Show in source.** Add explicit source/canvas navigation
  commands later; do not make typing trigger navigation. The earlier behavior
  notes remain above.
- **Gitleaks hardening.** Decide scanner availability, repository rules, and
  pinned CI version in separate security work. Existing release-security gates
  still apply; the earlier audit notes remain above.

## Undecided Release

- **UML enum literal bodies.** Define bounded Coral syntax and portable mapping
  for enum members such as `OPEN` and `CLOSED` , with source preservation and
  located diagnostics. Verify parsing, rendering, save/reopen and export before
  restoring those members to the Welcome example; the author explicitly deferred
  them beyond 0.2.8.

- **Broader spatial references.** Design portable reference kinds beyond the
  approved node/group, named-edge/label and route-anchor boundary, including any
  cross-document or visual-part references. Define identity, geometry, cycle
  handling and source syntax before release allocation.
- **Raw solver controls in saved source.** Review whether any raw engine/solver
  setting deserves a portable authored contract rather than transient API
  options. Define validation, deterministic behavior and cross-engine meaning
  before adding such syntax.
- **Flowchart canonical rule expansion.** Audit remaining ISO 5807 obligations
  and any proposed branch-label policy beyond the two bounded 0.2.8 decision
  rules. Distinguish provable graph conditions from logical branch exclusivity
  and report unavailable evidence honestly.
- **BPMN canonical rule expansion.** Review event refinements, gateways and
  broader canonical obligations beyond the eight bounded 0.2.8 rules. Keep
  semantic process, participant, lane and Message Flow scope explicit until a
  typed ownership model and tests exist.
- **UML class canonical rule expansion.** Review classifier and relationship
  obligations beyond the bounded open-triangle inheritance rule, including
  ownership, multiplicity, realization and generalization-set checks. Approve
  provenance, severity and evidence before enforcement.
- **UML sequence canonical rule expansion.** Review additional kind/operator
  compatibility and broader UML obligations beyond the two bounded 0.2.8 rules.
  Do not infer unrepresented lifetime or interaction semantics from
  character/SVG appearance.
- **Block profile rules.** Decide any profile-specific constraints beyond shared
  0.2.8 symbol/port/integrity checks. Do not infer SysML semantics from the
  profile name.
- **Architecture profile rules.** Define a bounded architectural notation
  contract before adding profile-specific rules. Generic service/boundary
  artwork does not establish C4 or UML component semantics.
- **AI/ML profile rules.** Decide which diagram-specific rules can be supported
  by portable model evidence. Rendering a training or model glyph does not prove
  executable ML semantics.
- **Code profile rules.** Define a bounded code-diagram rule contract before
  enforcement. Do not turn the notation into source-code analysis or a language
  type checker.
- **Data-engineering profile rules.** Approve any domain rules beyond shared
  checks and explicitly registered relations. Do not infer batch/stream or
  data-platform behavior from line styling.
- **Sketch profile rules.** Decide whether a future sketch profile promises
  formal constraints beyond shared checks. Do not silently apply full flowchart
  standards to informal artwork.
- **Bind bundled-symbol ports to anchors by layout.** Directed by the user on
  2026-09-28; rewritten 2026-10-31 by author decision. Bundled symbol ports
  are fixed to one side: the flowchart decision's `yes` output is always
  SOUTH, and nothing rebinds a port to another anchor by layout, so a
  left-to-right workflow forces an awkward route or reflow. 0.2.9 Slice 60
  delivered separate anchors and ports for document-local user symbols
  ([REQ-D2](requirements/system-requirements.md#req-d2-self-contained-document-local-user-symbols),
  legacy `R-065`); bundled symbols
  are unchanged. Binding a bundled port to the anchor that suits the layout
  changes symbol definitions, handle rendering, connection checks and layout
  port constraints. It needs design and user review, and any Coral source
  change needs the before/after HITL notation review. History: 027-R5 in the
  0.2.7 requirements.
- **Sunset-worker removal.** Remove the retained retirement worker only after
  hosted-client upgrade and rollback evidence proves supported old clients reach
  the successor online application. Keep the byte-exact worker and
  delivery-policy exception through 0.2.8 until that audit passes.

## Assigned to 0.2.8 website completion

- **Slice 80: website rework.** Deliver the Diagram Library launch using the
  retained structure and visual identity drafts on the `website` branch.
  Implement and verify real examples, navigation, editor handoff, responsive
  and accessible presentation, and release delivery. See the
  Slice 80 plan. Prototype preservation is not
  implementation or deployment; later Studio/Handbook phases remain separate.

## Released in 0.2.9

Published on 2026-11-01 as immutable
[`v0.2.9`](https://github.com/coreyt/coral/releases/tag/v0.2.9), from
`56c6c0b5`. All six npm packages, Pages and exact-source final CI are verified;
Slice 70 records the execution.
The development plan completed:

| Slice | Status | Outcome |
| --- | --- | --- |
| 0–9: prework | Slices 0–7 reviewed; Slice 8 reserved; Slice 9 complete | Assess environment/infra, libraries, cruft, draft product/architecture changes, verification, stale documentation and release friction; score proposals and obtain HITL decisions. |
| 10: approved prework implementation | Complete (2026-10-18) | Approved baseline, identity/security, compute and current acceptance corrections implemented and reviewed; controlled performance passed. |
| 12: incorporate MonoTrue updates | Complete (2026-10-18) | Adopt and verify selected MonoTrue updates in the existing character-rendering integration. |
| 20: topology and layout | Implementation complete | Readable node placement, contour contacts and connector routing, protected by shared and consumer checks. |
| 30: language reconciliation and evolution | Complete (2026-10-18) | Establish Specification 1.2.0 and join normative artifacts, conformance, consumers, packages and reference routes; resolve the older version and authority mismatch. |
| 40: shared example catalog | Complete (2026-10-19) | One versioned editor/website catalog with supported source, stable identities, previews and editor handoff. |
| 50: aligned public documentation | Complete (2026-10-19) | Public guides, API/package references and capability/example claims agree with the supported release and shared catalog. |
| 60: custom icons, ports and anchors | Complete; published (2026-11-01) | Portable reusable user symbols with SVG artwork, boundary and interior anchors, closed outlines, port labels and limits, and GraphIR 4 interchange through an updated `@graph-ir/core`. |
| 70: release hardening | Complete; final CI and publication verified (2026-11-01) | Integrated parsing, rendering, editing, export, website and consumer acceptance, including Slice 60; reconcile and fix omissions. |

## Planned for 0.2.10

AI integration and renderer robustness are in scope. The AI
design and
implementation plan define a compact diagram
snapshot, versioned bounded instructions, deterministic source/GraphIR
construction, staged review and atomic commit. The model receives the original
human query. The active plan records implementation progress.

Before product work, the hypotheses and experiment protocol test actual model
behavior, native effort sensitivity and operating limits. Offline experimental
infrastructure exists, verified with scripted responses. No provider
configuration is qualified, and no paid qualification campaign is authorized.

- **Renderer robustness (approved 2026-11-15).** Phases 1–3 are implemented.
  Fix the caption-stencil growth, generated-route rejections, unclear route
  errors and unwritable hyphenated relations found while drawing the coralsmol
  diagram. See the
  findings,
  the plan and its
  status.
- **Independent symbol and caption sizing (assigned 2026-11-22).** Let long
  captions wrap within their own area while the symbol keeps its size.
  Establish whether shared Coral geometry can meet the requirement. If
  portability requires a GraphIR change, plan the coordinated change.
  See the renderer plan.

The first executable profile is proposed as flowchart, with explicit capability
coverage for generation, bounded editing, explanations and spatial operations.
Retained G-34/G-41 AI work is input for review, not an approved integration.
The historical language reliability proposal
and review exploration inform this design;
their historical version labels do not control the current allocation.

The coralsmol on-device model ships in 0.2.10 as an opt-in experimental
feature for power users, never enabled by default, under the LFM Open License
v1.0 and with no model-quality gate (owner decisions, 2026-11-15). Its
integration plan is the
product work allocated here. Its known
shortcomings are tracked in the coralsmol backlog.

### Retained proposals outside 0.2.10

The current scope supersedes the previous allocations below. Preserve
artifacts and worktrees; no destination version is assigned.

- MonoTrue v0.2.1 adoption: retained
  historical proposal, not an AI prerequisite.
- Main protection: retained
  unapplied proposal; neither review nor activation is allocated here.
- Deterministic Mermaid-to-editable Coral conversion (G-42): retain
  `llm/s70-mermaid-coral` unmerged and existing parsing/preview behavior.
- Full structured visual sequence editing (U3): retain the
  earlier scope decision;
  the AI operation contract does not implement visual mutation parity.
- Composer voice input: deferred outside this typed-query AI integration.

## Planned for 0.2.11

- **Revisit AI-edit canvas keeping (owner, 2026-11-16).** 0.2.10 ships H3 on
  every AI edit: before an edit is reviewed, Coral writes the canvas place of
  each node a fresh layout would move, so neither Apply nor reopening moves
  it. Check that it performs as expected in use (diff size, edit latency,
  inserted nodes among kept ones, and groups) and decide whether H3 on
  placements only is better. A kept position is written like an authored
  one, so after Apply a later placement treats it as fixed and Reflow keeps
  it; decide whether kept positions need to stay distinguishable. The rules
  relaxed for it are recorded under CS-33 in the coralsmol backlog.

## Planned for 0.2.12

The document-local custom-symbol assignment moved to
0.2.9 Slice 60 by author direction on
2026-10-21. The earlier built-in-shape proposal is an input to that work;
custom SVG artwork is confirmed; storage and attachment contracts are proposed there.
No remaining custom-symbol implementation is assigned here by this move.

## Planned for 0.2.26

- **Plain-Text and ASCII Diagram Renderer.** Replace the bounded `0.2.8`
  character preview with a clean plain-text/ASCII renderer supporting two
  first-class profiles: regulated plain-text documents (US Letter `72x55` and
  A4 `72x60` with mandatory `\f` page breaks, non-splitting boxes, and paired
  off-page continuation markers in strict 7-bit ASCII) and compact source-code
  comments (default `utf8-box`, comment-prefix width budgeting, and closing
  delimiter safety), retaining `monotrue-v1` as an opt-in third charset.
  Phase 1 targets `architecture`, `infrastructure`, `flowchart`, `erd`,
  `uml-sequence`, `uml-state` (`0.2.17`), and `uml-class` across all five
  surfaces (`@coral-viz/render`, CLI, MCP, `@coral-viz/browser`, and
  `@coral-viz/diagram-editor`); Phase 2 covers the remaining six notations.
  See [text-renderer-spec.md](designs/text-renderer-spec.md).

## Exploration before 0.3.0

- Compare immediate AI application with in-place review/accept/discard after
  0.2.5 and before 0.3.0. Preserve the required task cases and latency/usability
  measures in the AI editing exploration.
  This exploration is outside the 0.2.5 release gates.
## Planned after 0.2.5

Honest remainder. None of it is claimed as done anywhere else.

- **PDF export.** Postponed by decision rather than deferred by accident. SVG,
  PNG, JPEG and HTML are the 0.2.3 formats. Printing is a stylesheet over the
  HTML export.
- **Tree-sitter as the runtime parser.** Evaluated and declined for this
  release; see `dev/designs/runtime-parser.md`. The grammar tracks the node
  declaration syntax only and cannot parse the full language.
- **Optional `@graph` metadata.** `.coral` files support but do not require
  the `@graph` header. When it is absent, the notation and graph metadata come
  from document settings, then defaults.
- **Collaboration and hosting.** Designed, not built; see
  `dev/designs/collaboration-hosting.md`.
- **TypeScript 7 and Node 26 type definitions.** The 0.2.5 release uses Node
  26.8.2 with npm 12.0.2 and TypeScript 6.0.3 while retaining Node 24 types and
  the Node 24.19.0 public consumer floor. Compiler/type-major migration remains
  outside 0.2.5.

Codebase indexing, source navigation, repository workspace ownership,
codebase-specific MCP tools, and IDE extensions are intentionally excluded.
