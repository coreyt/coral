# Specification-as-AC: Migration and Format Conversion

This decomposed specification defines the acceptance contract for **Persona P5
(Diagram Author Migrating to Coral)** and **Persona P3 (Automation Consumer)**
under `UN-06`, `UN-09`, `REQ-D3`, and `REQ-E3`. It explicitly separates
**Shipped Baseline** behavior from **P5 Target** capabilities so capability
truth (`REQ-H1`) stays exact at all times.

## Supported Source Formats and Subsets

| Source Format | Status | Supported Subset | Explicit Refusals & Known Losses |
| --- | --- | --- | --- |
| **Mermaid Flowchart** | Shipped baseline (library converter, Chrome file preview, pasted headerless tab conversion) | Nodes, shapes, labels, edges, edge labels, subgraphs, direction | Styling directives, click handlers, unsupported shape variants reported as structured conversion losses. Non-destructive file-to-saved-`.coral` adoption in Chrome (`G-42`) is a **P5 Target**. |
| **Mermaid Class** | Shipped baseline (import-only) | Classes, interfaces, enums, ordered members, finite UML relationships | Packages, templates, notes/styles outside subset reported as loss; no Mermaid export. |
| **Mermaid Sequence** | Shipped baseline (bounded import & writer) | Ordered participants, messages, activations, notes, supported fragments | Complete Mermaid sequence parity not claimed; unsupported constructs emit typed losses. |
| **Mermaid ER** | Shipped baseline (partial) | Entities and relationships | Cardinality mapping into native GraphIR relationship ends tracked on roadmap; unmapped properties reported. |
| **Graphviz / DOT** | Shipped baseline (library converter & Chrome `.dot`/`.gv` file preview) | Directed/undirected graphs, nodes, edges, subgraphs/clusters, labels, scalar attributes | Chrome opens `.dot`/`.gv` files for preview with structured loss diagnostics; editable file-to-saved-`.coral` conversion in Chrome is a **P5 Target**. Unsupported Graphviz layout/record attributes reported as loss. |
| **PlantUML** | Shipped baseline (diagnostic line importer & Chrome `.puml` file preview) | Component, deployment, and use-case diagrams (typed elements, arrows, optional labels) | Unsupported diagram kinds (such as activity and ER) refused explicitly by name; Chrome editable file-to-saved-`.coral` adoption is a **P5 Target**; unsupported notes/colors/directives reported as loss. |
| **GraphIR 1 & 2** | Shipped baseline (named migrations, `REQ-E3`) | Explicit `1 -> 2` and `2 -> 3` migration adapters via `@graph-ir/core` | Never silently cast or relabeled to GraphIR 3. |

## P5 Migration Workflow Contract

| Capability | Operating Context | Status | Normative Acceptance Criteria |
| --- | --- | --- | --- |
| **Foreign-file preview & library conversion** | Desktop Chrome & `@coral-viz/language` | **Shipped Baseline** | Opens `.mmd`, `.dot`/`.gv`, and `.puml` files for non-destructive preview with structured conversion-loss diagnostics, converts pasted headerless Mermaid on tab switch, refuses unsupported diagram kinds by name, and never overwrites a saved-header Coral document silently. |
| **Single-diagram interactive adoption to `.coral`** | Desktop Chrome (editor) | **P5 Target (Planned)** | Non-destructively converts an opened Mermaid, DOT, or PlantUML file into an editable saved `.coral` draft without modifying the original file, displays the exact fidelity-loss breakdown before/after adoption, and shows the similarity score when available. |
| **Batch migration CLI** | Command line (Node.js >= 24.19.0) | **P5 Target (Planned)** | Accepts one or more files or directories plus an explicit output directory. **Non-destructive:** input files are read-only and never modified in place. Mirrors relative subdirectories under the output root and prevents stem collisions (e.g., `foo.mmd` and `foo.dot` in the same directory write `foo.mmd.coral` and `foo.dot.coral`). Non-zero exit codes trigger only on hard I/O or fatal errors; per-file refusals are recorded cleanly in the report. |
| **Fidelity-loss accounting** | Chrome & CLI | **Shipped Baseline** (structured diagnostics) | Every dropped construct, attribute, layout hint, or unsupported diagram kind is recorded with source file, line/span (where available), construct category, and plain-language impact description. Zero silent drops. |
| **Visual and structural similarity score** | Chrome & CLI | **P5 Target (Planned)** | Reports a deterministic `0–100%` score (rounded to 1 decimal place) with two clearly separated components so layout-engine differences (e.g., Dagre vs. ELK) never mask semantic fidelity: (1) **Structural/topological similarity** (`0–100%`: normalized node, edge, group, and label isomorphism, always computed) and (2) **Rendered visual similarity** (`0–100%`: layout-normalized rendered comparison when a configured external reference renderer is available, or explicit `NOT MEASURED (no reference renderer)` otherwise). Triage bands: `>= 90%` Ready, `70–89.9%` Review, `< 70%` Manual Follow-Up. |
| **Reference-renderer sandboxing** | CLI (external renderers) | **P5 Target (Planned)** | Any invocation of external reference renderers (PlantUML, Graphviz, Mermaid CLI) MUST pass safe/sandbox flags disabling `!include` directives, local file reads, arbitrary preprocessor execution, and network fetches on untrusted diagram inputs. |
| **Side-by-side batch report** | CLI output (HTML / Markdown) | **P5 Target (Planned)** | Generates a self-contained side-by-side review report indexing every discovered diagram: original relative path, detected format, status (`Migrated`, `Migrated with losses`, `Refused`), side-by-side original vs. Coral preview (when reference render exists), structural + visual similarity scores and triage band, exact fidelity-loss breakdown, and link to generated `.coral` output. |

## Verification Matrix (for P5 Target Implementation)

When P5 interactive file adoption, batch migration, similarity scoring, and
side-by-side reporting enter an active release slice, implementation must
satisfy:

1. **Non-destructive invariant:** Input directory SHA-256 tree digest before
   batch run equals input directory SHA-256 tree digest after batch run.
2. **Collision-free deterministic outputs:** Running the same batch twice with
   the same inputs and renderer versions produces byte-identical `.coral`
   files, loss lists, and similarity scores; mixed-extension same-stem files
   (`foo.mmd`, `foo.dot`, `foo.puml`) produce distinct output paths with zero
   overwrites.
3. **Honest unavailable-renderer scoring:** Disabling or omitting an external
   reference renderer never crashes the batch, still computes structural
   similarity, and marks rendered visual similarity explicitly as
   `NOT MEASURED (no reference renderer)`.
4. **Safe external execution:** Adversarial inputs containing PlantUML
   `!include` or external URLs are blocked by mandatory safe flags with zero
   unauthorized file reads or outbound requests.
5. **Report completeness:** Every input file discovered in the batch appears
   exactly once in the side-by-side report with its status, scores, triage
   band, losses, and output link (or refusal reason).
