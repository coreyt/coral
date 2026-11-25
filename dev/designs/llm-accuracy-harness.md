# LLM accuracy harness, fixture corpus, and infrastructure evaluation

## Final Slice 49 acceptance amendment — 2026-09-15

The harness is accepted as deterministic local evaluation infrastructure, not
as evidence that any provider/model meets an accuracy threshold. Its release
contract keeps structural validity, expected content, unintended changes,
notation findings, skipped configurations, and manual-review cases as separate
dimensions. Slice 47's operation-aware material evidence owns geometry and
layout acceptance; Slice 48's findings remain internal advice/evidence.

A no-key CLI run must make no provider call and report skipped configurations.
Live/costed provider scorecards, production sampling defaults and corpus-driven
few-shot selection require later authorization and are not Slice 49 closure
gates. The corpus audit described in `coral-defect-corpus.md` is the provenance
and expected-result gate for inputs consumed by this harness.

Expected edge additions and removals are counted endpoint pairs so requested
restructures do not look like unintended changes and parallel siblings are not
blanket-exempted. Raw substring expectations use the bytes valid Coral must
contain (including escapes). Fixtures whose correctness needs geometry or
identity inspection carry an explicit manual-review flag; prose limitations
alone are not machine-readable acceptance. Cases with validity/notation-only
signals remain low-signal infrastructure fixtures, not provider-quality proof.
Expected-change lists authorize differences for unintended-change scoring; they
do not prove requested edits happened. Cases 002–004 therefore remain explicit
fulfillment-review cases. `HarnessRun` retains each configured run's candidate
DSL in the local scorecard next to its score, allowing that review to occur;
the output directory remains gitignored and is never production telemetry.

## Release integration disposition — 2026-09-14

The source branch is now mechanically imported in release merge `05f6824`.
This supersedes older provisional-worktree/approval statements below. Current
Slice 45 decisions govern: Coral plus Mermaid flowchart only; final construct
validation belongs to 47/48. The harness type allowlist is now `['flowchart']`,
with accepted/rejected/missing-type tests. It is not a production-format gate.
Scoring now separates node permissions from incident edges; the rename fixture
permits only its label field. Original edge IDs permit individual changes, and
each expected-new-edge entry permits one addition, not an unlimited pair.
Stable node IDs and endpoint-pair/label multiset matching remain assumptions;
this score does not prove geometry, semantics or fulfillment of the request.
Full field-level edge/style/route fidelity remains an acceptance gap.

See Slice 49 reconciliation
for evidence and unresolved repair/retry acceptance. Candidate IDs S49-C1–C7
are slice-local; previous R-049.x/R-048.x references are not global allocations.
Historical review approvals and Phase completion below do not close these gates.

## Historical design and review record

Status: accepted after one independent design review round; amended once
(round 2, additive) by [`llm-backend-reliability-strategy.md`](llm-backend-reliability-strategy.md)
to add unintended-change detection. See "Review log" for both rounds.

Supports Slice 49 (`experiment/LLM-improvements`, not yet in the approved
0.2.5 plan). Covers aspects (b) fixture corpus, (c) comparison harness and
sampling parameters, and (d) infrastructure evaluation criteria. Does not
cover aspect (a) — pure requirements/AC prose lives in the slice's draft plan,
not here — and does not cover semantic linting, which is out of scope per the
slice's reconciliation (owned by the slice Slice 45 proposes).

`dev/releases/ai-editing-exploration.md` and `dev/releases/0.2.5/slice-45/decision-log.md`
are cited below as grounding for the five required case types and the
Mermaid-allowlist/edit-lock constraints. Both exist only as uncommitted work
in the sibling `coral-0.2.5` worktree at the time of writing — not on any
branch. Treat every citation of them here as provisional; re-check against
whatever actually lands on `release/0.2.5` before this slice's merge-back.

## Scope and delta

Baseline: `release/0.2.5` at `75424e6`. Nothing production-facing changes
except one additive type/request-builder extension (see "Sampling
parameters"). This design adds:

- `packages/diagram-editor/test/llm/fixtures/accuracy/` — the fixture corpus.
- `packages/diagram-editor/test/llm/accuracy-scoring.ts` — pure, TDD'd scoring
  functions (`scoreResult`, fixture loading), independently testable without
  a live provider call.
- `packages/diagram-editor/test/llm/accuracy-harness.ts` — the CLI runner, a
  manual live-key script in the same family as the existing `test-e2e.ts`/
  `test-live.ts`, not part of `npm run verify` or CI.
- Both new `.ts` files (and any further shared helper modules) are added to
  `packages/diagram-editor/tsconfig.manual.json`'s `include`, alongside the
  three files already there, so they stay type-checked via `typecheck:manual`
  even though excluded from `npm run verify` execution — the same treatment
  `test-e2e.ts` already gets, not a new convention.

## Fixture corpus format

Each fixture is a small directory under `fixtures/accuracy/<case-id>/`:

```text
fixtures/accuracy/001-generate-login-flow/
  meta.json       # AccuracyFixtureMeta
  prompt.txt      # the natural-language instruction
  existing.txt    # optional: prior diagram content for modify/fix/spatial/notation cases
  diagnostics.txt # optional: present for fix cases
  layout.json     # optional: present for 'spatial' cases — see below
```

`existing.txt` (not `existing.coral`, since a fixture's prior content may be
Mermaid text when `outputFormat: 'mermaid'`; the extension no longer implies
the format — `meta.json.outputFormat` is authoritative).

`meta.json` shape:

```ts
interface AccuracyFixtureMeta {
  caseId: string;
  caseType: 'generate' | 'local-edit' | 'add-subgraph' | 'restructure' | 'injected-mistake'
          | 'ambiguous' | 'spatial' | 'notation' | 'adversarial-label';
  notationId?: string;           // for 'notation' cases
  outputFormat: 'coral' | 'mermaid';
  mermaidDiagramType?: string;   // required when outputFormat is 'mermaid'; checked against
                                  // the allowlist below before the harness runs the fixture
  expectedSubstrings?: string[]; // for 'adversarial-label' and similar content-fidelity cases;
                                  // every entry must appear verbatim in the candidate DSL
  provenance: string;            // who/what authored it and why, one sentence
  limitations: string;           // known gaps in what this fixture can prove
  tags?: string[];
  expectedChangedNodeIds?: string[]; // local-edit/add-subgraph/restructure only — see "Amendment (round 2)"
  expectedChangedEdgeIds?: string[];
}
```

`caseType` values `generate` through `injected-mistake` are the five required
cases from `ai-editing-exploration.md`; `ambiguous`, `spatial`, `notation`,
and `adversarial-label` are this slice's additions per aspect (b).

**Case-type to request/scoring treatment** (resolves the review's "hidden
complexity in `fixtureToRequest`" finding — this table is normative, not
illustrative):

| caseType | Reads | `GenerateRequest` fields populated | Scored how |
| --- | --- | --- | --- |
| `generate` | `prompt.txt` | `prompt` | Mechanical (validity only; no original to diff against) |
| `local-edit`, `add-subgraph`, `restructure` | `prompt.txt`, `existing.txt`, `meta.json.expectedChanged*Ids` | `prompt`, `existingDsl` | Mechanical (validity, drift%, lint, unintended-change diff) |
| `notation` | + `meta.json.notationId` | + `notationId` | Mechanical + lint |
| `fix` (subset of the five, when diagnostics present) | + `diagnostics.txt` | + `diagnostics` | Mechanical |
| `spatial` | + `layout.json` | + `layout` (the `GenerateRequest.layout` prompt-context field — **not** the deterministic `spatial` field; see below) | Mechanical, plus manual check that the candidate honors the described placement (not machine-verifiable from structure alone) |
| `adversarial-label` | + `meta.json.expectedSubstrings` | `prompt`, optional `existingDsl` | Mechanical + content check (`expectedSubstrings`) |
| `ambiguous`, `injected-mistake` | as above | as above | Mechanical only; `requiresManualReview: true` always set — see "Scoring model" |

`layout.json` (only for `spatial` fixtures) matches `GenerateRequest['layout']`
exactly — plain node positions used for R-025's prompt-level spatial context
(`composeLayoutContext`), which is what "the model reasons about a spatial
instruction from prompt context" actually means:

```ts
// same shape as GenerateRequest['layout']
{ nodes: Array<{ id: string; label?: string; x: number; y: number; pinned?: boolean }>,
  edges: Array<{ id: string; source: string; target: string; routingPoints?: Array<{x:number;y:number}> }> }
```

This deliberately does **not** exercise `GenerateRequest.spatial` (R-040's
deterministic command/plan pipeline, keyed on `CapturedNodeGeometry` and a
captured `GraphIR`) — that pipeline already has its own dedicated fixtures
and tests under `test/llm/spatial/`. This corpus's `spatial` case type tests
whether free-text spatial phrasing lands correctly *through the LLM prompt*,
which is a distinct, currently-unmeasured question from R-040's deterministic
plan correctness.

Mermaid fixtures name their `mermaidDiagramType` and are checked against a
single named allowlist source of truth:

```ts
// fixtures/accuracy/mermaid-allowlist.ts
export const MERMAID_ALLOWLIST: readonly string[] | null = null; // unset until Slice 45 freezes it
```

The harness skips any Mermaid fixture when `MERMAID_ALLOWLIST` is `null` or
does not include the fixture's `mermaidDiagramType`, printing which fixtures
were skipped and why. Updating this one constant is the entire integration
point once Slice 45's allowlist exists — no other file changes.

No fixture may contain content copied from production telemetry or a real
user session (S49-C2 AC-1); each is authored for this corpus specifically.

**Authoring requirement, found during implementation and stated explicitly
here rather than left implicit:** every node in an `existing.txt` used for a
`local-edit`/`add-subgraph`/`restructure` fixture must carry an explicit
`as "id"` clause (confirmed real and supported —
`packages/language/src/parser/index.ts`'s `parseNodeDeclaration` regex
accepts `type "Label" as "id"` for nodes, the same as it does for edges).
Without it, a node's ID is auto-derived from its label
(`labelToId`), so a genuine label change also changes the node's ID —
`scoreResult`'s node-field diff (which matches by ID) would then see the old
ID vanish and register it as *drift* (node loss), not as an `UnintendedChange`
on a matched node's `label` field. This is not a bug in `scoreResult`; it is
a real property of how Coral identity works, and fixture authors need to
know to opt into stable node identity explicitly. **This also surfaced a
real gap for aspect (e)'s grammar-reference audit**: `CORAL_GRAMMAR_REFERENCE`
(`packages/diagram-editor/src/llm/prompt.ts`, the system prompt given to the
model) documents the node-level `as` clause nowhere at all — the model is
never told this exists, even though the parser supports it.

### Corpus adapter: drawing `generate` fixtures from `coral-defect-corpus.md`

**Added by a follow-up review pass**, which found that
`coral-defect-corpus.md` and the slice draft plan both assert this harness
draws fixtures from the larger corpus's `manifest.json`, but this document
never said how — a real schema mismatch (`fixtures/accuracy/<case-id>/`'s
one-directory-per-case format vs. the manifest's per-slug record with three
description files and no `AccuracyFixtureMeta` shape at all) that a reader
could not have resolved from either document alone.

**Scope, corrected:** the corpus feeds `generate` fixtures only, not
`notation` fixtures as originally claimed — `coral-defect-corpus.md`'s
`SourceMeta` records a *Mermaid* `diagramType` (flowchart/sequenceDiagram/
classDiagram/stateDiagram/erDiagram), not a Coral notation ID, and the two
taxonomies don't map cleanly (most Mermaid-derived diagrams use only base
Coral types, with no corresponding entry in `notationLint.ts`'s notation
registry). The `notation` case type stays exclusively hand-authored.

The adapter, run once at harness startup to materialize corpus-backed
fixtures alongside the hand-authored ones:

```ts
function corpusToGenerateFixtures(manifest: CorpusManifest): LoadedFixture[] {
  // For each slug with a complete, review-passed entry:
  //   emit THREE fixtures, one per independent description — `${slug}-generate-d1/2/3` —
  //   rather than collapsing to one, so the corpus also measures prompt-phrasing
  //   sensitivity (the same diagram, described three different ways, should
  //   converge on structurally similar output; divergence is itself a finding).
  // meta: { caseId: `${slug}-generate-d${n}`, caseType: 'generate',
  //         outputFormat: 'coral', provenance: manifest[slug].source.sourceUrl,
  //         limitations: manifest[slug].descriptions.review notes for that file }
  // prompt: the description file's raw text
  // existingDsl: undefined (fresh generation; no prior diagram)
  // originalNodeIds/originalNodes/originalEdges: [] (nothing to diff against)
}
```

This produces up to 120-150 additional `generate` fixtures (40-50 diagrams ×
3 descriptions) — the harness's run matrix (providers × models × sampling
profiles) should account for this real cost when deciding what "the full
corpus" means for the AC-3 prompt-regression gate below (see
`llm-backend-reliability-strategy.md`'s S49-C7 AC-3, corrected in the same
review pass to name the small hand-authored set, not this larger set, as the
per-change gate — the larger set runs on a slower cadence).

## Scoring model

`accuracy-scoring.ts` is pure and independently testable — built under real
RED/GREEN TDD, since it is ordinary deterministic code, not a provider call.
Its central function takes the *loaded fixture* (not just its `meta.json`)
plus the generation result, because scoring a modify/restructure fixture
requires the original diagram's node IDs, which live in `existing.txt`, not
in `AccuracyFixtureMeta` or in `GenerateResult` (`GenerateResult` carries only
a boolean `driftDetected`, never a percentage or original node-ID list):

```ts
interface LoadedFixture {
  meta: AccuracyFixtureMeta;
  prompt: string;
  existingDsl?: string;         // raw content of existing.txt, if present
  originalNodeIds: string[];    // parsed from existingDsl via validateOutput; [] for fresh generate
  originalNodes: GraphNode[];   // full parsed nodes (id/type/label/properties), for unintended-change diffing
  originalEdges: GraphEdge[];   // full parsed edges, likewise
  diagnostics?: string;
  layout?: GenerateRequest['layout'];
}

interface UnintendedChange {
  kind: 'node-field' | 'edge-removed' | 'edge-added' | 'edge-label';
  id: string;          // node id for 'node-field'; `${source}->${target}` for edge kinds
  field?: string;       // property/label/type name for 'node-field' and 'edge-label'; absent otherwise
  before: unknown;
  after: unknown;
}

interface AccuracyScore {
  caseId: string;
  provider: LLMProviderId;
  model: string;
  samplingProfile: string;
  valid: boolean;                    // validateOutput(result.dsl, outputFormat).valid
  driftPct: number | null;           // checkStructuralDrift(fixture.originalNodeIds, newNodeIds).lossPercentage;
                                      // null when originalNodeIds is empty (fresh generate)
  lintErrorCount: number;            // lintAgainstNotation(...).filter(severity === 'error').length, 0 if no notationId
  lintWarningCount: number;
  contentCheckPassed: boolean | null; // every meta.expectedSubstrings entry found in result.dsl;
                                       // null when the fixture sets no expectedSubstrings
  unintendedChangeCount: number;      // see "Amendment (round 2)"; 0 for fresh generate (nothing to preserve)
  unintendedChanges: UnintendedChange[];
  requiresManualReview: boolean;      // true for 'ambiguous' and 'injected-mistake' caseTypes, else false
  semanticJudgment?: { confidence: 'llm-judge'; verdict: 'ok' | 'introduced-problem' | 'silently-fixed-unrequested'; explanation: string };
  retries: number;                    // result.retries
  succeeded: boolean;                 // result.success
}

function scoreResult(fixture: LoadedFixture, result: GenerateResult): AccuracyScore;
```

`scoreResult` calls the *existing* `validateOutput`, `checkStructuralDrift`,
and `lintAgainstNotation` on `result.dsl` (re-parsing it itself, the same way
`test-e2e.ts` already does) and on `fixture.existingDsl` (once, at fixture
load time, to populate `originalNodeIds`/`originalNodes`/`originalEdges`) —
it does not reimplement any of them, and it does not assume `GenerateResult`
carries fields those functions alone can produce.

### Amendment (round 2): unintended-change detection

Added by [`llm-backend-reliability-strategy.md`](llm-backend-reliability-strategy.md),
which found that `driftPct` alone (node-loss percentage) does not measure
compliance with the CRITICAL RULES in `prompt.ts` ("copy every unchanged node
and edge declaration EXACTLY as-is") — a node that survives with a silently
altered label, type, or property registers no drift at all.

**Correction from a follow-up review pass**, which found the original
wording of this amendment overstated what `validateOutput`/
`checkStructuralDrift`/`lintAgainstNotation` actually return:
`validateOutput` exposes only `nodeIds: string[]` (not full node objects);
`checkStructuralDrift` takes and returns only ID arrays; `lintAgainstNotation`
*consumes* `GraphNode[]`/`GraphEdge[]` as input, it doesn't produce them from
DSL text. None of the three can produce `originalNodes`/`originalEdges` —
populating those fields requires a **direct call to `parseCoralDSL`/
`parseMermaidDSL`** (`packages/diagram-editor/src/parsers.ts`) on both
`fixture.existingDsl` and `result.dsl`, in addition to (not instead of) the
three named functions. This is a fourth call `scoreResult` makes, stated
explicitly here rather than implied to be free.

For `local-edit`/`add-subgraph`/`restructure` fixtures, `meta.json`
additionally declares which entities the requested edit is expected to touch
(`expectedChangedNodeIds`/`expectedChangedEdgeIds` — the fixture author
already knows this, having written the prompt). `scoreResult` diffs every
**node** present in *both* `originalNodes` and the parsed candidate (matched
by node ID, which is stable — `labelToId` derivation only changes if the
label itself changes, and a label change is exactly one of the fields being
diffed): any field difference (`type`, `label`, `properties`) on a node
**not** in `expectedChangedNodeIds` is an `UnintendedChange`.

**Edges are matched differently, not by ID** — a second correction from the
same review pass. The corpus's known-good DSL is machine-converted
(Mermaid → `parseMermaid` → `printWithDiagnostics`, never hand-edited, per
`coral-defect-corpus.md` Step 3) and never carries an explicit `as "id"`
clause; edge IDs are therefore auto-derived from `source_to_target`
(`packages/language/src/ids.ts`), meaning an edge that gets **redirected**
(its source or target changes) gets a *different* auto-derived ID in the
candidate — it cannot be matched to "the same edge" by ID at all, so a
field-level source/target diff on a matched pair is never actually
observable for this corpus. Instead, edges are compared **by the
`(source, target)` pair, grouped into a multiset rather than a single
entry** (round 4 correction — Coral legally allows parallel edges between
the same two nodes, and a single-entry-per-pair Map silently dropped all
but one). Within a group, exact label matches between original and
candidate are removed first (they didn't change); the genuine leftover is
paired as `kind: 'edge-label'` (relabeled) up to the shorter side's length,
with any excess on the original side reported as `kind: 'edge-removed'` and
any excess on the candidate side as `kind: 'edge-added'`, each restricted to
groups where neither endpoint is in `expectedChangedNodeIds`/
`expectedChangedEdgeIds`. This correctly reports a redirected edge (a
group's original member has no candidate counterpart, and vice versa in a
different group) as a removal+addition rather than silently missing it as
an unmatched ID would, and correctly handles parallel edges rather than
collapsing them.

This is the harness's most direct, corpus-wide measurement of the one
guarantee LLM-only-editing users depend on most.

### Amendment (round 6): `expectedNewEdges`

Added after Phase 3 code review found, by direct execution against the new
`003-add-connected-subgraph` fixture, that neither existing exemption field
can correctly represent "the prompt legitimately adds one new edge from an
existing node." `expectedChangedNodeIds` exempts every edge touching that
node from the diff above, not just the new one — a candidate that adds the
requested edge but also silently drops or relabels a *different*,
untouched edge from the same node scores `unintendedChangeCount: 0`
regardless. `expectedChangedEdgeIds` cannot substitute for it either: the
check that consumes it (`originalGroup.some((edge) => ... expectedChangedEdgeIds.has(edge.id))`)
only ever inspects the *original* side of a pair group, which is empty by
definition for a pair that doesn't exist yet.

`AccuracyFixtureMeta.expectedNewEdges?: Array<{ source: string; target:
string }>` closes this gap: each declared pair is checked directly against
the diff's own `(source, target)` grouping key, exempting exactly that one
new pair and nothing else touching either endpoint. Purely additive — no
existing fixture or test needed to change, and `003-add-connected-subgraph`
was rewritten to use it instead of `expectedChangedNodeIds`, restoring its
ability to detect a dropped `gateway -> products` fallback edge (the exact
scenario its own prompt calls out and the exact scenario code review's
scripted candidate proved went undetected before this fix).

**A related, harder gap found the same review pass was *not* fixed here**:
`002-rename-node-local-edit` still has no way to keep the two edges
touching a renamed node (`gateway -> users`, `users -> userdb`) protected
from silent relabeling, because `expectedChangedNodeIds` must still contain
`users` for the rename itself to score correctly, and `isExpectedPair`
exempts by node membership for both node-field and edge-pair diffing at
once. A real fix requires decoupling those two concerns inside
`isExpectedPair` — riskier than the additive `expectedNewEdges` field,
since removing the node-membership fallback for edge-pair exemption would
regress `accuracy-scoring.test.ts`'s existing "does not flag an edge change
whose endpoints are declared in expectedChangedNodeIds" test (the redirect
case genuinely needs that fallback). Recorded as a known, named limitation
in `002-rename-node-local-edit/meta.json` rather than rushed through
without its own dedicated design review.

**What this scores, and what it doesn't.** `valid`/`driftPct`/`lintErrorCount`/
`unintendedChangeCount` establish structural health and edit-scope compliance
for every case type — a necessary baseline, not a full correctness proof.
Three case types need more than that to call "correct," and the design does
not pretend otherwise:

- `adversarial-label` gets a real mechanical answer via `contentCheckPassed`
  (did the exact expected text survive).
- `ambiguous` and `injected-mistake` get `requiresManualReview: true` and stop
  there for this harness. `injected-mistake` in particular is reused from
  `ai-editing-exploration.md`, where it is explicitly a *human-detection*
  question inside a UX study, not a structural one; this harness captures the
  candidate output (in the scorecard) for a person to read, and makes no
  claim of automated pass/fail for these two case types. **This deliberately
  excludes an LLM-judge mechanism** — see "Alternatives rejected" — because
  there is no ground truth to judge against for an open-ended "is this
  ambiguous prompt handled well" question.
- **Semantic-defect adversarial fixtures** (added by
  `llm-backend-reliability-strategy.md`, S49-C7 AC-6) get `semanticJudgment`,
  populated by a *separate*, narrower LLM-judge call — narrower specifically
  because, unlike the `ambiguous`/`injected-mistake` case above, there **is**
  ground truth here: the Fable-5.1-authored `SemanticDefectRecord` names
  exactly which defect was injected and why it's wrong. The judge call asks
  only "did the edit avoid worsening or silently repairing *this specific,
  named* defect" — a bounded, calibrated question, not "is this diagram
  correct" in the abstract. `semanticJudgment.confidence: 'llm-judge'` is
  never read by any pass/fail aggregation alongside the deterministic fields
  above; it is reported separately in the scorecard.

## Phase 3 implementation contract

### The 18 hand-authored fixtures (S49-C2 AC-2)

Stated concretely rather than left to be discovered during implementation.
Coral bundles eight notation libraries (`flowchartNotation`, `bpmnNotation`,
`erdNotation`, `codeNotation`, `architectureNotation`, `aimlNotation`,
`dataEngineeringNotation`, `sketchNotation` — `getAllNotations()` in
`@coral-viz/viz`), so "one case per bundled notation library" is eight cases
by itself; combined with the five required case types, one ambiguous case,
one spatial case, and three adversarial-label variants (quotes, unicode,
near-duplicate names — the three concrete escaping/collision failure modes
named in aspect (b)), the corpus is 18 fixtures, inside the ~15-20 estimate:

| # | `caseId` | `caseType` | `notationId` | Purpose |
| - | --- | --- | --- | --- |
| 1 | `001-generate-login-flow` | `generate` | — | Fresh generation from a plain-language prompt, no existing diagram |
| 2 | `002-rename-node-local-edit` | `local-edit` | — | Rename one node's label; every other node/edge must survive byte-identical |
| 3 | `003-add-connected-subgraph` | `add-subgraph` | — | Add a new, connected group of nodes without touching the existing ones |
| 4 | `004-broad-restructure-deletion` | `restructure` | — | A request that legitimately removes/reconnects several nodes |
| — | (2-4, restated) | | | Per this document's already-established "Authoring requirement" and "Amendment (round 2)": each of these three fixtures' `existing.txt` gives every node an explicit `as "id"` clause (so a label rename doesn't also change the node's identity), and each `meta.json` sets `expectedChangedNodeIds` (and `expectedChangedEdgeIds` where the edit touches an edge) to exactly the entities the fixture's own prompt asks to change — restated here per design review, since the case-list table is meant to be the single unambiguous spec for these three fixtures, not something inferred from a different section. |
| 5 | `005-detect-injected-mistake` | `injected-mistake` | — | A dense diagram with one planted structural mistake; `requiresManualReview: true` |
| 6 | `006-ambiguous-underspecified-prompt` | `ambiguous` | — | A prompt genuinely underspecified enough that no single "correct" output exists; `requiresManualReview: true` |
| 7 | `007-spatial-move-node-below` | `spatial` | — | "Move X below Y" — exercises `layout.json`/`composeLayoutContext`, not R-040's deterministic `spatial` field |
| 8 | `008-notation-flowchart` | `notation` | `flowchart` | |
| 9 | `009-notation-bpmn` | `notation` | `bpmn` | |
| 10 | `010-notation-erd` | `notation` | `erd` | |
| 11 | `011-notation-code` | `notation` | `code` | |
| 12 | `012-notation-architecture` | `notation` | `architecture` | |
| 13 | `013-notation-aiml` | `notation` | `aiml` | |
| 14 | `014-notation-dataeng` | `notation` | `data-engineering` | |
| 15 | `015-notation-sketch` | `notation` | `sketch` | |
| 16 | `016-adversarial-quote-in-label` | `adversarial-label` | — | A label containing a literal `"` — the exact grammar-reference gap "Test data generation approach" already flagged |
| 17 | `017-adversarial-unicode-label` | `adversarial-label` | — | A label with combining marks/emoji/RTL text |
| 18 | `018-adversarial-near-duplicate-names` | `adversarial-label` | — | Two requested node labels differing only by case/whitespace, which must not collide to the same derived id incorrectly |

Each notation fixture (8-15) uses `composeNotationReference`'s corresponding
library's own symbol vocabulary in its prompt (e.g. the `aiml` fixture asks
for a small model→vector-store→retriever pipeline) so `lintAgainstNotation`
has real notation-specific types to check, not base types that pass under
every notation trivially.

**Noted, not fixed, per design review**: none of these 18 fixtures exercise
the `fix` intent (none set `diagnostics.txt`), even though
`llm-backend-reliability-strategy.md`'s "Implementation contract (Phase 3)"
wires deterministic repair into exactly that intent in the same phase. This
harness corpus's coverage gap is real but not required by S49-C2 AC-2's
literal text (the five required case types are `generate`/`local-edit`/
`add-subgraph`/`restructure`/`injected-mistake`, none of which is `fix`);
the new `fix`-intent pre-repair behavior gets its own direct RED/GREEN unit
tests against `generate.ts` instead (see the reliability-strategy design),
which is a more precise instrument for that specific behavior than an
end-to-end accuracy fixture would be. Left as an explicit, named gap rather
than silently absent.

### `accuracy-harness.ts`'s testable core

Per this slice's TDD requirement, the harness is split into pure,
independently-testable functions plus a thin CLI shell that performs the
only two impure things the harness needs (reading fixture files, calling the
real network `generate`):

```ts
// Pure — no filesystem, no network. Unit-testable directly.
function fixtureToRequest(
  fixture: LoadedFixture,
  config: LLMConfig,
): GenerateRequest;
// Builds the request per the "Case-type to request/scoring treatment" table
// above: prompt/existingDsl/notationId/layout population by caseType.

interface RunMatrixEntry { provider: LLMProviderId; model: string; samplingLabel: string; sampling?: SamplingProfile; }

interface SkippedRun { caseId: string; provider: LLMProviderId; model: string; samplingLabel: string; reason: 'no-api-key' | 'mermaid-not-allowlisted'; }

interface HarnessRun { scores: AccuracyScore[]; skipped: SkippedRun[]; }

async function runHarness(
  fixtures: LoadedFixture[],
  matrix: RunMatrixEntry[],
  apiKeys: Partial<Record<LLMProviderId, string>>,
  generateFn: typeof generate, // injected — tests pass a fake, the CLI passes the real `generate`
): Promise<HarnessRun>;
// for each fixture, for each matrix entry:
//   if apiKeys[entry.provider] is not set:
//     skipped.push({ caseId: fixture.meta.caseId, provider: entry.provider, model: entry.model,
//                    samplingLabel: entry.samplingLabel, reason: 'no-api-key' })
//     continue
//   request = fixtureToRequest(fixture, { provider: entry.provider, model: entry.model,
//                                          apiKey: apiKeys[entry.provider]!, sampling: entry.sampling })
//   result  = await generateFn(request)
//   score   = scoreResult(fixture, result)
//   // scoreResult intentionally leaves provider/model/samplingProfile as empty-string
//   // placeholders (see accuracy-scoring.ts's own doc comment) for exactly this call site
//   // to fill in from the run-matrix entry it already has -- stated explicitly here since
//   // an earlier draft's pseudocode omitted this step entirely, which would have silently
//   // produced an AccuracyScore[] with every entry's provider/model/samplingProfile blank,
//   // erasing the ability to compare across the run matrix (this design's whole point).
//   scores.push({ ...score, provider: entry.provider, model: entry.model, samplingProfile: entry.samplingLabel })
// returns { scores, skipped } -- a caller (test or CLI) can assert on `skipped` directly
// rather than only inferring a skip from `scores`'s length, so a real filtering bug
// (a fixture dropped for the wrong reason) is distinguishable from an intentional skip.

// Filesystem — reads one fixture directory into a LoadedFixture. Thin: all
// the actual logic (parsing existingDsl, computing originalNodeIds/Nodes/Edges)
// stays in the already-tested, pure `loadFixture`.
function loadFixtureFromDirectory(dir: string): LoadedFixture;

// Filesystem — reads every fixtures/accuracy/*/ directory plus draws
// corpus-adapter fixtures from coral-defect-corpus's manifest.json (see
// "Corpus adapter" above), skipping any Mermaid fixture not on
// MERMAID_ALLOWLIST and printing what was skipped and why.
function loadAllFixtures(accuracyDir: string, corpusManifestPath: string): LoadedFixture[];
```

`runHarness`'s injected `generateFn` parameter is what makes this
RED/GREEN-testable without a live provider call or an API key: tests pass a
fake `generateFn` that returns a scripted `GenerateResult` per fixture and
assert `runHarness` builds the right request and produces the right score
(reusing `accuracy-scoring.test.ts`'s already-proven `scoreResult` behavior,
not re-testing it) — exactly the same "inject the effectful boundary"
pattern `generation-retry-transport.md` already established for
`RetryRuntime`. Only the CLI's `main()` wires `runHarness` to the real
`generate` and real `process.env` API keys, and that wiring is not itself
unit-tested (it has nothing to assert beyond "calls the real function"),
matching `test-e2e.ts`'s existing precedent of being a manual, live-key
script outside `npm run verify`.

## Harness architecture and output

`accuracy-harness.ts` is a CLI script (`npx tsx .../accuracy-harness.ts`),
the multi-model extension of `test-e2e.ts`'s existing loop:

```text
for each fixture in corpus (skipping unallowlisted Mermaid fixtures):
  for each (provider, model, samplingProfile) in the run matrix:
    request = fixtureToRequest(fixture, config, samplingProfile)  // table above
    result  = generate(request)
    score   = scoreResult(fixture, result)
    append score + result.dsl to the run's scorecard
```

Output is a JSON scorecard per run
(`accuracy-harness-output/<timestamp>/scorecard.json`, gitignored — added to
the repository root `.gitignore` as part of this design, not left as a
stated-but-missing fact) plus a console table, so results are diffable across
harness runs and comparable across models. The harness prints a summary table
grouped by `caseId × provider/model/samplingProfile` with pass/fail, drift%,
and lint counts, mirroring `test-e2e.ts`'s existing `printDslPreview`/`hr`
presentation conventions. Rows with `requiresManualReview: true` are called
out separately in the console summary so they aren't misread as auto-passed.

The run matrix is a plain array literal in the script, not a config file —
intentionally minimal; a config format is not justified until the harness has
been run enough times to show what actually needs to vary.

## Sampling parameters

`buildRequest`/`buildMultiTurnRequest` in `providers.ts` gain an optional
`sampling` field on `LLMConfig`:

```ts
interface SamplingProfile {
  temperature?: number;
  topP?: number;
  reasoningEffort?: 'low' | 'medium' | 'high'; // provider support varies; ignored where unsupported
}
```

Each provider's request builder maps present fields to its own wire format
and omits absent fields, preserving current behavior exactly when `sampling`
is not supplied.

**Scope correction from design review:** the slice's original S49-C3 AC-2
wording ("replacing today's silent provider defaults") overstated what this
design delivers. This design ships the `SamplingProfile` plumbing and, once
harness runs produce evidence, a recorded table of recommended defaults per
intent — it does not wire those defaults into `generate.ts`'s production
request construction. That wiring is real production behavior change and
belongs in its own reviewed increment, informed by evidence this design
produces, not assumed by it. **S49-C3 AC-2 in the slice draft plan is
revised accordingly** (see that file); this design's traceability table
reflects the narrowed scope, not the original wording.

## Infrastructure evaluation criteria (aspect d)

A comparison matrix, not new code:

| Criterion | Direct browser call (current) | Server-mediated (MCP or other) |
| --- | --- | --- |
| API-key exposure | Key lives in browser storage/memory, visible to the page | Key can stay server-side, never reaches the client |
| Latency, under the 0.2.5 edit-lock contract | One hop, provider-direct. The edit lock (Slice 45) is held for the full request with no partial-progress UI, so this latency directly bounds how long editing is blocked | Extra hop through the mediating server extends the same lock-held window by exactly that hop's cost — this is not a minor efficiency concern, it is user-facing block time |
| Offline/PWA behavior | Fails closed identically to direct call when offline | Fails closed the same way unless the server also proxies caching/queueing (out of scope here) — not a differentiator either way |
| Telemetry-privacy fit (R-042/R-043) | Already excludes prompt/DSL from telemetry; browser-only, no additional retention surface | A server hop is a new place prompt/DSL content could be logged; must inherit the same exclusions explicitly, not by accident |
| R-006 fit | Matches current requirement (MCP stays heuristic) as-is | Requires an explicit R-006 change and HITL decision (S49-C4 AC-3) |

The evaluation deliverable is this table filled in with evidence (measured
latency deltas under the edit-lock model above, a concrete threat-model note
on key exposure, a plain statement of whether current PWA offline behavior
would change) plus a recommendation — not a prototype of a server-mediated
path. Building one is out of scope unless the recommendation is adopted,
which is a separate, explicitly HITL-gated decision.

### Evaluation (S49-C4 AC-1–3)

**The comparison above conflates two materially different things under
"server-mediated," and separating them changes the conclusion.** Verified
directly against the code: `packages/mcp-server/src/index.ts` wires the MCP
server exclusively to `StdioServerTransport` — a local stdio pipe, the
transport MCP hosts like Claude Code/Claude Desktop use to talk to a locally
running tool process. It is not an HTTP service a web browser can call. Coral
also has **no backend of any kind today** — `dev/releases/0.2.5/plan.md`
describes the shipped product as a static PWA served from GitHub Pages, with
every existing MCP tool (`coral_generate`, `coral_validate`, etc.) explicitly
heuristic and non-network per R-006. So "route generation through MCP
instead of a direct browser call" isn't an available alternative for the
shipped editor at all — there is no reachable MCP endpoint for a browser tab
to call, and giving MCP real LLM-backed generation (an R-006 change) would
still leave the *browser app* with nothing to call unless a second, separate
piece of infrastructure — an HTTP backend proxy — were also built. These are
two distinct options, evaluated separately:

| Criterion | Direct browser call (current) | New HTTP backend proxy (hypothetical) | MCP gaining real generation (R-006 change) |
| --- | --- | --- | --- |
| Solves browser API-key exposure? | No — key is client-visible by design | Yes — key moves server-side | **No** — MCP's stdio transport is unreachable from a browser regardless; this doesn't address the browser app's exposure at all |
| Infrastructure cost | None — already shipped | New: hosting, deployment, auth for the proxy itself, an operational surface Coral has never had | None for the browser app specifically; useful only to non-browser MCP callers (e.g., an agent host using Coral as a tool) |
| Latency, under the 0.2.5 edit-lock contract | One hop, provider-direct | Extra hop extends the edit-lock-held window (Slice 45: no partial-progress UI) by that hop's cost | N/A — doesn't serve the browser app |
| Offline/PWA behavior | Fails closed identically online-required, matching the existing documented "network-only LLMs" disclosure (`dev/requirements.md` completion-evidence requirement) | Same network requirement, plus a *second* point of failure (provider up, proxy down still fails generation) | N/A |
| Telemetry-privacy fit (R-042/R-043) | Already excludes prompt/DSL; Coral itself never sees the content, only the browser and the provider do | A new server hop is a new place prompt/DSL content *could* be logged — must inherit the same exclusions deliberately, not by default | N/A |
| R-006 fit | Matches current requirement as-is | Unrelated to R-006 (MCP is not involved) | Requires an explicit R-006 change and HITL decision |

**Recommendation:** retain direct browser calls for the shipped editor.
Building a new HTTP backend proxy is a disproportionate infrastructure
commitment (Coral has never had a backend) for a key-exposure risk that is
already disclosed to users per existing documentation requirements, and it
introduces a new operational surface and a new failure mode without
improving latency or offline behavior. Separately, changing R-006 to give
MCP real generation is a legitimate, independent question for non-browser
use cases (an agent host calling Coral's MCP server as a tool) — but it does
**not** solve the browser app's key-exposure question, since that's a
transport-reachability problem, not an R-006 policy problem, and the two
should not be evaluated as if choosing one addresses the other. Any future
proposal to build a backend proxy, or to change R-006, is its own separate,
explicitly HITL-gated decision (satisfying AC-3) — this evaluation does not
adopt either.

## Alternatives rejected

- **A YAML/config-driven run matrix** instead of a plain array literal:
  rejected as premature configurability before any harness run has shown what
  needs to vary.
- **Reimplementing validation/drift/lint scoring inside the harness** for
  independence from production code changes: rejected because it would let
  the harness silently diverge from what `generate.ts` actually enforces,
  defeating the harness's purpose.
- **Mining production telemetry for corpus fixtures**: rejected outright —
  forbidden by R-042/R-043, and telemetry as currently scoped excludes the
  content that would be needed anyway.
- **A hosted/shared eval service**: out of scope; every provider call already
  requires the running developer's own API key, and standing up shared
  infrastructure is a much larger commitment than this assessment slice
  justifies.
- **Automated pass/fail for `ambiguous`/`injected-mistake` via an LLM judge**:
  rejected for this slice as unjustified added complexity and a new source of
  unverified scoring error; revisit only if manual review of harness runs
  shows a concrete need. This is a *different* decision from the
  `semanticJudgment` LLM-judge use added for semantic-defect adversarial
  fixtures ("Scoring model" above) — that one is bounded by a known,
  Fable-5.1-authored ground-truth defect record; this rejected one would
  have had no ground truth to check against at all.
- **Exercising R-040's deterministic `spatial` field from this corpus**:
  rejected — that pipeline has its own fixtures/tests already; this corpus's
  `spatial` case type targets the distinct, currently-unmeasured R-025
  prompt-context path instead.

## Requirement-to-design traceability

| Requirement (candidate) | Design element |
| --- | --- |
| S49-C2 AC-1–3 | Fixture directory format, `meta.json` provenance/limitations fields, required case-type coverage table |
| S49-C3 AC-1 | Harness run-matrix loop over providers/models/sampling profiles, `scoreResult` |
| S49-C3 AC-2 (narrowed — see "Sampling parameters" and the slice draft plan's revision) | `SamplingProfile` addition to `LLMConfig`, per-provider request-builder mapping, and a recorded-recommendation table; production wiring is explicitly out of scope for this design |
| S49-C3 AC-3 | JSON scorecard output, gitignored local-only artifact, no telemetry wiring |
| S49-C4 AC-1–3 | Infrastructure evaluation criteria matrix, tied to the edit-lock contract |
| S49-C7 AC-5 (round-2 amendment) | `expectedChangedNodeIds`/`expectedChangedEdgeIds`, `unintendedChangeCount`/`unintendedChanges`, `(source,target)`-keyed edge diffing |
| S49-C7 AC-6 (round-3 amendment) | `semanticJudgment` field on `AccuracyScore`, distinguished from the rejected general-purpose LLM judge |
| S49-C5 (corpus-adapter, round-3 amendment) | `corpusToGenerateFixtures`, three-descriptions-per-diagram fixture expansion, `notation` case-type claim retracted |
| S49-C2 AC-2 (Phase 3) | The 18-fixture case list table above, covering the five required case types, one ambiguous, one spatial, eight notation-library cases, and three adversarial-label variants |
| S49-C3 AC-1 (Phase 3) | `fixtureToRequest`/`runHarness`'s injected-`generateFn` architecture, TDD'd without a live provider call |

## Review log

Independent design review (round 1) found three high-severity and four
medium-severity issues, all resolved in this revision:

- **High — `scoreResult` couldn't compute `driftPct`** (its signature took
  only `AccuracyFixtureMeta`, which has no original node IDs). Fixed by
  widening the input to `LoadedFixture`, which carries `originalNodeIds`
  parsed from `existing.txt` at load time.
- **High — S49-C3 AC-2 claimed production default-wiring the design didn't
  deliver.** Fixed by narrowing the AC (see slice draft plan) to match what
  this design actually builds: plumbing plus a recorded recommendation, with
  production wiring scoped as explicit follow-on work.
- **High — `AccuracyScore` couldn't score `adversarial-label`,
  `injected-mistake`, or `ambiguous`.** Fixed by adding `contentCheckPassed`
  (mechanical, via `expectedSubstrings`) and `requiresManualReview` (honest
  scope limit for the two judgment-call case types), documented in "Scoring
  model."
- **Medium — `fixtureToRequest` hid real complexity, especially for
  `spatial` fixtures**, which had no geometry artifact and couldn't run as
  specified. Fixed with the normative case-type mapping table and a
  `layout.json` fixture artifact scoped to R-025's prompt-context path
  (not R-040's deterministic pipeline, which already has its own tests).
- **Medium — the Mermaid-allowlist skip had no operational mechanism.**
  Fixed with a typed `mermaidDiagramType` field and a single named
  `MERMAID_ALLOWLIST` constant the harness checks per fixture.
- **Medium — aspect (d)'s matrix didn't tie latency/offline findings back to
  the edit-lock contract.** Fixed by rewriting those two rows to state the
  connection explicitly.
- **Medium — `tsconfig.manual.json` wasn't mentioned**, risking the new
  non-`.test.ts` files escaping type-checking. Fixed in "Scope and delta."

Low-severity findings also resolved: `existing.coral` renamed to the
format-neutral `existing.txt`; the gitignore entry for harness output is
added by this design rather than only described; the cross-worktree citation
risk for `ai-editing-exploration.md`/`slice-45/decision-log.md` is now stated
explicitly at the top of this document.

**Round 2 (additive amendment):** added `expectedChangedNodeIds`/
`expectedChangedEdgeIds` to `AccuracyFixtureMeta`, `originalNodes`/
`originalEdges` to `LoadedFixture`, and `unintendedChangeCount`/
`unintendedChanges` to `AccuracyScore`, per "Amendment (round 2)" above. This
did not touch anything round 1 resolved; it is a pure addition to the
scoring contract.

**Round 3 (follow-up review of round 2, plus the new
`llm-backend-reliability-strategy.md` design), findings resolved:**

- **High — round 2's amendment claimed `originalNodes`/`originalEdges` come
  from `validateOutput`/`checkStructuralDrift`/`lintAgainstNotation`**, none
  of which can produce them. Fixed: "Amendment (round 2)" now states a
  direct `parseCoralDSL`/`parseMermaidDSL` call is required, as a fourth,
  separate step.
- **High — edge matching by ID silently can't detect a redirected edge**,
  since this corpus's machine-converted DSL never carries explicit edge IDs
  and auto-derived IDs change when an edge's endpoints change. Fixed:
  edges are now compared by `(source, target)` pair, not by ID; the
  `UnintendedChange` interface's `kind` field was revised to
  `'node-field' | 'edge-removed' | 'edge-added' | 'edge-label'` to match.
- **High — this document never actually specified how it consumes
  `coral-defect-corpus.md`'s manifest**, despite that dependency being
  asserted in two other documents. Fixed: added "Corpus adapter" section,
  which also retracts the `notation` case-type claim (the corpus has no
  Coral-notation field, only a Mermaid `diagramType`) and specifies
  three-fixtures-per-diagram expansion (one per description).
- **High — `semanticJudgment`/`confidence: 'llm-judge'` (S49-C7 AC-6) was
  referenced by the plan but never added to `AccuracyScore`.** Fixed: field
  added, with prose distinguishing it from the LLM-judge mechanism this same
  document already rejected for `ambiguous`/`injected-mistake` (bounded,
  ground-truthed question vs. open-ended one).

**Round 4 (code review of the implementation), finding resolved:**

- **High — `diffUnintendedChanges`'s `(source, target)`-pair Map silently
  dropped all but one edge when Coral's legally-supported parallel edges
  (two edges between the same node pair, distinguished only by label) were
  present**, confirmed by direct execution against a real parallel-edge
  fixture. Fixed in `accuracy-scoring.ts`: each pair now groups into an
  array rather than a single Map entry, diffed as a multiset — exact
  label matches between original and candidate are removed first (they
  didn't change), and only the genuine leftover is paired up as
  relabeled/removed/added. (A first fix attempt sorted each group by label
  and paired by position, which spuriously reported an unchanged edge as
  relabeled whenever sorting shifted its relative index — caught by this
  fix's own regression test before being corrected to the current
  match-then-diff-the-remainder approach.)

**Round 5 (Phase 3 design review), findings resolved:**

- **High — fixture 14's `notationId` was written as `dataEngineering`,
  which doesn't match the real notation registry.** Confirmed against
  `packages/render/src/notations/data-engineering.ts`: the notation's actual
  `id` is `'data-engineering'` (kebab-case); `getNotation('dataEngineering')`
  would silently return nothing (`lintAgainstNotation` fails open with zero
  results rather than erroring), so this fixture would have scored
  `lintErrorCount: 0`/`lintWarningCount: 0` no matter what the model
  produced, defeating its entire purpose. Fixed: table corrected to
  `data-engineering`.
- **Medium-high — `runHarness`'s pseudocode never copied
  `provider`/`model`/`samplingProfile` from the run-matrix entry into the
  returned `AccuracyScore`,** even though `scoreResult` deliberately leaves
  those three fields blank for exactly this call site to fill in (per
  `accuracy-scoring.ts`'s own doc comment). As written, every score in a
  harness run would have come back with blank provider/model/sampling
  fields, erasing the run-matrix comparison this design's whole premise
  depends on. Fixed: pseudocode now states the explicit merge step.
- **Medium — `runHarness`'s "skip pairs with no API key" behavior had no
  representable return value**, only a stated intention in prose, making it
  untestable as "skipped, not silently dropped" versus a real filtering
  bug. Fixed: `runHarness` now returns `{ scores, skipped }`
  (`HarnessRun`/`SkippedRun`), so tests assert directly on which pairs were
  skipped and why.
- **Noted, not changed** — two other findings from this round
  (short-circuit safety, explanation-text merging) turned out to be about a
  behavior this document doesn't itself specify; both are resolved in
  `llm-backend-reliability-strategy.md`'s own Phase 3 review-log entry,
  which removed the short-circuit that motivated them.
- **Low — fixtures 2-4's already-established authoring requirements
  (explicit `as "id"` on every node, `expectedChangedNodeIds`) weren't
  restated against the concrete fixture list**, leaving them to be inferred
  from a different section. Fixed: restated directly under the table.
- **Low — no fixture exercises the new `fix`-intent pre-repair behavior.**
  Noted explicitly rather than left silent (see the paragraph after the
  fixture table) — direct unit tests against `generate.ts` cover that
  behavior more precisely than an end-to-end fixture would; not required by
  S49-C2 AC-2's literal text.

**Round 6 (Phase 3 code review of the implementation), findings resolved:**

- **High — `018-adversarial-near-duplicate-names/meta.json` was missing the
  `expectedSubstrings` field its own `limitations` text described**,
  confirmed by execution: `scoreResult` against a deliberately wrong
  candidate returned `contentCheckPassed: null` (no assertion configured at
  all) rather than `false` — the fixture made zero mechanical claim about
  the one thing it exists to test. Fixed: `expectedSubstrings: ["User
  Service", "user service"]` added.
- **High — `expectedChangedNodeIds`, as fixtures 002 and 003 were originally
  forced to use it, silently exempted edges those fixtures' own prompts
  explicitly protect.** Confirmed by execution with scripted "bad"
  candidates against the real fixtures: fixture 003's candidate that
  correctly added the requested cache edge but also dropped the explicitly-
  protected `gateway -> products` fallback scored `unintendedChangeCount: 0`
  either way. Fixed for 003 via the new `expectedNewEdges` field (see
  "Amendment (round 6)" above); 002's harder, related gap (silent edge
  relabeling on a renamed node's own edges) is recorded as a known,
  unfixed-here limitation in its `meta.json` and in "Amendment (round 6)"
  above, since a full fix risks regressing an existing, already-reviewed
  regression test and needs its own dedicated review.
