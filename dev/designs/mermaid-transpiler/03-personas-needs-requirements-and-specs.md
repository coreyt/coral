# Personas, User Needs, Requirements, and Acceptance Specifications: Mermaid.js-to-Coral Transpiler

> **Revision:** FIX-2 (updated after Adversarial Review Pass 2).
> **Companion Documents:**
> - [01-mermaid-coral-taxonomy-and-nomenclature.md](./01-mermaid-coral-taxonomy-and-nomenclature.md)
> - [02-transpiler-architecture-design.md](./02-transpiler-architecture-design.md)
> - [04-adversarial-review-and-fix-log.md](./04-adversarial-review-and-fix-log.md)
>
> **Project Grounding:** Personas reuse and operationalize the verified adopter
> segments defined in Coral's main market research
> ([dev/designs/website/01-market-and-adopters.md](file:///home/coreyt/projects/coral/dev/designs/website/01-market-and-adopters.md)
> — `E1`, `E2`, `I2`, `I1`) and directly address Launch Gate **G5**
> ([dev/designs/website/02-reach-and-messaging.md](file:///home/coreyt/projects/coral/dev/designs/website/02-reach-and-messaging.md)).
> Requirements are numbered `TR-01`–`TR-12` so they do not collide with the main
> release registry (`R-001`–`R-064` in
> [dev/requirements.md](file:///home/coreyt/projects/coral/dev/requirements.md)).

---

## 1. Personas (Grounded in Coral's Main Project Adopter Segments)

### P1 — Maya, Staff Platform Engineer *(Coral Segment `E1`: Mermaid Outgrower with Own Renderer — Primary Beachhead)*
- **Role & Context:** Staff engineer / tech lead maintaining architecture RFCs
  and runbooks in Git, published on an internal Docusaurus/MkDocs portal.
  Currently authors flowcharts, sequence diagrams, and ERDs in Mermaid.js, then
  manually redraws the 5–10 critical diagrams (>20 nodes) in draw.io when
  Mermaid's automatic layout becomes unreadable.
- **Trigger Event:** Opens Coral playground for the first time with her ugliest
  28-node Mermaid flowchart or checkout sequence diagram on her clipboard.
- **Goals:** Paste existing Mermaid.js text and get clean, idiomatic, visually
  renderable `@diagram` Coral source in under 30 seconds so she can immediately
  drag/pin problem boxes and commit the `.coral` source + SVG in a PR.
- **Frustrations & Dealbreakers:** Refuses to retype existing Mermaid by hand;
  will leave immediately if pasting a Mermaid flowchart says "preview only",
  produces a blank error canvas on `==>` thick arrows, or silently drops
  database cylinders or subgraph edges without warning; will not trust a tool
  that corrupts her source or requires an LLM API key.

### P2 — Devon, Docs-as-Code Maintainer *(Coral Segment `E2`: Docs Maintainer Who Embeds — Secondary)*
- **Role & Context:** Technical writer / DevRel engineer maintaining a public
  product docs repository containing 60+ Markdown files with embedded ````
  ```mermaid ```` blocks (flowcharts, sequence flows, class models, and ER
  schemas).
- **Trigger Event:** Migrating a documentation section from Mermaid to Coral for
  consistent visual polish and deterministic SVG builds.
- **Goals:** Run a repeatable, scriptable CLI/Node conversion across a directory
  of `.mmd`/Markdown files, inspect a concise structured loss report for every
  diagram that needs manual follow-up, and get clean Git diffs with
  deterministic formatting.
- **Frustrations & Dealbreakers:** Non-deterministic output that churns Git
  diffs on re-runs; silent loss of comments, styling, or column constraints;
  tools that fail-fast on line 1 instead of reporting all conversion issues in
  one pass.

### P3 — Priya, AI Agent & Harness Builder *(Coral Segment `I2`: Agent & Harness Builder — Parallel Track)*
- **Role & Context:** Developer building coding-agent workflows and
  documentation-generation harnesses that call Coral's MCP server
  (`@coral-viz/mcp-server`). Her LLMs emit Mermaid.js reliably from training
  priors, and she wants to upgrade those outputs into strictly validated,
  deterministically rendered Coral diagrams.
- **Trigger Event:** Calls `coral_convert(from: "mermaid", to: "coral", strict:
  true)` inside an automated pipeline.
- **Goals:** Guaranteed-valid, self-verified Coral output (never unparseable
  text); machine-readable `structuredContent` with stable diagnostic codes,
  exact UTF-16 ranges, and backward-compatible
  `candidateVersion`/`nodeCount`/`edgeCount`; strict mode that refuses lossy
  conversions deterministically so her harness can retry or switch target
  notation.
- **Frustrations & Dealbreakers:** Unverified text emitted by hand-rolled string
  concatenation; ambiguous prose errors; hidden LLM calls adding latency, cost,
  or non-determinism.

### P4 — Henrik, Diagram-Tooling Enthusiast & Grammar Auditor *(Coral Segment `I1`: Innovator / First Critique Audience)*
- **Role & Context:** Compiler/tooling developer from Hacker News / Lobsters who
  evaluates new diagram languages by feeding them adversarial edge cases:
  hyphenated IDs, reserved keywords as node names, 3-digit `#f9f` hex colors,
  nested subgraphs with cross-boundary edges, non-LIFO sequence activations,
  `classDiagram` reverse inheritance arrows, ER `PK, FK` columns, Unicode/HTML
  entities, and unsupported diagram types like `gantt` or `radar-beta`.
- **Trigger Event:** Reads Coral's spec and tries to break the Mermaid converter
  in the live playground or CLI.
- **Goals:** Verify that Coral's claims are 100% honest—especially around what
  converts losslessly, what degrades with explicit diagnostics, and what refuses
  cleanly (including `uml-state`'s character-only visual boundary and
  `visual-safe` vs `portable` edge styles).
- **Frustrations & Dealbreakers:** Overclaimed "full Mermaid support" that
  silently swallows constructs; crashes/hangs on malformed or deeply nested
  inputs; emitted Coral that fails Coral's own parser or display seam.

---

## 2. User Needs

| ID | Persona(s) | User Need Statement |
| --- | --- | --- |
| **UN-01** | P1, P2, P3 | Convert existing Mermaid.js diagrams across the Top-5 engineering types (`flowchart`/`graph`, `sequenceDiagram`, `classDiagram`, `erDiagram`, `stateDiagram-v2`) into editable, idiomatic Coral saved source without manual retyping. |
| **UN-02** | P1, P3, P4 | Guarantee that conversion is 100% deterministic, local, offline-capable, and zero-LLM—never requiring credentials, network calls, or probabilistic guesses. |
| **UN-03** | P1, P2, P3, P4 | Guarantee that every emitted Coral document passes Coral's own parser, successor projection, and display-seam checks (zero broken output or surprise blank canvases). |
| **UN-04** | P1, P2, P4 | Preserve structural semantics—including flowchart subgraphs & dot-qualified edges, sequence activations & nested fragments, class namespaces/compartments & relationship polarity, and ER columns & Crow's Foot cardinality—rather than flattening them into generic boxes. |
| **UN-05** | P1, P2 | Allow Mermaid flowcharts that model system/block architecture (containing database cylinders, rounded blocks, or cloud components) to target Coral's `block` or `architecture` notation instead of silently losing shape semantics in ISO `flowchart`. |
| **UN-06** | P1, P2, P3, P4 | Surface every dropped, degraded, or unsupported Mermaid construct transparently with exact source locations and stable machine-readable codes—never silently discarding user intent. |
| **UN-07** | P2, P3 | Support both a **best-effort** mode (produce valid Coral + complete loss report) and a **strict** mode (refuse any lossy conversion with full diagnostics) across API, MCP, and CLI. |
| **UN-08** | P1 | In the interactive editor, convert Mermaid to editable Coral via an explicit, loss-aware action that is reversible in a single Undo step and never destroys original Mermaid text on refusal. |
| **UN-09** | P1, P4 | Report capability boundaries honestly—including refusing the 25 out-of-scope Mermaid.js diagram types clearly and disclosing `uml-state`'s character-only visual limit and `0.2.14` display limits truthfully. |
| **UN-10** | P2, P3, P4 | Handle hostile, malformed, deeply nested, or large Mermaid inputs safely and quickly (no ReDoS, no prototype pollution, no XSS/XML injection, sub-50ms typical latency). |

---

## 3. Requirements (`TR-01` – `TR-12`)

### TR-01: Format Detection, Top-5 Admission, and Out-of-Scope Refusal
The transpiler and Coral's shared format detector
(`packages/language/src/detect.ts`) shall preprocess YAML frontmatter (`---`),
single- and multi-line `%%{init:...}%%` directives, comments (`%%`), and
accessibility directives (`accTitle`/`accDescr`) while preserving original
UTF-16 source positions; recognize all 30 open-source Mermaid.js diagram headers
(including bare `graph`); admit the Top 5 types (`flowchart`/`graph`,
`sequenceDiagram`, `classDiagram`/`classDiagram-v2`, `erDiagram`,
`stateDiagram`/`stateDiagram-v2`); and fail closed with
`mermaid.diagram.unsupported` for all 25 other Mermaid.js types and
`mermaid.diagram.unrecognized` for unknown headers.
- *Traces to:* UN-01, UN-06, UN-09

### TR-02: Flowchart Transpilation (`flowchart` / `graph` → `@diagram flowchart` | `block` | `architecture`)
The transpiler shall convert Mermaid `flowchart`/`graph` diagrams to Coral
`0.2.14` saved source, supporting orientation (emitting explicit `layout
[direction: DOWN]` when targeting `block` with `TD`/`TB`/omitted direction), all
classic bracket shapes and v11.3+ `@{ shape: ... }` shapes across `flowchart`,
`block`, and `architecture` targets, arrow types (`-->`, `---`, `-.->`, `-.-`,
`<-->`, `<-.->`, `==>`, `===`, `<==>`, `--o`, `-.-o`, `o--o`, `o-.-o`, `--x`,
`x--x`, `~~~`, variable shaft lengths 1–6), v11.3+ edge IDs (`A e1@--> B` +
`e1@{ animate | animation }`), edge chains (`A --> B --> C`), `&`
fan-in/fan-out, recursive subgraphs with **all** grouped edge endpoints
dot-qualified at root scope, and CSS-normalized
`classDef`/`class`/`:::`/`style`/`linkStyle` handling. Under default
`edgeStyleMode: 'visual-safe'`, edge weight/color/animation shall degrade
cleanly with classified warnings so `visualRenderable === true`; under
`edgeStyleMode: 'portable'`, portable Coral edge styles shall emit with honest
`visualRenderable === false`.
- *Traces to:* UN-01, UN-03, UN-04, UN-05, UN-06

### TR-03: Sequence Diagram Transpilation (`sequenceDiagram` → `@diagram uml-sequence`)
The transpiler shall convert Mermaid `sequenceDiagram` to Coral `0.2.14`
`@diagram uml-sequence`, allocating participants first into the shared sequence
identity set and generating collision-free `msg_N`/`box_N` IDs; supporting
`participant`/`actor` declarations, aliases, multi-word implicit participants,
`box` → `participants ... [label: "..."]`, root-level `create` (pre-declaring
aliased/`actor` targets) and receiver-checked `destroy`, message arrows (`->>`,
`-->>`, `-)`, `--)`, `->`, `-->`, `-x`, `--x`, `<<->>`, `<<-->>`, `-|>`, `--|>`,
`-|)`, `--|)`), recursive fragments (`alt`/`else`, `opt`, `loop`, `par`/`and`,
`critical`/`option`, `break`) with empty-operand handling, `rect` → `region`,
`Note over`/`left of`/`right of`, `wrap:`/`nowrap:` handling, and
container-scoped sibling-item lowering of `activate`/`deactivate` and `+`/`-`
into `activation P { ... }` blocks (with explicit warning/drop for non-nestable,
cross-container, or destroy-wrapping activations).
- *Traces to:* UN-01, UN-04, UN-06

### TR-04: Class Diagram Transpilation (`classDiagram` → `@diagram uml-class`)
The transpiler shall convert Mermaid `classDiagram`/`classDiagram-v2` to Coral
`0.2.14` `@diagram uml-class` (accompanied by the prerequisite 1-line fix adding
`'inheritance'` to `KNOWN_RELATIONS_0214['uml-class']`), supporting `direction`,
`class` declarations, display aliases, backtick-quoted names,
`<<interface>>`/`<<enumeration>>`/`<<enum>>`, native `group` emission for
`namespace`, inline `{ ... }` and standalone `Class : member` merged into
`attributes { ... }` and `operations { ... }`, all four visibilities (`+`, `-`,
`#`, `~`), type-first and colon member styles, all UML relationship operators
normalized to canonical Coral written polarity (including `<..>` and symmetric
`<|--|>`, `*--*`, `o--o` without operator end conflicts), and quoted
multiplicities mapped to `[firstLabel: "...", secondLabel: "..."]`. Saved-source
`0.2.14` gaps (enum literal bodies, `abstract`/`static` modifiers, sanitized
generic types, class notes) shall emit classified warnings.
- *Traces to:* UN-01, UN-04, UN-06, UN-09

### TR-05: Entity Relationship Transpilation (`erDiagram` → `@diagram erd` `0.2.14`)
The transpiler shall convert Mermaid `erDiagram` to Coral `0.2.14` Crow's Foot
`@diagram erd`, supporting `direction`, bare/hyphenated/quoted/aliased/empty
entities, `columns { name type [pk, fk, uk] }` (inverting `<type> <name>
[KEYS]`, sanitizing `[]`/`~T~`/hyphens, deduplicating duplicate columns with
warning, and dropping column comments with warning), all symbolic and Mermaid
English-alias Crow's Foot cardinalities (`only one`, `zero or one`, `one or
zero`, `one or more`, `one or many`, `zero or more`, `zero or many`, `many`,
`1`, `0+`, `1+`) across identifying (`--`/`to`) and non-identifying
(`..`/`optionally to`) relationships, and CSS-normalized entity styling.
- *Traces to:* UN-01, UN-04, UN-06

### TR-06: State Diagram Transpilation (`stateDiagram-v2` / `stateDiagram` → `@diagram uml-state`)
The transpiler shall convert Mermaid `stateDiagram-v2`/`stateDiagram` to valid
Coral Edition `0.2.8` `@diagram uml-state` saved source (omitting `@coralVersion
"0.2.14"` and `layout` so `characterState028` compatibility is preserved),
mapping `[*]` entry/exit to collision-free `initial`/`final` nodes, simple
states, aliases, concatenated `s1 : desc` descriptions, and transitions
(including multiple `[*]` transitions and self-transitions). Under Tier 1,
composite states, `--` concurrency, `<<choice>>`/`<<fork>>`/`<<join>>`,
`direction`, notes, and styles shall emit classified warnings; Stage 4B shall
truthfully report `visualRenderable: false`
(`coral.uml-state.visual-unavailable`, `info`) and `characterRenderable: true |
false` (`coral.uml-state.character-bounds.exceeded`, `info` when outside
`characterState028` bounds).
- *Traces to:* UN-01, UN-03, UN-04, UN-06, UN-09

### TR-07: Identifier Normalization, Color Normalization, Escaping, and Lexical Hygiene
All emitted Coral identifiers shall match `^[A-Za-z_][A-Za-z0-9_]*$`, avoid the
27 canonical Coral reserved words, resolve collisions via a deterministic `k =
2, 3, ...` loop, populate `idMap` keyed by **canonical qualified Coral ID** for
every declared node/group/participant, and preserve original display text via
`as "..."`. All quoted strings shall obey Coral's `\"`, `\\`, `\n` escape set,
normalize `\t` → `' '` and U+2028/U+2029 → `\n`, convert `<br\s*/?>` → `\n`,
reject non-XML-1.0 scalars/lone surrogates with error, normalize CSS
`#RGB`/named/`rgb(...)` colors to `#RRGGBB`, and obey Coral's
operator-shorthand, double-dimension, and `as`/`label:` mutual-exclusion rules.
- *Traces to:* UN-03, UN-06, UN-10

### TR-08: Loss Accounting, Modes, and Stable Diagnostics
Every result shall return a frozen, source-position-ordered `diagnostics` array
(1-based line, 0-based UTF-16 column/offset) with stable codes and
`lossSummary`. In `best-effort` mode, `ok` is `true` iff no `error` occurred and
Stage 4 passed. In `strict` mode, any `warning` or `error` shall refuse (`ok:
false`, `coral: undefined`, `coral.transpile.strict.refused`); `info`
diagnostics shall not cause strict refusal.
- *Traces to:* UN-06, UN-07

### TR-09: Mandatory Two-Layer Self-Verification, Determinism, and Zero-LLM Invariant
Every emitted Coral string shall pass Stage 4A (`parse` with
`HEADER_MANIFEST_028` runtime: valid header, zero header diagnostics, zero
syntax diagnostics—without assuming GraphIR 3 `doc.graph` exists on
successor-only syntax) and Stage 4B (`parseInstalledDocument028` →
`projectInstalledSourceToSuccessor028` → `verifyPortableSuccessorSource028` →
`validateGraphIRSuccessorWithCatalog` → actual display seam branching on
`projected.graph.interaction`: `successorSourceDisplay028` for `uml-sequence`
and `successorSourceDisplayWithSemanticPorts028` for all other notations,
followed by `assertRenderableInterpretation028(display.nodes, targetNotation,
display.profile, installedCatalogSnapshotForEdition(targetNotation,
targetEdition))` for `visualRenderable`, and `stateCharacterUsesChain028` for
`uml-state` `characterRenderable`). Unexpected verification failure shall fail
closed with `coral.transpile.self-check.failed`. Output shall be byte-identical
across runs, idempotent under `formatDocument028(coral, runtime)`, and strictly
zero-LLM.
- *Traces to:* UN-02, UN-03

### TR-10: Shared Surface Integration (API, MCP, Editor, CLI)
One shared implementation (`@coral-viz/language` + `@coral-viz/render`) shall
power:
1. `@coral-viz/mcp-server` `coral_convert` (`from: "mermaid", to: "coral"`,
   `strict`, additive `flowchartTarget` and `edgeStyleMode`, preserving
   backward-compatible `candidateVersion: '4.0.0'`, `nodeCount`, `edgeCount`
   alongside new `structuredContent` fields).
2. `@coral-viz/diagram-editor` (explicit "Convert to Editable Coral" action,
   pre-commit loss review when `lossy === true`, single atomic Undo step
   restoring exact prior Mermaid bytes, no mutation on refusal, honest
   `uml-state` notice).
3. Node/CLI batch conversion for `.mmd` and fenced Markdown blocks with JSON
   diagnostic reports and CI exit codes.
- *Traces to:* UN-01, UN-05, UN-07, UN-08, UN-09

### TR-11: Security, Safety, and Performance Budgets
The transpiler shall enforce `maxInputLength` (default 512 KB) and
`maxNestingDepth` (default 32), use linear-time $O(n)$ lexers immune to ReDoS,
use `Map`/`Set`/`Object.create(null)` for all user-keyed tables (zero prototype
pollution), neutralize raw HTML/SVG injection, and complete within <= 15 ms (30
nodes), <= 50 ms (100 nodes), and <= 250 ms (500 nodes) on Node 24/26.
- *Traces to:* UN-10

### TR-12: Honesty & Phase-2 Evolution Alignment
Public documentation, editor UI copy, and MCP tool descriptions shall state the
exact Top-5 supported types, `flowchartTarget`/`edgeStyleMode` options,
`uml-state` character-only status, and `uml-class` `0.2.14` gaps without
overclaiming. Phase-2 extensions shall follow
`dev/designs/language-design-and-evolution.md` without mutating frozen
`0.2.8`/`0.2.9`/`0.2.14` digests.
- *Traces to:* UN-09

---

## 4. Traceability Matrix

| Requirement | Personas | User Needs | Primary Acceptance Specs |
| --- | --- | --- | --- |
| TR-01 | P1, P2, P3, P4 | UN-01, UN-06, UN-09 | SPEC-01, SPEC-02 |
| TR-02 | P1, P2, P3, P4 | UN-01, UN-03, UN-04, UN-05, UN-06 | SPEC-03, SPEC-04, SPEC-05 |
| TR-03 | P1, P2, P3, P4 | UN-01, UN-04, UN-06 | SPEC-06, SPEC-07 |
| TR-04 | P1, P2, P3, P4 | UN-01, UN-04, UN-06, UN-09 | SPEC-08, SPEC-09 |
| TR-05 | P1, P2, P3, P4 | UN-01, UN-04, UN-06 | SPEC-10, SPEC-11 |
| TR-06 | P1, P3, P4 | UN-01, UN-03, UN-04, UN-06, UN-09 | SPEC-12, SPEC-13 |
| TR-07 | P2, P3, P4 | UN-03, UN-06, UN-10 | SPEC-14 |
| TR-08 | P1, P2, P3, P4 | UN-06, UN-07 | SPEC-15 |
| TR-09 | P1, P2, P3, P4 | UN-02, UN-03 | SPEC-16 |
| TR-10 | P1, P2, P3 | UN-01, UN-05, UN-07, UN-08 | SPEC-17, SPEC-18 |
| TR-11 | P2, P3, P4 | UN-10 | SPEC-19 |
| TR-12 | P1, P4 | UN-09 | SPEC-12, SPEC-18 |

---

## 5. Acceptance Criteria & Executable Specifications

### SPEC-01: Out-of-Scope Mermaid Types Refuse Cleanly (Including Auto-Detection) (TR-01)
- **Given** a valid Mermaid `gantt`, `pie`, `gitGraph`, `mindmap`,
  `quadrantChart`, `sankey-beta`, `xychart-beta`, `radar-beta`, `treemap`,
  `venn-beta`, `ishikawa`, or `wardley-beta` document
- **When** passed to `detectFormat(source)` and
  `transpileAndVerifyMermaidToCoral(source)` (and MCP `coral_convert` with
  `from: "auto"`)
- **Then** `detectFormat` detects `'mermaid'` (never falling back to `'coral'`),
  `ok` is `false`, `coral` is `undefined`, `diagnostics` contains
  `mermaid.diagram.unsupported` (`error`) positioned at the header line, and the
  message names both the detected type and the 5 supported types.

### SPEC-02: Frontmatter, Directives, and Exact UTF-16 Line Accuracy (TR-01, TR-08)
- **Given** an 8-line Mermaid input:
  - Lines 1–4: `---\ntitle: Checkout\nconfig: { theme: dark }\n---` (4 lines)
  - Line 5: `%%{init: {"theme": "dark"}}%%`
  - Line 6: `flowchart TD`
  - Line 7: `  A[Start] --> B[End]`
  - Line 8: `  click A "https://example.com"`
- **When** transpiled in `best-effort` mode
- **Then** `ok` is `true`, `mermaid.frontmatter.title.dropped` (`info`) points
  to line 2, `mermaid.frontmatter.config.dropped` (`warning`) points to line 3,
  `mermaid.directive.init.dropped` (`warning`) points to line 5, and
  `mermaid.flowchart.click.dropped` (`warning`) points to exact physical line 8.

### SPEC-03: Golden Flowchart with Subgraphs & Dot-Qualified Root Edges (TR-02, TR-09)
- **Given** Mermaid input:
  ```mermaid
  flowchart LR
    start([Start]) --> check{Valid?}
    subgraph backend [Backend]
      api[API Call] --> sub[[Auth Check]]
    end
    check -->|Yes| api
    check -.->|No| done([Done])
    sub --> done
  ```
- **When** `transpileAndVerifyMermaidToCoral(input)` runs with default options
  (`flowchartTarget: 'flowchart'`)
- **Then** `ok` is `true`, `targetEdition` is `'0.2.14'`, `visualRenderable` is
  `true`, `lossSummary.lossy` is `false`, `idMap["backend.api"] === "api"`, and
  `coral` equals:
  ```coral
  @diagram flowchart
  @coralVersion "0.2.14"
  layout [direction: RIGHT]

  start terminal [variant: "start"] as "Start"
  check decision as "Valid?"
  backend group as "Backend" {
    api process as "API Call"
    sub process [symbol: "flowchart-predefined"] as "Auth Check"
  }
  done terminal [variant: "end"] as "Done"

  start -> check
  backend.api -> backend.sub
  check -> backend.api as "Yes"
  check -.-> done as "No"
  backend.sub -> done
  ```
- **And** `projectInstalledSourceToSuccessor028(result.coral)` succeeds with
  zero diagnostics and `successorSourceDisplayWithSemanticPorts028` +
  `assertRenderableInterpretation028` succeed (even though GraphIR 3 `doc.graph`
  is `undefined` due to `layout`).

### SPEC-04: Flowchart Target Notation Override (`flowchart` vs `block` vs `architecture`) (TR-02, TR-08)
- **Given** Mermaid input:
  ```mermaid
  flowchart TD
    api[Orders API] --> db[(Orders DB)]
  ```
- **When** transpiled with `flowchartTarget: 'flowchart'` (default)
- **Then** `ok` is `true`, `visualRenderable` is `true`, `db` emits `db process
  as "Orders DB"`, and `diagnostics` contains `mermaid.flowchart.shape.degraded`
  (`warning`) suggesting `block` or `architecture`.
- **When** transpiled with `flowchartTarget: 'block'`
- **Then** `ok` is `true`, `visualRenderable` is `true`, `lossSummary.lossy` is
  `false`, and `coral` contains `@diagram block`, `@coralVersion "0.2.14"`,
  **`layout [direction: DOWN]`** (preserving `TD` against `block`'s `RIGHT`
  default!), `api box as "Orders API"`, `db cylinder as "Orders DB"`, `api ->
  db`.
- **When** transpiled with `flowchartTarget: 'architecture'`
- **Then** `ok` is `true`, `visualRenderable` is `true`, `lossSummary.lossy` is
  `false`, and `coral` contains `@diagram architecture`, `@coralVersion
  "0.2.14"`, `layout [direction: DOWN]`, `api service as "Orders API"`, `db
  database as "Orders DB"`, `api -> db`.

### SPEC-05: Flowchart Fan-Out, CSS Color Normalization, `o--o`, v11.3+ Edge IDs, and `visual-safe` vs `portable` Edge Styles (TR-02, TR-07)
- **Given** Mermaid input:
  ```mermaid
  flowchart LR
    A & B ==> C
    A e1@-.-> C
    e1@{ animate: true }
    A o--o D
    A ~~~ D
    B --x D
    classDef hot fill:#f9f,stroke:red
    class C hot
  ```
- **When** transpiled with default `edgeStyleMode: 'visual-safe'`
- **Then** `ok` is `true`, `visualRenderable` is `true`, `C` carries `[style:
  "fill: #ff99ff; stroke: #ff0000"]` (3-digit hex & named CSS color
  normalized!), `A o--o D` emits **`A -o D [firstEnd: circle]`** (no
  `end-conflict`!), `A & B ==> C` expands to `A -> C` and `B -> C` with
  `mermaid.flowchart.edge-weight.degraded` (`warning`), `e1` emits `e1 = A -.->
  C` with `mermaid.flowchart.edge-animation.degraded` (`warning`), `A ~~~ D`
  emits `mermaid.flowchart.edge.invisible.dropped` (`warning`), and `B --x D`
  emits `mermaid.flowchart.marker.cross.degraded` (`warning`).
- **When** transpiled with `edgeStyleMode: 'portable'`
- **Then** `ok` is `true`, `visualRenderable` is `false`, `A & B ==> C` emits `A
  -> C [style: "thick"]` and `B -> C [style: "thick"]`, `e1` emits `e1 = A -.->
  C [style: "animated:forward"]` (WITHOUT repeating `dashed` in `style:`!), and
  `diagnostics` includes `coral.edge-style.visual-unavailable` (`info`).

### SPEC-06: Golden Sequence Diagram with Box, Nested Activation, Alt/Else, and Note (TR-03, TR-10)
- **Given** Mermaid input:
  ```mermaid
  sequenceDiagram
    actor user as User
    box Backend
      participant api as API
      participant db as Database
    end
    user->>+api: POST /orders
    alt valid
      api->>db: INSERT order
      db-->>api: 201 Created
    else invalid
      Note over api: Rejected payload
      api-->>user: Log warning
    end
    api-->>-user: Response
  ```
- **When** `transpileAndVerifyMermaidToCoral(input)` runs
- **Then** `ok` is `true`, `targetEdition` is `'0.2.14'`, `visualRenderable` is
  `true`, `lossSummary.lossy` is `false`, `diagnostics.length === 0`, and
  `coral` equals:
  ```coral
  @diagram uml-sequence
  @coralVersion "0.2.14"

  user actor as "User"
  api participant as "API"
  db participant as "Database"

  box_1 = participants api, db [label: "Backend"]

  activation api {
    msg_1 = user -#> api as "POST /orders"
    alt "valid" {
      msg_2 = api -#> db as "INSERT order"
      msg_3 = db -.-> api as "201 Created"
    } else "invalid" {
      note "Rejected payload" on api
      msg_4 = api -.-> user as "Log warning"
    }
    msg_5 = api -.-> user as "Response"
  }
  ```
- **And** `projectInstalledSourceToSuccessor028(result.coral)`,
  `successorSourceDisplay028(projected.graph)`, and
  `assertRenderableInterpretation028(display.nodes, 'uml-sequence',
  display.profile, installedCatalogSnapshotForEdition('uml-sequence',
  '0.2.14'))` pass with zero errors.

### SPEC-07: Sequence Non-Nested Activation, Participant-ID Collision Avoidance, and Lifecycle Guards (TR-03, TR-08)
- **Given** (a) a Mermaid `sequenceDiagram` with interleaved activations
  (`activate A`, `activate B`, `deactivate A`, `deactivate B`) or cross-fragment
  activation; (b) a diagram with a participant literally named `msg_1`; and (c)
  `create actor U as User` followed by `A->>U: spawn`
- **When** transpiled in `best-effort` mode
- **Then** (a) `ok` is `true`, all messages preserve chronological order,
  conflicting activation wrapper drops with
  `mermaid.sequence.activation.non-nested.dropped` (`warning`); (b) the first
  synthetic message allocates `msg_2` (zero identity collision!); and (c) `U
  actor as "User"` is pre-declared AND the spawn message emits `U` with
  `[create]` over `-.->` (`mermaid.sequence.create-arrow.normalized`, `info`).
- **When** (a) is transpiled in `strict` mode
- **Then** `ok` is `false`, `coral` is `undefined`, with
  `coral.transpile.strict.refused`.

### SPEC-08: Golden Class Diagram with Namespace Group, Compartments, Polarity, and Multiplicities (TR-04)
- **Given** Mermaid input:
  ```mermaid
  classDiagram
    namespace Banking {
      class Account["Bank Account"] {
        +String owner
        -Decimal balance
        +deposit(Decimal amount) Boolean
      }
      class SavingsAccount
    }
    Account <|-- SavingsAccount
    Customer "1" --> "0..*" Account : owns
    Portfolio *-- Account
  ```
- **When** `transpileAndVerifyMermaidToCoral(input)` runs *(with the
  prerequisite `KNOWN_RELATIONS_0214['uml-class']` `'inheritance'` fix in
  place)*
- **Then** `ok` is `true`, `visualRenderable` is `true`, `lossSummary.lossy` is
  `false`, and `coral` equals:
  ```coral
  @diagram uml-class
  @coralVersion "0.2.14"

  Banking group {
    Account class as "Bank Account" {
      attributes {
        + owner: String
        - balance: Decimal
      }
      operations {
        + deposit(amount: Decimal): Boolean
      }
    }
    SavingsAccount class
  }
  Customer class
  Portfolio class

  Banking.SavingsAccount -|> Banking.Account [inheritance]
  Customer -> Banking.Account [association, firstLabel: "1", secondLabel: "0..*"] as "owns"
  Portfolio -- Banking.Account [composition, firstEnd: filledDiamond]
  ```

### SPEC-09: Class Diagram `0.2.14` Saved-Source Gaps Diagnosed Explicitly (TR-04, TR-08)
- **Given** a Mermaid `classDiagram` with an `<<enumeration>>` body (`OPEN`,
  `CLOSED`), an `<<abstract>>` class with a static attribute `+int count$` and
  generic type `+List~Item~ items`, and `note for Order "Immutable"`
- **When** transpiled in `best-effort` mode
- **Then** `ok` is `true`, `visualRenderable` is `true`, emitted Coral parses
  and projects cleanly under `0.2.14`, and `diagnostics` contains
  `mermaid.class.enum-literals.dropped`,
  `mermaid.class.modifier.abstract.dropped`,
  `mermaid.class.member-modifier.dropped`,
  `mermaid.class.member-type.sanitized`, and `mermaid.class.note.dropped` (all
  `warning`).
- **When** transpiled in `strict` mode
- **Then** `ok` is `false` with `coral.transpile.strict.refused`.

### SPEC-10: Golden ER Diagram with Column Inversion and Native Crow's Foot (TR-05)
- **Given** Mermaid input:
  ```mermaid
  erDiagram
    CUSTOMER {
      uuid id PK
      varchar(255) email UK
    }
    ORDER {
      uuid id PK
      uuid customer_id FK
    }
    CUSTOMER ||--o{ ORDER : places
    ORDER ||..|{ LINE-ITEM : contains
  ```
- **When** `transpileAndVerifyMermaidToCoral(input)` runs
- **Then** `ok` is `true`, `targetEdition` is `'0.2.14'`, `visualRenderable` is
  `true`, `lossSummary.lossy` is `false`, `lossSummary.infoCount === 1`
  (`mermaid.id.normalized` for `LINE-ITEM` → `LINE_ITEM`), `idMap["LINE_ITEM"]
  === "LINE-ITEM"`, and `coral` equals:
  ```coral
  @diagram erd
  @coralVersion "0.2.14"

  CUSTOMER entity {
    columns {
      id uuid [pk]
      email varchar(255) [uk]
    }
  }
  ORDER entity {
    columns {
      id uuid [pk]
      customer_id uuid [fk]
    }
  }
  LINE_ITEM entity as "LINE-ITEM"

  CUSTOMER ||--o{ ORDER as "places"
  ORDER ||..|{ LINE_ITEM as "contains"
  ```

### SPEC-11: ER Column Comments, Array Types, Duplicate Columns, and Real English Aliases (TR-05)
- **Given** Mermaid `erDiagram` with `string[] tags "tag list"` and duplicate
  `string tags` inside `POST`, and `USER one or more optionally to zero or many
  POST : writes`
- **When** transpiled in `best-effort` mode
- **Then** `ok` is `true`, `visualRenderable` is `true`, `POST` emits single
  `tags string_array`, edge emits `USER }|..o{ POST as "writes"`, and
  `diagnostics` reports `mermaid.er.column-type.sanitized`,
  `mermaid.er.column-comment.dropped`, and `mermaid.er.column.duplicate.dropped`
  (all `warning`).

### SPEC-12: Golden Flat State Diagram, Edition `0.2.8`, and Honest Render Flags (TR-06, TR-12)
- **Given** Mermaid input:
  ```mermaid
  stateDiagram-v2
    [*] --> Idle
    Idle --> Checking : submit
    state "Validating Order" as Checking
    Checking --> Done : valid
    Done --> [*]
  ```
- **When** `transpileAndVerifyMermaidToCoral(input)` runs
- **Then** `ok` is `true`, `targetEdition` is `'0.2.8'`, `visualRenderable` is
  `false`, `characterRenderable` is `true`, `lossSummary.lossy` is `false`,
  `diagnostics` contains `coral.uml-state.visual-unavailable` (`info`), and
  `coral` equals:
  ```coral
  @diagram uml-state

  start initial
  Idle state
  Checking state as "Validating Order"
  Done state
  finish final

  start -> Idle
  Idle -> Checking as "submit"
  Checking -> Done as "valid"
  Done -> finish
  ```
- **And** `parseInstalledDocument028(result.coral)` and
  `renderInstalledCharacterPreview028(result.coral)` succeed with zero errors.
- **And** for a flat state diagram with a self-transition (`Idle --> Idle :
  tick`) or >8 states, `ok` is `true`, `visualRenderable` is `false`,
  `characterRenderable` is `false`, and `diagnostics` includes
  `coral.uml-state.character-bounds.exceeded` (`info`).

### SPEC-13: State Diagram Composite, Concurrency, and Pseudostate Degradation (TR-06, TR-08)
- **Given** a Mermaid `stateDiagram-v2` with a composite state `state Active {
  [*] --> Run; -- ; [*] --> Log }`, `state branch <<choice>>`, `direction LR`,
  and `note right of Active : live`
- **When** transpiled in `best-effort` mode
- **Then** `ok` is `true`, `targetEdition` is `'0.2.8'`, emitted Coral is valid
  flat `@diagram uml-state`, and `diagnostics` contains
  `mermaid.state.composite.flattened`, `mermaid.state.concurrency.dropped`,
  `mermaid.state.pseudostate.degraded`, `mermaid.state.direction.dropped`, and
  `mermaid.state.note.dropped` (all `warning`).
- **When** transpiled in `strict` mode
- **Then** `ok` is `false` with `coral.transpile.strict.refused`.

### SPEC-14: Reserved Keyword IDs, Numeric IDs, Collision Loop, Tab Normalization, and Escapes (TR-07)
- **Given** a Mermaid flowchart with nodes `layout[Layout Engine]`, `123[Step
  One]`, `a-b[First]`, `a_b_2[Preexisting]`, `a_b[Second]`, and label text
  containing `"quotes"`, `C:\path`, a literal tab `\t`, and `Line1<br/>Line2`
- **When** transpiled
- **Then** IDs normalize deterministically to `layout_id`, `n_123`, `a_b`,
  `a_b_2`, `a_b_3` (skipping taken `a_b_2` via the collision loop!), `idMap`
  maps all five qualified Coral IDs to original IDs, `\t` normalizes to `' '`
  with `mermaid.text.tab.normalized` (`info`), labels escape strictly with `\"`,
  `\\`, `\n`, and Stage 4A+4B parse-back recovers exact normalized labels with
  zero diagnostics.

### SPEC-15: `info` vs `warning` Strict-Mode Boundary (TR-08)
- **Given** a Mermaid flowchart with `accTitle: Billing` and hyphenated ID
  `order-api[Orders API]` (producing only `info` diagnostics:
  `mermaid.accessibility.dropped` and `mermaid.id.normalized`)
- **When** transpiled with `mode: 'strict'`
- **Then** `ok` is `true` and `lossSummary.lossy` is `false`.

### SPEC-16: Self-Verification Fail-Closed, Determinism, and Formatting Fixpoint (TR-09)
- **Given** every valid fixture across the Top-5 corpus
- **When** `transpileAndVerifyMermaidToCoral` is invoked twice in separate calls
- **Then** outputs are byte-identical (`r1.coral === r2.coral`),
  `formatDocument028(r1.coral, runtime) === r1.coral`, zero network/LLM calls
  occur, and injecting a fault into Stage 3 (emitting invalid syntax in a unit
  test) causes Stage 4 to fail closed with `ok: false`, `coral: undefined`, and
  `coral.transpile.self-check.failed`.

### SPEC-17: MCP `coral_convert` Contract & Backward Compatibility (TR-10)
- **Given** MCP tool call `coral_convert({ content: <mermaid>, from: "auto", to:
  "coral", strict: false, flowchartTarget: "block" })`
- **When** executed for each of the Top-5 diagram types
- **Then** `isError` is `false`, `structuredContent` preserves `from:
  "mermaid"`, `to: "coral"`, `nodeCount`, `edgeCount`, `diagnostics`, and
  `candidateVersion: "4.0.0"`, while additively returning `detectedKind`,
  `targetNotation`, `targetEdition` (`"0.2.14"` or `"0.2.8"` for Tier 1
  `uml-state`), `visualRenderable`, `characterRenderable`, `lossSummary`, and
  `idMap`.

### SPEC-18: Editor Atomic Conversion, Loss Review, Undo, and Refusal Preservation (TR-10, TR-12)
- **Given** the reference editor displaying a pasted Mermaid flowchart
  containing a database cylinder `db[(Orders DB)]`
- **When** the user clicks **Convert to Editable Coral**
- **Then** a pre-commit loss banner displays the cylinder warning and offers
  **Switch to Block**, **Switch to Architecture**, **Convert as Flowchart**, or
  **Cancel**; choosing **Convert** replaces the editor buffer with verified,
  visually renderable Coral in **one single Undo step**; pressing `Ctrl+Z`
  restores exact original Mermaid bytes; attempting conversion on `gantt` leaves
  original text untouched with `mermaid.diagram.unsupported`; and converting
  `stateDiagram-v2` displays an honest banner explaining character/source-only
  support with **Copy Coral / Save `.coral`**.

### SPEC-19: Security, Prototype Pollution, ReDoS, and Performance Gates (TR-11)
- **Given** (a) node IDs `__proto__`, `constructor`, `toString`,
  `hasOwnProperty`; (b) a 100 KB pathological unclosed bracket/quote string; (c)
  a 40-level nested subgraph input; (d) a label containing
  `<script>alert(1)</script>`; and (e) generated 100-node and 500-node
  flowcharts
- **When** transpiled
- **Then** (a) succeeds with zero prototype mutation; (b) completes in < 20 ms
  with clean syntax diagnostics; (c) fails cleanly with
  `mermaid.input.nesting-exceeded` without stack overflow; (d) preserves
  `<script>alert(1)</script>` as literal quoted text safely escaped in SVG
  export; and (e) completes within <= 50 ms (100 nodes) and <= 250 ms (500
  nodes).
