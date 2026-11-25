# Slice 10: Baseline Scorecards & Competitor Benchmark Report

Status: completed (`2026-11-24`).

This report records the empirical Coral `0.2.12` baselines before any `0.2.14`
rendering or notation changes.

## 1. Coral `0.2.12` Rendering Baseline (`LAYOUT_CORPUS_0211`, 40 Diagrams)

Evaluated with `evaluatePreparedSceneQuality0211` across all 40 stratified
diagrams (9 notations, 4 scales, `RIGHT`/`DOWN`, flat and grouped):

- **Tier-1 hard invariants:** `40 / 40` pass (`0` hard defects)
- **Overall Tier-2 composite mean:** **`91.67 / 100`** (`min: 54.62`,
  `max: 100.00`)
- **Diagrams meeting `>= 95 / 100` target:** `20 / 40` (`50%`)
- **Diagrams below `90 / 100`:** `10 / 40` (`25%`)

| Notation | Count | Mean Score | Min | Max | Avg Bends/Edge | Avg Crossings | Avg Avoidable Jogs | Avg Wire Len |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `uml-class` | 2 | 100.00 | 100.00 | 100.00 | 0.88 | 0.00 | 0.00 | 1.91 |
| `aiml` | 6 | 97.36 | 92.00 | 100.00 | 1.17 | 0.17 | 0.00 | 2.97 |
| `block` | 2 | 95.67 | 91.34 | 100.00 | 0.93 | 0.00 | 1.00 | 1.80 |
| `data-engineering` | 6 | 95.21 | 80.75 | 100.00 | 1.19 | 0.33 | 0.00 | 3.10 |
| `flowchart` | 7 | 93.62 | 87.84 | 100.00 | 0.59 | 0.29 | 0.00 | 1.52 |
| `sketch` | 1 | 92.90 | 92.90 | 92.90 | 0.75 | 0.00 | 1.00 | 2.41 |
| `code` | 3 | 88.98 | 77.94 | 100.00 | 1.24 | 0.33 | 0.33 | 1.83 |
| `architecture` | 9 | **86.92** | **59.57** | 97.92 | 1.56 | 0.56 | 0.56 | 3.74 |
| `bpmn` | 4 | **80.63** | **54.62** | 97.00 | 0.98 | 1.00 | 0.25 | 2.77 |

### Root Causes Dragging Scores Below `95`

1. **Off-center single ports (`offCenterSinglePorts`):** `3` each on `c32`,
   `c12`, `c34`, `c29`; `2` on `c31`.
2. **Edge crossings on grouped/cyclic topologies:** `3` on `c32`, `2` on `c16`
   and `c21`, `1` on `c12`, `c13`, `c34`, `c31`, `c04`, `c06`.
3. **Avoidable jogs & excess wire length:** `3` avoidable jogs + `6.71` wire
   length on `c16-arch-stress-24node-right` (`59.57`); `5.83` wire length on
   `c13-arch-nested-vpc-right` (`78.50`); `2` jogs on `c36-block-pid` (`91.34`).
4. **Wide aspect ratios & low fill ratios:** `7.61` aspect on `c04`, `5.83` on
   `c06`, `5.46` on `c36`; `0.11` fill ratio on grouped `architecture` cases.

## 2. 12-Case Cross-Tool Competitor Benchmark (Chromium DOM Scorer)

Equivalent diagrams authored in **Coral `0.2.12`**, **Mermaid (latest)**,
**Graphviz DOT**, and **PlantUML `1.2026.10`** (including `C4-PlantUML`,
`awslib20`, `Azure-PlantUML`, and IE Crow's Foot ERD), rendered to real SVGs
and scored identically via Playwright Chromium DOM extraction through
`analyzeNormalizedDiagram0211`:

| Case | Family | Coral `0.2.12` | Mermaid | Graphviz DOT | PlantUML |
| --- | --- | --- | --- | --- | --- |
| `bm01-fc-checkout` | Flowchart | **100.0** (0d) | 41.0 (3d) | 85.5 (0d) | 100.0 (0d) |
| `bm02-fc-release-ci` | Flowchart | **96.3** (0d) | 35.7 (6d) | 49.0 (2d) | 80.0 (0d) |
| `bm03-block-concept` | Block / Freeform | **100.0** (0d) | 31.3 (8d) | 93.0 (0d) | 88.7 (0d) |
| `bm04-block-pid` | Block | **92.6** (0d) | 64.0 (1d) | 78.5 (0d) | 19.0 (4d) |
| `bm05-c4-context` | Architecture (C4) | **82.3** (0d) | 34.0 (18d) | 61.0 (0d) | 67.0 (0d) |
| `bm06-c4-container` | Architecture (C4) | **69.8 (2d)** | 0.0 (22d) | 26.9 (5d) | 53.2 (2d) |
| `bm07-c4-grouped-3zone` | Architecture (C4) | **99.0** (0d) | 0.0 (11d) | 50.5 (2d) | 50.0 (1d) |
| `bm08-cloud-aws-vpc` | Cloud Infra (AWS) | **77.7** (0d) | 33.0 (4d) | 32.9 (3d) | 14.0 (4d) |
| `bm09-cloud-gcp-data` | Cloud Infra (GCP) | **97.0** (0d) | 58.0 (2d) | 94.0 (0d) | 94.0 (0d) |
| `bm10-cloud-azure-app` | Cloud Infra (Azure) | **96.4** (0d) | 53.1 (2d) | 94.0 (0d) | 94.0 (0d) |
| `bm11-erd-ecommerce` | ERD (Crow's Foot) | **DISABLED** | 33.0 (4d) | 94.0 (0d) | 64.0 (2d) |
| `bm12-erd-saas` | ERD (Crow's Foot) | **DISABLED** | 30.0 (8d) | 66.2 (1d) | 81.9 (1d) |

### Key Visual Inspection Takeaways (Chromium PNG Side-by-Side)

1. **Coral already leads on geometric routing hygiene**, but our own
   `bm06-c4-container` exposed **2 real Tier-1 edge-label collisions**
   (`"Publishes OrderCreated"` occluded by `Order Service`; `"Records invoice"`
   occluded by `Billing Worker`) plus `"Reads/writes"` drifting outside the
   group border.
2. **Where C4-PlantUML and AWS-PlantUML visually beat Coral `0.2.12` today
   (grokability & beauty):**
   - Coral `0.2.12`'s `hifi` renderer strips semantic symbol fills and draws a
     stark black-on-white wireframe, even though `symbols/*.ts` already define
     semantic palettes.
   - C4-PlantUML delivers instant visual hierarchy via semantic color roles
     (dark navy Person, crisp blue Container, slate gray External System),
     dashed muted boundaries, and 3-tier typography (**Bold Title** +
     *`[Technology]`* + body description), plus protocol-tagged edges.
   - AWS-PlantUML delivers instant cloud scannability via color-coded service
     tiles and icons (while suffering curved edges cutting through subnet
     titles — a geometry flaw Coral avoids).
   - Mermaid `erDiagram` delivers crisp 3-column entity tables (`type | name |
     PK/FK/UK`) with tinted headers and clean Crow's Foot markers.
3. **Scoring system gap to close in Slice 20:** `diagramQuality0211.ts`
   currently scores geometry only — it does not yet measure visual hierarchy,
   semantic color differentiation (Moody *Visual Expressiveness* & *Perceptual
   Discriminability*), card/table typography contrast, edge-label proximity to
   its parent edge, or Crow's Foot / C4 / nested cloud boundary clarity.

## 3. Objective Notation Understandability Scorecard (`0.2.12` Baseline)

Measured directly against `packages/render/dist/notations/index.js`,
`packages/language/spec/grammar-028.ebnf` (`87` productions, `153` keywords),
and the 12-case multi-tool markup corpus using Moody's *Physics of Notations*
(PoN), Green & Petre's *Cognitive Dimensions* (CDNs), Kahraman & Bilgen's
*FQAD*, and Stefik-inspired token/boilerplate metrics:

| Tool / Edition | Vocab Directness (20%) | Token Economy (20%) | Grammar Symmetry (15%) | PoN Semiotic & Coverage (25%) | CDN Usability (20%) | **Composite (0–100)** |
| --- | --- | --- | --- | --- | --- | --- |
| **Coral `0.2.12` (Baseline)** | **24.2** (`22/91` symbols) | 50.7 (`35.2%` boilerplate) | 44.0 (`7` asymmetries) | 27.5 (`15` shape overloads; ERD/cloud missing) | 64.0 | **41.3** |
| Graphviz DOT | 85.0 | 0.0 (`87.1%` boilerplate) | 92.0 | 55.0 | 62.0 | **64.4** |
| PlantUML | 75.0 | 77.9 (`15.8%` boilerplate) | 52.0 | 84.0 | 66.0 | **73.2** |
| Mermaid | 88.0 | 88.2 (`8.4%` boilerplate) | 58.0 | 78.0 | 76.0 | **77.6** |
| **Coral `0.2.14` (Target)** | **>= 98.0** | **>= 92.0** | **>= 94.0** | **>= 95.0** | **>= 94.0** | **>= 94.7** |

### Specific Measured Friction Points in Coral `0.2.12`

- Only **22 of 91** installed symbols (`24.2%`) have direct type words
  (`code`, `aiml`, `data-engineering`, and `sketch` have `0%`; `architecture`
  has `27.3%`).
- **`35.2%` average boilerplate ratio** (vs. `8.4%` in Mermaid and `15.8%` in
  PlantUML), driven by `[symbol: "..."]`, mandatory edge IDs/types on simple
  flows, and missing shorthands.
- **15 non-rectangle shape overloads** across catalogs (Moody *Semiotic
  Clarity* defects, e.g., `architecture` reuses `cylinder`, `cloud`, and
  `hexagon` for distinct concepts).
- **7 grammar asymmetries** documented in
  [hitl-notation-review.md](hitl-notation-review.md).
