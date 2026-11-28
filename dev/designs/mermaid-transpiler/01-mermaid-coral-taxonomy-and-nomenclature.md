# Mermaid.js Diagram Taxonomy, Coral Mapping, and Top-5 Nomenclature Reference

> **Revision:** FIX-2 (updated after Adversarial Review Pass 2).
> **Target Coral Baseline:** Coral Language `1.3.0`, Saved-Source Edition
> `0.2.14` (and `0.2.8` for Tier 1 `uml-state`) in `release/0.2.16` /
> `origin/main` as of 2026-11-27.
> **Target Mermaid.js Baseline:** Open-source `mermaid-js/mermaid` (MIT, v11.x
> through v12.3.0). Commercial **Mermaid Chart** (`mermaid.ai`) SaaS features
> (Whiteboard visual editor, Mermaid AI chat, cloud workspaces, collaboration,
> native Office/Google Docs plugins, and commercial-first theme/look workflows)
> are explicitly excluded.

---

## 1. Open-Source Mermaid.js vs. Commercial Mermaid Chart

A common source of confusion is separating **Mermaid.js** (`mermaid-js/mermaid`,
MIT-licensed open-source library) from **Mermaid Chart** (now branded
**Mermaid** at `mermaid.ai`, the commercial SaaS company founded by Mermaid's
creator):

- **All diagram grammars live in open-source `mermaid-js/mermaid`.** Mermaid
  Chart does not gatekeep proprietary diagram *types*; every official syntax
  parser (`packages/mermaid/src/diagrams/*`) originates in or lands in the
  open-source repository.
- **What is excluded here:** Mermaid Chart's hosted GUI editor/Whiteboard, AI
  generation/repair, cloud storage, co-editing, commercial MCP connector, and
  SaaS-specific theme/layout persistence metadata.
- **Note on Mermaid 12 defaults:** Starting in open-source `mermaid@12.0.0`, ELK
  became the default layout engine for `flowchart`, `state`, `class`, `er`,
  `requirement`, and `usecase` diagrams (`layout: dagre` restores legacy dagre).
  Our transpiler treats layout engines as non-semantic rendering choices unless
  explicit direction/layout directives appear in Mermaid source.

---

## 2. Exhaustive Inventory of Open-Source Mermaid.js Diagram Types

Inspecting `mermaid-js/mermaid` (`packages/mermaid/src/diagrams/` and
`mermaid.js.org` syntax reference through v12.3.0) yields **30 user-facing
diagram types** (plus 2 internal non-diagram utility types, `info` and `error`,
excluded from the user count):

### 2.1 Core & Stable Diagram Types (11)

| # | Mermaid.js Diagram Type | Declaration Keyword(s) | Maturity | Primary Domain |
| ---: | --- | --- | --- | --- |
| 1 | **Flowchart** | `flowchart`, `graph` | Stable | Process flows, decision trees, system/pipeline overviews |
| 2 | **Sequence Diagram** | `sequenceDiagram` | Stable | Time-ordered actor/service interactions, API & auth flows |
| 3 | **Class Diagram** | `classDiagram`, `classDiagram-v2` | Stable | Object-oriented/domain structure, types, inheritance |
| 4 | **State Diagram** | `stateDiagram-v2`, `stateDiagram` | Stable | Finite state machines, lifecycles, protocol states |
| 5 | **Entity Relationship Diagram** | `erDiagram` | Stable | Relational database schemas, Crow's Foot cardinality |
| 6 | **User Journey** | `journey` | Stable | UX step satisfaction scores by actor and section |
| 7 | **Gantt Chart** | `gantt` | Stable | Project schedules, date bars, milestones |
| 8 | **Pie Chart** | `pie` | Stable | Proportional categorical data |
| 9 | **Quadrant Chart** | `quadrantChart` | Stable | 2x2 prioritization/positioning matrix |
| 10 | **Requirement Diagram** | `requirementDiagram` | Stable | SysML-style requirement traceability |
| 11 | **Git Graph** | `gitGraph` | Stable | Git commits, branches, tags, merges, cherry-picks |

### 2.2 Extended, Experimental & Beta Diagram Types in Open-Source v10–v12 (19)

| # | Mermaid.js Diagram Type | Declaration Keyword(s) | Maturity | Primary Domain |
| ---: | --- | --- | --- | --- |
| 12 | **C4 Diagram** | `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment` | Experimental | C4 model software architecture |
| 13 | **Mindmap** | `mindmap` | Experimental / Stable | Indentation-based radial concept trees |
| 14 | **Timeline** | `timeline` | Experimental / Stable | Chronological period/event bands |
| 15 | **ZenUML** | `zenuml` | Plugin-backed | Code-block syntax alternative for sequence diagrams |
| 16 | **Sankey** | `sankey`, `sankey-beta` | Beta / Stable | Quantity-weighted flow bands (CSV tuples) |
| 17 | **XY Chart** | `xychart`, `xychart-beta` | Beta / Stable | Bar and line charts over X/Y axes |
| 18 | **Block Diagram** | `block`, `block-beta` | Beta | Explicit grid/column block layouts |
| 19 | **Packet Diagram** | `packet`, `packet-beta` | Beta / Stable | Bit-field network protocol headers |
| 20 | **Kanban** | `kanban` | Experimental (v11.4+) | Columnar task boards |
| 21 | **Architecture** | `architecture-beta` | Beta (v11.1+) | Cloud service/group/junction graphs (fcose layout) |
| 22 | **Radar Chart** | `radar-beta` | Beta (v11.6+) | Multivariate radial axis plots |
| 23 | **Treemap** | `treemap`, `treemap-beta` | Beta (v11.7+) | Proportional nested rectangles |
| 24 | **Venn Diagram** | `venn-beta` | Beta (v11+/v12) | Set intersection/overlap circles |
| 25 | **Ishikawa (Fishbone)** | `ishikawa`, `ishikawa-beta` | Beta (v11+/v12) | Cause-and-effect root-cause trees |
| 26 | **UML Use Case** | `usecase`, `usecase-beta` | Beta / New (v12.0+) | Actors, use cases, system boundaries |
| 27 | **Event Modeling** | `eventmodeling` | Beta (v12) | Event-driven timeline/swimlane slices |
| 28 | **TreeView** | `treeView-beta` | Beta (v12) | Directory/hierarchy tree views |
| 29 | **Cynefin** | `cynefin-beta` | Beta (v12) | Five-domain sense-making framework |
| 30 | **Wardley Map** | `wardley-beta` | Beta (v12) | Value-chain vs. evolution strategic maps |

> [!NOTE]
> **Excluded internal/non-standard entries:** `info` and `error` are internal
> Mermaid diagnostic renderers, not user diagram types. `swimlane-beta`
> (referenced in third-party converters) and `agentflow` (Mermaid docs/ecosystem
> workflow format) are not core stable Mermaid.js diagram types and are excluded
> from the 30-type core inventory.

---

## 3. Top 5 Most-Used Mermaid.js Diagram Types (Evidence-Graded)

Mermaid.js does **not** publish official telemetry breaking down usage by
diagram type. Following Coral's evidence-grading discipline
(`dev/designs/character-renderer-diagram-priority.md`), we avoid fabricating
exact telemetry and instead triangulate **five independent public signals**:

1. **GitHub Markdown corpus observations:** Public code-search analyses
   consistently place `flowchart`/`graph` as the clear majority (~55–60%
   estimated share), `sequenceDiagram` a distant #2 (~20–25%), followed by
   `classDiagram` (~5–8%) and `erDiagram` (~4–6%), with `stateDiagram-v2` and
   `gitGraph` competing in the #5–#6 band (~1–4%).
2. **Mermaid Chart's own commercial visual-editor rollout:** Mermaid's creators
   built GUI visual editors in exact commercial demand order: **Flowchart →
   Sequence → Class → ER** (4 types as of 2025–2026).
3. **Mermaid 12.0 ELK-default migration targets:** Mermaid 12 prioritized ELK
   layout defaults specifically for **flowchart, state, class, ER** (plus
   requirement and new use-case).
4. **Ecosystem converter priorities:** `@excalidraw/mermaid-to-excalidraw`
   (~1.9M npm downloads/week) and Coral's own existing `parseMermaid` core both
   prioritize the same five software-engineering diagram families.
5. **Coral's own popularity evidence grades:** In
   `dev/designs/character-renderer-diagram-priority.md`, **Flowchart**, **UML
   Sequence**, **ERD**, **UML Class**, and **UML State** all carry Evidence
   Grade **B** (direct comparative prevalence observations), whereas `GitGraph`,
   `Timeline`, `Mindmap`, and `User Journey` carry Grade **D** (no usable
   comparative prevalence observation).

### Selected Top 5 Scope

| Rank | Mermaid.js Diagram Type | Keywords | Evidence Grade | Rationale & Boundary Note |
| ---: | --- | --- | :---: | --- |
| **1** | **Flowchart** | `flowchart`, `graph` | B | Undisputed #1 across engineering docs, RFCs, pipelines, and ad-hoc architecture blocks. |
| **2** | **Sequence Diagram** | `sequenceDiagram` | B | Dominant #2 for APIs, auth flows, RPC/event protocols, and microservice interactions. |
| **3** | **Class Diagram** | `classDiagram`, `classDiagram-v2` | B | Tied #3–#4 for OO design, domain models, and SDK/type documentation. |
| **4** | **Entity Relationship Diagram** | `erDiagram` | B | Tied #3–#4 for SQL/relational schemas and backend data documentation. |
| **5** | **State Diagram** | `stateDiagram-v2`, `stateDiagram` | B | #5 software-engineering graph type (FSMs, order/job lifecycles, UI states). *Note:* `gitGraph` competes closely in README tutorials, but has no Coral visual or source notation, whereas Coral already has `@diagram uml-state` in its manifest. |

---

## 4. Complete Mapping: Mermaid.js (30 Types) → Coral (13 Notations)

Coral Edition `0.2.14` (`packages/render/src/notations/index.ts` &
`packages/language/src/parser/header-manifest028.ts`) installs **13 notations**:
- **12 Visual + Source Notations** (`getAvailableNotations0214()`): `block`,
  `flowchart`, `bpmn`, `erd`, `code`, `architecture`, `infrastructure`, `aiml`,
  `data-engineering`, `sketch`, `uml-class`, `uml-sequence`.
- **1 Source + Character-Only Notation:** `uml-state` (present in
  `HEADER_MANIFEST_028` and `notationRegistry`, **but**
  `packages/render/src/scene.ts:116` currently throws
  `render.capability.character-only-edition` for SVG/visual editor rendering).

### 4.1 Full 30-to-13 Mapping Matrix

| Mermaid.js Type | Coral Target Notation | Target Edition | Fidelity Tier | Transpiler Scope (Phase 1) | Notes / Structural Constraints |
| --- | --- | :---: | --- | --- | --- |
| **Flowchart** (`flowchart`/`graph`) | `@diagram flowchart` *(opt-in: `block`, `architecture`)* | `0.2.14` | **Direct (High)** | **In Scope (Top 5 #1)** | ISO 5807 core shapes map cleanly to `flowchart`; non-ISO shapes (e.g. cylinder `[(db)]`) emit classified loss in `flowchart` or preserve shape via opt-in `block`/`architecture` target. |
| **Sequence** (`sequenceDiagram`) | `@diagram uml-sequence` | `0.2.14` | **Direct (High)** | **In Scope (Top 5 #2)** | Coral saved-source grammar supports `participant`, `actor`, `-#>`, `->`, `-.->`, `[create]`, `[destroy]`, nested `alt`/`opt`/`loop`/`par`/`critical`/`break`, `activation`, `region`, `participants`, and `note`. |
| **Class** (`classDiagram`) | `@diagram uml-class` | `0.2.14` | **Direct (High w/ 3 grammar gaps)** | **In Scope (Top 5 #3)** | Coral `0.2.14` supports `class`, `interface`, `enum`, `group` (for `namespace`), all 4 visibilities (`+ - # ~`), relationship markers, and `firstLabel`/`secondLabel`. **Prerequisite `0.2.16` bugfix:** add `'inheritance'` to `KNOWN_RELATIONS_0214['uml-class']` (`candidate028.ts:1558`). **Saved-source gaps:** enum literal bodies, `abstract`/`static` modifiers, generic `<T>`/`~T~` types. |
| **ER** (`erDiagram`) | `@diagram erd` | `0.2.14` | **Direct (Very High)** | **In Scope (Top 5 #4)** | Coral `0.2.14` enabled Crow's Foot ERD natively: `entity`, `columns { name type [pk, fk, uk, null, not null] }`, and native Crow's Foot connectors (`\|\|--o{`, `\|\|..o{`, `\|\|-.-\|{`, etc.). |
| **State** (`stateDiagram-v2`/`stateDiagram`) | `@diagram uml-state` | `0.2.8` (Tier 1) | **Partial (Visual Gap!)** | **In Scope (Top 5 #5)** | Emits `@diagram uml-state` (edition `0.2.8`—NO `@coralVersion "0.2.14"` so `characterState028` accepts it!). Currently blocks SVG/visual editor (`scene.ts:116`) and lacks composite states, concurrency `--`, and `<<choice>>`/`<<fork>>`/`<<join>>` pseudostates. |
| **Architecture** (`architecture-beta`) | `@diagram architecture` or `@diagram infrastructure` | `0.2.14` | Structural Match | Deferred (Phase 2) | Coral `0.2.14` has rich `architecture` and `infrastructure` notations (groups, services, databases, queues, cloud providers). |
| **Block** (`block-beta`) | `@diagram block` | `0.2.14` | Partial | Deferred (Phase 2) | Coral `0.2.14` `block` has 10 shapes (`box`, `rounded`, `circle`, `oval`, `triangle`, `diamond`, `cylinder`, `pill`, `note`, `group`), but no explicit grid-column span layout (`columns N`, `:2`). |
| **C4** (`C4Context`..`C4Deployment`) | `@diagram architecture` | `0.2.14` | Strong Match | Deferred (Phase 2) | Coral `0.2.14` added `person`, `system`, `externalSystem`, `container`, `component`, `systemBoundary`, `containerBoundary`, `[technology: "..."]`, `[description: "..."]`. |
| **ZenUML** (`zenuml`) | `@diagram uml-sequence` | `0.2.14` | Structural Match | Deferred (Phase 2) | Same semantic target as `sequenceDiagram`, different block grammar. |
| **Gantt**, **Pie**, **Quadrant**, **Sankey**, **XY Chart**, **Radar**, **Treemap**, **Venn**, **Packet**, **Timeline**, **Kanban**, **User Journey**, **Mindmap**, **GitGraph**, **Requirement**, **Ishikawa**, **Use Case**, **Event Modeling**, **TreeView**, **Cynefin**, **Wardley** | *None (No Visual/Source Notation)* | — | **Refuse** | **Explicitly Refused** | Non-graph data charts, schedules, or unshipped Coral notations. Must fail closed with `mermaid.diagram.unsupported` naming the detected type and supported Top-5 list. |

> [!IMPORTANT]
> **Unused Coral Notations in Mermaid Mapping:** Coral's `bpmn`, `code`, `aiml`,
> `data-engineering`, `infrastructure`, and `sketch` notations have no 1:1
> counterpart among the Top-5 Mermaid types (though `architecture` and `block`
> serve as optional user-selected target notations for Mermaid `flowchart`
> diagrams).

---

## 5. Deep Nomenclature Mapping for the Top 5 Diagram Types

All Coral outputs target **Saved-Source Edition `0.2.14`** (`@diagram <type>` +
`@coralVersion "0.2.14"`) for Flowchart, Sequence, Class, and ER, and
**Saved-Source Edition `0.2.8`** (`@diagram uml-state`, omitting
`@coralVersion`) for Tier 1 State—NEVER legacy `@graph` graph-interchange
syntax. Every production below is verified against
`packages/language/spec/grammar-028.ebnf`, `candidate028.ts`, `connector028.ts`,
`successorSourceDisplay028.ts`, `characterState028.ts`, and
`edition0214.test.ts`.

### 5.0 Cross-Cutting Lexical, Escaping, Color, and Identity Rules (All 5 Types)

| Concept | Mermaid.js Nomenclature | Coral Saved-Source Nomenclature | Transformation & Edge-Case Rule |
| --- | --- | --- | --- |
| **Header & Edition** | `flowchart LR`, `sequenceDiagram`, `classDiagram`, `erDiagram`, `stateDiagram-v2` | `@diagram <type>` + `@coralVersion "0.2.14"` *(for Flowchart/Sequence/Class/ER)*; `@diagram uml-state` *(edition `0.2.8`, no `@coralVersion`, for Tier 1 State)* | Emit `@coralVersion "0.2.14"` for the 4 visual Top-5 types. Omit `@coralVersion` on Tier 1 `uml-state` because `candidate028.ts:1953-1956` attaches `metadata.custom.coralEdition`, which `characterState028.ts:45-46` rejects (`character.field.unsupported`). |
| **Comments** | `%% single line comment` | `// single line comment` | Optional preservation (`preserveComments: true`, default `false`); never silently drop `%%{init:...}%%` (single- or multi-line)—diagnose as `mermaid.directive.init.dropped`. |
| **YAML Frontmatter** | `---\ntitle: Foo\nconfig: ...\n---` | No top-level YAML frontmatter in saved source | Parse frontmatter before header detection; emit `mermaid.frontmatter.title.dropped` (`info`) / `mermaid.frontmatter.config.dropped` (`warning`). |
| **Accessibility Directives** | `accTitle: ...`, `accDescr: ...`, `accDescr { ... }` | No saved-source equivalent | Consume cleanly (never misparse as nodes) and emit `mermaid.accessibility.dropped` (`info`). |
| **Identifiers & Canonical Reserved-Word List** | Permits hyphens (`order-svc`), leading digits (`123`), spaces/backticks in quoted names, Unicode | Strict ASCII bare ID: `[A-Za-z_][A-Za-z0-9_]*` (dots reserved for group qualification) | Deterministic `sanitizeId(raw)`: replace invalid runs with `_`, trim trailing `_`, prefix `n_` if empty or starts with a digit, suffix `_id` if matching any of the **27 canonical Coral reserved words** (`layout`, `route`, `constraint`, `arrange`, `group`, `columns`, `attributes`, `operations`, `alt`, `else`, `opt`, `loop`, `par`, `and`, `critical`, `break`, `activation`, `region`, `participants`, `note`, `as`, `port`, `on`, `at`, `pinned`, `label`, `waypoint`), resolve collisions by looping `k = 2, 3, ...` (`_2`, `_3`, …) until free in scope. Preserve original text via `as "<raw>"` and emit `mermaid.id.normalized` (`info`). |
| **Strings, Control Chars & Escapes** | `<br>`, `<br/>`, `<br />`, `#quot;`, `#35;`, markdown strings `` "`...`" ``, tabs `\t` | Double-quoted strings with **`\"`, `\\`, `\n` ONLY** (`candidate028.ts:330-355` rejects `\t` literal AND `\t` escape, U+0000–U+001F except `\n`, U+007F–U+009F, U+2028/U+2029, and lone surrogates!) | Convert `<br\s*/?>` → `\n`; normalize literal `\t` → single ASCII space `' '` (`info` `mermaid.text.tab.normalized`); normalize U+2028/U+2029 → `\n`; decode safe numeric XML 1.0 entities `#NNN;` and standard HTML entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `#quot;`, `#35;`); strip markdown backtick wrapper `` "`...`" `` (preserving multiline content) with `mermaid.text.markdown.degraded` (`warning`) if formatting markers (`**`, `*`, `_`) appear; **reject** non-XML-1.0 scalars, other C0/C1 controls, and lone surrogates with `mermaid.text.invalid-scalar` (`error`). |
| **CSS Color Normalization** | `#RGB` (`#f9f`, `#333`), `#RRGGBB`, all 148 CSS named colors (`white`, `lightblue`, `pink`), `rgb(r,g,b)`, `rgba(...)` | Node `[style: "..."]` accepts ONLY 6-digit `#RRGGBB` or Coral's 14 named colors (`black`, `gray`, `red`, `orange`, `yellow`, `green`, `blue`, `purple`, `teal`, `coral`, `indigo`, `amber`, `rose`, `slate`) (`candidate028.ts:764-783`) | Deterministic **CSS Color Normalizer** (`lower/styles.ts`): expand `#RGB` → `#RRGGBB`, convert all standard CSS named colors and `rgb(r,g,b)` → `#RRGGBB`; drop alpha/unsupported colors (`rgba`, `#RRGGBBAA`, `hsl`, `transparent`, `none`) with `mermaid.style.color.unsupported` (`warning`). Only emit `dashed` when `stroke-dasharray` has a non-zero pattern (never for `0` or `none`). |
| **Label vs. ID (`as`)** | In Mermaid `state`/`participant`: `as` is label; in Coral `@graph`: `as` was ID | In Coral Saved-Source: **`<id> <kind> as "<label>"`** (`as` is ALWAYS rendered label; ID comes first!) | Emit `as "<label>"` whenever label differs from sanitized ID; emit `as ""` only for explicit empty label; never emit both `[label: "..."]` and `as "..."` on the same edge (`grammar-028.ebnf:237`). |

---

### 5.1 Type 1: Flowchart (`flowchart` / `graph`) → `@diagram flowchart` *(opt-in: `block`, `architecture`)*

> **Architectural Reality Check:** Developers use Mermaid `flowchart` both for
> ISO 5807 process flows and for system/block architecture diagrams containing
> cylinders `[(DB)]` and hexagons `{{API}}`. Coral's `flowchart` notation
> defines 8 ISO 5807 symbols and has no cylinder or hexagon symbol. The
> transpiler defaults to `flowchartTarget: 'flowchart'` and supports explicit
> `'block'` and `'architecture'` targets.

#### 5.1.1 Header & Orientation

| Mermaid.js Syntax | Coral `@diagram flowchart` / `architecture` | Coral `@diagram block` | Disposition |
| --- | --- | --- | --- |
| `flowchart TD` / `TB` / `graph TD` / `TB` | `layout [direction: DOWN]` | `layout [direction: DOWN]` | Exact |
| `flowchart BT` / `graph BT` | `layout [direction: UP]` | `layout [direction: UP]` | Exact |
| `flowchart LR` / `graph LR` | `layout [direction: RIGHT]` | `layout [direction: RIGHT]` | Exact |
| `flowchart RL` / `graph RL` | `layout [direction: LEFT]` | `layout [direction: LEFT]` | Exact |
| `flowchart` / `graph` (direction omitted; Mermaid defaults to `TB`/`DOWN`) | Omit `layout` (`flowchart` & `architecture` both default to `DOWN`) | **Emit `layout [direction: DOWN]`** (`blockNotation` defaults to `RIGHT` at `block.ts:9`!) | Exact |

#### 5.1.2 Node Shapes — Classic Bracket Forms & v11.3+ Expanded `@{ shape: ... }`

| Mermaid.js Classic | Mermaid.js v11.3+ `@{ shape: ... }` | Coral `@diagram flowchart` | Coral `@diagram block` (opt-in) | Coral `@diagram architecture` (opt-in) | Disposition (`flowchart` / `block` / `architecture`) |
| --- | --- | --- | --- | --- | --- |
| `A` / `A[text]` | `rect`, `proc`, `process` | `A process as "text"` | `A box as "text"` | `A service as "text"` | Exact / Exact / Exact |
| `A(text)` | `rounded`, `event` | `A process as "text"` (`warning` degraded) | `A rounded as "text"` | `A service as "text"` (`info` normalized) | Degraded / Exact / Normalized |
| `A([text])` | `stadium`, `terminal`, `pill` | `A terminal [variant: "start"\|"end"] as "text"` *(emit `[variant: "start"]` ONLY when this node is the unique 0-in-degree stadium node with >=1 outgoing edge, matching `flowchart.ts:159` `max: 1`; emit `[variant: "end"]` when >=1 incoming & 0 outgoing; otherwise `A terminal as "text"`)* | `A pill as "text"` | `A actor as "text"` (`info` normalized) | Exact / Exact / Normalized |
| `A{text}` | `diam`, `diamond`, `decision`, `question` | `A decision as "text"` | `A diamond as "text"` | `A gateway as "text"` (`info` normalized) | Exact / Exact / Normalized |
| `A[/text/]` / `A[\text\]` | `lean-r`, `lean-l`, `in-out`, `out-in` | `A io as "text"` (`info` if `lean-l`) | `A box as "text"` (`warning`) | `A queue as "text"` (`info`) | Exact / Degraded / Normalized |
| `A[[text]]` | `subproc`, `subprocess`, `framed-rectangle` | `A process [symbol: "flowchart-predefined"] as "text"` | `A box as "text"` (`warning`) | `A component as "text"` | Exact / Degraded / Exact |
| `A((text))` / `A(((text)))` | `circ`, `circle`, `sm-circ`, `dbl-circ`, `f-circ`, `framed-circle` | `A process [symbol: "flowchart-connector"] as "text"` (`warning` on `(((text)))`) | `A circle as "text"` (`warning` on `(((text)))`) | `A actor as "text"` (`warning`) | Exact / Exact / Degraded |
| *(expanded only)* | `doc`, `document`, `docs`, `documents`, `lin-doc`, `tag-doc` | `A document as "text"` (`info` on `docs`) | `A note as "text"` | `A storage as "text"` (`info`) | Exact / Exact / Normalized |
| *(expanded only)* | `comment`, `brace`, `brace-r`, `braces`, `notch-pent` | `A process [symbol: "flowchart-annotation"] as "text"` | `A note as "text"` | `A service [symbol: "arch-annotation"] as "text"` | Exact / Exact / Exact |
| `A[(text)]` | `cyl`, `cylinder`, `db`, `database`, `h-cyl`, `lin-cyl` | `A process as "text"` + **`warning`** `mermaid.flowchart.shape.degraded` (suggesting `block` or `architecture`) | `A cylinder as "text"` | `A database as "text"` | Degraded / **Exact** / **Exact** |
| `A{{text}}` | `hex`, `hexagon`, `prepare` | `A process as "text"` + `warning` | `A box as "text"` + `warning` | `A function as "text"` (`info`) | Degraded / Degraded / Normalized |
| `A>text]` | `flag`, `odd` | `A process as "text"` + `warning` | `A box as "text"` + `warning` | `A service as "text"` + `warning` | Degraded / Degraded / Degraded |
| `A[/text\]` / `A[\text/]` | `trap-b`, `trap-t`, `manual`, `priority` | `A process as "text"` + `warning` | `A box as "text"` + `warning` | `A service as "text"` + `warning` | Degraded / Degraded / Degraded |
| *(other v11.3+ shapes)* | `cloud`, `tri`, `oval`, `bolt`, `disk`, `hourglass`, `delay`, `fork`, etc. | `A process as "text"` + **`warning`** `mermaid.flowchart.shape.degraded` | `tri`→`triangle`, `oval`→`oval`, others→`box` + `warning` | `cloud`→`externalSystem`, `disk`→`storage`, `bolt`→`function`, others→`service` + `warning` | Degraded / Partial / Partial |

#### 5.1.3 Edges, Chaining, Fan-Out, and Visual-Safe vs. Portable Edge Styles

> [!WARNING]
> **Critical Coral `0.2.16` Display Boundary
> (`successorSourceDisplay028.ts:94-102`):**
> Coral's saved-source parser accepts edge `[style: "thick"]`, `[style:
> "#FF0000"]`, and `[style: "animated:forward"]`, **but** the visual display
> seam (`successorSourceDisplay028.ts:94-102`) currently throws
> `SuccessorDisplayCapabilityError028` (`render.capability.edge-rgb`,
> `edge-stroke-weight`, `edge-motion`), which blanks the editor canvas and fails
> `coral_render`!
> Therefore, the transpiler provides **`edgeStyleMode: 'visual-safe' |
> 'portable'`** (default **`'visual-safe'`**):
> - **`'visual-safe'` (default):** Emits only visually renderable edge forms
>   (`->`, `--`, `-.->`, `-.-`, `<->`, `-o`) and degrades `==>`, `===`,
>   `linkStyle` color/weight, and `@{ animate: true }` with explicit `warning`
>   diagnostics so every converted flowchart renders immediately in the Editor
>   and `coral_render`!
> - **`'portable'`:** Emits full Coral portable `[style: "thick"]`, `[style:
>   "#RRGGBB"]`, `[style: "animated:forward"]`, and Stage 4B honestly sets
>   `visualRenderable: false` + `coral.edge-style.visual-unavailable` (`info`).

| Mermaid.js Syntax | Coral `0.2.14` (`visual-safe` default) | Coral `0.2.14` (`portable`) | Disposition |
| --- | --- | --- | --- |
| `A --> B` / `A ---> B` (1–6 dashes) | `A -> B` / `A --> B` (clamp >6 to 6 w/ `info`) | Same | Exact |
| `A --- B` (open link) | `A -- B` | Same | Exact |
| `A -.-> B` / `A -..-> B` | `A -.-> B` *(NEVER also put `dashed` in `style:`!)* | Same | Exact |
| `A -.- B` (dashed open link) | `A -.- B` | Same | Exact |
| `A <--> B` | `A <-> B` | Same | Exact |
| `A <-.-> B` (dashed bidirectional) | `A <-> B [style: "dashed"]` *(Coral `connector028.ts:64` has no `<-.->` operator; `[style: "dashed"]` IS supported by `successorSourceDisplay028`!)* | Same | Exact |
| `A ==> B` / `A === B` / `A <==> B` | `A -> B` / `A -- B` / `A <-> B` + **`warning`** `mermaid.flowchart.edge-weight.degraded` | `A -> B [style: "thick"]` / `A -- B [style: "thick"]` / `A <-> B [style: "thick"]` (`visualRenderable: false`) | Degraded (`visual-safe`) / Exact (`portable`) |
| `A --o B` / `A -.-o B` / `A ==o B` | `A -o B` / `A -.-o B` / `A -o B` (+ weight warning for `==o`) | Same (`==o` → `A -o B [style: "thick"]`) | Exact / Degraded |
| `A o--o B` / `A o-.-o B` | **`A -o B [firstEnd: circle]`** / **`A -.-o B [firstEnd: circle]`** *(NEVER `A -- B [firstEnd: circle, secondEnd: circle]` — `candidate028.ts:1037` rejects `secondEnd: circle` on `--` with `coral.syntax.connector.end-conflict`!)* | Same | Exact |
| `A --x B` / `A x--x B` / `A -.-x B` / `A ==x B` | `A -- B` / `A -.- B` + **`warning`** `mermaid.flowchart.marker.cross.degraded` | Same | Degraded |
| `A ~~~ B` (invisible layout edge) | **Omitted** + **`warning`** `mermaid.flowchart.edge.invisible.dropped` | Same | Dropped |
| Edge labels: `A -->\|text\| B`, `A -- text --> B`, `A -- text --- B`, `A -. text .-> B`, `A -. text .- B`, `A == text ==> B`, `A == text === B` | `A -> B as "text"` (preserving arrow/open/dashed style) | Same | Exact |
| Chained `A --> B --> C` & Fan-out `A & B --> C & D` | Desugared in source order to binary edges (`A -> C`, `A -> D`, `B -> C`, `B -> D`) | Same | Exact |
| v11.3+ Edge ID & Animation: **`A e1@--> B`** + `e1@{ animate: true }` (or `e1@{ animation: fast\|slow }`, which implies `animate: true`) | `e1 = A -> B` + **`warning`** `mermaid.flowchart.edge-animation.degraded` | `e1 = A -> B [style: "animated:forward"]` (`visualRenderable: false`; `fast`/`slow` speed → `info`) | Degraded (`visual-safe`) / Exact (`portable`) |

#### 5.1.4 Subgraphs & Scoping

| Mermaid.js Construct | Coral `0.2.14` Construct | Critical Rule |
| --- | --- | --- |
| `subgraph sg1 [Backend] ... end` / `subgraph sg1` (bare ID) / `subgraph "Backend"` / `subgraph Backend Services` (bare multi-word title) | `sg1 group as "Backend" { ... }` / `sg1 group { ... }` / `backend_services group as "Backend Services" { ... }` | Exact |
| Nested subgraphs | Nested `outer group { inner group { ... } }` (in `architecture` target: `systemBoundary` / `containerBoundary` or `group`) | Exact |
| **All edges involving nodes inside subgraphs** | **ALWAYS dot-qualified at root scope:** `backend.api -> backend.sub`, `check -> backend.api` | **CRITICAL:** Because Stage 3 emits all edges at document root scope, **every** grouped node endpoint MUST be dot-qualified (`candidate028.ts:1965` cannot resolve bare child IDs from root scope!). |
| Node referenced inside two disjoint subgraphs | Hoist to Lowest Common Ancestor (LCA) group + **`warning`** `mermaid.flowchart.subgraph.reparented` | Deterministic & valid |
| Edge targeting subgraph ID (`X --> sg1`) | `X -> sg1` (Coral edges accept group IDs directly) | Exact |
| Per-subgraph `direction LR` | **`warning`** `mermaid.flowchart.subgraph-direction.dropped` (Coral `layout` is document-level only) | Dropped |

#### 5.1.5 Styling & Directives

| Mermaid.js Construct | Coral `0.2.14` Construct | Disposition |
| --- | --- | --- |
| `style A fill:#f9f,stroke:#333,stroke-width:4px,stroke-dasharray: 5 5` | `A process [style: "fill: #ff99ff; stroke: #333333; thick; dashed"]` (CSS Color Normalizer expands `#RGB` / named colors / `rgb(...)` → `#RRGGBB`; `stroke-width` >= 3px → `thick`; non-zero `stroke-dasharray` → `dashed`; drop unsupported CSS props like `color`, `rx`, `font-size` with `info`) | Partial (visually renderable via `coralStyle0214`!) |
| `classDef hot fill:#fee2e2,stroke:#dc2626` + `class A,B hot` / `A:::hot` | Inline resolved `classDef` properties onto target nodes' `[style: "..."]` (later `style` overrides `classDef`) | Partial (visually renderable!) |
| `linkStyle 0,1 stroke:#f00,stroke-width:3px` / `linkStyle default ...` | In `'visual-safe'`: emit `mermaid.flowchart.edge-color.degraded` / `edge-weight.degraded` (`warning`). In `'portable'`: apply normalized `#RRGGBB` / `thick` to target edges (`visualRenderable: false`). | Degraded (`visual-safe`) / Partial (`portable`) |
| `click A "https://..." "Tooltip"` | Omitted + **`warning`** `mermaid.flowchart.click.dropped` | Dropped |

---

### 5.2 Type 2: Sequence Diagram (`sequenceDiagram`) → `@diagram uml-sequence`

#### 5.2.1 Participants, Lifelines & Shared Identity Rule

> **Coral `0.2.16` Identity Invariant (`successorSourceProjection028.ts:294,
> 384-439`):** In `@diagram uml-sequence`, participants, messages, notes,
> activations, regions, fragments, and participant groups share **one flat
> identity namespace**. Therefore, all participant IDs are registered FIRST, and
> synthetic IDs (`msg_1`, `msg_2`, …, `box_1`, …) skip any ID already held by a
> participant! Using `msg_N` preserves 100% backward compatibility with existing
> `packages/mcp-server/test/convert.test.ts`.

| Mermaid.js Syntax | Coral `0.2.14` Syntax | Disposition |
| --- | --- | --- |
| `participant A` / `participant A as Alice` / `actor U as End User` | `A participant` / `A participant as "Alice"` / `U actor as "End User"` | Exact |
| Implicit participant (including unquoted multi-word names `Alice->>Bob Smith: hi`) | Hoist `Alice participant`, `Bob_Smith participant as "Bob Smith"` in first-appearance order before timeline | Exact |
| `participant A@{ "type": "database" }` (v11 typed participants) | `A participant` + **`warning`** `mermaid.sequence.participant-type.degraded` | Degraded |
| `box Purple Backend ... end` / `box transparent ... end` / `box #eef ... end` / `box ... end` (no label) | Emit participants in declared order + root declaration `box_1 = participants api, db [label: "Backend"]` (omit `[label: ...]` if unlabeled; drop non-transparent box color with `info` `mermaid.sequence.box-color.dropped`) | High fidelity |
| `create participant W as Worker` / `create actor U as User` followed by `A->>W: init` | **Pre-declare** `W participant as "Worker"` (or `U actor as "User"`) so alias and `actor` kind are preserved (`candidate028.ts:2226-2231` would otherwise synthesize untyped `W participant`), and emit `msg_N = A -.-> W [create] as "init"` at root timeline. *(Normalize solid `->>` to dashed open `-.->` with `info` `mermaid.sequence.create-arrow.normalized`. If `create` occurs inside a fragment, drop `[create]` with `warning` `mermaid.sequence.create.root-only.dropped` because `successorSourceProjection028.ts:323` requires root timeline!)* | High fidelity |
| `destroy W` followed by `A->>W: close` | Emit `msg_N = A -#> W [destroy] as "close"` at root timeline. *(CRITICAL checks: if `destroy W` occurs inside a fragment, or if the following message is sent BY `W` rather than TO `W`, or if `W` is used after destruction, emit `warning` `mermaid.sequence.destroy.unsupported.dropped` and drop `[destroy]` rather than destroying the wrong participant or failing projection!)* | High fidelity |

#### 5.2.2 Messages & Arrows

| Mermaid.js Arrow | Mermaid Meaning | Coral `0.2.14` Operator | Semantic Mapping & Disposition |
| --- | --- | --- | --- |
| `A->>B: msg` | Solid sync call | `A -#> B as "msg"` | **Exact** |
| `A-->>B: msg` | Dashed return/reply | `A -.-> B as "msg"` | **Exact** |
| `A-)B: msg` | Solid async open arrow | `A -> B as "msg"` | **Exact** |
| `A--)B: msg` | Dashed async open arrow | `A -.-> B as "msg"` + `info` `mermaid.sequence.arrow.normalized` | **Normalized** |
| `A->B: msg` / `A-->B: msg` | Solid/dashed arrowless line | `A -> B` / `A -.-> B` + **`warning`** `mermaid.sequence.arrow.degraded` | **Degraded** |
| `A-xB: msg` / `A--xB: msg` | Solid/dashed cross (lost/failed) | `A -> B` / `A -.-> B` + **`warning`** `mermaid.sequence.arrow.cross.degraded` | **Degraded** |
| `A<<->>B: msg` / `A<<-->>B: msg` | Bidirectional sync/async | `A -#> B` / `A -.-> B` + **`warning`** `mermaid.sequence.arrow.bidirectional.degraded` | **Degraded** |
| `A-\|>B` / `A--\|>B` / `A-\|)B` / `A--\|)B` | Mermaid v11 stick/half arrows | `A -#> B` / `A -.-> B` + **`warning`** `mermaid.sequence.arrow.degraded` | **Degraded** |
| `wrap:` / `nowrap:` message/note text prefix | Mermaid text wrapping control | Strip prefix + **`warning`** `mermaid.sequence.text-wrap.dropped` | **Dropped** |

#### 5.2.3 Activations, Fragments, Regions, Notes, and Metadata

| Mermaid.js Construct | Coral `0.2.14` Construct | Disposition & Constraints |
| --- | --- | --- |
| `activate P` / `deactivate P` & `+`/`-` arrow modifiers (properly nested inside one lexical container, not wrapping a `[destroy]` on `P`) | `activation P { ... }` | **Exact** (see `02` §4 Stage 2C for container-scoped sibling-item interval algorithm, pre-message `activate P`, and equal-span tie-breaking) |
| Interleaved activations (`activate A`, `activate B`, `deactivate A`, `deactivate B`), cross-fragment activations, or activation wrapping `[destroy]` on `P` | Drop conflicting activation wrapper (preserve all messages) + **`warning`** `mermaid.sequence.activation.non-nested.dropped` | **Fail-safe / Classified loss** |
| `alt g1 ... else g2 ... end` | `alt "g1" { ... } else "g2" { ... }` | **Exact** (recursive nesting supported; empty `else` guard → `"else"` + `info`; 1-branch `alt` → `opt "g1"` + `info`; empty operand → drop empty operand or emit `warning` `mermaid.sequence.fragment.empty-operand.dropped` so `successorSequenceDisplay028.ts:57` never rejects!) |
| `opt guard ... end` / `break guard ... end` | `opt "guard" { ... }` / `break "guard" { ... }` | **Exact** (empty guard → `"optional"`/`"break"` + `warning`) |
| `loop [guard] ... end` | `loop "guard" { ... }` or `loop { ... }` | **Exact** |
| `par [g1] ... and [g2] ... end` | `par "g1" { ... } and "g2" { ... }` | **Exact** (1-branch `par` → `region` + `warning`) |
| `critical [guard] ... [option d ... ] end` | `critical "guard" { ... }` (Mermaid `option d` sub-clauses lowered to nested `opt "d" { ... }` + **`warning`** `mermaid.sequence.critical-option.degraded`) | **Exact / Degraded** |
| `rect rgb(...) ... end` | `region { ... }` + `info` `mermaid.sequence.rect-color.dropped` | **Partial** |
| `Note over A[,B]: text` / `Note left\|right of A: text` | `note "text" on A[, B]` (`left of`/`right of` emit `info` `mermaid.sequence.note-side.degraded`) | **Exact / Minor info** |
| `autonumber`, `link`/`links`, `properties`, `details` | Omitted + **`warning`** `mermaid.sequence.autonumber.dropped` / `metadata.dropped` | **Dropped** |

---

### 5.3 Type 3: Class Diagram (`classDiagram`) → `@diagram uml-class`

> [!IMPORTANT]
> **Prerequisite Coral `0.2.16` Bugfix (`candidate028.ts:1558`):**
> In Coral `release/0.2.16`, `KNOWN_RELATIONS_0214['uml-class']` lists
> `'generalization'` and accidentally omits `'inheritance'`, whereas `uml.ts:15`
> (`umlClassNotation.edgeStyles`) and `umlClass028.ts:14` use `'inheritance'`.
> Under `@coralVersion "0.2.14"`, `[inheritance]` currently triggers `warning`
> `coral.relation.unknown`, which blocks `projectInstalledSourceToSuccessor028`.
> Phase 1B includes a 1-line Coral bugfix adding `'inheritance'` to
> `KNOWN_RELATIONS_0214['uml-class']` so `[inheritance]` projects cleanly with
> zero warnings across all editions.

#### 5.3.1 Header, Direction, Classifiers & Namespaces

| Mermaid.js Syntax | Coral `0.2.14` Syntax | Disposition |
| --- | --- | --- |
| `classDiagram` / `classDiagram-v2` + `direction TB\|BT\|LR\|RL` | `@diagram uml-class` + `@coralVersion "0.2.14"` + `layout [direction: DOWN\|UP\|RIGHT\|LEFT]` | Exact |
| `class BankAccount` / `class BankAccount["Bank Account"]` / `` class `My Class` `` | `BankAccount class` / `BankAccount class as "Bank Account"` / `My_Class class as "My Class"` | Exact |
| `<<interface>>` | `Shape interface { ... }` | Exact |
| `<<enumeration>>` / `<<enum>>` | `Status enum` *(literal bodies dropped with `warning` `mermaid.class.enum-literals.dropped` — see §5.3.4)* | Partial |
| `<<abstract>>` | `Animal class` + **`warning`** `mermaid.class.modifier.abstract.dropped` | Degraded |
| Custom stereotypes (`<<service>>`, `<<DTO>>`) | `Foo class [description: "<<service>>"]` + `info` `mermaid.class.stereotype.degraded` | Degraded |
| Generics `class List~T~`, `class Map~K, V~` | `List class as "List<T>"` / `Map class as "Map<K, V>"` + **`warning`** `mermaid.class.generic.degraded` | Degraded |
| `namespace BaseShapes { class Triangle ... }` | **Native Coral `group`:** `BaseShapes group { Triangle class { ... } }` with dot-qualified references `BaseShapes.Triangle` *(verified in `candidate028.ts:1537`, `interpretation028.ts:127`, `containerGeometry028.ts:11`!)* | **Exact** |

#### 5.3.2 Attributes & Operations (Compartments)

| Mermaid.js Syntax | Coral `0.2.14` Syntax | Transformation Rule |
| --- | --- | --- |
| Inside `{ ... }` or standalone `BankAccount : +String owner` | Merged into at most one `attributes { ... }` and one `operations { ... }` per classifier | Exact |
| `+`, `-`, `#`, `~` visibilities | `+`, `-`, `#`, `~` on both attributes and operations (Edition `0.2.14` N6c-1) | Exact |
| Type-first `+String owner` or colon `+owner: String` | `+ owner: String` (normalized to Coral `<vis> <name>: <Type>`) | Exact |
| Omitted visibility (`String owner`) / omitted type (`+owner`) | Default visibility `+` (`info` `mermaid.class.visibility.defaulted`); default type `Any` (`warning` `mermaid.class.type.defaulted`) | Normalized / Degraded |
| Operations `+deposit(Decimal amount) Boolean` / `+deposit(amount: Decimal): Boolean` | `+ deposit(amount: Decimal): Boolean` (untyped param → `amount: Any` + `warning`) | Exact / Degraded |
| Generic / array member types (`List~Order~`, `Map~K, V~`, `String[]`) | Sanitized to ASCII bare identifier (`List_Order`, `Map_K_V`, `String_Array`) + **`warning`** `mermaid.class.member-type.sanitized` (`candidate028.ts:1328` requires `isBareId(valueType)`) | Degraded |
| Member classifiers `*` (abstract), `$` (static) | Stripped + **`warning`** `mermaid.class.member-modifier.dropped` | Dropped |

#### 5.3.3 Relationships & Multiplicities (Canonical Polarity)

| Mermaid.js Relationship | UML Semantics | Canonical Coral `0.2.14` Syntax | Disposition |
| --- | --- | --- | --- |
| `Parent <\|-- Child` / `Child --\|> Parent` | Inheritance | `Child -\|> Parent [inheritance]` *(requires `0.2.16` `KNOWN_RELATIONS_0214` fix)* | Exact |
| `Iface <\|.. Impl` / `Impl ..\|> Iface` | Realization | `Impl -.\|> Iface [realization]` | Exact |
| `Whole *-- Part` / `Part --* Whole` | Composition | `Whole -- Part [composition, firstEnd: filledDiamond]` *(single canonical spelling; `secondEnd: none` is implicit on `--`)* | Exact |
| `Whole o-- Part` / `Part --o Whole` | Aggregation | `Whole -- Part [aggregation, firstEnd: diamond]` | Exact |
| `A --> B` / `B <-- A` / `A -- B` | Association | `A -> B [association]` / `A -- B [association]` | Exact |
| `A ..> B` / `B <.. A` / `A .. B` | Dependency / Dashed link | `A -.-> B [dependency]` / `A -.- B [association]` | Exact |
| `A <--> B` / `A <..> B` | Bidirectional Association / Dependency | `A <-> B [association]` / `A <-> B [dependency, style: "dashed"]` | Exact |
| Symmetric `A <\|--\|> B`, `A *--* B`, `A o--o B` | Two-way UML markers | `A -\|> B [inheritance, firstEnd: triangle]` / `A -#<> B [composition, firstEnd: filledDiamond]` / `A -<> B [aggregation, firstEnd: diamond]` *(never `secondEnd` on `--`!)* | Exact |
| `A ()-- B` / `B --() A` | Lollipop Interface | `A -- B [firstEnd: circle]` + `info` `mermaid.class.lollipop.degraded` | Degraded |
| Generic endpoints `List~Order~ --\|> Collection~Order~` | Relationship on generic class | Strip `~...~` to resolve target classifier ID (`List -\|> Collection [inheritance]`) | Exact (generic warning already emitted on classifier) |
| Multiplicity + Label: `Customer "1" --> "0..*" Order : places` | Role/Multiplicity + Label | `Customer -> Order [association, firstLabel: "1", secondLabel: "0..*"] as "places"` | Exact |
| `note "..."` / `note for Foo "..."` | Class note | Omitted + **`warning`** `mermaid.class.note.dropped` | Dropped |
| `style`, `cssClass`, `link`, `callback` | Styling / links | Normalize CSS colors onto node `[style: "..."]`; drop `link`/`callback` with `warning` | Partial |

#### 5.3.4 Explicit Coral `0.2.14` Saved-Source Gaps for `uml-class`
1. **Enum literal bodies** (`literals { ... }`) are not yet admitted in
   `grammar-028.ebnf`.
2. **Classifier & member modifiers** (`abstract`, `static`, `readonly`,
   `derived`) are not yet admitted in `grammar-028.ebnf`.
3. **Parameterized/generic types** (`List<T>`, `String[]`) are rejected by
   `candidate028.ts:1328` (`isBareId`).

---

### 5.4 Type 4: Entity Relationship Diagram (`erDiagram`) → `@diagram erd`

#### 5.4.1 Header, Orientation & Entities

| Mermaid.js Syntax | Coral `0.2.14` Syntax | Disposition |
| --- | --- | --- |
| `erDiagram` + optional `direction TB\|BT\|LR\|RL` | `@diagram erd` + `@coralVersion "0.2.14"` + optional `layout [direction: ...]` | Exact |
| `CUSTOMER` / `LINE-ITEM` / `"Order Item"` / `p["Person"]` / `ENTITY {}` (empty block) | `CUSTOMER entity` / `LINE_ITEM entity as "LINE-ITEM"` / `Order_Item entity as "Order Item"` / `p entity as "Person"` / `ENTITY entity` | Exact |

#### 5.4.2 Entity Columns / Attributes (Token-Order Inversion)

| Mermaid.js Syntax | Coral `0.2.14` Syntax | Transformation Rule |
| --- | --- | --- |
| `uuid id PK` / `varchar(255) email UK` / `int order_id PK, FK` | `columns { id uuid [pk]\n email varchar(255) [uk]\n order_id int [pk, fk] }` | Invert `<type> <name> [KEYS]` → `<name> <type> [flags]`. Lowercase `PK`/`FK`/`UK`. |
| `string[] tags` / `List~int~ ids` / `double-precision amount` / `string first-name` | Sanitize `[]` → `_array`, `~T~` → `_T`, hyphens in column name/type → `_` (`candidate028.ts` requires bare ASCII identifiers for names/base types) + **`warning`** `mermaid.er.column-type.sanitized` / `mermaid.id.normalized` | Safe |
| Duplicate column name within one entity | Keep first occurrence, drop duplicate + **`warning`** `mermaid.er.column.duplicate.dropped` (`candidate028.ts:2134` rejects duplicate columns with `coral.erd.column.duplicate`!) | Fail-safe |
| `int id PK "Primary key"` (trailing comment) | `id int [pk]` + **`warning`** `mermaid.er.column-comment.dropped` | Dropped |

#### 5.4.3 Relationships & Crow's Foot Cardinality

| Mermaid.js Left Marker | Mermaid.js Right Marker | Real Mermaid.js English Aliases | Coral `0.2.14` Operator Side | Canonical GraphIR Marker |
| --- | --- | --- | --- | --- |
| `\|\|` | `\|\|` | `only one`, `1` | `\|\|` | `one` |
| `\|o` or `o\|` | `o\|` or `\|o` | `zero or one`, `one or zero` | `\|o` (left) / `o\|` (right) | `zero-or-one` |
| `}\|` | `\|{` | `one or more`, `one or many`, `1+` | `}\|` (left) / `\|{` (right) | `one-or-many` |
| `}o` | `o{` | `zero or more`, `zero or many`, `many`, `0+` | `}o` (left) / `o{` (right) | `zero-or-many` |

| Mermaid.js Line & Label | Coral `0.2.14` Syntax | Disposition |
| --- | --- | --- |
| `--` (`to`) identifying / `..` (`optionally to`) non-identifying | `--` / `..` (`parseCrowsFootConnector0214` native!) | Exact |
| `: places` / `: "places order"` / `: ""` / bare trailing `:` | `as "places"` / `as "places order"` / omit `as` if empty | Exact |
| `style` / `classDef` / `class` | CSS-normalized `[style: "..."]` on entity node | Partial |

---

### 5.5 Type 5: State Diagram (`stateDiagram-v2` / `stateDiagram`) → `@diagram uml-state`

> [!CAUTION]
> **Critical Coral `0.2.16` Capability Boundaries:**
> 1. **Visual/SVG Boundary (`scene.ts:116`):** `@diagram uml-state` throws
>    `render.capability.character-only-edition` for SVG and visual editor
>    display (`visualRenderable: false`).
> 2. **Edition Boundary (`characterState028.ts:45-46`):** Emitting
>    `@coralVersion "0.2.14"` attaches `metadata.custom.coralEdition`, which
>    **breaks** `characterState028` (`character.field.unsupported`). Therefore
>    Tier 1 emits **`@diagram uml-state` (Edition `0.2.8`, no `@coralVersion`
>    directive)**.
> 3. **Character-Preview Bounds (`characterState028.ts:48-117`):** Valid flat
>    `@diagram uml-state` documents parse cleanly under
>    `parseInstalledDocument028` even when they omit `[*]`, include
>    self-transitions, or exceed character layout limits—but `characterState028`
>    enforces stricter envelope bounds (**exactly 1** `initial` with 1 outgoing
>    & 0 incoming edge, **exactly 1** `final` with >=1 incoming & 0 outgoing
>    edge, **1–8** simple states [`nodes.length` in 3..10], **2–20**
>    transitions, no self-transitions, and all nodes on an initial-to-final
>    path). Stage 4B delegates directly to `stateCharacterUsesChain028(display)`
>    and reports `characterRenderable: true | false` honestly!

#### 5.5.1 Nomenclature Mapping (`stateDiagram-v2` → `@diagram uml-state`)

| Mermaid.js Syntax | Coral Tier 1 (`@diagram uml-state`, Edition `0.2.8`) | Coral Tier 2 (Proposed Visual `0.2.17`) | Disposition (Tier 1) |
| --- | --- | --- | --- |
| `stateDiagram-v2` / `stateDiagram` | `@diagram uml-state` *(no `@coralVersion`)* | `@diagram uml-state` + `@coralVersion "0.2.17"` | Exact (source) |
| `[*] --> A` (one or multiple) | Single `start initial` (allocate `start_2` if `start` taken) + `start -> A` | Same | Exact *(>1 outgoing edge sets `characterRenderable: false` + `info`)* |
| `Done --> [*]` (one or multiple) | Single `finish final` (allocate `finish_2` if `finish` taken) + `Done -> finish` | Same | Exact |
| `Idle` / `state Idle` / `state "Waiting" as wait` | `Idle state` / `wait state as "Waiting"` | Same | Exact |
| `s1 : line 1` (+ optional second `s1 : line 2`) | If `s1` has no alias: `s1 state as "line 1\nline 2"` (`info` `mermaid.state.description.as-label`); if `s1` already has an alias: drop description + **`warning`** `mermaid.state.description.degraded` *(never emit `[description: ...]` in Edition `0.2.8`!)* | `s1 state [description: "..."]` | Normalized / Degraded (Tier 1) |
| `Idle --> Running : start` / self-transition `Idle --> Idle : tick` | `Idle -> Running as "start"` / `Idle -> Idle as "tick"` *(self-transition sets `characterRenderable: false` + `info`)* | Same | Exact (source) |
| `direction LR\|RL\|TB\|BT` | Omitted + **`warning`** `mermaid.state.direction.dropped` | `layout [direction: ...]` | Dropped (Tier 1) |
| `state Active { ... }` (composite) / `--` (concurrency) | Flatten inner states with **`warning`** `mermaid.state.composite.flattened`; drop `--` with `mermaid.state.concurrency.dropped` | `Active group { ... }` | Degraded / Dropped (Tier 1) |
| `state c <<choice>>` / `<<fork>>` / `<<join>>` | `c state` + **`warning`** `mermaid.state.pseudostate.degraded` | `c choice` / `fork` / `join` | Degraded (Tier 1) |
| `note left\|right of S : text` / multiline `note ... end note`, `classDef`/`class`/`style`/`:::` | Omitted + **`warning`** `mermaid.state.note.dropped` / `mermaid.state.style.dropped` | `note` / `[style: "..."]` | Dropped (Tier 1) |
