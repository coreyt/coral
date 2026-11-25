# Semantic-lint assessment

Status: accepted after independent design review and implementation re-review on
2026-09-15. This describes internal evidence only. It does not authorize a
0.2.5 product feature or application gate.

## Decision

Coral needs a narrow seam that stops deterministic graph integrity,
notation-capability constraints, and likely-meaning advice from being treated as
one undifferentiated "lint" result. Slice 48 will implement a pure internal
assessment function over already-parsed `GraphNode[]` and `GraphEdge[]`.
Application and provider paths will not import it.

The closed internal contract is:

```ts
type SemanticAssessmentCode =
  | 'graph.edge.missing-source'
  | 'graph.edge.missing-target'
  | 'graph.node.missing-parent'
  | 'graph.topology.disconnected'
  | 'notation.node.unsupported-type'
  | 'notation.edge.atypical';

interface SemanticAssessmentFinding {
  readonly code: SemanticAssessmentCode;
  readonly category: 'integrity' | 'capability' | 'advice';
  readonly severity: 'error' | 'review';
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly components?: readonly (readonly string[])[];
  readonly message: string;
}
```

The function returns readonly findings with:

- a stable code;
- category: `integrity`, `capability`, or `advice`;
- severity: `error` only for deterministic integrity/capability evidence and
  `review` for context-dependent evidence;
- affected node and edge IDs; and
- an explanation that describes observed structure without claiming intent.

Immutability means a readonly TypeScript contract plus verified nonmutation; it
does not promise runtime `Object.freeze`. Ordering is deterministic by category
precedence (`integrity`, `capability`, `advice`), then code, joined edge IDs,
joined node IDs, and joined component IDs. Every ID list is sorted. The input
arrays and entities are never mutated.

## Existing-stage inventory

| Stage | Current evidence | Classification and Slice 48 disposition |
| --- | --- | --- |
| Coral/Mermaid parsing and `validateOutput` | Syntax errors and non-empty node set | Keep as syntax. Endpoint existence is not currently checked by the Coral parser. |
| AI format policy | Explicit Coral/Mermaid allowlist | Keep as format capability, owned by Slice 47. |
| `lintAgainstNotation` node types | Active notation versus mapped DSL types | Capability error; preserve current generation behavior. Add stable metadata only. |
| `lintAgainstNotation` connection rules | "not typical" warning for four mapped notations | Context-dependent advice. Preserve internal/silent behavior and expose stable metadata only. |
| Structural drift/material change | Node membership, topology and layout evidence | Not semantic lint; owned by Slice 47. The old scalar drift helper is not expanded here. |
| Slice 49 semantic corpus | 45 parse-valid model-authored mutations, 11 labels | Candidate fixture evidence. It validates records, not detector precision or universal rules. |

Supported AI text output remains Coral and the bounded Mermaid subset. The
internal helper consumes the common parsed node/edge shape, so it does not add a
format parser. Notation relationship lookup currently covers architecture,
flowchart, AI/ML, and data-engineering only. Unknown or uncovered notations yield
no fabricated relationship advice.

## Rule disposition

| Candidate | Evidence class | Slice 48 disposition |
| --- | --- | --- |
| Edge source/target absent from node identities | Deterministic graph integrity | Implement internal finding per missing endpoint. No repair and no 0.2.5 app gate. |
| Node parent absent from node identities | Deterministic containment integrity | Implement one internal finding per missing parent. Valid parent/child pairs participate in topology. |
| Node type unavailable in selected notation | Deterministic notation capability | Reuse existing error; enrich with stable code/entity evidence without changing behavior. |
| Connection absent from notation's typical-rule table | Notation advice | Reuse existing warning as `review`; never block, notify, or retry. |
| More than one weakly connected component / isolated node | Topology evidence only | Report one graph-level review finding with canonically sorted `components`. Do not call it an orphan/error. Empty and single-node graphs produce no finding. |
| Missing expected connector, order/direction, unreachable/dead-end state, decision completeness, contradiction, labels/types, grouping, terminal boundary | Requires description, notation semantics, or author intent | Keep as future corpus labels; no context-free detector. |
| Duplicate/parallel relationship | Ambiguous without relationship identity and intent | Do not flag; parallel edges are legitimate. |
| Geometry, overlap, routing, displacement | Layout quality | Exclude; Slice 47 owns it. |

Dangling references and disconnected components are deliberately different:
the former points at an identity that does not exist; the latter contains valid
identities and may be intentional. Deleting a node and all incident edges is
valid restructuring. The assessment never synthesizes an edge.

## Pure seam

The internal function accepts parsed nodes, edges, and an optional notation ID.
It first records missing edge endpoints and parent identities, then reuses
notation lint results, then computes weakly connected components using only
edges whose endpoints exist and valid parent-child containment as undirected
adjacency. It emits exactly one disconnected graph finding containing every
component; each component and the outer component list are lexically sorted.
Duplicate node/edge IDs remain parser/schema ownership. The seam requires the
unique identities produced by supported parsers and throws on duplicate input
rather than silently normalizing it. Relationship lint metadata carries source
and target IDs directly; findings never recover endpoints through an ambiguous
edge-ID lookup.

The existing `LintResult` gains stable `code`, `category`, and relevant
`edgeId` metadata. Existing consumers continue to decide behavior from severity;
there is no new warning consumer. Slice 48's helper maps notation `error` to
capability/error and notation `warning` to advice/review. The stale automatic-
retry comments and unused retry-prompt formatter are removed. The relationship
lookup's intentionally narrower private mapping is documented as such instead
of claiming parity with `notationRef.ts`; expanding notation relationship advice
requires later fixture review and is not coupled to current capability checks.

No module-level registry, storage, React state, async work, provider call,
telemetry, auto-fix, prompt, or retry is introduced. The helper is intentionally
not exported through a package public entry point and is not imported by
`generate.ts`, `useLlmChat.ts`, controller code, or UI components.

## Verification design

Focused tests use small hand-authored graph fixtures because the behavior is
structural and deterministic:

- missing source, missing target, and both missing preserve edge/node IDs;
- missing parent is integrity/error, while valid containment joins topology;
- invalid notation type is capability/error;
- atypical relationship is advice/review;
- two valid components produce review-only topology evidence, while empty,
  single-node, loop, terminal, and parallel-edge examples do not become semantic
  errors;
- unknown/uncovered notation adds no relationship finding;
- output ordering is stable and inputs remain unchanged;
- generation returns no semantic warning diagnostics, chat suppresses even a
  legacy injected `lintWarnings` field, and neither path retries for advice;
- the Slice 49 semantic corpus remains parse-valid with valid record identities.

The corpus may support a later calibrated detector, but Slice 48 reports only
coverage counts and known limitations. A future release must define a labeled
negative control set and precision/recall acceptance before shipping any
meaning-based rule.

Current-consumer inspection is a closure gate. Generated candidates pass through
transactional publication, and layout failure must roll back without partial
application; renderers may defensively omit undrawable edges. Focused evidence
must determine whether that behavior safely contains dangling references. If it
does not, the gap returns to Slice 47/release acceptance immediately. If it does,
the parser-level residual is recorded as `S48-F1`, explicitly unallocated until
a future parser/schema-integrity slice is approved; it is not mislabeled as a
semantic-rule backlog item.

## Rejected alternatives

- Integrating the helper into candidate application: conflicts with the
  approved 0.2.5 policy and would create a new release gate.
- Treating every disconnected node/component, dead end, loop, or unusual type
  pair as invalid: creates obvious false positives and invents author intent.
- Calling a provider to judge semantics at runtime: adds cost, privacy,
  nondeterminism, retry, and UX policy outside this slice.
- Extending GraphIR/Coral syntax with intent metadata: allocated to 0.2.6 and
  requires coordinated language/schema work.
- Building a general lint framework: unnecessary for the bounded assessment and
  overbuilds an unallocated feature.
