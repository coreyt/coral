# LLM backend reliability strategy: using the corpus for prompt/context engineering and testing

## Final Slice 49 repair boundary — 2026-09-15

For 0.2.5, deterministic repair is a conservative suggestion inside an explicit
Coral Fix request. The exact captured source and its original diagnostics remain
the authoritative prompt input. A fully resolved allowlisted repair may be
included in a separately labelled, request-local suggestion with its
descriptions and locations; it never replaces the source or claims an applied
change. Ambiguous or partially resolved input has no suggestion. The final
accepted provider candidate is the only content that enters Slice 47's
revision-bound atomic transaction.

Parser-error reduction is necessary but insufficient. The allowlist is limited
to diagnosed missing whitespace after a node type, diagnosed node-property `=`
to `:`, and diagnosed missing/trailing commas inside a `data {}` JSON object.
Every other token is preserved. Brace/quote/line-join inference, wrong-arrow or
Unicode-quote replacement, bracket completion, unrestricted character deletion,
missing endpoints, bare attributes, and vocabulary near matches remain
unresolved. Indentation is not evidence of containment. Deterministic repair
never runs during typing, load, save, Mermaid handling, candidate validation, or
undo. It is not written to Activity, telemetry, persistent storage, or the
public generation result. `RepairResult` retains suggestion provenance and
unresolved diagnostics; Slice 47 remains the sole application/provenance owner.

The corpus and harness remain development infrastructure. Provider quality,
few-shot retrieval, production sampling defaults, an LLM semantic judge, and
expanded generation-path repair are not 0.2.5 acceptance criteria.

Latest release amendment: approved lint/retry policy
supersedes earlier pending choices below. 0.2.5 has explicit syntax Fix, no
autocorrect/autocomplete and no semantic-lint user notifications/correction.
Candidate retry is user initiated; transport retry is separately bounded.
Slice 47 owns code reconciliation and manual HITL UX tests; Slice 48 remains
internal future-feature work, not a release semantic acceptance gate.

## Release integration disposition — 2026-09-14

Imported in mechanical release merge `05f6824`; earlier approval records below
are experiment history. Approved Slice 45 D07/D08 now govern automatic atomic
application, no review/Apply gate in 0.2.5, complete undo and current-state
reconciliation without network calls. Slice 47 owns transactions and Slice 48
owns semantic acceptance; Slice 49 supplies fixtures and accuracy evidence.

Two material conflicts remain, not silently resolved by import: deterministic
preflight can alter already-valid meaning and discards repair provenance at
its string-only integration boundary; candidate-validation retries can issue
another model request automatically despite D07's user-initiated retry rule.
Transport retries are a distinct inherited R-042/R-043 contract. Do not expand
repair wiring, sampling defaults, providers or backend architecture here.
See Slice 49 reconciliation
for the baseline map, evidence and recommended HITL decisions. Local S49-C
references below are not new global requirements.

## Historical strategy and review record

Status: accepted after one independent design review round (7 findings — 4
high, 2 medium, 1 low — all resolved). See "Review log."

Covers aspect (e), cross-cutting over (a)/(b)/(c) per the slice draft plan.
Supports Slice 49. Answers a specific question: given the planned corpus
(known-good diagrams, three descriptions each, Mermaid + Coral DSL, syntax
and semantic defect variants — [`coral-defect-corpus.md`](coral-defect-corpus.md)),
how should Coral actually use it to make the LLM-assisted generation/editing
backend as correct as it can be, and how should that use differ between the
two usage modes the product actually has?

## The two modes have very different stakes, and the design must say so plainly

**Generation** (`intent: 'generate'`) starts a diagram from nothing. It is
comparatively low-stakes: the user can discard and retry cheaply, there is no
prior state to lose, and "good enough starting point" is a legitimate bar.

**Editing** (`intent: 'modify'`/`'fix'`) is different in kind, not degree,
whenever the product actually requires a user to edit *only* through the LLM.
For that population there is no manual-DSL-editing fallback — a bad edit is
not an inconvenience, it is a dead end unless undo recovers it. This document
treats that requirement as the design's organizing constraint: **the modify
path is the product** for LLM-only users; generation quality matters, but
editing correctness is where the reliability budget belongs.

One consequence worth surfacing explicitly rather than silently accepting:
Slice 45 already froze 0.2.5 on automatic, atomic application with no
preview/apply gate, for every user. That decision was made for the general
editing population. It's worth an explicit question back to that process —
not decided here — whether an LLM-only-editing user population is exactly
the population most likely to need a review step precisely because they have
no other way to catch a bad edit before it lands. See "Recommendation for
the apply-strategy decision" below.

## The core principle: mechanical determinism is the safety net, prompts are prevention

An LLM cannot be made reliable by asking it to be more careful, and its own
self-reported confidence is not a safety mechanism — models are frequently
confident and wrong. The only trustworthy backstop is deterministic,
independently-verifiable checking, with prompt/context quality doing the
*prevention* work of minimizing how often that backstop has to catch
something. Concretely, in priority order:

1. **Prevent** — prompt and context engineering, informed by the corpus,
   reduces the rate of bad output.
2. **Catch, mechanically** — parsing, structural validation, drift/lint,
   and (new, see below) unintended-change detection catch what prevention
   missed, deterministically, before anything is shown as a successful edit.
3. **Recover** — undo is the last line of defense once something has already
   been applied, which for LLM-only-editing users is not optional polish.

Every one of the corpus's four artifact types (descriptions, known-good DSL,
syntax defects, semantic defects) feeds a different layer of this stack.
None of them are "just test data" — each has a production use.

## How each corpus artifact is actually used

### Known-good (description, Mermaid, Coral) triples → prompt prevention

- **Retrieval-based few-shot selection.** `CORAL_GRAMMAR_REFERENCE`
  (`packages/diagram-editor/src/llm/prompt.ts`) currently ships exactly one
  worked example for every request, regardless of what's being asked. With
  40-50 corpus diagrams tagged by **Mermaid `diagramType` and `complexity`**
  (corrected after review — the corpus's `SourceMeta` schema has no Coral
  notation field, and Mermaid's diagram types don't map cleanly onto Coral's
  notation registry, so matching is by diagram shape/complexity, not
  notation), the system prompt can select one or two structurally similar
  examples per request instead of one fixed example for everything. When the
  active request *does* specify a Coral notation, the existing
  `notationRef.ts` composition remains the source for notation-specific
  guidance — this is additive to that, not a replacement.
- **Grammar-reference completeness audit.** Run every corpus diagram's known-
  good Coral DSL against `CORAL_GRAMMAR_REFERENCE`'s documented constructs.
  Any construct that appears in real corpus diagrams but isn't documented in
  the reference (a particular property type, a nesting depth, an edge-style
  combination) is a concrete instruction gap — the reference is currently
  authored by inspection, not verified against a real corpus, and this closes
  that loop.
- **Prompt changes become regression-gated, like code — scope stated
  precisely, corrected after review.** "The full corpus" must mean one
  specific, bounded thing, not whichever of three overlapping fixture sets a
  reader assumes. The **per-change gate** is the small hand-authored
  `fixtures/accuracy/` set (~15-20 cases): every change to
  `CORAL_GRAMMAR_REFERENCE`, the CRITICAL RULES instructions, or notation
  reference composition runs that set through the accuracy harness before/
  after, and a regression on any score dimension is rejected or requires
  explicit sign-off. The larger 40-50-diagram corpus (up to 120-150
  `generate` fixtures once its three-descriptions-per-diagram expansion is
  applied, per `llm-accuracy-harness.md`'s "Corpus adapter") runs on a
  **slower, periodic cadence** (e.g., before a slice closes, not on every
  prompt edit) given its real per-run provider-call cost. This is the
  "world-class" discipline the user is asking for: prompts are versioned,
  diffed, and tested exactly like code — with the gate sized to what's
  actually affordable to run on every change, and a larger check reserved
  for milestones.

### Syntax defects + `repairCoralDsl` → production reliability, not just test tooling

The original framing of `repairCoralDsl`/`repairKnownNodeTypeTypos`
(`coral-defect-corpus.md`) was a corpus-testing capability: prove they
resolve 100% of injected defects. That undersells them, but **full
production wiring is more involved than "two insertion points," and this
document was corrected after review to say so plainly rather than understate
the remaining work.**

`generate.ts`'s real control flow (traced directly, not assumed) has:

- **`existingDsl` consumed in three structurally separate branches** —
  `fix` (`composeFixSystemPrompt`), `help` (`composeHelpSystemPrompt`), and
  `generate`/`modify` (`composeSystemPrompt`, plus a *separate* parse for the
  drift baseline `originalNodeIds`) — each needing its own repair insertion,
  not one.
- **A format gate is required**: `existingDsl` can be Mermaid text when
  `outputFormat === 'mermaid'`; `repairCoralDsl` only understands Coral DSL
  and must never run on Mermaid input.
- **A data-freshness question that would otherwise be a silent bug**: if
  `existingDsl` is repaired before use, the drift baseline
  (`originalNodeIds`) must be computed from the *repaired* text, not a stale
  pre-repair parse — otherwise "what the model saw" and "what drift is
  measured against" diverge, and drift results become meaningless.
- **The spatial branch (`request.spatial` set) never calls `validateOutput`
  on its candidate at all** — it uses `parseCoralDSL` and the canonical
  `parse()` directly, a fourth, separate path repair would need to reach
  explicitly, with its own question (repair is compatible with "the model
  must not touch coordinates," but that compatibility isn't proven here).
- Every candidate-side insertion needs the same Mermaid format gate as the
  `existingDsl` side.

**Scope, corrected:** this design does not claim full production wiring
across every branch as a single-slice deliverable. It commits to one
concrete, demonstrated integration point — the **`fix` intent's Coral-format
`existingDsl` path** (the simplest single branch: one format, one
call site, and no drift-baseline interaction to get wrong) — built and
tested to the same TDD/review standard as `repairCoralDsl` itself. The
remaining branches (`generate`/`modify`'s dual pre/post-flight repair with
correctly-sequenced drift-baseline recomputation, the `help` branch, the
spatial branch, and the Mermaid format gate throughout) are named here as
**explicit, scoped follow-on work** — a distinct, separately reviewed
increment, not something this design pretends to close by asserting "runs
at two points." This mirrors exactly how S49-C3 AC-2's sampling-defaults
wiring was already narrowed in an earlier review round: prove the
capability, demonstrate one real integration, and scope the rest honestly
rather than rushing a change to the production request/response orchestrator
without it.

Even the one demonstrated integration point directly serves the
LLM-only-editing requirement: it converts a class of failures from "ask the
model to try again" (probabilistic, costs latency and budget, might not even
fix the same thing) into "fixed immediately by a verified deterministic
function" — for exactly the defect types the corpus enumerates, in the one
branch this slice actually wires up.

#### Implementation contract (Phase 3)

Stated exactly, so the TDD tests below have a single unambiguous spec to
target, not something inferred from prose.

**Corrected after independent design review, which found a real bug in an
earlier draft of this contract**: that draft skipped the LLM call entirely
whenever `parseCoralDSL` reported zero errors after repair, treating that as
proof the diagnostics that triggered the `fix` request were resolved. Traced
against the real call path (`classify.ts`'s `classifyIntent` only returns
`'fix'` when `hasDiagnostics` is true; that text is built in
`useEditorController.ts` from **edge-compatibility/notation-connection-rule
checks** — `getEdgeStatus`/`getEdgeValidation` — not from a parse failure),
the diagnostics that actually drive most real `fix` requests describe a
problem class (an incompatible/warned edge) that `repairCoralDsl`/
`repairKnownNodeTypeTypos` have no knowledge of at all. A diagram with an
edge-compatibility warning is syntactically clean already, so
`parseCoralDSL(...).errors.length === 0` is true *before* any repair even
runs — the original contract would have skipped the LLM call and returned
`success: true` with the diagram completely unchanged, silently no-op'ing on
exactly the request the user made. `GenerateRequest.diagnostics` is an
opaque formatted string with no field distinguishing "this came from a parse
failure" from "this came from an edge-compatibility check," so there is no
reliable way to gate a skip-the-network-call decision on it without adding
new structure this narrow integration point doesn't otherwise need. The
corrected contract below never skips the LLM call — it only ever improves
what the LLM is given to work with, which is safe regardless of what kind of
diagnostic triggered the request.

In `generate.ts`'s `intent === 'fix'` branch, **before** `composeFixSystemPrompt`
is called, when `outputFormat === 'coral'` (the Mermaid format gate — this
never runs on Mermaid text) **and** `existingDsl` is a non-empty string:

1. Run `repairCoralDsl(existingDsl)` → `step1`.
2. Run `repairKnownNodeTypeTypos(step1.fixed)` → `step2`. (Order matters only
   in that `repairCoralDsl` must see the raw text first — `repairKnownNodeTypeTypos`
   only ever rewrites a node's type keyword in place and cannot introduce or
   remove the grammar-level defects `repairCoralDsl` looks for, so running it
   second cannot undo `step1`'s fixes.)
3. Pass `step2.fixed` — never the original `existingDsl` — as the text
   `composeFixSystemPrompt` builds its prompt from, and continue the
   existing `fix` intent flow exactly as it runs today (same retry budget,
   same `diagnostics`/`notationId` handling, same response extraction). The
   `diagnostics` string the caller supplied is passed through unchanged (it
   describes the caller's own view of what's wrong — from an edge-compatibility
   check or otherwise — and this integration point does not attempt to
   regenerate it from the partially-repaired text).

There is deliberately no "skip the LLM" branch: even when `step2.fixed`
already re-parses with zero errors, the LLM call still runs, because a clean
parse does not imply the diagnostic that triggered the request is resolved.
This still demonstrates real production value — every grammar/vocabulary-level
defect the corpus's 17-type catalog covers is fixed deterministically before
the model ever sees the text, converting that class of problem from
"probabilistic, costs a retry" into "already correct going in" — without
gambling on an unsafe skip. If `step1.appliedFixes` and `step2.appliedFixes`
are both empty (nothing needed fixing), `step2.fixed` equals `existingDsl`
exactly and the flow is unaffected — the pre-flight step is a safe no-op for
already-clean diagrams.

This is deliberately narrow: no Mermaid handling (falls through to today's
unmodified behavior when `outputFormat === 'mermaid'`), no drift-baseline
interaction (the `fix` intent has none), no `help`/`generate`/`modify`/spatial
changes, and no attempt to classify what kind of diagnostic triggered the
request. The remaining branches stay exactly as scoped above — explicit,
separate follow-on work.

### A new scoring dimension: unintended-change detection (amends `llm-accuracy-harness.md`)

`checkStructuralDrift` (`validate.ts`) measures node loss — it does not
detect a node that survived but had its label, type, or properties silently
altered, nor does it inspect edges at all beyond node-ID presence. For
general editing this is a known limitation; for LLM-only editing it is a gap
in exactly the guarantee that matters most: "only change what was asked."
The CRITICAL RULES in `prompt.ts` assert this behavior; nothing currently
measures whether the model actually complies at the property level.

**Amendment to `llm-accuracy-harness.md`'s fixture/scoring contracts** — see
that document's "Amendment (round 2)" and "Amendment (round 3)" for the
authoritative, corrected shapes (`expectedChangedNodeIds`/
`expectedChangedEdgeIds` on `AccuracyFixtureMeta`;
`unintendedChangeCount`/`unintendedChanges` on `AccuracyScore`, with edges
compared by `(source, target)` pair rather than by the corpus's unstable
auto-derived edge IDs — not duplicated here to avoid the two documents
drifting apart on the exact contract).

Fixture authors — who wrote the prompt — already know which entities the
edit should touch; recording that expectation is no more burdensome than
writing the prompt itself, and turns "only change what was asked" from an
untested prompt assertion into a measured, corpus-wide statistic.

### Semantic defects → adversarial modify-path stress testing, and an explicitly low-confidence interim check

Two distinct uses, not one:

1. **Adversarial existing-diagram fixtures.** Feed a semantic-defect-injected
   diagram as `existingDsl` for an *unrelated* edit request (e.g., "add a
   cache" on a diagram that already has an orphan node from the corpus's
   defect injection). Score whether the model's edit **avoids introducing
   new** structural/lint problems and does not silently "fix" the
   pre-existing semantic defect when it wasn't asked to — both would violate
   the CRITICAL RULES, and this is the only way to test that without a
   working semantic linter.
2. **An interim LLM-judge check, labeled as exactly that.** Until the
   Slice-45-proposed semantic-linting slice ships a deterministic checker,
   the only way to ask "does this edit avoid worsening this specific,
   named, Fable-5.1-authored defect" is another model call — bounded by that
   named defect record, not an open-ended "is this diagram correct"
   question (that broader question was considered and explicitly rejected
   for `ambiguous`/`injected-mistake` fixtures; see `llm-accuracy-harness.md`'s
   "Alternatives rejected"). Recorded in the scorecard as
   `AccuracyScore.semanticJudgment` (`confidence: 'llm-judge'`), never merged
   with the deterministic `valid`/`driftPct`/`lintErrorCount` fields as if it
   had the same evidentiary weight — an LLM judging an LLM is a real signal,
   not a proof, and pretending otherwise is exactly the kind of overclaiming
   this slice has been catching and correcting in itself throughout its own
   reconciliation and review rounds.

### Undo-as-safety-net → corpus-driven undo-fidelity tests

Given 0.2.5 has no preview/apply gate, undo is the only recovery mechanism an
LLM-only-editing user has after a bad automatic application. **Slice 45
*requires* unified, coherent undo across AI/text/properties/layout changes —
it does not yet *deliver* it; that requirement and its delivery are not the
same thing, and this section originally conflated them.** (**Corrected again
after the 2026-09-13 release-allocation amendment**: Slice 45's decision log
records the requirement, but ownership of actually *implementing* it moved to
the new Slice 47 — "Text-first editing, AI transactions, undo, and layout
reconciliation" — which explicitly owns "reconciled text/layout/property
history" and "unified... undo/redo." References below to "landing" mean
Slice 47 landing it, not Slice 45.) This slice writes
the test *contract* now, using the same corpus (for every
`local-edit`/`add-subgraph`/`restructure` fixture, run the edit, then undo,
then assert the document is byte-identical (DSL text) and position-identical
(layout) to the pre-edit known-good state — not just "undo ran without
error"), but the tests are **blocked on Slice 47's unified undo actually
landing** — see S49-C7 AC-7. Writing the contract now means Slice 47's
implementation has a ready-made, corpus-backed acceptance test to run against
the moment it lands, rather than this slice claiming passing coverage of
something that doesn't exist yet.

## Recommendation for the apply-strategy decision (not decided here)

**Cross-worktree caveat, stated here explicitly** (matching how
`llm-accuracy-harness.md` already discloses this risk, which this document
originally omitted): `dev/releases/ai-editing-exploration.md` and
`slice-45/decision-log.md` exist only as uncommitted files in the sibling
`coral-0.2.5` worktree — absent entirely from this worktree/branch. This
slice cannot literally write into `ai-editing-exploration.md` today; S49-C7
AC-8 below tracks recording this argument as a merge-back action against
that document (or its eventual committed/merged copy), not something delivered
inside this branch.

Stated once, plainly, as a recommendation to feed into the existing HITL
process rather than a decision this assessment slice makes: the strongest
argument for *some* form of review-before-commit is not "users prefer to see
changes first" (the framing `ai-editing-exploration.md` is built around) —
it's that **a user population with no manual editing fallback has no
recovery path except undo**, and undo protects against a bad edit only if
the user notices it's bad. Whether that argument changes the outcome of the
pre-0.3.0 exploration, or motivates differentiating apply strategy by user
context (LLM-only vs. general editing) rather than picking one mode for
everyone, is exactly the kind of question that exploration exists to answer
— this document only makes sure the argument reaches it.

## Requirements and acceptance criteria (candidate)

### S49-C7 — Reliability strategy for LLM-only editing

- **AC-1:** Few-shot examples in `composeSystemPrompt` are selected from the
  corpus by Mermaid `diagramType`/`complexity` match (not "notation" — the
  corpus has no such field) rather than one fixed example for every request,
  with evidence from the accuracy harness that this improves (or does not
  regress) scores relative to the single-example baseline before it replaces
  that baseline.
- **AC-2:** `CORAL_GRAMMAR_REFERENCE` is audited against every corpus
  diagram's known-good DSL; any undocumented-but-real construct is either
  added to the reference or the corpus diagram is confirmed out of the
  currently supported grammar surface. **Early findings from the 5-diagram
  pilot corpus** (hand-authoring the Coral DSL surfaced these directly,
  before any automated audit tooling exists): the node-level `as "id"`
  clause is real (parser-supported) but wholly undocumented in the
  reference (see `llm-accuracy-harness.md`'s fixture-authoring note); and
  the real Mermaid→GraphIR conversion (`packages/language/src/formats/mermaid.ts`)
  has structural gaps the reference doesn't address at all — no flowchart
  shape ever infers `external_api`, `sequenceDiagram` participants can only
  become `actor`/`service` (never `database`), `stateDiagram`'s `[*]`
  start/end pseudostates are hardcoded to `actor` (a semantic mismatch),
  `alt`/`else` branch blocks are silently dropped with no diagnostic, and
  `erDiagram` entity attributes parse into array-valued properties that
  Coral's node-property grammar has no scalar-only representation for. None
  of these are corrected here — they're recorded as concrete input to the
  full audit once the 40-50-diagram corpus and its automated conversion
  pipeline exist, per the pilot's own scoping.
- **AC-3:** Any change to system-prompt composition (`prompt.ts`,
  `notationRef.ts`) requires the small hand-authored `fixtures/accuracy/` set
  to run through the accuracy harness showing no score regression, recorded
  as evidence alongside the change; the larger 40-50-diagram corpus runs on
  a slower, periodic cadence given its real per-run cost, not on every
  change.
- **AC-4 (narrowed after review):** `repairCoralDsl` runs as a demonstrated
  pre-flight repair step on the `fix` intent's Coral-format `existingDsl`
  path in `generate.ts` — one concrete, TDD'd, reviewed integration point.
  Full production wiring across the `generate`/`modify`/`help`/spatial
  branches (with correct drift-baseline sequencing and Mermaid format
  gating throughout) is explicit, scoped follow-on work, not claimed as
  delivered by this AC.
- **AC-5:** The accuracy harness's `AccuracyScore` includes
  `unintendedChangeCount`/`unintendedChanges` (edges compared by
  `(source, target)` pair, not by the corpus's unstable auto-derived edge
  IDs), computed from fixture-declared `expectedChangedNodeIds`/
  `expectedChangedEdgeIds`, for every local-edit/add-subgraph/restructure
  case.
- **AC-6:** Semantic-defect fixtures are used as adversarial `existingDsl`
  inputs for unrelated-edit test cases, scored on whether the edit avoids
  introducing new problems or silently "fixing" what wasn't asked; the
  bounded LLM-judge check (distinct from the general-purpose one already
  rejected for `ambiguous`/`injected-mistake`) is recorded as
  `AccuracyScore.semanticJudgment` with an explicit `confidence: 'llm-judge'`
  marker, never conflated with deterministic scores.
- **AC-7:** For every local-edit/add-subgraph/restructure fixture, an
  edit-then-undo test contract is written asserting byte-identical DSL and
  position-identical layout against the pre-edit known-good state — **blocked
  on Slice 45's unified undo/redo actually landing**; this slice delivers the
  test contract, not passing coverage of a capability that doesn't exist yet.
- **AC-8:** The apply-strategy recommendation above is recorded in
  `dev/releases/ai-editing-exploration.md` (or its eventual successor
  record) as an input to that exploration, not adopted as a 0.2.5 behavior
  change by this slice — tracked in the slice draft plan's "Deferred to
  merge-back" list, since that file is not present in this worktree/branch
  today (see the cross-worktree caveat above).

## Alternatives rejected

- **Relying on the model's self-reported confidence to gate auto-apply**:
  rejected — self-reported confidence is not a reliable signal and using it
  as a safety mechanism would be worse than not having one, since it creates
  false assurance.
- **Treating the LLM-judge semantic check as equivalent evidence to the
  deterministic checks**: rejected — would silently overstate confidence in
  results that a model, not an independent mechanism, produced.
- **Skipping the unintended-change metric because drift already exists**:
  rejected — drift measures a different failure mode (nodes disappearing),
  not property-level mutation of surviving nodes, which is exactly the
  failure class the CRITICAL RULES prompt targets and nothing currently
  measures.
- **Building a full preview/review UI here to address the LLM-only-editing
  risk directly**: rejected — that is explicitly Slice 45/`ai-editing-
  exploration.md` territory; this document surfaces the argument for that
  process rather than duplicating its decision authority.

## Requirement-to-design traceability

| Requirement (candidate) | Design element |
| --- | --- |
| S49-C7 AC-1–3 | Few-shot selection (diagram-type/complexity, not notation), grammar-reference audit, tiered prompt-regression-gate policy |
| S49-C7 AC-4 | One demonstrated `repairCoralDsl` integration (`fix` intent, Coral format); remaining branches scoped as follow-on |
| S49-C7 AC-5 | `unintendedChangeCount` amendment to `llm-accuracy-harness.md`, `(source,target)`-keyed edge diffing |
| S49-C7 AC-6 | Adversarial semantic-defect fixtures, `semanticJudgment` field, distinguished from the rejected general-purpose judge |
| S49-C7 AC-7 | Undo-fidelity test contract, explicitly blocked on Slice 47 (requirement recorded by Slice 45, implemented by Slice 47) |
| S49-C7 AC-8 | Recommendation recorded for the apply-strategy HITL process, tracked as a merge-back action |

## Review log

**Round 1 findings, all resolved:**

- **High — the unintended-change amendment misattributed how
  `originalNodes`/`originalEdges` are obtained**, and edge matching by
  parser-internal ID silently cannot detect a redirected edge (auto-derived
  IDs change when endpoints change, for this corpus's never-hand-edited DSL).
  Both fixed directly in `llm-accuracy-harness.md`'s "Amendment (round 2)"
  correction and "Amendment (round 3)"; this document now points there
  rather than duplicating a contract that could drift out of sync.
- **High — S49-C7 AC-4's `repairCoralDsl` production wiring understated
  real complexity** across `generate.ts`'s branches (three `existingDsl`
  consumers, a Mermaid format gate, a drift-baseline synchronization risk,
  an unaddressed spatial branch) and contradicted the slice plan's "two
  named exceptions" framing by implying a third, unscoped production change.
  Fixed: AC-4 narrowed to one demonstrated integration point; the rest is
  explicit follow-on work, and the slice draft plan's TDD steps and
  "Outcome and boundaries" section were updated to match.
- **High — AC-7's Slice-45 dependency was stated in the slice plan but
  dropped in this document**, which read as though passing undo-fidelity
  tests would ship with this slice. Fixed: "Undo-as-safety-net" and AC-7
  both now state the tests are blocked on Slice 45's undo landing.
- **High — `semanticJudgment`/`confidence: 'llm-judge'` was referenced by
  AC-6 but never added to `llm-accuracy-harness.md`'s `AccuracyScore`.**
  Fixed there directly ("Amendment (round 3)"); this document's AC-6 and
  prose now name the field and distinguish it from the LLM-judge mechanism
  already rejected for a different case type.
- **Medium — AC-1's few-shot selection and the corpus's schema disagreed**:
  AC-1 claimed "notation" tagging that doesn't exist in
  `coral-defect-corpus.md`'s `SourceMeta`. Fixed: rescoped to Mermaid
  `diagramType`/`complexity`.
- **Medium — AC-3's "full corpus" gate was unbounded in scope and cost.**
  Fixed: split into a per-change gate (small hand-authored set) and a
  periodic gate (the larger corpus).
- **Low — AC-8's cross-worktree dependency on `ai-editing-exploration.md`
  wasn't disclosed**, unlike the equivalent disclosure already present in
  `llm-accuracy-harness.md`. Fixed: caveat added, and the write is tracked
  as a merge-back action rather than implied to happen inside this branch.

**Round 2 (Phase 3 design review of the "Implementation contract" addition),
finding resolved:**

- **High — the original contract's "skip the LLM call when `parseCoralDSL`
  reports zero errors" short-circuit was unsafe against how `fix` requests
  actually arise in production.** Traced directly: `classify.ts`'s
  `classifyIntent` only returns `'fix'` when `hasDiagnostics` is true, and
  that diagnostics text is built in `useEditorController.ts` from
  edge-compatibility/notation-connection-rule checks
  (`getEdgeStatus`/`getEdgeValidation`), not from a parse failure. A diagram
  flagged for an incompatible edge is syntactically clean already, so the
  zero-errors check would be true regardless of whether repair ran, and the
  original contract would have skipped the LLM call and returned
  `success: true` with the diagram completely unchanged — silently doing
  nothing about the actual problem the user asked to fix. Since
  `GenerateRequest.diagnostics` carries no field distinguishing a parse
  failure from an edge-compatibility warning, there is no safe way to gate a
  skip-the-network-call decision on it without adding structure this narrow
  integration point doesn't otherwise need. Fixed: the short-circuit is
  removed entirely. The contract now only ever feeds the LLM a pre-repaired
  `existingDsl` (never skips the call), which is safe under every diagnostic
  origin — see the rewritten "Implementation contract (Phase 3)" above.

**Round 3 (merge-back reconciliation against `release/0.2.5`), findings
resolved:**

- **This slice renumbered from Slice 48 to Slice 49.** `release/0.2.5`'s
  2026-09-13 planning amendment (recorded in `plan.md` and Slice 45's
  decision log, uncommitted at the time this slice branched) independently
  assigned Slice 47 ("Text-first editing, AI transactions, undo, and layout
  reconciliation") and Slice 48 ("Semantic linting and AI-validation
  integration" — the real semantic-linting slice this document has always
  deferred to) to real, differently-scoped work. `plan.md` explicitly
  reserves "Slices 49–59... for additional assessed release work," which is
  this slice's actual category. Every "Slice 48"/`R-048.x` reference in this
  document (and the rest of this slice's design docs, code, and test
  fixtures) was renumbered to "Slice 49"/`R-049.x` accordingly — a purely
  mechanical rename with no content change, verified by a clean re-run of
  the full test suite afterward.
- **High — undo ownership moved from Slice 45 to the new Slice 47**, per the
  same amendment: Slice 45's decision log records the unified-undo
  *requirement*; Slice 47 ("reconciled text/layout/property history,"
  "unified... undo/redo") owns *implementing* it. Every reference in this
  document to undo-fidelity tests being "blocked on Slice 45" was corrected
  to Slice 47 (see "Undo-as-safety-net" and the S49-C7 AC-7 traceability
  row above) — the requirement/delivery distinction this document already
  insists on elsewhere applies here too: Slice 45 decided it, Slice 47
  delivers it.
- **Confirmed unchanged, not a finding**: the edit-lock, atomic-application,
  and Mermaid-allowlist decisions this document treats as "Slice 45's...
  fixed inputs once frozen" (aspect (d)) are still accurately attributed —
  those remain Slice 45's decisions in the amendment, only the unified-undo
  *implementation* ownership moved. The Mermaid allowlist itself remains
  genuinely undecided ("the exact Mermaid types remain open" per the
  decision log), so `MERMAID_ALLOWLIST = null` and every "provisional
  pending Slice 45" note elsewhere in this slice's design docs are still
  accurate as written.
- **Noted, not a required change**: `release/0.2.5`'s real Slice 48 draft
  plan calls for "positive/negative fixtures for each approved rule... with
  code and fixture evidence" once its own gap assessment establishes a rule
  is needed. This slice's Fable-5.1-authored semantic-defect corpus (45
  labeled examples across 14 defect types, `coral-defect-corpus.md` Step 7)
  is exactly that shape of evidence — flagged here as a candidate input for
  whoever executes the real Slice 48, not adopted as a dependency of this
  slice.
