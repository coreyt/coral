# Notation libraries

Enabled visual vocabularies for Coral 0.2.17. Saved source defaults to edition
`0.2.8` (ten baseline visual libraries) and explicitly pins `0.2.9` for
document-local custom symbols, `0.2.14` for Crow's Foot ERD, C4-grade
architecture, cloud infrastructure, and freeform blocks, or `0.2.17` for visual
hierarchical UML State.

| Notation library | Minimum visual edition | Use it for |
| --- | --- | --- |
| Block | `0.2.8` (`0.2.14` freeform shapes) | Functional blocks, signals, and freeform diagrams |
| Flowchart | `0.2.8` | Processes and decisions |
| BPMN | `0.2.8` | Business processes and events |
| Code | `0.2.8` | Call and module structure |
| Architecture | `0.2.8` (`0.2.14` C4-grade nodes) | Services, systems, containers, components, and boundaries |
| Infrastructure | `0.2.14` | Provider-tagged cloud topologies with geometric glyphs |
| ERD (Crow's Foot) | `0.2.14` | Entities, typed columns, PK/FK/UK constraints, and cardinality |
| AI/ML | `0.2.8` | Model, data, and agent pipelines |
| Data engineering | `0.2.8` | Sources, transforms, and stores |
| Sketch | `0.2.8` | Loose planning diagrams |
| UML class | `0.2.8` | Structured classifiers and relationships |
| UML sequence | `0.2.8` | Ordered interactions |
| UML state | `0.2.17` (`0.2.8` character-only) | Flat and hierarchical state machines |

Individual catalog entries are not a support claim; the
[capability matrix](capabilities.md) describes supported subsets and limits.
Browse the [shared example gallery](https://coreyt.github.io/coral/examples/)
for current example names, previews, downloads, and versioned editor links.

## Flowchart {#flowchart}

Flowchart supplies terminal, process, decision, input/output, document,
predefined-process, connector, and annotation symbols.

## Block {#block}

Edition `0.2.8` block diagrams show functional units and the signals between
them. Edition `0.2.14` expands `@diagram block` to ten freeform shapes (`box`,
`rounded`, `circle`, `oval`, `triangle`, `diamond`, `cylinder`, `pill`, `note`,
`group`) with inline node `[style: ...]`.

## BPMN {#bpmn}

BPMN supplies events, tasks, subprocesses, gateways, data, pools, lanes, and
annotations. A plain `->` between eligible BPMN nodes is interpreted as
Sequence Flow. Pools and lanes can be drawn, but `0.2.8` does not verify
participant, process, or lane membership. Cross-process connections and Message
Flow are outside the supported source meaning.

## ERD {#erd}

Chen ERD is disabled as a Coral 0.2.8 document type; its authored text remains
saveable. Explicit `@coralVersion "0.2.14"` enables Crow's Foot `@diagram erd`
with `entity`, `columns { name type [pk, fk, uk, null, not null] }`, and native
Crow's Foot connectors (`||--o{`, `||..o{`, `}|--|{`, and related markers),
while retired Chen syntax emits `coral.erd.chen.retired`.

## Code {#code}

Code supplies functions, classes, modules, variables, types, namespaces,
external dependencies, and comments.

## Architecture and infrastructure {#architecture}

Edition `0.2.8` architecture supplies services, stores, queues, infrastructure,
boundaries, and annotations for individual diagrams. Edition `0.2.14` expands
`@diagram architecture` with C4-grade nodes (`person`, `system`,
`externalSystem`, `container`, `component`, `systemBoundary`,
`containerBoundary`) and structured `[technology: "..."]` and
`[description: "..."]` metadata.

Edition `0.2.14` also adds dedicated cloud `@diagram infrastructure` (`users`,
`cdn`, `dns`, `waf`, `gateway`, `loadBalancer`, `compute`, `container`,
`kubernetes`, `function`, `database`, `cache`, `storage`, `queue`, `iam`,
`monitoring`, `ml`, `boundary`, `vpc`, `subnet`, `region`, `account`, `zone`,
`cluster`, `note`) with `[provider: "aws" | "azure" | "gcp" | "generic"]`,
built-in Apache-2.0 geometric glyphs, and optional imported vendor SVG artwork
through My Icons (`0.2.9`+ document-local symbols).

## AI and ML {#aiml}

AI/ML supplies models, datasets, vector stores, training, inference, agents,
retrieval, memory, tools, guardrails, and evaluation symbols.

## Data engineering {#data-engineering}

Data engineering supplies sources, transforms, streams, pipelines, warehouses,
lakes, orchestration, and monitoring symbols.

## Sketch {#sketch}

Sketch supplies hand-drawn-style steps, labels, boxes, decisions, circles,
clouds, and groups.

## UML class {#uml-class}

The tested core covers structured classes, interfaces, enums, ordered members,
and a finite relationship set (`[inheritance]`, `[implementation]`,
`[composition]`, `[aggregation]`, `[association]`, `[dependency]`) through
Coral source and Mermaid conversion. Conformance checks apply only to Coral's
bounded UML class profile, not complete UML 2.5.

## UML sequence {#uml-sequence}

Coral source represents ordered participants and messages, recursive fragments
(`alt`, `opt`, `loop`, `par`, `critical`, `break`), scoped activations, notes,
and Mermaid conversion. A visual capability that cannot preserve authored
meaning reports a finding and withholds rendering or export while keeping the
source editable and saveable. Complete Mermaid sequence compatibility is not
claimed.

## UML state {#uml-state}

Edition `0.2.8` `@diagram uml-state` remains a flat character-only profile
through the [character Render API](../../embed/reference/render-api.md#character-output),
and canvas/SVG targets report an unsupported-target finding. Explicit
`@coralVersion "0.2.17"` enables visual and hierarchical `@diagram uml-state`
(`uml-state@1.1.0`) with `state`, nested `composite`, `initial`, `final`,
`choice`, `fork`, `join`, `note`, `[description]`, `[style]`, `[annotation]`,
and `layout` across `lowfi`, `hifi`, and `anemone`.

An explicit symbol choice remains authored when a diagram type changes.
Unavailable symbols receive a finding; Coral does not silently replace them.

## Related

- [How to start from an example](../how-to/start-from-an-example.md)
- [Capability matrix](capabilities.md)
- [Shape primitives](shape-primitives.md)
- [Understanding connection rules](../explain/connection-rules.md)
