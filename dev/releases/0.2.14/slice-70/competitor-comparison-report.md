# Coral 0.2.14 vs. competitors comparison report

Apples-to-apples rendering and notation comparison across **12 real-world
benchmark diagrams** covering Flowchart, Expanded Block (boxes-and-arrows),
C4 Architecture, Cloud Infrastructure (AWS, GCP, Azure), and Crow's Foot ERD.

Every diagram is rendered live in Chromium / native CLI across six outputs:

- **Coral `0.2.14` (`anemone`)** — new expressive peer style (`ane`).
- **Coral `0.2.14` (`hifi`)** — default monochrome ink-on-paper style.
- **Coral `0.2.12`** — prior release baseline (`10/12` supported; ERD disabled).
- **Mermaid** — `flowchart`, `C4Context`, `C4Container`, `architecture-beta`,
  and `erDiagram`.
- **Graphviz DOT** — `dot -Tsvg` with clusters, records, and Crow's Foot ends.
- **PlantUML** — Activity, C4-PlantUML, `awslib20`, `azure`, and IE ERD.

## Overall cross-tool scorecard

| Tool / renderer | Cases | Tier-1 pass (0 hard defects) | Hard defects | Mean score | Avg lines | Avg tokens | Boilerplate imports/overrides |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Coral `0.2.14` (`anemone`)** | **12 / 12** | **12 / 12** | **0** | **96.91** (Living **96.93**) | 25.8 | 158.9 | **0** |
| **Coral `0.2.14` (`hifi`)** | **12 / 12** | **12 / 12** | **0** | **96.91** (Living **96.93**) | 25.8 | 158.9 | **0** |
| Coral `0.2.12` (baseline) | 10 / 12 | 10 / 10 | 0 | 94.80 (excl. ERD) | 18.8 | 157.4 | 16 |
| Graphviz DOT | 12 / 12 | 7 / 12 | 13 | 68.80 | 21.9 | 181.2 | 0 |
| PlantUML / C4 / Cloud | 12 / 12 | 6 / 12 | 14 | 67.15 | 27.0 | 154.6 | 18 |
| Mermaid | 12 / 12 | 0 / 12 | 89 | 34.43 | 19.5 | 133.7 | 0 |

After the owner-requested 3-zone routing fix (`bm07`), Coral `0.2.14`
averages **`96.91 / 100`** (`12/12` Tier-1 pass, `0` hard defects) across all
benchmark families, including `100.0` on E-Commerce ERD, `99.33` on
Multi-Tenant SaaS ERD, `100.0` on GCP Data/ML, `98.93` on Azure Microservices,
and `95.89` on AWS 3-Tier VPC.

## Per-diagram comparison matrix

Scores show `Tier-2 composite (hard defects)` using the shared
`NormalizedDiagram0211` analyzer; `L=` notes the `0.2.14` living composite.

| Case | Family | Coral `0.2.12` | Coral `0.2.14` (`hifi` / `anemone`) | Mermaid | Graphviz DOT | PlantUML |
| --- | --- | --- | --- | --- | --- | --- |
| `bm01-fc-checkout` | Flowchart | 100.0 (0) | **100.0 (0, L=100.0)** | 41.0 (3) | 85.55 (0) | 100.0 (0) |
| `bm02-fc-release-ci` | Flowchart | 99.26 (0) | **99.07 (0, L=99.21)** | 35.67 (6) | 49.0 (2) | 80.0 (0) |
| `bm03-block-concept` | Block | 100.0 (0) | **100.0 (0, L=100.0)** | 31.33 (8) | 93.0 (0) | 88.7 (0) |
| `bm04-block-pid` | Block | 92.63 (0) | **93.30 (0, L=94.30)** | 64.0 (1) | 78.5 (0) | 19.0 (4) |
| `bm05-c4-context` | Architecture | 81.25 (0) | **87.45 (0, L=86.93)** | 34.0 (18) | 61.0 (0) | 67.0 (0) |
| `bm06-c4-container` | Architecture | 96.13 (0) | **97.00 (0, L=94.45)** | 0.0 (22) | 26.88 (5) | 53.17 (2) |
| `bm07-c4-grouped-3zone` | Architecture | 98.00 (0) | **92.00 (0, L=93.20)** | 0.0 (11) | 50.5 (2) | 50.0 (1) |
| `bm08-cloud-aws-vpc` | Infrastructure | 92.33 (0) | **95.89 (0, L=96.51)** | 33.0 (4) | 32.89 (3) | 14.0 (4) |
| `bm09-cloud-gcp-data` | Infrastructure | 97.00 (0) | **100.0 (0, L=100.0)** | 58.0 (2) | 94.0 (0) | 94.0 (0) |
| `bm10-cloud-azure-app` | Infrastructure | 91.40 (0) | **98.93 (0, L=99.09)** | 53.14 (2) | 94.0 (0) | 94.0 (0) |
| `bm11-erd-ecommerce` | ERD | N/A | **100.0 (0, L=100.0)** | 33.0 (4) | 94.0 (0) | 64.0 (2) |
| `bm12-erd-saas` | ERD | N/A | **99.33 (0, L=99.43)** | 30.0 (8) | 66.22 (1) | 81.89 (1) |

## Key takeaways for human review

- **All 12 cases pass with zero hard defects**, with support increasing from
  `10/12` to `12/12` diagrams (Crow's Foot ERD brought online at `100.0` and
  `99.33`) while eliminating all `16` `[symbol:]` boilerplate overrides from
  `0.2.12`. Individual scores and regressions remain visible in the matrix.
- **Cloud infrastructure (`bm08`–`bm10`)** jumped from `93.58` mean (`0.2.12`
  architecture workaround) to **`98.27` mean** (`95.89` AWS, `100.0` GCP,
  `98.93` Azure) with dedicated `@diagram infrastructure` semantics, provider
  tags, and zero hard defects — outscoring Mermaid (`48.05`), DOT (`73.63`),
  and PlantUML (`67.33`).
- **C4 Architecture (`bm05`–`bm06`)** improved on both Context (`81.25 -> 87.45`)
  and Container (`96.13 -> 97.00`) while adding structured `[technology: ...]`
  and `[description: ...]` cards, outscoring Mermaid C4 (`34.0` / `0.0`), DOT
  (`61.0` / `26.88`), and C4-PlantUML (`67.0` / `53.17`).
- **Resolved routing findings (`bm07-c4-grouped-3zone`):** The owner requested
  a targeted fix before release. Batch repair now checks every node body and
  caption, preventing a later fallback from crossing the Event Bus caption
  and creating a micro-jog or sideways cylinder approach. Both styles now
  score **`92.00`** (living **`93.20`**), with **`0` Tier-1 findings** and no
  edge crossings. Regression coverage exercises the complete layout and
  prepared-scene quality pipeline in `hifi` and `anemone`.
