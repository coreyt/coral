# Specification-as-AC: Supported Diagram Types

This specification serves directly as the normative Verification Acceptance
Criterion for `REQ-D1` and `REQ-E2` and supports `UN-01`, `UN-05`, and `UN-10`.
Every supported, bounded, and disabled diagram type names its authoritative
source standard or validator, supported output surfaces, and explicit
exceptions.

**Conformance rule:** Explicit strict checks certify only the versioned Coral
U1/U2 inventory listed below—never full external ISO/OMG standard conformance.

## Diagram Types Matrix

| Diagram Type | Status & Source Edition | Source Standard / Validator | Visual Surfaces (Canvas / SVG / Browser) | Character Surfaces (ASCII / MonoTrue) | Explicit Exceptions & Non-Claims |
| --- | --- | --- | --- | --- | --- |
| `flowchart` | Supported (0.2.8 / 0.2.9) | ISO 5807 (informative reference); Coral U1 symbol catalog + bounded U2 flowchart card | Supported (generic ELK, `ORTHOGONAL` default + contour/route checks) | Supported (routed ASCII + MonoTrue Diagram Set 1) | Example-tested subset covers terminal, process, decision, start/end variants, data, document, predefined-process, connector, annotation, flow edges. Does not claim full ISO 5807 compliance. |
| `block` | Supported (0.2.8 / 0.2.9) | Coral-native U1 block catalog + bounded U2 block card (no external ISO validator) | Supported (`POLYLINE` default) | Supported (routed ASCII + MonoTrue Diagram Set 1) | Functional blocks and signal connections only. No electrical/circuit simulation or SysML BDD compliance. |
| `bpmn` | Supported — bounded subset (0.2.8 / 0.2.9) | ISO/IEC 19510 (BPMN 2.0, informative reference); Coral U1 BPMN catalog + bounded U2 BPMN card | Supported (`ORTHOGONAL` default) | Supported (routed ASCII + MonoTrue Diagram Set 1) | Plain `->` between eligible BPMN nodes maps to Sequence Flow. Pools and lanes draw visually, but participant/process/lane membership is unverified. Cross-process connections, Message Flow, choreography, and full ISO/IEC 19510 validation are excluded. |
| `architecture` | Supported (0.2.8 / 0.2.9) | Coral-native U1 architecture catalog + bounded U2 architecture card (no external ISO validator) | Supported (`POLYLINE` default) | Not supported (refuses explicitly) | Covers actor, service, database, queue, API, infrastructure, boundaries, sync/data edges. Outside-captioned `actor` governed by `REQ-B1` and `DRQ-10`. No C4 model semantics or vendor-specific cloud icon sets (AWS/GCP/Azure). |
| `aiml` | Supported (0.2.8 / 0.2.9) | Coral-native U1 AI/ML catalog + bounded U2 AI/ML card (no external ISO validator) | Supported (`ORTHOGONAL` default) | Not supported (refuses explicitly) | Covers model, LLM, dataset, vector store, embedding, training, inference, agent, retrieval, memory, tool, guardrail, evaluator. Outside-captioned glyphs (`actor`, `brain`, `neural-net`) governed by `REQ-B1` and `DRQ-10`. Hyphenated relations (`data-flow`, `tool-use`) gated on `ENG-06` HITL notation review. No model execution/inspection. |
| `data-engineering` | Supported (0.2.8 / 0.2.9) | Coral-native U1 data-engineering catalog + bounded U2 card (no external ISO validator) | Supported (`ORTHOGONAL` default) | Not supported (refuses explicitly) | Covers source, transform, stream, pipeline, quality, warehouse, lake, orchestration, sink, monitoring. Outside-captioned `funnel` governed by `REQ-B1` and `DRQ-10`. Hyphenated relation `stream-flow` gated on `ENG-06` HITL notation review. No live pipeline execution or platform connectors. |
| `code` | Supported (0.2.8 / 0.2.9) | Coral-native U1 code catalog + bounded U2 card (no external ISO validator) | Supported (`ORTHOGONAL` default) | Not supported (refuses explicitly) | Covers module, class, function, variable, type, namespace, external dependency, comment, containment. No repository indexing or static source-code analysis (`REQ-H1`). |
| `sketch` | Supported (0.2.8 / 0.2.9) | Coral-native U1 sketch catalog + bounded U2 card (no external ISO validator) | Supported (`SPLINES` default) | Not supported (refuses explicitly) | Loose planning diagrams (step, box, decision, circle, cloud, label, group). No UI wireframes or freehand vector drawing. |
| `uml-class` | Supported — tested core (0.2.8 / 0.2.9) | ISO/IEC 19505-2 (UML 2.5.1, informative reference); Coral U1 UML-class catalog + bounded U2 card | Supported (`ORTHOGONAL` default) | Supported (bounded class-box ASCII + MonoTrue) | Covers structured classes, interfaces, enums, ordered members, and finite relationship set via Coral source and Mermaid import. Excludes packages, templates, association classes, arbitrary stereotypes, XMI/UML export, AI UML generation, and full ISO/IEC 19505 conformance. |
| `uml-sequence` | Supported — bounded core (0.2.8 / 0.2.9) | ISO/IEC 19505-2 (UML 2.5.1, informative reference); Coral U1 sequence catalog + specialized sequence integrity validator | Supported (deterministic specialized sequence layout; capability-gated visual editing) | Supported (bounded lifeline/message ASCII + MonoTrue) | Covers ordered participants, messages, recursive fragments, scoped activations, notes, and bounded Mermaid import. Targets unable to preserve meaning refuse explicitly with findings while keeping source saveable. Full visual editing of recursive fragments is deferred outside 0.2.10; complete Mermaid sequence parity is not claimed. |
| `uml-state` | Character-only — partial (0.2.8) | ISO/IEC 19505-2 (UML 2.5.1, informative reference); empty-symbol catalog, generic U1, explicitly partial U2 card | Refused explicitly (absent from visual pickers; canvas/SVG emit unsupported-target finding) | Supported — flat branching state pictures only | Authored source remains saveable. Nested/hierarchical states, orthogonal regions, and visual canvas/SVG rendering are excluded. |
| `erd` (Chen) | Disabled | Unassigned (ownership and cardinality semantics under research) | Refused explicitly | Refused explicitly | Authored source text remains saveable; no visual editor, layout, or rendering support is claimed. |

## Cross-Cutting Type Rules (Normative AC)

1. **No silent symbol substitution:** Changing a document's diagram type keeps
   explicitly authored symbol choices and emits an unavailable-symbol finding
   rather than replacing symbols silently.
2. **Catalog membership is not a support claim:** Only subsets backed by
   versioned examples, U1/U2 tests, and surface checks carry support claims.
3. **Document-local user symbols (`0.2.9` edition):** Permitted across enabled
   visual profiles under `REQ-D2`. On character targets, `flowchart` renders
   document-local user symbols as labelled fallback boxes with a
   `character.symbol.local-fallback` finding, while `block`, `bpmn`,
   `uml-class`, `uml-sequence`, and `uml-state` refuse custom user symbols
   explicitly.
4. **Explicitly unsupported families:** C4, vendor-specific cloud iconography,
   UI wireframes, and complete external ISO/OMG standard validation are outside
   current scope and must remain explicitly disclaimed in public docs.
