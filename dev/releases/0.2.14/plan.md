# Coral 0.2.14 release plan

Status: approved by owner (`2026-11-24`).

Release `0.2.14` (intentionally skipping `0.2.13`) focuses on three
interconnected pillars:

1. **Incessant rendering quality (`>= 95` target):** make every Coral diagram
   genuinely beautiful, geometrically accurate, and instantly grokable at a
   glance across canvas, SVG, browser, and MCP outputs, proven by continuous
   empirical testing against Coral `0.2.12` and competitors.
2. **Expanded and distinct diagram types:** expand `block` into freeform
   boxes-and-arrows; overhaul `architecture` for C4-grade system design;
   introduce a separate `infrastructure` diagram type for cloud infrastructure
   (AWS, Azure, GCP, and cloud-neutral topologies); and revive `erd` with
   Crow's Foot notation while retiring legacy Chen notation.
3. **Intuitive, objectively scored notation:** score Coral's textual and visual
   notation with established objective frameworks, eliminate syntactic
   friction, and add only the HITL-approved syntax rules needed to express
   every supported diagram naturally.

## Locked owner decisions (`2026-11-24`)

1. **`block` expands into boxes-and-arrows:** Keep the existing `@diagram block`
   type name and expand it (under edition `0.2.14`) with freeform geometric
   primitives (boxes, rounded boxes, circles/ovals, triangles, diamonds,
   cylinders, pills, notes/text, groups) and flexible arrow/line styling.
2. **`infrastructure` and `architecture` are separate diagram types:**
   - `@diagram architecture` owns **system design** (C4-style Context,
     Container, and Component views: people, software systems, external
     systems, containers, components, data stores, boundaries, technology tags,
     descriptions, and protocol-labeled relationships).
   - `@diagram infrastructure` (exact manifest key finalized in Slice 10 HITL)
     owns **cloud infrastructure** (AWS, Azure, GCP, Kubernetes, and
     cloud-neutral topologies: accounts/subscriptions/projects, regions, AZs,
     VPCs/VNets, public/private subnets, security groups, compute, serverless,
     storage, databases, caches, queues, gateways, CDN, IAM, observability).
3. **Crow's Foot for ERD; retire Chen:** Re-enable `@diagram erd` using modern
   Crow's Foot (Information Engineering entity tables with `PK`/`FK`/`UK`,
   types, and nullability + Crow's Foot cardinality connectors). Explicitly
   retire legacy Chen notation (while preserving immutable `0.2.8`/`0.2.9`
   manifest history where `erd` remained disabled).
4. **Empirical, data-driven rendering bar (`>= 95 / 100`) and living
   benchmarks:** Never assume routing or style defaults (such as `POLYLINE` vs.
   `ORTHOGONAL` or `hifi` vs. `lowfi`) without running head-to-head benchmark
   experiments against Coral `0.2.12` and competitors. Aim for **`>= 95 / 100`**
   composite rendering quality with `0` Tier-1 hard defects, and evolve both
   the scoring system and the competitor benchmark matrix as every diagram type
   comes online.
5. **Two-path presentation architecture (`2026-11-25`):**
   - **Basic black-and-white default (`lowfi` and `hifi`):** Keep default
     `lowfi` and `hifi` outputs crisp monochrome ink-on-paper without cloning
     C4's visual render format.
   - **New peer output style `anemone` (shorthand `ane`):** Introduce `anemone`
     (accepted shorthand `ane`) as a first-class peer to `lowfi` and `hifi` for
     Coral's own evolving, expressive visual style competing with C4 and other
     tools.
   - **New `parrotfish` modeled-output renderer:** Export a `parrotfish`
     rendering function that applies modeled presentation rules (style, colors,
     symbols, visual treatments) strictly without altering layout, flow, or
     routing.
6. **HITL notation approvals locked (`2026-11-25`):** Approved **N1**
   (`approvedTypeWords`), **N2** (node `[style: ...]`), **N3** (`architecture`
   type words + `technology`/`description`), **N4** (`@diagram infrastructure`),
   **N5** (Crow's Foot `@diagram erd`, retiring Chen), **N6a-B** (camelCase
   relation words + hyphen diagnostic), **N6b-1** (keep `0.2.8` O2 shafts), and
   **N6c-1** (unnamed UML attribute visibility `-`, `#`, `~`).

## Problem statement

Coral `0.2.12` ships a clean public repository, an `ELK` + `libavoided-js`
routing pipeline, and a 40-diagram layout verification corpus
(`LAYOUT_CORPUS_0211`), but key gaps remain:

- **Unenforced aesthetic ceiling and missing grokability signals:**
  `layoutCorpus0211.test.ts` currently asserts only `compositeScore >= 0`, and
  several `Post-0.2.10` `DRQ` clauses remain open (multi-edge tracks, external
  self-loops, back-edge return channels, endpoint labels, sibling-label and
  group-title clearance, disconnected packing). Nodes render flat single-string
  labels without structured title/technology/description typography.
- **Narrow `block` catalog:** `block` provides only a single `block-unit`
  rectangle, forcing authors to use hand-drawn `sketch` (which lacks triangles
  and forces `[symbol: "sketch-..."]` boilerplate) for simple boxes-and-arrows
  diagrams.
- **Conflated architecture and cloud infrastructure:** `architecture` mixes
  generic system boxes with minimal cloud primitives, suffers Moody *Symbol
  Overload* (load balancers and serverless functions share one hexagon), lacks
  C4 card semantics, and cannot represent real AWS/Azure/GCP cloud topologies.
- **Disabled ERD and notation friction:** `erd` is disabled with dormant Chen
  attribute-ellipses. Across notations, sparse `approvedTypeWords` force
  `[symbol: "..."]` boilerplate, and `grammar-028.ebnf` lacks node styling,
  structured metadata (`technology`/`description`), ERD column compartments,
  ergonomic cardinality shorthand, endpoint labels, hyphenated identifiers, and
  connector/visibility symmetry.

## Scope: in-scope vs. deferred

| Area | In scope for `0.2.14` | Deferred outside `0.2.14` |
| --- | --- | --- |
| **Rendering & living scoring system** | Continuous rendering craft pass targeting **`>= 95 / 100`** with `0` Tier-1 hard defects; empirical A/B testing of routing/style defaults; upgraded scoring system covering visual hierarchy, grokability, cards, tables, nesting, and Crow's Foot; living competitor benchmark matrix (Mermaid, D2, PlantUML, Structurizr/C4, Graphviz/DOT, Mingrammer `diagrams`, DBML/dbdiagram). | Coordinated `@graph-ir/core` arbitrary manual caption offset (`G-3`/`G-4`), animated GIF export, PDF export. |
| **Expanded `block` (boxes & arrows)** | Expand `@diagram block` with `box`, `rounded`, `circle`/`oval`, `triangle`, `diamond`, `cylinder`, `pill`, `note`, `group`, flexible arrows/styles, auto + manual layout, and cross-surface parity. | Freehand vector pen drawing, UI wireframing kits. |
| **`architecture` (C4-grade)** | System-design overhaul competing directly with C4: person, software system, external system, container, component, database, queue, boundaries, title + technology + description cards, protocol-labeled relationships, empirically tested routing/style defaults. | Full Structurizr DSL importer, multi-view C4 workspace zoom navigation. |
| **`infrastructure` (cloud infra)** | Dedicated cloud-infrastructure diagram type covering AWS, Azure, GCP, Kubernetes, and cloud-neutral primitives + nested account/region/AZ/VPC/VNet/subnet/cluster boundaries, with Apache-2.0-compliant icon licensing and bundle-budget hygiene. | Live cloud-account discovery or Terraform/CloudFormation state scanning (`REQ-H1`). |
| **`erd` (Crow's Foot)** | Re-enable `@diagram erd` with Crow's Foot entity tables (`PK`/`FK`/`UK`, types, nullability), crisp Crow's Foot markers, identifying vs. non-identifying lines, relationship & endpoint labels, U1/U2 checks; retire Chen. | Live database schema introspection or DDL sync. |
| **Notation & syntax** | Objective Notation Understandability Scorecard (PoN, CDNs, FQAD, Stefik-inspired grammar/token metrics), full `approvedTypeWords` coverage, HITL-approved edition `0.2.14` syntax extensions, Language Specification `1.3.0`, Tree-sitter sync. | Breaking changes to `0.2.8` or `0.2.9` saved documents; Tree-sitter as runtime parser. |
| **Migration, AI & other** | Keep existing Mermaid/DOT/PlantUML importers passing (plus optional Mermaid ER cardinality alignment in Slice 60 if straightforward). | P5 batch migration CLI & similarity reports, AI-edit canvas keeping (`CS-33`), P4 accessibility catch-up release, sunset-worker removal, TS 7 / Node 26 types. |

## Working constraints

- **Branch discipline:** All work happens on `release/0.2.14`; `main` stays
  pinned to `0.2.12` until exact-SHA `final_candidate=true` CI passes.
- **Exact toolchain:** Node.js `26.8.2`, npm `12.0.2`, TypeScript `6.0.3`
  (`npm run check:toolchain`). Published packages retain Node.js `24.19.0`
  minimum runtime and `24.x` `@types/node`.
- **Mandatory HITL Source Notation Gate:** Every change to Coral source syntax,
  spellings, canonical printed output, or diagnostics requires before/after
  human-in-the-loop approval in Slice 10 *before* Slice 30 implementation.
- **Catalog & edition immutability:** Existing `0.2.8` and `0.2.9` header
  manifest entries and catalog digests remain immutable. New syntax, expanded
  `block`, overhauled `architecture`, new `infrastructure`, and Crow's Foot
  `erd` ship under edition `0.2.14` and updated profile/catalog versions.
- **Icon licensing & browser bundle budget:** Cloud-infrastructure icons (AWS,
  Azure, GCP, generic) must satisfy Apache-2.0 distribution and trademark rules
  and stay within the `@coral-viz/browser` gzip ceiling
  (`packages/browser/test/bundle.test.ts`).
- **Public API & coverage floors:** Maintain strictly additive `0.2.x` public
  APIs (`npm run api-compat`) and Vitest coverage floors
  (`npm run test:coverage:gate`).
- **Product boundary:** Preserve Coral's general-purpose diagramming boundary
  (no repo indexing, workspace ownership, or codebase-specific MCP tools).

## Living benchmark & competitor matrix

Each diagram type is evaluated on the same normalized geometric/aesthetic
scorer (`>= 95 / 100` target, `0` Tier-1 hard defects) plus Chromium PNG
Tier-3 visual rubric and compared against Coral `0.2.12` and domain
competitors:

| Diagram family | Coral `0.2.14` target type | Competitor benchmarks tracked |
| --- | --- | --- |
| **Flowcharts, BPMN, UML, AI/ML, Data, Code, Sketch** | Existing 8 types | Mermaid, D2, PlantUML, Graphviz/DOT |
| **Freeform boxes & arrows** | Expanded `@diagram block` | D2, Graphviz/DOT, Mermaid flowchart, Excalidraw-style baselines |
| **System architecture (C4)** | Overhauled `@diagram architecture` | C4-PlantUML, Structurizr, Mermaid C4, D2 |
| **Cloud infrastructure** | New `@diagram infrastructure` (AWS, Azure, GCP, K8s) | Mingrammer `diagrams`, D2 (cloud icons), PlantUML AWS/Azure/GCP, Mermaid architecture-beta |
| **Entity-Relationship (ERD)** | Re-enabled `@diagram erd` (Crow's Foot) | DBML / dbdiagram.io, Mermaid `erDiagram`, PlantUML IE |

## Dependency-ordered slices

| Slice | Depends on | Deliverable | Mechanical exit gate |
| --- | --- | --- | --- |
| **Slice 10: Baseline scorecards, competitor benchmark & HITL notation design** | Clean `release/0.2.14` + `npm ci` | Run `0.2.12` baseline on the 40-diagram corpus; build automated Notation Understandability Scorecard (`scripts/notation-scorecard.mjs` covering PoN, CDNs, FQAD, token economy, grammar complexity); define expanded `0.2.14` Rendering Beauty & Grokability scorer and competitor matrix; audit AWS/Azure/GCP icon licensing & bundle strategy; deliver the mandatory **HITL Source Notation Review** (before/after syntax, canonical printer output, diagnostics, diagram-type keys). | Baseline `0.2.12` rendering + notation scores recorded in `dev/releases/0.2.14/slice-10/`; `npm run verify` baseline green; **explicit human approval** of HITL notation proposals and cloud-icon licensing approach. |
| **Slice 20: Core rendering craft & upgraded scoring system (`>= 95` push)** | Slice 10 | Upgrade the scoring engine (`diagramQuality0211.ts` -> `0.2.14` scorer with grokability, hierarchy, card, table, and nesting metrics); empirically A/B test routing/style defaults across notations vs. `0.2.12` and competitors; refine `hifi`/`lowfi` palettes, typography, multi-part card primitive (title + technology + description), and close `DRQ` `Post-0.2.10` layout/routing gaps (`DRQ-03`, `DRQ-08`, `DRQ-15`, `DRQ-16`, `DRQ-18`, `DRQ-19`, `DRQ-21`, `DRQ-22`). | `0` Tier-1 hard defects across the full corpus; corpus mean & per-notation scores pushed toward **`>= 95 / 100`** (with recorded before/after vs. `0.2.12` and competitors); Chromium PNG Tier-3 visual rubric signed off; `npm run verify` + bundle budget green. |
| **Slice 30: Intuitive notation & edition `0.2.14` (Language Specification `1.3.0`)** | Slice 10 (HITL approval), Slice 20 | Implement approved edition `0.2.14` syntax in `@coral-viz/language`, `@coral-viz/render`, and `tree-sitter-coral`: full `approvedTypeWords` across notations (removing `[symbol: "..."]` boilerplate), approved node styling, structured metadata (`technology`/`description`), ERD column compartments & Crow's Foot cardinality shorthand, endpoint labels, hyphenated kinds/relations, and connector/visibility symmetry; keep `0.2.8`/`0.2.9` immutable. | 100% of `0.2.8`/`0.2.9` conformance fixtures remain green; new `0.2.14` conformance/round-trip/diagnostic fixtures green; Tree-sitter native smoke passes; Notation Understandability Scorecard improves measurably over Slice 10 baseline; `npm run api-compat` green. |
| **Slice 40: Expanded `block` (freeform boxes & arrows)** | Slice 20, Slice 30 | Expand `@diagram block` with geometric primitives (`box`, `rounded`, `circle`/`oval`, `triangle`, `diamond`, `cylinder`, `pill`, `note`, `group`), flexible connectors/styles, empirically tuned layout defaults, editor creation/inspector support, shared catalog example, and updated benchmark corpus + competitor comparison. | `0` Tier-1 hard defects and **`>= 95 / 100`** target score on expanded `block` corpus (benchmarked vs. `0.2.12` & D2/Graphviz/Mermaid); Chromium PNG Tier-3 rubric signed off; editor E2E + `npm run verify` green. |
| **Slice 50: `architecture` overhaul (C4-grade system design)** | Slice 20, Slice 30 | Overhaul `@diagram architecture` for C4-competitive system design (person, software system, external system, container, component, database, queue, system/container boundaries; title + technology + description cards; protocol edges), empirically benchmarked against Coral `0.2.12`, C4-PlantUML, Structurizr, Mermaid C4, and D2; update scoring system for C4 card/boundary clarity. | `0` Tier-1 hard defects and **`>= 95 / 100`** target score on C4/architecture corpus; head-to-head comparison table & Chromium PNG rubric vs. C4 competitors recorded; zero PoN symbol overload; editor E2E + `npm run verify` green. |
| **Slice 55: `infrastructure` diagram type (AWS, Azure, GCP & cloud)** | Slice 20, Slice 30 | Ship dedicated `@diagram infrastructure` covering AWS, Azure, GCP, Kubernetes, and cloud-neutral primitives plus nested account/region/AZ/VPC/VNet/subnet/cluster boundaries, license-compliant crisp icons, clean cross-boundary routing, shared catalog examples, and updated scoring system + cloud-infra competitor benchmarks (Mingrammer `diagrams`, D2, PlantUML cloud, Mermaid architecture). | `0` Tier-1 hard defects and **`>= 95 / 100`** target score on AWS/Azure/GCP/hybrid cloud corpus; Chromium PNG Tier-3 rubric & PoN audit signed off; `@coral-viz/browser` gzip budget & Apache-2.0 icon-license check green; editor E2E + `npm run verify` green. |
| **Slice 60: `erd` revival (Crow's Foot; retire Chen)** | Slice 20, Slice 30 | Re-enable `@diagram erd` with Crow's Foot entity table boxes (`PK`/`FK`/`UK`, types, nullability), crisp Crow's Foot markers on orthogonal stubs, identifying vs. non-identifying lines, relationship & endpoint labels, U1/U2 validation, shared catalog example, Chen retirement docs/diagnostics, and updated scoring system + ERD competitor benchmarks (DBML/dbdiagram, Mermaid ER, PlantUML IE). | `0` Tier-1 hard defects and **`>= 95 / 100`** target score across simple, multi-table, self-referencing, and composite-key ERD corpus; Chromium PNG Tier-3 rubric signed off; U1/U2 + round-trip + editor E2E + `npm run verify` green. |
| **Slice 70: Whole-suite rendering polish (`>= 95` gate), parity & docs** | Slices 40, 50, 55, 60 | Full-suite rendering beauty/grokability pass across **all** supported diagram types (light/dark, `hifi`/`lowfi`, canvas vs. SVG vs. browser vs. MCP); final Coral `0.2.12` vs. `0.2.14` vs. competitor Rendering & Notation Scorecard report; update shared examples, `README.md`, `docs/`, `packages/*/README.md`, `dev/requirements/specs/supported-diagram-types.md`, `dev/ARCHITECTURE.md`, and `dev/ROADMAP.md`. | All diagram types pass `0` Tier-1 hard defects and **`>= 95 / 100`** composite target; `npm run check:docs`, `npm run lint:md`, `npm run test:markdownlint`, `npm run test:capability-truth`, `npm run api-compat`, `npm run test:coverage:gate`, bundle budget, and full Chromium E2E pass with zero retries. |
| **Slice 80: Release `0.2.14` hardening, version cutover & publication** | Slice 70 | Atomic version bump `0.2.12` -> `0.2.14` (skipping `0.2.13`) across manifests, lockfile, version constants, workflows, `dev/release-policy.json`, `dev/releases/0.2.14/renderer-candidate.json`, `PLAN.md`, `CLAUDE.md`, and `CHANGELOG.md`; local CI parity + hosted `ci.yml` (`final_candidate=true`) -> fast-forward `main` -> `publish.yml` -> `pages.yml` -> `release.yml` (`v0.2.14`). | `npm run test:release-version`, `npm run verify`, `npm run build`, `npm run test:e2e`, `npm run test:gitleaks`, `smoke:consumer`, `smoke:native` green; hosted `ci.yml` 20/20 + `final-candidate-proof` green; npm OIDC provenance, GitHub Pages, and immutable `v0.2.14` tag verified. |
