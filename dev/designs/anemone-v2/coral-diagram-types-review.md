# Coral Diagram Types — Visual Design & Symbol Audit (Edition 0.2.14)

**Scope:** Exhaustive visual-communication review of all **13 installed Coral
notations** (`12` visual in edition `0.2.14`, plus `1` character-only:
`uml-state`), audited against hand-crafted **Figma / IcePanel / Linear**
(precision register) and **Excalidraw** (tactile sketch register) quality
bars.

---

## Executive Diagnosis: Why Current Anemone (v1) Falls Short

Coral's **layout and routing engine** (`0.2.14` — `96.91/100`, `0` hard
defects across 12 benchmarks) is already ahead of Mermaid, Graphviz, and
PlantUML structurally. Its **visual presentation layer** (`anemone` via
`parrotfishCore.ts` + `projectScene028.ts` + `shapes/index.ts`), however,
still reads as an auto-generated tool rather than a designer-crafted artifact:

1. **Rainbow Pastel Soup (`TONE_STYLES`):** Eleven Tailwind-50 fills paired
   with saturated 700-weight borders (`#fff1f2/#be123c`, `#f0fdfa/#0f766e`,
   `#eef2ff/#3730a3`, `#fffbeb/#b45309`, `#f5f3ff/#6d28d9`, `#f0f9ff/#0369a1`,
   `#ecfdf5/#047857`) fire simultaneously via a single flat regex
   (`classifyAnemoneTone`) regardless of diagram type.
2. **The 3.5px Left Accent Stripe Cliché:** `parrotfishCore.ts` appends a
   3.5px vertical accent pill inside every rectangle node (`rn?.shapeId ===
   'rectangle'`), a dated Bootstrap-alert pattern that competes with text and
   fractures rounded corners.
3. **Starved Iconography vs. Unreadable Clipart Contours:** `glyphs/index.ts`
   has only **8 glyphs total** (`globe`, `api`, `cog`, `shield`, `user`,
   `gear`, `code`, `hand`), while `shapes/index.ts` forces multi-line node
   text *inside* complex geometric clipart (`brain`, `neural-net`,
   `dashboard`, `gear`, `chip`, `cube`, `funnel`, `wave`, `lake`, `warehouse`,
   `actor`). In `neural-net` and `dashboard`, interior lines literally cross
   behind node captions.
4. **Zero Surface Elevation or Micro-Craft:** `projectScene028.ts` emits flat
   `<path>`, `<line>`, `<text>`, and sharp `<rect>` label backgrounds — no
   diffused shadows, no dot-grid canvas option, no rounded pill badges for
   `[technology]` / edge labels, and no anchored container header tabs.
5. **Monolithic Typography:** Primary titles, `[technology]` metadata, and
   descriptions share the exact same `14px` font size and weight (differing
   only by ink color), flattening scan hierarchy.
6. **Notation-Blind Styling:** One global node classifier and 3 edge colors
   are applied identically across C4 Architecture, Crow's Foot ERD, BPMN,
   AI/ML, UML Class, and Sketch whiteboards.

---

## Summary Scorecard Across All 13 Diagram Types

| # | Diagram Type | Status (0.2.14) | Symbols | Anemone v1 Craft Score | Primary Visual Gap | Target Register |
| --- | --- | --- | ---: | :---: | --- | --- |
| 1 | `architecture` | Visual | 17 | 2.6 / 5 | C4 cards lack 3-tier typography, icon badges, and clean trust-zone headers | Precision (Figma / IcePanel) |
| 2 | `infrastructure` | Visual | 19 | 2.4 / 5 | Clipart shapes (`chip`, `cube`, `brain`, `dashboard`) hurt legibility; provider tinting feels heavy | Precision (Cloud / AWS-GCP-Azure) |
| 3 | `aiml` | Visual | 17 | 2.1 / 5 | Worst clipart-over-text collisions (`neural-net`, `brain`, `gear`, `chat-bubble`) | Precision (Modern AI Canvas) |
| 4 | `data-engineering` | Visual | 14 | 2.2 / 5 | Raw `funnel`, `wave`, `pipe`, `lake`, `warehouse`, `dashboard` outlines look dated | Precision (Data Lineage) |
| 5 | `erd` | Visual | 7 | 2.8 / 5 | Plain divider lines; missing shaded entity header band, PK/FK badges, mono type alignment | Precision (Schema / DBML / Figma) |
| 6 | `uml-class` | Visual | 3 | 2.8 / 5 | Flat 3-compartment boxes; no stereotype pills, header shading, or visibility badges | Precision (Technical Spec) |
| 7 | `uml-sequence` | Visual | 2 | 2.3 / 5 | Anemone only swaps 6 hex values; flat participants, weak activation bars & `alt`/`loop` tabs | Precision (Sequence Studio) |
| 8 | `bpmn` | Visual | 14 | 3.0 / 5 | Event rings & gateways work well structurally, but pools/lanes & task badges need polish | Precision (Process Studio) |
| 9 | `flowchart` | Visual | 8 | 3.1 / 5 | Heavy saturated decision/terminal borders; missing soft pill terminals & clean branch tags | Precision (Clean Editorial) |
| 10 | `block` | Visual | 11 | 2.9 / 5 | Generic geometric boxes; needs restrained editorial surface hierarchy & subtle elevation | Precision (Editorial Diagrams) |
| 11 | `code` | Visual | 8 | 2.7 / 5 | Modules/classes/functions lack monospace symbol badges (`fn`, `cls`, `mod`, `type`) | Precision (IDE / Code Graph) |
| 12 | `sketch` | Visual | 7 | 2.0 / 5 | Anemone uses clean `hifi` base + corporate teal! Completely misses Excalidraw's warm tactile soul | **Tactile Sketch (Excalidraw)** |
| 13 | `uml-state` | **Char-only** | 0 visual | N/A | **Major gap:** State machines are a top-5 developer diagram type and need visual symbols | Precision (Statechart) |

---

## Detailed Notation-by-Notation Review & Upgrade Plan

### 1. `architecture` (C4 & System Architecture) — Flagship Showcase Priority #1
- **Current symbols (17):** `arch-service` (`web`, `api`, `worker`,
  `gateway`), `arch-database`, `arch-queue`, `arch-external-api`,
  `arch-actor`, `arch-load-balancer`, `arch-container`, `arch-cdn`,
  `arch-storage`, `arch-function`, `arch-annotation`, plus `0.2.14` C4 types:
  `arch-system`, `arch-external-system`, `arch-deployable`, `arch-component`,
  `arch-system-boundary`, `arch-container-boundary`.
- **What fails visually today:**
  - `arch-actor` uses a tall stick figure (`actor` shape) that looks jarring
    beside modern rounded cards.
  - `[technology]` and `[description]` render as flat stacked text with no
    pill badge, size contrast, or visual rhythm.
  - `arch-system-boundary` and `arch-container-boundary` are dashed wireframes
    with centered bare text.
  - Every node type gets a different pastel box color, turning realistic 10–15
    node C4 views into visual clutter.
- **Anemone v2 upgrade (Figma / IcePanel bar):**
  - **Elevated Neutral Cards (`#FFFFFF` / `#161E2E`)** with a **28×28 icon
    squircle** top-left (person silhouette icon, server/container icon,
    cylinder DB icon, queue streams icon, globe/shield gateway icon).
  - **3-Tier Card Anatomy:** Bold Title (`13.5px/600`) → compact **Technology
    Pill** (`10.5px/500` mono on subtle slate/tinted chip) → concise muted
    Description (`11.5px/400`, `#475569`).
  - **External Systems:** Soft cool-slate card surface (`#F8FAFC`) with crisp
    dashed border (`1.25px`, `#94A3B8`) and muted slate icon badge — instantly
    signaling "outside ownership" without visual noise.
  - **Boundaries:** Soft tinted zone (`L1` `#F1F5F9`/60%, `L2` `#E8EEF6`/55%)
    with `14px` corners and an **anchored top-left header pill** showing
    boundary kind (`SYSTEM BOUNDARY` / `CONTAINER`) + bold title.
  - **Connectors:** Default calm slate (`#64748B`), subtle semantic coding
    only for `async/event` (violet dashed), `data` (amber/slate with DB
    arrow), and `error` (rose), with rounded pill labels separating verb and
    `[HTTPS / gRPC]` mono tag.

### 2. `infrastructure` (Cloud Topologies — AWS / Azure / GCP / K8s) — Priority #2
- **Current symbols (19):** `infra-users`, `infra-cdn`, `infra-dns`,
  `infra-waf`, `infra-gateway`, `infra-load-balancer`, `infra-compute`,
  `infra-container`, `infra-kubernetes`, `infra-function`, `infra-database`,
  `infra-cache`, `infra-storage`, `infra-queue`, `infra-iam`,
  `infra-monitoring`, `infra-ml`, `infra-note`, `infra-boundary` (`public`,
  `private`, `vpc`, `region`, `cluster`).
- **What fails visually today:**
  - Relies on raw `chip`, `cube`, `brain`, `dashboard`, `hexagon`, `cloud`,
    `shield` contours with text overlaid directly on intricate paths.
  - `provider: aws | azure | gcp` floods the entire node fill with
    orange/sky/blue pastel instead of subtle provider badging.
  - Nested cloud hierarchy (`Account → Region → VPC → Public/Private Subnet →
    Cluster`) collapses visually because every boundary uses generic gray
    dashes.
- **Anemone v2 upgrade:**
  - **Uniform Cloud Resource Cards** (`rx=10`, crisp `1px` border, subtle
    shadow) with a **category-colored 28×28 icon squircle** (Compute, Network,
    Storage/DB, Security, Observability, AI) and a tiny **top-right provider
    micro-tag** (`AWS`, `GCP`, `Azure`, `K8s`) when `provider` is set.
  - **Distinct Nested Boundary Hierarchy:**
    - `cloud` / `account` / `region`: subtle neutral L1 frame +
      provider-colored corner badge.
    - `vpc` / `vnet`: soft cool-indigo/slate frame (`solid` subtle hairline).
    - `public` subnet: soft emerald-tinted border & pill (`PUBLIC SUBNET`).
    - `private` subnet: soft indigo/slate-tinted border & pill (`PRIVATE
      SUBNET`).
    - `cluster` / `securityGroup`: clean dashed inner frame with tight header
      chip.

### 3. `aiml` (AI/ML & Agentic Systems) — Priority #3
- **Current symbols (17):** `aiml-model`, `aiml-llm`, `aiml-dataset`,
  `aiml-vector-store`, `aiml-embedding`, `aiml-training`, `aiml-inference`,
  `aiml-feature-store`, `aiml-gpu`, `aiml-agent`, `aiml-prompt`,
  `aiml-guardrail`, `aiml-evaluator`, `aiml-retriever`, `aiml-memory`,
  `aiml-tool`, `aiml-annotation`.
- **What fails visually today:**
  - **Highest visual-defect density in Coral:** `neural-net` draws 20
    crisscrossing lines behind the label; `brain` splits the text with a
    vertical center line; `gear` forces text into an inner circle; `chip` pins
    clutter borders; `chat-bubble` clips bottom text.
- **Anemone v2 upgrade:**
  - Retire raw clipart-with-text-inside in Anemone presentation; render
    **precision AI/ML cards** with bespoke, iconic 24×24 duotone glyphs
    (sparkle/neural cluster for `llm`, bot/compass for `agent`, layered vector
    prism for `vectorStore`, shield-check for `guardrail`, wrench/plug for
    `tool`, memory chips for `memory`, GPU die for `gpu`, funnel/magnifier for
    `retriever`).
  - Use a cohesive **modern AI palette**: Violet-Indigo for
    Intelligence/Orchestration (`llm`, `agent`, `model`), Cyan-Teal for
    Retrieval/Tooling (`retriever`, `tool`, `embedding`), Amber for
    Knowledge/Data (`vectorStore`, `dataset`, `memory`), Emerald/Rose accents
    strictly on `guardrail` pass/fail branches.

### 4. `data-engineering` (Pipelines, Lakehouse & Streaming) — Priority #4
- **Current symbols (14):** `data-source`, `data-sink`, `data-transform`,
  `data-lake`, `data-warehouse`, `data-stream`, `data-batch`, `data-quality`,
  `data-schema`, `data-catalog`, `data-cdc`, `data-dashboard`,
  `data-pipeline`, `data-annotation`.
- **What fails visually today:**
  - `funnel`, `wave`, `pipe`, `lake`, `warehouse`, and `dashboard` shapes look
    like 1990s Visio clip-art, with `dashboard`'s 4 vertical bar rectangles
    intersecting label text.
- **Anemone v2 upgrade:**
  - **Stage-coded Lineage Cards** with crisp 24×24 icons (ingest arrow,
    Kafka-style wave icon, lakehouse ripple, warehouse columns, shield-check
    quality gate, chart bars icon, CDC pulse) arranged with a **left-to-right
    stage progression** (Ingest → Stream/Transform → Store → Serve/BI) and
    clean stream (`dashed` violet) vs. batch (`solid` slate) vs. quality-fail
    (`rose`) edge coding.

### 5. `erd` (Crow's Foot Entity-Relationship) — Priority #5
- **Current symbols (7):** `erd-entity`, `erd-weak-entity`, `erd-view`,
  `erd-note` (plus legacy `erd-attribute`, `erd-relationship`,
  `erd-cardinality`, `erd-isa`).
- **What fails visually today:**
  - Flat monochrome-tinted boxes with a plain `<line>` under the title; PK/FK
    markers are plain inline text with no scannable column alignment or badge
    differentiation.
- **Anemone v2 upgrade (Linear / dbdiagram.io / Figma schema bar):**
  - **Table Card Anatomy:** Clean white card (`rx=10`, soft shadow) with a
    **tinted header band** (slate-indigo for `entity`, soft teal for `view`,
    double-border indicator for `weakEntity`), bold entity name, and table
    icon.
  - **Structured Attribute Rows:** Left-aligned **compact `PK` (amber pill) /
    `FK` (sky pill) / `UK` (slate pill) key badges**, medium-weight column
    name, and right-aligned muted monospace data type (`uuid`, `varchar`,
    `timestamptz`) with subtle alternating row tint or `0.5px` hairlines.
  - **Crisp Crow's Foot Connectors:** Clean `1.5px` slate lines with sharp,
    properly proportioned crow's foot + bar/ring endpoints and small rounded
    relationship labels.

### 6. `uml-class` (Class, Interface & Enumeration)
- **Current symbols (3):** `uml-class`, `uml-interface`, `uml-enum`.
- **What fails visually today:**
  - Basic stacked rectangles with plain divider lines; `<<interface>>` and
    `<<enum>>` stereotypes look identical to class names except for tint.
- **Anemone v2 upgrade:**
  - **Distinct Header Band + Stereotype Pill:** Class (`indigo` subtle
    header), Interface (`teal` subtle header + `«interface»` italic mono
    pill), Enum (`amber` subtle header + `«enum»` mono pill).
  - **Visibility Color Dots / Mono Glyphs:** `+` (emerald public), `-` (rose
    private), `#` (amber protected), `~` (slate package) in crisp monospace,
    cleanly separated from member names and return types.
  - **Relationship Clarity:** Crisp solid hollow-triangle inheritance, dashed
    realization, filled/open diamonds for composition/aggregation, with
    compact cardinality endpoint badges (`1`, `0..*`).

### 7. `uml-sequence` (Sequence Diagrams)
- **Current symbols (2):** `uml-participant`, `uml-actor` (+ activations,
  sync/async/return messages, notes, `alt`/`opt`/`loop` fragments, participant
  groups/regions).
- **What fails visually today:**
  - `serialize.ts:159-167` only hands `sequencePrimitives` 6 hardcoded colors
    — teal boxes everywhere, plain dashed lifelines, unstyled fragment
    corners, flat yellow notes.
- **Anemone v2 upgrade:**
  - **Elevated Participant Cards** (`rx=8`, soft shadow, optional
    actor/service/database micro-icon on top edge) with subtle `1.5px` muted
    dashed lifelines (`#CBD5E1`).
  - **Tinted Activation Bars:** Clean `10px`-wide rounded bars (`rx=3`) filled
    in soft primary tint with crisp `1.25px` accent border.
  - **Refined Combined Fragments (`alt` / `opt` / `loop`):** Soft translucent
    fill (`rgba(99,102,241,0.03)`), clean `1px` border, and a **chamfered or
    pill operator badge** (`alt`, `loop`, `opt`) in bold uppercase with subtle
    horizontal dashed operand dividers + guard pills (`[authorized]`,
    `[else]`).
  - **Sticky-Style Notes:** Soft warm-amber card (`#FFFBEB`) with folded
    corner accent and readable dark-warm ink.

### 8. `bpmn` (Business Process Modeling)
- **Current symbols (14):** `bpmn-start-event`, `bpmn-end-event`,
  `bpmn-intermediate-event`, `bpmn-task`, `bpmn-subprocess`, 4 gateways
  (`exclusive`, `parallel`, `inclusive`, `event`), `bpmn-data-object`,
  `bpmn-data-store`, `bpmn-pool`, `bpmn-lane`, `bpmn-annotation`.
- **What fails visually today:**
  - Structurally strong (Coral already has dedicated BPMN event/gateway
    geometry!), but Anemone v1 gives start/end/task/gateway clashing flat
    fills and flat wireframe pools/lanes.
- **Anemone v2 upgrade:**
  - **Strict BPMN 2.0 Semantic Colors (Restrained):**
    - Start event: soft emerald ring (`#ECFDF5` fill, `2px` `#059669` stroke).
    - Intermediate event: soft amber double ring (`#FFFBEB`, `#D97706`).
    - End event: soft rose thick ring (`#FFF1F2`, `3px` `#E11D48`).
    - Tasks: crisp white elevated cards (`rx=10`) with a **top-left task-type
      icon** (`user`, `gear`, `code`, `hand`) in muted indigo/slate — no ugly
      left stripe!
    - Gateways: clean elevated amber-tinted diamond (`#FFFDF5` fill, `#D97706`
      stroke, crisp bold inner `×` / `+` / `○` symbol).
    - Pools & Lanes: crisp horizontal swimlanes with rotated or left-anchored
      header strips in `L1` slate surface and subtle `1px` lane dividers.

### 9. `flowchart` (Process & Decision Flows)
- **Current symbols (8):** `flowchart-terminal`, `flowchart-process`,
  `flowchart-decision`, `flowchart-io`, `flowchart-document`,
  `flowchart-predefined`, `flowchart-connector`, `flowchart-annotation`.
- **What fails visually today:**
  - Heavy borders + loud pastel fills; `Yes`/`No` branches have plain text
    that blends into connectors.
- **Anemone v2 upgrade:**
  - **Clean Editorial Flow:** Pill terminals (`stadium`) in soft emerald
    (start) / soft rose or dark slate (end); white elevated process cards
    (`rx=10`); crisp subtly-tinted amber decision diamonds (`rx` softened
    corners where supported); clean `Yes` (emerald pill) and `No` (rose pill)
    branch badges on outgoing edges.

### 10. `block` (General Concept & Block Diagrams)
- **Current symbols (11):** `block-unit`, `block-rounded`, `block-circle`,
  `block-oval`, `block-triangle`, `block-diamond`, `block-cylinder`,
  `block-pill`, `block-note`, `block-group`.
- **What fails visually today:**
  - Everything falls through to default `teal` in `classifyAnemoneTone`,
    making block diagrams monochromatic teal boxes with left stripes.
- **Anemone v2 upgrade:**
  - **Editorial Neutral-First Palette:** Elevated crisp white cards
    (`#FFFFFF`), refined slate ink (`#0F172A`), soft slate border (`#CBD5E1`),
    subtle shadow; reserve Coral/Indigo/Amber/Teal accents for explicit author
    `style` hints or callout `note` cards (`#FFFBEB`), so general concept
    diagrams look like Stripe/Linear docs rather than teal wallpaper.

### 11. `code` (Module, Class & Dependency Graphs)
- **Current symbols (8):** `code-function`, `code-class`, `code-module`,
  `code-variable`, `code-type`, `code-namespace`, `code-external`,
  `code-comment`.
- **What fails visually today:**
  - Bare shapes (`hexagon`, `ellipse`, `cloud`, `rectangle`) don't look like
    software engineering artifacts.
- **Anemone v2 upgrade:**
  - **IDE-Grade Symbol Cards:** Compact monospace **kind chip** (`fn`,
    `class`, `mod`, `type`, `var`, `pkg`) tinted with familiar
    syntax-highlighting semantics (indigo `class`, teal `fn`, violet `type`,
    amber `var`, slate-dashed `external`), paired with monospace identifiers
    and clean `imports` (dashed) / `calls` (solid) / `extends` (hollow
    triangle) connectors.

### 12. `sketch` (Informal Whiteboard / Excalidraw-Class Mode) — Crucial Differentiator!
- **Current symbols (7):** `sketch-step`, `sketch-label`, `sketch-box`,
  `sketch-decision`, `sketch-circle`, `sketch-cloud`, `sketch-group`.
- **What fails visually today:**
  - In `0.2.14`, selecting `anemone` on `@diagram sketch` runs
    `baseRenderStyle028('anemone') -> 'hifi'` (Inter font!) and colors every
    sketch box corporate teal! It **destroys** the sketch character instead of
    elevating it.
- **Anemone v2 upgrade (Excalidraw Parity):**
  - **Dedicated Tactile Sketch Register:** Warm off-white paper canvas
    (`#FAF8F4`) with optional faint dot grid, refined hand-lettered typography
    (`Coral Lowfi Caveat` / Excalifont-like proportions with clean sizing),
    **charcoal ink (`#1E293B`)** organic slightly-variable stroke (`2px`),
    **soft pastel highlighter fills** (warm butter `#FEF3C7`, soft sky
    `#E0F2FE`, blush coral `#FFE4E6`, sage `#DCFCE7`, lavender `#F3E8FF` —
    *this* is the one register where soft hand-drawn fills shine!), optional
    diagonal hachure/crosshatch accent fills, sticky-note callouts with
    tape/shadow, and expressive hand-drawn curved/organic arrowheads.

### 13. `uml-state` (State Machine / Statechart) — Recommended Roadmap Gap!
- **Current status:** Installed in `HEADER_MANIFEST_028` and
  `notations/state.ts`, but **character-only** (filtered out by
  `getAvailableNotations0214()`).
- **Why promote to visual in `0.2.15+` / `0.3.0`:**
  - State machines (`initial ●`, `final ◉`, `state` rounded card with
    entry/exit actions, `composite state` container, `choice ◇`, `fork/join
    ▬`) are among the top 5 most-authored developer diagrams in
    Mermaid/XState/Figma.
- **Anemone v2 vision for `uml-state`:**
  - Solid dark initial dot, bullseye final marker, elevated rounded state
    cards (`rx=14`) with bold state name + subtle hairline divider for `entry
    / do / exit` actions, clean orthogonal/curved transitions with `[guard] /
    action` mono pill labels.

---

## Cross-Cutting Recommendations & Prioritized Gaps

| Priority | Gap / Opportunity | Impact on Figma/Excalidraw Parity | Engine Layer |
| :---: | --- | --- | --- |
| **P0** | Replace rainbow `TONE_STYLES` + 3.5px left stripe with **Neutral Elevated Cards + Semantic Icon Badges + 60-30-10 Palette** | Immediate 2× leap in visual polish | `parrotfishCore.ts` (zero layout change!) |
| **P0** | Add **SVG `<defs>` Elevation Shadows**, **Rounded Edge-Label Pills**, and **Anchored Container Header Pills** | Eliminates "flat wireframe" look overnight | `projectScene028.ts` + `serialize.ts` (presentation-only!) |
| **P0** | Dispatch Anemone styling **by `notationId` first** + give `@diagram sketch` its own **Excalidraw-grade Tactile Sketch Register** | Fixes sketch & unlocks idiomatic ERD/BPMN/UML/AI visuals | `parrotfishCore.ts` + `visualStyle028.ts` |
| **P1** | Expand `glyphs/index.ts` from **8 glyphs → 48 cohesive 24×24 duotone icons** and replace clipart-with-text-inside (`neural-net`, `brain`, `dashboard`, `gear`, `chip`, `cube`) in Anemone | Fixes the worst readability defects in `aiml`, `infrastructure`, `data-engineering` | `parrotfishCore.ts` + `glyphs/index.ts` |
| **P1** | Add **3-Tier Typography** (Title / Technology Pill / Description) for C4, Infra, ERD header bands + PK/FK pills, and Sequence upgraded theme | Matches IcePanel / dbdiagram / Figma craft | `renderScene028.ts` + `sequence.ts` + `parrotfishCore.ts` |
| **P2** | Promote **`uml-state`** from character-only to full visual notation + add optional **subtle canvas dot-grid** toggle | Completes developer diagram coverage | Next edition catalog + `serialize.ts` |
