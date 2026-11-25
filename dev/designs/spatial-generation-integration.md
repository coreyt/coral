# Spatial generation integration

Status: historical C35 implementation design, amended by R-041/R-042/R-054 and
the 2026-09-14 explicit Fix/retry policy.

Current authority: a rejected mixed candidate stops before mutation and waits
for explicit user Fix/retry. Only retryable provider transport failures replay
automatically within `maxRetries`. References below to mixed candidates consuming
the existing repair loop/budget describe current code to replace, not accepted
target behavior.

## Decision

C35 connects C30's immutable `SpatialPlan` to the existing generation loop and
reference editor without moving spatial authority into prompts, providers, or
React components. `GenerateRequest.spatial` is one optional but complete
context containing canonical GraphIR and captured node geometry. The released
R-025 `layout` prompt projection remains compatible context, never plan input.
Callers that omit `spatial` behave exactly as before, even when their prose
contains spatial-looking words.

## Snapshot and routing

App captures a provider-facing `SpatialGenerationContext { original, geometry }`
plus a separate UI-private editor revision token before asynchronous work. The
revision is never serialized into prompts or provider bodies. Geometry uses React Flow parent-relative `position`,
measured then explicit then data dimensions, `origin`, and `parentId`; it never
uses viewport coordinates. Missing or invalid authoritative geometry returns
`spatial.context.invalid` without fetch or mutation.

`generate` recognizes and resolves the plan once. A spatial-only request calls
`applySpatialPlan({ original, candidate: original, plan })` locally; a provider
adds no semantic value. A mixed request calls the provider only for its opaque
content clause. A compact resolved-plan summary is appended to the system
prompt—not merely `userPrompt`—so it survives the current single-turn,
multi-turn, and repair request paths for all providers. It says the provider
must not calculate or redefine spatial geometry. Help/fix and requests without
complete spatial context keep their existing routing.

## Mixed candidate boundary

A mixed candidate passes ordinary syntax and strict notation validation, then
is parsed with `@coral-viz/language.parse(candidateText, { graphId: original.id })`. Its graph
version and identity are normalized to the captured original. A narrow
surface-capability adapter hydrates only fields Coral text cannot spell:

- graph id, name, metadata, layout, and unknown extension fields;
- existing node dimensions, description, layout options, symbol, variant,
  ports, source information, unknown extensions, and absent property values
  whose original value has no Coral scalar spelling;
- existing edge identity, ports, description, routes, source information,
  non-line-style style fields, unknown extensions, and equivalently unspellable
  absent property values.

Nodes match by unique ID while retaining candidate nesting and sibling order.
Edges match by unique ID where possible, otherwise by stable occurrence of an
unchanged endpoint pair. Hydration never restores a missing entity or endpoint,
never changes candidate order/hierarchy, and never restores a spellable label,
type, scalar/JSON property, position, pin, or line style. Derived `sourceInfo`
is not treated as provider content. This adapter describes Coral surface
capability only; C30's preservation check remains the sole legality policy.
Existing spatial subjects/targets/scopes must come from the pre-provider
snapshot. Mixed additions are allowed only as unrelated content and do not
enter frozen geometry or outcome predicates.

The pipeline is:

```text
canonical graph + measured snapshot + prompt
        -> recognize/resolve immutable plan
        -> original graph (spatial-only) OR provider candidate (mixed)
        -> parse/strict notation validation (mixed)
        -> surface-only hydration (mixed)
        -> C30 preserve/transform/evaluate
        -> printWithDiagnostics
        -> ephemeral reparse/hydration/evaluation audit
        -> canonical graph + Coral text + evidence result
        -> revision-checked editor commit
```

Generation never materializes the returned graph. The committed graph
contains C30's transformed operation positions only, so omitted auto-layout
positions remain omitted. For print audit, text is reparsed and ephemerally
hydrated from the accepted sidecar, then passed through
`materializeSpatialSnapshot` so dependencies with no authored position can be
evaluated. That ephemeral audit graph is evaluated and discarded; its extra
positions never enter returned text or canonical state. C30's minimal
dependency materializer otherwise remains explicit and opt-in. Existing document Save,
GraphIR export, and recovery keep their current full rendered-view snapshot;
C35 adds no second save mode or persistent relation.

## Diagnostics, retry, and ranking

C35 adds generation-level codes (`spatial.context.invalid`, core `spatial.*`,
`spatial.unencodable`, `spatial.print`, and `spatial.stale`) to the existing
diagnostic envelope with `attempt` and `format`. Core codes are not widened.
Recognition/context/plan failures occur at attempt zero before fetch. Mixed
parse, strict notation, hydration/preservation, transform, print-audit, and
outcome failures return ordered diagnostics without another provider call.
Another candidate requires explicit user Fix/retry. Retryable provider transport
failures use R-042's bounded replay policy. Spatial candidates never use the
ordinary degraded notation-success path.

The transaction returns the first fully verified candidate. A rejected candidate
returns failure and no replacement; observed text may remain only as bounded
diagnostic evidence. No new pipeline ranking, successful-candidate tournament,
or partial constraint score is introduced.

## Mermaid transaction

A recognized spatial request against Mermaid makes no provider request and
returns `spatial.unencodable` plus a one-shot accessible chat action with
Convert and Cancel controls. Convert uses a pure in-memory Mermaid-to-canonical
Coral conversion, resolves/applies the original prompt against that provisional
snapshot, and does not invoke the existing immediate format-switch handler.
Cancel, double activation, conversion failure, provider failure, or spatial
failure leaves Mermaid text, format, canvas, canonical graph, routes, and
history unchanged. Success commits the Coral text and verified sidecar once;
its undo payload contains text, format, and canonical graph.

## Atomic commit and staleness

Before submission App captures a monotonically increasing editor revision plus
text and format identity. Text edits, node/edge/waypoint gestures, format,
notation/settings, reflow, load/recovery, undo/redo, and any newer submission
advance it. Acceptance compares the complete token immediately before mutation;
a mismatch emits `spatial.stale` to chat and does not touch document or history.
Overlapping submissions are last-started-wins.

On acceptance, printed text and canonical graph install through one replacement
boundary. Full layout preserves explicit positions, graph routes restore
waypoints, and projection provenance prevents a passive text parse from
discarding the sidecar. Failure creates no undo entry.

## Compatibility, exclusions, and verification

All new fields are additive and optional. Provider protocols remain unchanged;
only model IDs proven retired by official documentation may be corrected.
Persistent constraints, free-form spatial NLP, multi-operation plans, provider
parallelism, transport retry strategy, telemetry, Mermaid layout extensions,
and a second state architecture are outside C35.

Focused tests cover omitted/incomplete context; snapshot immutability; one
representative per operation family; mixed hydration/additions; wrong provider
coordinates; retry exhaustion; print audit; single/multi-turn/retry plan prompt
bodies; help/fix routing; every commit invalidator; and Mermaid convert/cancel/
double activation. Chromium intercepts mixed-provider requests and asserts
visible text, canvas bounds, save/recovery geometry, diagnostics, and failure
preservation without credentials. Exact-toolchain verify, focused coverage,
documentation, and compatibility gates complete the slice. Live provider smoke
is sanitized and non-gating when named credentials are available.
