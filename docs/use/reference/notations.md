# Notation libraries

Enabled visual vocabularies for Coral 0.2.12, using saved-source edition 0.2.8.

| Notation library | Use it for |
| --- | --- |
| Block | Functional blocks and signals |
| Flowchart | Processes and decisions |
| BPMN | Business processes and events |
| Code | Call and module structure |
| Architecture | Services and infrastructure |
| AI/ML | Model, data and agent pipelines |
| Data engineering | Sources, transforms and stores |
| Sketch | Loose planning diagrams |
| UML class | Structured classifiers and relationships |
| UML sequence | Ordered interactions |

Individual catalog entries are not a support claim; the
[capability matrix](capabilities.md) describes supported subsets and limits.
Browse the [shared example gallery](https://coreyt.github.io/coral/examples/)
for current example names, previews, downloads and versioned editor links.

UML State is a separate bounded source/character edition, available through
the [character Render API](../../embed/reference/render-api.md#character-output).
Its source can be saved, but it is absent from visual creation choices and the
canvas/SVG paths report an unsupported-target finding.

## Flowchart {#flowchart}

Flowchart supplies terminal, process, decision, input/output, document,
predefined-process, connector, and annotation symbols.

## Block {#block}

Block diagrams show functional units and the signals between them.

## BPMN {#bpmn}

BPMN supplies events, tasks, subprocesses, gateways, data, pools, lanes, and
annotations. A plain `->` between eligible BPMN nodes is interpreted as
Sequence Flow. Pools and lanes can be drawn, but 0.2.8 does not verify
participant, process, or lane membership. Cross-process connections and
Message Flow are outside the supported source meaning.

Chen ERD is disabled as a Coral 0.2.8 document type while its ownership and
cardinality contract is researched. Its authored text remains saveable.

## Code {#code}

Code supplies functions, classes, modules, variables, types, namespaces,
external dependencies, and comments.

## Architecture {#architecture}

Architecture supplies services, stores, queues, infrastructure, boundaries,
and annotations.

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
and a finite relationship set through Coral source and Mermaid import. It does
not claim complete UML, packages/templates, association classes, arbitrary
stereotypes, UML export, or AI UML generation.

## UML sequence {#uml-sequence}

Coral source represents ordered participants and messages, recursive
fragments, scoped activations, notes, and the approved import subset. A visual
capability that cannot preserve this meaning reports a finding and withholds
rendering or export; the source remains editable and saveable. Full visual
creation and editing of recursive sequence structures is planned for 0.2.10.
Complete Mermaid sequence compatibility is not claimed.

An explicit symbol choice remains authored when a diagram type changes.
Unavailable symbols receive a finding; Coral does not silently replace them.

## Related

- [How to start from an example](../how-to/start-from-an-example.md)
- [Capability matrix](capabilities.md)
- [Shape primitives](shape-primitives.md)
- [Understanding connection rules](../explain/connection-rules.md)
