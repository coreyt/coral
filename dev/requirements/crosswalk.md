# Legacy Requirements Crosswalk (`R-001`–`R-067` and `UN-056`–`UN-067`)

This crosswalk maps every superseded requirement and user need from
requirements-0.2.9-legacy.md to its
current owner in the 3-tier architecture
([User Needs](user-needs.md),
[System Requirements](system-requirements.md),
[Engineering Constraints](engineering-constraints.md)).

## Legacy User Needs (`UN-056`–`UN-067`)

| Legacy UN | Current Owner(s) | Notes |
| --- | --- | --- |
| `UN-056` | `UN-01`, `UN-07` | Split into honest discovery/hosted delivery (`UN-01`) and local ownership (`UN-07`). |
| `UN-057` | `UN-01`, `UN-04`, `UN-05` | Examples, visual legibility, and faithful notation rendering. |
| `UN-058` | `UN-09` | Portable semantic interchange via GraphIR. |
| `UN-059` | `UN-05` | Scoped UML class authoring/export (spec in `supported-diagram-types.md`). |
| `UN-060` | `UN-05` | Core UML sequence authoring/export (spec in `supported-diagram-types.md`). |
| `UN-061` | `UN-08` | Zero-framework browser embedding (`@coral-viz/browser`). |
| `UN-062` | `UN-01`, `ENG-04`, `ENG-05` | Capability truth (`UN-01`/`REQ-H1`) separated from release governance (`ENG-04`/`ENG-05`). |
| `UN-063` | `UN-02`, `UN-03` | Text-first authority (`UN-02`) and visual/source parity (`UN-03`). |
| `UN-064` | `UN-02`, `UN-07` | Consistent file open, draft survival, and visible diagnostics. |
| `UN-067` | `UN-04` | Generalized into multi-domain visual legibility and layout reliability (`VAC-04.1`–`VAC-04.3`). |

## Legacy Requirements (`R-001`–`R-067`)

| Legacy ID | Legacy Title | Current Owner(s) | Disposition |
| --- | --- | --- | --- |
| `R-001` | Product boundary | `REQ-H1` | Consolidated |
| `R-002` | Versioned, reproducible workspace | `ENG-01`, `REQ-A1` | Split: versioning/toolchain to `ENG-01`, schema independence to `REQ-A1` |
| `R-003` | Canonical GraphIR | `REQ-E3`, `ENG-02` | Split: IR contract to `REQ-E3`, lock/integrity to `ENG-02` |
| `R-004` | Portable language loop | `REQ-A1`, `REQ-A2` | Consolidated |
| `R-005` | Visualization and editor behavior | `REQ-C1`, `REQ-D3`, `REQ-A3` | Consolidated (build-tool detail moved to `ARCHITECTURE.md`) |
| `R-006` | MCP behavior | `REQ-F3` | Consolidated |
| `R-007` | Release quality | `ENG-02`, `ENG-03`, `ENG-05` | Moved to Tier 3 Engineering Constraints |
| `R-008` | Honest documentation | `REQ-H1` | Consolidated |
| `R-009` | Language round-trip fidelity | `REQ-A2`, `REQ-A3` | Consolidated |
| `R-010` | Node and edge identity | `REQ-A2`, `REQ-F3` | Consolidated |
| `R-011` | Parse and print diagnostics | `REQ-A3` | Consolidated |
| `R-012` | Editor shell characterization | `REQ-C1` | Consolidated |
| `R-013` | Keyboard shortcuts are mounted | `REQ-C1`, `REQ-C3` | Split: basic shortcuts in `REQ-C1`, full keyboard workflow in `REQ-C3` (Catch-Up) |
| `R-014` | Accessible graph semantics and focus | `REQ-C3` | Moved to Catch-Up Release tier (`UN-12` / P4) |
| `R-015` | Canvas precision interactions | `REQ-C2`, `REQ-C1` | Consolidated |
| `R-016` | Connection gestures and live port compatibility | `REQ-C2` | Consolidated |
| `R-017` | Node positions and pinning in the DSL | `REQ-A2`, `REQ-B4` | Consolidated |
| `R-018` | Edge waypoints in the DSL | `REQ-A2`, `REQ-B4` | Consolidated |
| `R-019` | `@coral-viz/render` | `REQ-B2`, `REQ-F2` | Consolidated |
| `R-020` | PlantUML import | `REQ-D3` | Consolidated (`specs/migration-conversion.md`) |
| `R-021` | Conversion-loss reporting and converter unification | `REQ-D3` | Consolidated (`specs/migration-conversion.md`) |
| `R-022` | Deterministic text measurement | `REQ-B2` | Consolidated |
| `R-023` | SVG export | `REQ-E1`, `REQ-B2` | Consolidated |
| `R-024` | Raster export | `REQ-E1` | Consolidated |
| `R-025` | LLM spatial feedback, retry budget and output format | Deferred provider-AI (`dev/releases/0.2.10/llm-experiments.md`) | Parked outside active 0.2.10 product path |
| `R-026` | Large-graph performance budgets | `REQ-A1`, `REQ-A2`, `REQ-C2`, `REQ-E1`, `REQ-F1`, `ENG-03` | Budgets centralized in `specs/budgets-and-ceilings.md` |
| `R-027` | Editor fidelity and geometry authority | `REQ-B4`, `REQ-C1`, `REQ-A1` | Consolidated |
| `R-028` | Standalone HTML export | `REQ-E1` | Consolidated |
| `R-029` | Browser-level coverage | `ENG-03` | Moved to Tier 3 Engineering Constraints |
| `R-030` | Coverage targets | `ENG-03` | Floors centralized in `specs/budgets-and-ceilings.md` |
| `R-031` | The reference shell uses its extracted panes | `dev/ARCHITECTURE.md` | Architecture concern (not a user requirement) |
| `R-032` | Windows x64 release operation | `ENG-04` | Moved to Tier 3 Engineering Constraints |
| `R-033` | End-to-end scalable and selectable diagram fonts | `REQ-B2`, `REQ-E1` | Consolidated |
| `R-034` | Preserve published 0.2.x consumer boundary | `REQ-F2`, `ENG-01` | Split: consumer compat in `REQ-F2`, toolchain floor in `ENG-01` |
| `R-035` | Lossless JSON-safe GraphIR projection | `REQ-A2`, `REQ-E3` | Consolidated |
| `R-036` | Structured editor diagnostics and entity highlighting | `REQ-A3`, `REQ-C1` | Consolidated |
| `R-037` | One live reference-editor state owner | `REQ-C1`, `dev/ARCHITECTURE.md` | Behavioral contract in `REQ-C1`; structural design in `ARCHITECTURE.md` |
| `R-038` | Pointer-free node and edge creation | `REQ-C3` | Moved to Catch-Up Release tier (`UN-12` / P4) |
| `R-039` | Consolidated, notation-aware and responsive layout | `REQ-B3`, `REQ-B4`, `REQ-C2` | Consolidated |
| `R-040` | Deterministic spatial plans and verified outcomes | `REQ-G2` (on-device); deferred provider-AI | Active shared boundary retained in `REQ-G2` |
| `R-041` | Spatial generation and editor integration | `REQ-G2` (on-device); deferred provider-AI | Active shared boundary retained in `REQ-G2` |
| `R-042` | Bounded generation retries, cancellation, telemetry | `REQ-G1`, `REQ-G2`; deferred provider-AI | Zero-telemetry / cancellation retained in `REQ-G1`/`REQ-G2` |
| `R-043` | Completion evidence for domain notations and Mermaid | Archived (`dev/archive/requirements-0.2.9-legacy.md`) | Immutable historical closure record |
| `R-044` | User-feature browser verification coverage | `ENG-03` | Moved to Tier 3 Engineering Constraints |
| `R-045` | Hosted product shell and version identity | `REQ-H1`, `ENG-01` | Consolidated |
| `R-046` | Local document ownership and safe online updates | `REQ-A3`, `REQ-G1`, `REQ-H1` | Consolidated |
| `R-047` | Canonical hosted delivery and artifact identity | `ENG-01`, `ENG-02` | Moved to Tier 3 Engineering Constraints |
| `R-048` | Guided first use, examples, Help, privacy, support | `REQ-H1`, `REQ-D1` | Consolidated |
| `R-049` | Audience-separated, executable documentation | `REQ-H1` | Consolidated |
| `R-050` | Desktop browser and package-platform support | `ENG-04`, `REQ-H1` | Consolidated |
| `R-051` | Exact 0.2.5 release closure | Archived (`dev/archive/requirements-0.2.9-legacy.md`) | Immutable historical closure record |
| `R-052` | Text-primary editor workspace and visual-system conformance | `REQ-C1`, `REQ-C3` | Consolidated |
| `R-053` | Text-source authority and rendering synchronization | `REQ-A1`, `REQ-C1` | Consolidated |
| `R-054` | Bounded AI transactions, retention, material layout | `REQ-G2` | Consolidated (on-device `coralsmol` contract) |
| `R-055` | Normative Coral language authority and conformance | `REQ-A1`, `ENG-06` | Consolidated |
| `R-056` | Online product delivery and offline retirement | `REQ-H1`, `REQ-G1` | Consolidated |
| `R-057` | Faithful notation examples and rendering | `REQ-D1`, `REQ-B2` | Consolidated (`specs/supported-diagram-types.md`) |
| `R-058` | Portable notation profiles in GraphIR | `REQ-E3`, `REQ-D1` | Consolidated |
| `R-059` | Core UML class notation | `REQ-D1` | Consolidated (`specs/supported-diagram-types.md`) |
| `R-060` | Core sequence notation | `REQ-D1`, `REQ-B3` | Consolidated (`specs/supported-diagram-types.md`) |
| `R-061` | Browser-native Coral rendering | `REQ-F1` | Consolidated (`specs/budgets-and-ceilings.md`) |
| `R-062` | Documentation, platform, and release truth | `REQ-H1`, `ENG-04`, `ENG-05` | Consolidated |
| `R-063` | Editor and Coral-source parity | `REQ-C1`, `REQ-A2` | Consolidated |
| `R-064` | Consistent file open | `REQ-A3`, `REQ-C1` | Consolidated |
| `R-065` | Document-local user symbols | `REQ-D2` | Consolidated |
| `R-066` | Opt-in on-device diagram editing model | `REQ-G1`, `REQ-G2` | Consolidated (`specs/budgets-and-ceilings.md`) |
| `R-067` | Independent symbol and caption sizing | `REQ-B1`, `REQ-E3` | Consolidated (`specs/independent-symbol-caption.md`) |
| `CHAR028-3` | MonoTrue v0.2.0 / Diagram Set 1 character output | `REQ-E2` | Consolidated (`specs/supported-diagram-types.md`) |
