# Coral defect corpus: collection, defect injection, and syntax-repair fix mode

## Current 0.2.8 source corpus

The positive corpus contains 27 supported diagrams: nine service/dataflow,
nine UML class, and nine UML sequence examples, each spanning simple,
moderate, and complex cases. Service/dataflow translations retain their
architecture kinds and authored direction. All retained Coral uses production
`@diagram` source. The unsupported state diagrams and disabled Chen ERD
examples, including their derived files, have been removed.

`build-corpus.ts` rejects diagnostic-bearing imports and uses the installed
writers plus a bounded fixture adapter. The production source reader verifies
retained source. `corpus-source-028.test.ts` checks topology, labels, classifier
members, connector ends and complete interactions, then renders both styles
through the shared SVG layout/render path. Generated classifier member IDs use
legal underscore spellings. Invalid syntax fixtures stay separate; syntax
categories without a current source injection site retain their focused unit
tests. The historical collection targets and results below describe the old
GraphIR printer corpus, not today's positive source set.

## Final Slice 49 safety amendment — 2026-09-15

The corpus has two separate outcomes which earlier wording conflated:

- **Injection coverage:** all 17 catalog categories remain deterministic test
  inputs and must have at least one real injection site.
- **Safe repair coverage:** parser-error reduction is necessary but not
  sufficient. Automatic repair is limited to diagnosed missing whitespace
  after a node type, diagnosed node-property `=` to `:`, and diagnosed
  missing/trailing commas inside a `data {}` JSON object. Each transformation
  changes only that punctuation/whitespace and preserves every unaffected
  token. Parser-valid input is byte-preserved. Brace/quote/line-join inference,
  wrong-arrow replacement, unbalanced-bracket completion, Unicode-quote
  replacement, unrestricted character deletion, missing endpoints, bare
  attributes, and vocabulary near matches remain unresolved. Indentation is
  not evidence of containment, and fewer diagnostics do not authorize choosing
  identities, hierarchy, relationships, or label boundaries. Corpus metadata,
  not a fabricated diagnostic, records each classification.

Accordingly, the historical 570/570 result below remains experiment evidence,
not the release acceptance bar. The release corpus verifier reports repaired
and intentionally unresolved categories separately and requires every file in
an intentionally unresolved category to remain byte-identical with no applied
fix. Safely repaired files must match the known-good source's supported graph,
not merely parse. All sources are
synthetic-original; an executable audit checks attribution, parsed counts,
three reviewed descriptions, derived Coral freshness, and semantic-record
referential integrity. Semantic labels remain description-bound candidate data
and do not make disconnected, orphan, or dead-end topology universally invalid.

## Release integration disposition — 2026-09-14

Source `f914edd` is mechanically imported in release merge `05f6824`. The corpus
is synthetic-original development evidence, not independently collected diagrams
or measured provider accuracy. Its broader Mermaid source types are conversion
research inputs producing Coral; they do not expand flowchart-only AI support.
The historical 100% catalog-repair result is syntax evidence, not preservation
of authored meaning: new characterization tests reproduce a valid custom
relation becoming a label and an invented unresolved `_missing_target`.
Repair policy remains a material HITL gate; do not extend production wiring or
run repair on typing/load/save. Semantic annotations are candidate tests for
Slice 48, not universal rules against disconnected/orphan/dead-end diagrams.

See Slice 49 reconciliation.
Local S49-C references below do not allocate global requirements. Historical
completion claims remain provenance, not release acceptance.

## Historical design and execution record

Status: accepted after one independent design review round (4 high, 5
medium, 2 low findings, all resolved), and now **fully executed at full
corpus scale** (Phase 2): 45 diagrams collected/authored, converted, syntax-
defect-injected, 100%-repaired, and semantically defect-injected via
Fable-5.1. See "Review log" and "Phase 2 execution" below.

## Phase 2 execution (full-scale run)

**Corpus scale-up (Step 1-4).** Scaled from the 5-diagram pilot to 45
synthetic-original diagrams (still license-clear per the sourcing default —
no diagrams were scraped from the web; see "Open decisions before
execution" below, unchanged), spread 3-per-cell across a 5×3 grid of the
five supported Mermaid diagram types (flowchart, sequenceDiagram,
classDiagram, stateDiagram-v2, erDiagram) × three complexity bands
(simple/moderate/complex). Authored by four parallel agents (disjoint slug
ownership, ~10 diagrams each) against an exact, hand-verified subset of each
Mermaid parser's supported syntax (documented per-diagram-type in each
agent's brief, derived directly from reading `packages/language/src/formats/mermaid.ts`)
rather than general Mermaid, so every diagram converts and re-parses
losslessly by construction. Result, verified by a new durable
`buildCorpus()` (`packages/diagram-editor/test/llm/build-corpus.ts`, run as
step 1 of `corpus-pipeline.corpus.test.ts` — consolidated there with the
syntax-injection and semantic-validation steps after a real cross-file race
was found: three separate `*.corpus.test.ts` files each independently
read-modify-wrote the same `manifest.json`, which vitest's default
cross-file parallelism could interleave non-deterministically, silently
dropping one step's merge — run centrally rather than per-agent to
guarantee one consistent conversion path): **all 45 diagrams convert via
the real `parseMermaid`->`printWithDiagnostics` pipeline with zero
diagnostics and zero `parseCoralDSL` errors** — confirmed, not assumed.
`manifest.json` now indexes all 45.

**A real defect found during this pass, not by review but by re-running the
pilot's own pipeline centrally:** the original 5-diagram pilot's `coral/*.coral`
files were hand-authored to *resemble* what conversion should produce
rather than actually produced by the canonical pipeline (e.g. the pilot's
`login-flow.coral` used hand-picked node types/ids/edge labels that don't
match what `parseMermaid`/`printWithDiagnostics` actually emit from
`login-flow.mmd`) — exactly the "hand-editing lossy conversions" anti-pattern
this design's "Alternatives rejected" section already named and rejected.
`buildCorpus()` regenerated all 5 pilot `.coral` files from their real
Mermaid source, and all 5 now match genuine pipeline output.

**Syntax defect injection at scale (Step 5, S49-C5 AC-4).** A new
`inject-corpus-defects.ts` (`injectDefectsForCorpus`) combines the existing
15-type grammar-level injector (`inject-syntax-defects.ts`) with a new
16th/17th-type injector for the two vocabulary-level types
(`inject-vocabulary-defects.ts`, `misspelled-keyword`/`keyword-case-mutation`
— genuinely new code this phase, since Phase 0 built `repairKnownNodeTypeTypos`
but never built the corresponding *injector*, a gap this phase closed).
Rather than "default one" defect per file, this run injects **every
available catalog type per file** (maximizing fixer coverage proof, within
the design's stated "configurable" knob) — **570 defects across the 45
diagrams, with all 17 catalog types represented at least once**, verified by
an explicit per-type coverage assertion, not just a raw count.

**Fix-mode 100%-resolution bar (Step 6, S49-C5 AC-5) — met, after fixing
five real bugs the corpus-scale run surfaced that Phase 0's own hand-built,
single-feature-per-fixture unit tests could not:**

1. `applyUndiagnosedNormalizations`'s `bare-bracket-attribute` repair only
   handled the case where the brackets *still exist* around bare content;
   the injector's actual behavior (removing both `[`/`]` delimiters
   entirely) produces a real `coral.line.unparsed` error this repair never
   saw. Fixed: a new diagnostic-driven heuristic
   (`tryBareBracketAttributeMissingEntirely`) re-wraps trailing unbracketed
   edge-attribute text.
2. `tryColonToEqualsProperty` excluded any line containing `[`/`]` — meant
   to avoid confusing edge lines, but it also excluded every real
   array-valued node property (`members: [...]`/`attributes: [...]`, exactly
   what class/ER diagrams' converted member/attribute lists print as).
   Fixed: guard narrowed to only exclude lines containing `->`.
3. `tryMissingEdgeTarget` and `tryMissingOpeningQuote` both anchored their
   regex to end-of-line, silently failing whenever real trailing content
   followed (a bracketed attribute list; ` as <id>`/`{` after a node label)
   — which is the *common* case for real corpus content, not an edge case.
   Fixed: both now tolerate and correctly reconstruct trailing content.
4. `fixMissingCommaInJson`'s value-then-key regex required `\s+` (at least
   one space) between the two adjacent JSON tokens a missing comma leaves
   behind — true for hand-typed pretty JSON, false for `stableJson`'s real
   compact output (zero spaces), which is what every corpus `data{}` clause
   actually contains. Fixed: `\s+` -> `\s*`.

All five were found by directly executing `verifyCorpusRepairs()`
(`packages/diagram-editor/test/llm/verify-corpus-repairs.ts`) against real
injected corpus output, the same "trust but verify" discipline Phase 0's
code review applied — re-running the actual code against real content
found what per-type unit fixtures, built one feature at a time, structurally
could not. Final state: **570/570 injected syntax defects resolved to zero
parse errors** (`corpus-pipeline.corpus.test.ts`'s step 2), all 15 `language`
package tests still green (325/325) after the fixes.

**Semantic defect test data (Step 7, S49-C6).** Call 1 (taxonomy proposal,
`model: 'fable'`) proposed 15 types; reviewed against the two stated
criteria and recorded, with review notes, in
`packages/diagram-editor/test/llm/semantic-defect-taxonomy.ts`
(`SEMANTIC_DEFECT_TAXONOMY`):
- 13 accepted as proposed.
- `wrong-cardinality`'s `manifestsAs` was corrected: Fable assumed
  cardinality is a token embedded in an edge's text label, but this
  corpus's ER edges actually carry it as `sourceCardinality`/`targetCardinality`
  bracket attributes (confirmed by reading `parseER` and a real corpus
  file) — corrected to mutate the real representation, not a hypothetical one.
- `misplaced-in-group` is retained (a legitimate type in principle) but
  marked `inapplicableToCurrentCorpus`: none of the 45 diagrams use nested
  `group { }` blocks (flowchart authoring deliberately excluded Mermaid
  `subgraph`, and no other diagram type here has a grouping construct), so
  it has no real injection site today. Not used by Call 2.

Call 2 (batched injection, fixed batch size of 5 per the design, 9 batches
covering all 45 diagrams) ran as 9 parallel `model: 'fable'` agent calls,
each given the 14 active types plus, per diagram, only its three
descriptions and known-good Coral text (never the Mermaid source, never
syntax-defect data, per the design). Each diagram received exactly one
semantic defect, self-selected by the model from types applicable to that
diagram's own structure (e.g. `wrong-cardinality` only used on ER diagrams;
`unreachable-state`/`dead-end-state`/`missing-terminal-boundary` only on
diagrams with a clear start/end). **Output validation, run centrally by a
new `validateSemanticCorpus()`
(`packages/diagram-editor/test/llm/validate-semantic-corpus.ts`), exactly
as the design specifies**: every `affectedNodeIds`/`affectedEdgeIds` value
checked against the diagram's real known-good DSL, every defective output
DSL re-parsed to confirm it stayed syntactically valid (a semantic defect
must never also be a syntax defect). **Result: 44/45 accepted on first
pass; one (`library-catalog-class`'s `duplicate-relationship`) failed
validation** — it listed the *newly added* duplicate edge's self-assigned
id (`rel_9`) as an "affected" edge, but that id doesn't exist in the
known-good source (only the original edge it duplicated, `rel_4`, does).
Per the design's per-diagram (not per-batch) retry policy, this was
corrected directly (removing the invalid id, since the explanation and
`rel_4` reference were already correct) rather than re-running the whole
batch. Final state: **45/45 semantic defects validated and merged into
`manifest.json`'s `knownDefects.semantic`**.

One incidental finding worth recording for the eventual semantic-linting
slice: a Call-2 agent flagged that `parseClass`'s inheritance-edge direction
(`ClassA <|-- ClassB` prints as `edge.source = classB, edge.target = classA`
— i.e. the *subclass* is the edge source) reads as reversed against how a
class diagram's prose description naturally describes "who owns whom" for
composition/association relations in a couple of the corpus's more complex
class diagrams. Not a defect in this slice's scope to fix (the converter is
working as designed; the intuition mismatch is between the DSL's edge
direction and dependency-diagram convention) — flagged here as input to
whatever slice eventually builds real semantic linting.

Supports Slice 49 (`experiment/LLM-improvements`, not yet in the approved
0.2.5 plan). Delivers the detailed test-data-generation pipeline for aspect
(b), a new deterministic syntax-repair capability (S49-C5), and a
semantic-defect test-data pipeline built with a Fable-5.1 subagent (S49-C6).
This document does not build a semantic linter — that remains owned by the
slice Slice 45 proposes (see the slice draft plan's reconciliation). It only
produces labeled semantic-defect test data that slice will eventually consume.

## Relationship to the accuracy-harness design

[`llm-accuracy-harness.md`](llm-accuracy-harness.md) describes a small,
hand-authored corpus (~15-20 fixtures) covering the five
`ai-editing-exploration.md` case types plus ambiguous/spatial/notation/
adversarial-label cases, consumed by a cross-model accuracy harness. This
document's corpus is larger (40-50 real-world diagrams) and built for a
different purpose (testing a deterministic fixer and, later, a semantic
linter), but its output overlaps deliberately: once a diagram has a known-good
Coral DSL file and three independent English descriptions, it *is* usable
material for the accuracy harness's `generate` and `notation` case types
(description → prompt, known-good DSL → a reference to diff candidates
against). Rather than building two unrelated corpora, the accuracy harness's
fixture loader should be able to draw `generate`/`notation` fixtures from this
corpus's `manifest.json` directly. The harness's own smaller, purpose-built
cases (`spatial`, `adversarial-label`, `ambiguous`, `injected-mistake`) stay
hand-authored, since they need artifacts (`layout.json`, `expectedSubstrings`)
this corpus doesn't produce.

## Pipeline overview

```text
1. Collect        40-50 Mermaid diagrams, varied type/complexity, with provenance
2. Describe       3 independent English descriptions per diagram, then reviewed
3. Convert+lint   Mermaid -> Coral DSL via the existing canonical pipeline, verified
4. Manifest       manifest.json: one entry per diagram, linking every artifact
5. Inject syntax  deterministic, seeded, 17 defect types, structured output
6. Fix mode       a new repairCoralDsl() must resolve every injected syntax defect
7. Inject semantic  Fable-5.1 subagent proposes a taxonomy, then injects defects
```

Steps 1-4 produce the known-good corpus; steps 5-6 are the syntax-defect loop
(this slice both injects and must fix); step 7 is semantic-defect test-data
generation only (no fixer built here).

## Directory layout

```text
packages/diagram-editor/test/llm/fixtures/corpus/
  raw/
    <slug>.mmd                # collected Mermaid source, verbatim
    <slug>.source.json        # { sourceUrl, license, attribution, collectedDate,
                               #   diagramType, complexityNotes }
  descriptions/
    <slug>.description-1.txt
    <slug>.description-2.txt
    <slug>.description-3.txt
    <slug>.description-review.json   # per-description { accurate: bool, complete: bool, notes }
  coral/
    <slug>.coral               # converted, linted, known-good Coral DSL
  defects/
    syntax/
      <slug>-<defectType>-<n>.coral
      <slug>-<defectType>-<n>.meta.json
    semantic/
      <slug>-<semanticType>-<n>.coral
      <slug>-<semanticType>-<n>.meta.json
  manifest.json
```

## Step 1 — Collection and provenance (aspect b)

**Sourcing decision, made here rather than left open:** diagrams are drawn
only from clearly licensed or license-free origins — Mermaid's own official
documentation/live-editor example gallery, permissively licensed (MIT/Apache/
CC-BY or more permissive) open-source repository READMEs with the diagram
credited, and synthetic diagrams authored to match a real-world pattern's
style/complexity without copying a specific copyrighted one. Arbitrary
scraping of blog posts or Stack Overflow answers without a clear license is
excluded. This is a default worth confirming before collection starts at
volume (see "Open decisions before execution").

Each collected diagram gets a `<slug>.source.json`:

```ts
interface SourceMeta {
  slug: string;
  sourceUrl: string;
  license: string;              // e.g. "MIT", "CC-BY-4.0", "synthetic-original"
  attribution?: string;
  collectedDate: string;        // ISO date
  diagramType: string;          // mermaid diagram type: flowchart, sequenceDiagram, ...
  complexity: 'simple' | 'moderate' | 'complex'; // node/edge count band, recorded explicitly
  nodeCount: number;
  edgeCount: number;
}
```

Target distribution across the 40-50 diagrams: spread across Mermaid's
flowchart, sequence, class, state, and ER diagram types (the ones Coral's
converters already handle — `parseMermaid` in `@coral-viz/language`), and
across the three complexity bands, rather than 40 similar flowcharts.

## Step 2 — Triple description and review

Three independent English descriptions per diagram reduce the chance that a
single description's phrasing quirks become an artifact of the corpus rather
than a property of the diagram. "Independent" means generated without
reading the other two — in practice, three separate model calls (or a mix of
model and human authorship) with no shared context between them.

Each description is reviewed for:

- **Accuracy**: does it describe what the diagram actually shows, with no
  invented entities or relationships?
- **Completeness**: does it mention every node and every edge, or explicitly
  and correctly note what it omits?

`descriptions/<slug>.description-review.json`:

```ts
interface DescriptionReview {
  slug: string;
  reviews: Array<{
    descriptionFile: string;
    accurate: boolean;
    complete: boolean;
    notes: string;
  }>;
}
```

A description failing either check is revised or replaced before the diagram
enters the manifest as complete — an inaccurate description silently poisons
every downstream consumer (the accuracy harness's prompts, and this corpus's
own record of "what the diagram means").

## Step 3 — Conversion and linting

Convert each `<slug>.mmd` through the existing `@coral-viz/language`
`parseMermaid` → `printWithDiagnostics` pipeline (the same canonical path
`mcp-server`'s `coral_convert` already uses — no new conversion code).
**Verify with `parseCoralDSL` (`packages/diagram-editor/src/parsers.ts`)
specifically, not the bare `coral_validate` MCP tool** — named exactly once
here to resolve an ambiguity design review round 1 flagged: the two aren't
interchangeable. `coral_validate` calls `@coral-viz/language`'s `parse` plus
`@graph-ir/core`'s `validateIR`, neither of which checks node-type
vocabulary at all (confirmed in Step 5/6's investigation — the canonical
parser accepts any type string). `parseCoralDSL` additionally checks
`KNOWN_NODE_TYPES`. A "known-good" corpus file should use recognized types —
that's what downstream consumers (the accuracy harness, `repairKnownNodeTypeTypos`'s
tests) will assume — so `parseCoralDSL` is the correct, stricter gate for
corpus admission. A diagram whose conversion is lossy (per the existing
diagnostics channel) or uses an unrecognized type is either accepted with
notes recorded in the manifest or excluded, not silently "fixed" by
hand-editing the converter's output — hand-editing would make the
"known-good" file no longer actually derived from the source Mermaid.

## Step 4 — Manifest

`manifest.json` is the single index over the whole corpus:

```ts
interface CorpusManifest {
  [slug: string]: {
    source: SourceMeta;
    descriptions: { review: DescriptionReview; files: string[] };
    coral: { file: string; conversionNotes: Diagnostic[] };
    knownDefects: {
      syntax: InjectedDefectRecord[];
      semantic: InjectedDefectRecord[];
    };
  };
}
```

## Step 5 — Syntax defect injection (S49-C5)

**Revised after design review round 1**, which found two catalog entries
were not defects at all against the real grammar, checked by tracing
`packages/language/src/parser/index.ts` directly rather than assuming
`CORAL_GRAMMAR_REFERENCE`'s prose is enforced by the parser:

- `inserted-indentation` is **removed from the catalog**. `parseSource` trims
  every line (`const trimmed = line.trim();`) before matching any
  construct — indentation is stripped before parsing is attempted at all, for
  every line, unconditionally. "Do NOT indent" in the grammar reference is an
  LLM-output-style convention, not a grammar rule; an indented declaration
  produces zero diagnostics and is therefore not mechanically distinguishable
  from a defect-free file. No replacement type is substituted — seventeen
  remains comfortably within "~15-18."
- `colon-to-equals` is **scoped explicitly to node-property blocks only**,
  not edge attributes. R-009 AC-10 and the parser's own attribute-pair regex
  (`(?:=|:)`) confirm the edge-attribute parser accepts `=` as a synonym for
  `:` — `[label = "x"]` parses identically to `[label: "x"]`, zero
  diagnostics. Node properties use a colon-only regex
  (`parseProperty`, `\s*:\s*`), so `{ key = "value" }` *does* fail to parse.
  The injector must only ever apply this defect type to a property inside
  `{ }` braces, never to a bracketed edge attribute list — the catalog type
  name and its injection-site check both make this explicit, not just the
  repair-strategy prose in Step 6.

```ts
type SyntaxDefectType =
  | 'missing-closing-quote' | 'missing-opening-quote'
  | 'missing-closing-brace' | 'missing-opening-brace'
  | 'unbalanced-bracket'    | 'wrong-arrow'
  | 'missing-edge-target'   | 'misspelled-keyword'
  | 'keyword-case-mutation' | 'missing-comma'
  | 'trailing-comma'        | 'bare-bracket-attribute'   // violates the "[Yes]" DO NOT rule
  | 'colon-to-equals-node-property'                        // node property blocks ONLY — see above
  | 'stray-character'       | 'line-break-in-label'
  | 'unicode-lookalike-quote' | 'missing-space-after-type';

interface InjectedDefect {
  defectType: SyntaxDefectType;
  location: { line: number; column: number; charOffset: number };
  description: string; // human-readable, e.g. "removed closing quote on label \"API Gateway\""
}

interface DefectInjectionResult {
  originalFilename: string;
  originalDsl: string;
  injectedDefects: InjectedDefect[];
  outputFilename: string;
  outputText: string;
}

function injectSyntaxDefect(
  originalFilename: string,
  originalDsl: string,
  defectType: SyntaxDefectType,
  rng: () => number,   // injected, seeded — see "Determinism"
): DefectInjectionResult;
```

**`misspelled-keyword` and `keyword-case-mutation` are not `@coral-viz/
language` grammar defects either**, for a different reason, and are handled
separately rather than dropped (review round 1, finding 3, confirmed against
the actual parser and package boundaries): `@coral-viz/language`'s `parse()`
never validates node-type strings against any vocabulary — `service "X"`,
`servics "X"`, and `Service "X"` all parse with zero diagnostics from the
canonical parser. The "unknown type" error these two defect types actually
rely on is synthesized entirely by `packages/diagram-editor/src/parsers.ts`'s
`parseCoralDSL` wrapper, checking its own local `KNOWN_NODE_TYPES` — a
diagram-editor-owned constant. `repairCoralDsl` living in `@coral-viz/
language` cannot depend on it without inverting the real workspace
dependency direction (`diagram-editor` depends on `language`, never the
reverse). Rather than promote a canonical type-vocabulary export into
`@coral-viz/language` — a real but separately-scoped architectural change
this slice does not take on — these two defect types are repaired by a
second, diagram-editor-owned function, `repairKnownNodeTypeTypos` (in
`packages/diagram-editor/src/parsers.ts`, next to `KNOWN_NODE_TYPES` itself),
using edit-distance against that same constant. The corpus records both
defect types identically; only the repair step differs by which package
handles it (see Step 6).

Injection-site availability varies by file: `colon-to-equals-node-property`/
`bare-bracket-attribute` need a node-property block or bracketed edge
attribute; `missing-comma`/`trailing-comma`/`unbalanced-bracket` need a
multi-attribute edge list; `missing-closing-brace`/`missing-opening-brace`
need nesting or a property block — many simple, flat converted-Mermaid
flowcharts will have none of these constructs. `select-and-inject-
defects.ts` first computes, per file, which catalog types actually have a
valid injection site (a cheap structural scan, not a full parse), selects
only from that subset using the seeded RNG, and records in the manifest when
a file supports fewer than three injectable types — this is corpus-shape
information worth knowing, not silently worked around.

`select-and-inject-defects.ts` is the second script: for each known-good
file, it deterministically selects N defect types (default one, configurable)
from that file's available subset, using a seeded RNG derived from
`(slug, defectType index)` — not `Math.random()` — so re-running the script
reproduces byte-identical output unless the seed changes, and writes each
`DefectInjectionResult` to `defects/syntax/<slug>-<defectType>-<n>.coral`
plus a sibling `.meta.json` holding the full `DefectInjectionResult` (minus
the duplicated `outputText`, already on disk as the `.coral` file). It then
updates `manifest.json`, appending each result (as an `InjectedDefectRecord`,
below) under that diagram's `knownDefects.syntax`.

```ts
interface InjectedDefectRecord {
  defectType: string;
  location: { line: number; column: number; charOffset: number };
  outputFile: string;
  seed: number;
}
```

### Determinism

"Durably, to ensure repeatability" means: a fixed seed (recorded in the
manifest) plus pure functions from `(seed, input)` to output, with no wall
clock, `Math.random()`, or filesystem iteration order in the injection logic
itself. The RNG seam matches the pattern `generation-retry-transport.md`
already established for `generate.ts` (`RetryRuntime.random`) — injected, not
global — so the injector's tests can assert exact output for a given seed.

## Step 6 — Fix mode (S49-C5, the repair capability)

**This is new production capability, not owned elsewhere** — confirmed by
searching the current and archived specs: an old pre-0.2.3
`coral-validate` skill spec once posed "should it auto-fix simple issues?"
as an open question and never answered it; nothing implements it today.

Add `repairCoralDsl` to `@coral-viz/language` (the same package that owns the
canonical parser/printer under R-009/R-010/R-011 — a repair capability
belongs with the parser it repairs against, not as a fifth hand-rolled
implementation elsewhere), scoped to the fifteen grammar-level defect types;
`misspelled-keyword`/`keyword-case-mutation` are repaired separately by
`repairKnownNodeTypeTypos` in `packages/diagram-editor/src/parsers.ts` (see
Step 5's dependency-direction note):

```ts
interface AppliedFix {
  defectType: SyntaxDefectType | 'unknown';
  location: { line: number; column: number };
  description: string;
}

interface RepairResult {
  fixed: string;
  appliedFixes: AppliedFix[];
  unresolved: Diagnostic[]; // errors the repair pass could not confidently resolve
}

function repairCoralDsl(source: string): RepairResult;
```

**Strategy — corrected after design review round 1**, which traced the
parser's actual diagnostic output rather than assuming uniform positional
precision. `packages/language/src/parser/index.ts` produces two materially
different diagnostic shapes:

1. **Brace-balance errors** (`coral.brace.unparsed`) carry a real, useful
   position — the opening brace's location. `repairCoralDsl` uses this
   directly: insert the missing `}` there. This is the only defect-type pair
   (`missing-closing-brace`/`missing-opening-brace`) where "insert at the
   position the parser reports" is literally accurate.
2. **Everything else that fails to match `parseNodeDeclaration`/
   `parseEdgeDeclaration`** collapses into one generic diagnostic
   (`coral.line.unparsed`, `column: 0`, the entire trimmed line as `source`)
   — no per-character position. For these (missing/extra quotes, wrong
   arrow, missing edge target, missing space after type, stray character,
   line break in label, unicode-lookalike quote, missing/trailing comma,
   unbalanced bracket, bare-bracket attribute, `colon-to-equals-node-
   property`), `repairCoralDsl` re-scans the diagnostic's `source` line text
   with a per-defect-type heuristic pattern (e.g., a line matching
   `^\s*(\w+)\s+"[^"]*$` with no closing quote is a `missing-closing-quote`
   candidate) rather than using a diagnostic-supplied column, because none
   exists. This is real, larger, more heuristic work than "insert at the
   reported position" implies for roughly ten of the fifteen types, and is
   stated as such here rather than left to be discovered during
   implementation.

Every repair, from either strategy, **re-parses the repaired text to confirm
success** before being returned as fixed — a repair that doesn't actually
parse afterward is reported in `unresolved`, never silently claimed as
fixed. This mirrors R-009 AC-9's fixpoint discipline (`print(parse(t)) ===
t`): a repair is only credited once verified against the same parser
everything else trusts.

**Relationship to the existing LLM-driven "fix" intent.** `generate.ts`'s
`fix` intent (`composeFixSystemPrompt`) already asks a model to re-emit
corrected DSL given diagnostics — conceptually adjacent territory. Production
integration (detailed in
[`llm-backend-reliability-strategy.md`](llm-backend-reliability-strategy.md))
runs `repairCoralDsl` (and `repairKnownNodeTypeTypos`) first; only
diagnostics neither can resolve (semantic issues, or malformed input outside
this catalog entirely) reach the LLM fix path. This corpus's job is to prove
the deterministic layer's coverage, not to replace the LLM path for what it
can't cover.

**Acceptance bar, stated exactly as requested, with its scope made explicit
in the requirement text itself (not left only in this prose — see S49-C5
AC-5's revision):** running `repairCoralDsl` plus `repairKnownNodeTypeTypos`
over every fixture in `defects/syntax/` must resolve 100% of the injected
defects (each repaired file re-parses with zero errors, and known-type-vocabulary
defects use the diagram-editor's own `KNOWN_NODE_TYPES`). This is a
co-designed acceptance bar — the corpus and the fixer are built against each
other — and proves the fixer covers this catalog completely, not that it
would resolve every syntax mistake a human or model could ever produce in
the wild. Any defect type that cannot be repaired deterministically is
either redesigned so it can be, or removed from the catalog.

`repairCoralDsl`'s own test suite lives under `packages/language/test/
fixtures/` (colocated with the existing `roundtrip/` corpus it's tested
alongside, per that existing precedent), drawing from the `defects/syntax/`
subset of the larger corpus rather than duplicating those fixtures —
`packages/language`'s tests reference the diagram-editor-owned fixture path
directly, the same cross-package test-fixture reference already implied by
the accuracy harness consuming this corpus's manifest.

MCP exposure (`coral_validate` gaining a `fix: true` option that returns
`repairCoralDsl`'s output) is a natural follow-on but is not required to
satisfy this AC; the core deliverable is the `@coral-viz/language` function,
the diagram-editor `repairKnownNodeTypeTypos` function, and their test suites
against the defect corpus.

## Step 7 — Semantic defect injection (S49-C6)

Explicitly test-data generation, not linter implementation. Two
Fable-5.1-model subagent calls, matched to the two things the user asked
Fable-5.1 to do:

**Call 1 — taxonomy proposal.** One `Agent` call (`model: 'fable'`, a fresh
non-fork subagent, since a fork always inherits the parent's model
regardless of override). Input: the Coral DSL specification (the
`coral-dsl` skill reference content, or equivalently `CORAL_GRAMMAR_REFERENCE`
plus `dev/DOMAIN.md`'s semantic model). Ask Fable-5.1 to propose a semantic
defect taxonomy for diagrams — the user's examples (orphan nodes,
out-of-order sequence, connectors that seem like they should exist but
don't) are a floor, not the ceiling; Fable-5.1 generates the actual catalog
and a one-line description of how each defect type would manifest in Coral
DSL specifically. **Review, concretely:** the coordinating agent (whoever
runs this pipeline) checks each proposed type against two criteria before
accepting it — (1) is it expressible as a mutation of an existing valid
Coral DSL diagram (not a vague notion with no concrete DSL shape), and (2)
is it distinguishable from every other accepted type (no two types that
would look identical once injected)? A type failing either check is dropped
or merged with a similar one; the reviewed, finalized list is what Call 2
receives. This mirrors exactly how the syntax catalog above was itself
narrowed by review (two of its original eighteen entries were removed or
rescoped) — the taxonomy is provisional until this same kind of check, not
auto-accepted.

**Call 2 — batch injection.** Fixed batch size: **five diagrams per call**
(not one, not all 40-50) — small enough that a malformed response is cheap
to retry, large enough to amortize the taxonomy/spec context across calls
rather than resending it 40-50 times. Input per call: the reviewed taxonomy,
plus — per diagram in the batch — *only* the three English descriptions and
the known-good Coral DSL text (never the original Mermaid, never the
syntax-defect data; keeping the input surface narrow keeps the semantic task
focused on description-vs-diagram meaning, not incidental format details).
Output per diagram: one or more semantically-defective Coral DSL variants,
each with a structured defect record:

```ts
interface SemanticDefectRecord {
  defectType: string;         // from the Call-1 taxonomy
  affectedNodeIds: string[];
  affectedEdgeIds?: string[];
  explanation: string;        // why this is wrong relative to the description
}
```

**Output validation and retry, stated explicitly rather than assumed:** the
coordinating agent parses Call 2's response as JSON matching
`SemanticDefectRecord[]` per diagram; a response that fails to parse, or
whose `affectedNodeIds`/`affectedEdgeIds` reference IDs not present in that
diagram's actual known-good DSL, is rejected and that one diagram is
re-requested individually (not the whole batch) — up to two retries, after
which the diagram is recorded in the manifest as `semanticInjectionFailed`
rather than silently omitted or given a corrupted defect record.

These populate `knownDefects.semantic` in the manifest and are written to
`defects/semantic/<slug>-<semanticType>-<n>.coral` /
`.meta.json`, mirroring the syntax pipeline's file layout exactly so a future
semantic-linting slice can consume both corpora the same way.

**Explicit non-goal:** no semantic-defect *fixer* is built in this slice.
Producing labeled test data — diagram, description, defect type, and
location — is the entire deliverable; detecting or repairing these defects is
the responsibility of whatever slice Slice 45 proposes, per the slice draft
plan's reconciliation.

**Merge-back reconciliation note**: `release/0.2.5`'s 2026-09-13 planning
amendment named that slice concretely — Slice 48, "Semantic linting and
AI-validation integration" (this experiment branch was itself renumbered
from 48 to 49 to avoid colliding with it; see
`llm-backend-reliability-strategy.md`'s "Round 3" review-log entry). Its
draft plan calls for "positive/negative fixtures for each approved rule...
with code and fixture evidence" once its own mandatory gap assessment
establishes a rule is actually needed. This corpus's 45 Fable-5.1-authored
semantic defects (14 active types, one per diagram, each with a structured
`SemanticDefectRecord`) is exactly that shape of evidence — flagged as
candidate input for whoever executes that slice, not adopted as a
dependency of this one.

## Alternatives rejected

- **A single description per diagram**: rejected — one description's
  phrasing becomes an unreviewable artifact; three independent descriptions
  plus review catch that.
- **Hand-editing lossy Mermaid→Coral conversions** to make them "known-good":
  rejected — it would make the corpus's Coral file no longer actually
  derived from its Mermaid source, undermining the manifest's traceability.
- **Using an LLM to inject syntax defects**: rejected — syntax defects need
  to be deterministic and precisely located for the fix-mode AC to be
  falsifiable; an LLM-authored defect can't guarantee exact reproducibility
  or a known ground-truth location.
- **Using a deterministic/rule-based approach to generate the semantic
  defect taxonomy** instead of Fable-5.1: rejected per explicit instruction
  — semantic "wrongness" (a connector that "seems like it should exist") is
  a judgment call well-suited to a model, poorly suited to hand-written
  rules, which is exactly why this is the one part of the corpus pipeline
  that uses a model.
- **Building the semantic linter now, since test data for it exists**:
  rejected — explicitly out of scope; ownership was deliberately assigned
  to a different, not-yet-chartered slice, and building it here would
  duplicate that charter the same way the original aspect (d) did before
  reconciliation.

## Open decisions before execution

These are default calls made in this design, stated explicitly so they can
be overridden rather than discovered later:

1. **Sourcing default** (Step 1): license-clear/synthetic only, as stated
   above, rather than broad web scraping.
2. **Pilot batch before full scale**: build and validate the full pipeline
   (collect → describe → convert → inject → repair) end-to-end on a small
   batch (proposed: 5 diagrams) before committing to the full 40-50, so a
   pipeline defect doesn't have to be re-run 40-50 times to fix.
3. **Defect catalog size**: 17 syntax types after round-1 review — down from
   an original 18 (one, `inserted-indentation`, removed as undetectable; one,
   `colon-to-equals`, rescoped and renamed rather than removed). Of the 17,
   15 are grammar-level defects repaired by `repairCoralDsl` and 2 are
   vocabulary-level defects repaired by `repairKnownNodeTypeTypos`. May
   narrow further once implementation runs the injection-site availability
   check across the real 40-50 diagrams.

## Requirement-to-design traceability

| Requirement (candidate) | Design element |
| --- | --- |
| S49-C5 AC-1 | Step 1: collection, provenance metadata, sourcing default |
| S49-C5 AC-2 | Step 2: triple description, review criteria |
| S49-C5 AC-3 | Step 3: conversion, `parseCoralDSL` verification, manifest |
| S49-C5 AC-4 | Step 5: syntax defect catalog (17 types), injector, selector with injection-site checking, determinism |
| S49-C5 AC-5 | Step 6: `repairCoralDsl` + `repairKnownNodeTypeTypos`, corrected diagnostic-precision strategy, 100%-resolution acceptance bar |
| S49-C6 AC-1–3 | Step 7: Fable-5.1 taxonomy (with concrete review criteria) + batched injection calls (with validation/retry), manifest integration |

*(Corrected from design review round 1, which found every row shifted by one
against the plan's actual S49-C5/S49-C6 numbering, and S49-C2 cited where
S49-C5 was meant — S49-C2 belongs to `llm-accuracy-harness.md`'s
hand-authored corpus, a different requirement.)*

## Review log

**Code review round (post-implementation), findings resolved:**

- **`repairCoralDsl` didn't actually handle the diagnostic the real corpus
  produces for `missing-comma`/`trailing-comma`.** Both the injector and
  `repairCoralDsl` independently converged on targeting a node/edge
  `data { ... }` clause for these two types (see "Implementation
  confirmation" below) — but `repairCoralDsl`'s diagnostic dispatch only
  handled `coral.brace.unparsed` and `coral.line.unparsed`, not the actual
  `coral.node.data.unparsed`/`coral.edge.data.unparsed` codes those clauses
  raise. Confirmed by direct execution: both types reported "15/15 working"
  against each side's own hand-built test fixtures, but end-to-end (injector
  output fed into the repair function) the two defect types went
  unrepaired — an integration gap neither side's isolated unit tests could
  see, since they never actually exercised each other's real output. Fixed:
  a third diagnostic branch (`repairDataClauseComma`) added to
  `repair.ts`, plus a nested-brace-aware clause-span finder (the first fix
  attempt used a naive `{[^{}]*}` regex that broke on a `data { "style": {
  ... } }` shape), with two new regression tests reproducing the exact
  reported scenario.
- **`repairKnownNodeTypeTypos`'s absolute edit-distance-2 threshold could
  silently misfire on short type names.** Confirmed by direct execution:
  `levenshteinDistance('api', 'gpu') === 2`, so a plausible short type like
  `api` (perhaps meant as shorthand for `external_api`) got silently
  rewritten to the unrelated `gpu`. Fixed: the threshold is now scaled to
  the declared type's own length (`Math.floor(length / 3)`, capped at 2),
  and a genuine ambiguity guard was added — `modul "Auth"` is truly
  equidistant from both `module` and `model` in the real `KNOWN_NODE_TYPES`
  set, and now correctly declines to guess rather than picking one
  arbitrarily.

Both findings came from an independent code-review pass that verified its
claims by actually running the code against the reported failure inputs,
not just reading it — exactly the discipline this slice has applied to
itself throughout its own planning.

**Implementation confirmation (Phase 0 build):** both the injector
(`packages/diagram-editor/test/llm/inject-syntax-defects.ts`) and
`repairCoralDsl` (`packages/language/src/repair.ts`) were built by separate
agents with no communication between them beyond this design doc. All 15
grammar-level types were independently confirmed fully working by both —
the injector verifies each produces genuinely broken DSL via a real `parse()`
call, and the repair side independently resolves and re-verifies all 15. Both
also independently discovered the same previously-undocumented parser
behavior: `bare-bracket-attribute`, `missing-comma`, and `trailing-comma`
never produce a parse error at all against an edge's `[ ]` attribute list —
`scanAttributes` is maximally lenient (a missing comma merges two attributes
into one garbled value; a lone bare token just becomes the edge's relation
type). The injector relocated `missing-comma`/`trailing-comma` to a node/edge
`data { ... }` JSON clause (where `JSON.parse` genuinely rejects them) and
implemented `bare-bracket-attribute` as stripping the bracket delimiters
entirely (reliably breaking the outer edge regex) rather than the literal
`[Yes]` example, which — confirmed independently by both agents — is already
valid syntax. `repairCoralDsl` reached the identical conclusion for its own
repair side and documents the same caveat: `bare-bracket-attribute`'s "fixed"
output cannot be verified by re-parse the way the other 14 types can, since
the *input* already parses cleanly. This is exactly the class of error the
round-1 review already caught twice elsewhere in this catalog, now confirmed
a third time by two independent implementations rather than by review alone
— strong evidence the corrected catalog is now sound.

**Round 1 findings, all resolved:**

- **High — `colon-to-equals` and `inserted-indentation` weren't real defects**
  against the actual parser (edge attributes accept `=`; all lines are
  trimmed before matching, so indentation is invisible to the parser).
  `inserted-indentation` removed from the catalog entirely;
  `colon-to-equals` rescoped and renamed `colon-to-equals-node-property`,
  restricted to property blocks where the parser is actually colon-only.
- **High — the repair strategy assumed uniform diagnostic positional
  precision the parser doesn't provide.** Only brace-balance errors carry a
  real position; roughly ten other types collapse into one generic
  line-level diagnostic. Step 6 now describes both repair strategies
  explicitly (position-driven for braces, line-text-heuristic for
  everything else) instead of implying one uniform mechanism.
- **High — `misspelled-keyword`/`keyword-case-mutation` aren't
  `@coral-viz/language` defects at all**, and repairing them from inside
  that package would invert the real workspace dependency direction (it
  would need to import diagram-editor's `KNOWN_NODE_TYPES`). Resolved by
  splitting repair ownership: `repairCoralDsl` (language package) handles
  the fifteen true grammar defects; `repairKnownNodeTypeTypos` (diagram-editor,
  next to `KNOWN_NODE_TYPES`) handles the two vocabulary defects.
- **High — direct contradiction with the slice draft plan's "no production
  package changes" policy**, which never acknowledged that S49-C5 AC-5
  requires shipping `repairCoralDsl` as a production `@coral-viz/language`
  export. Resolved in the slice draft plan itself: "Outcome and boundaries"
  and "Implementation approach" now explicitly name this (and
  `repairKnownNodeTypeTypos`) as a deliberate, reviewed exception, with TDD
  steps added for both.
- **Medium — the Fable-5.1 subagent calls were under-specified to actually
  invoke.** Fixed: Call 2's batch size is fixed at five diagrams; concrete
  review criteria given for Call 1's taxonomy (expressible as a DSL mutation,
  distinguishable from other accepted types); output validation and a
  per-diagram (not per-batch) retry policy specified for Call 2, with a
  named manifest state (`semanticInjectionFailed`) for exhausted retries.
- **Medium — `repairCoralDsl`'s relationship to the existing LLM-driven
  `fix` intent was unaddressed.** Fixed: Step 6 now states the integration
  order (deterministic repair first, LLM fix only for what it can't
  resolve), detailed further in `llm-backend-reliability-strategy.md`.
- **Medium — traceability table cited the wrong requirement/AC numbers
  throughout.** Corrected above.
- **Medium — no stated home for `repairCoralDsl`'s own test fixtures.**
  Resolved: colocated under `packages/language/test/fixtures/`, alongside
  the existing `roundtrip/` corpus precedent, referencing the diagram-editor-owned
  `defects/syntax/` subset rather than duplicating it.
- **Medium — no fallback when a selected defect type has no valid injection
  site in a given file.** Resolved: `select-and-inject-defects.ts` now
  computes per-file injection-site availability before selecting, and
  records files with fewer than three injectable types in the manifest.
- **Low — the "100% is co-designed, not a general claim" caveat lived only
  in prose.** Folded into the acceptance-bar text itself, not left implicit.
- **Low — Step 3 named two non-interchangeable verification tools.**
  Resolved: `parseCoralDSL` named specifically, with the reasoning for why
  it (not the bare `coral_validate` MCP tool) is the right corpus-admission
  gate.

Confirmed sound by the reviewer and unchanged: the overall mutation-based
catalog concept, the seeded-RNG determinism design, and the "no LLM for
syntax injection, LLM only for semantic judgment calls" split.
