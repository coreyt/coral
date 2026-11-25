# LLM and Coral language reliability

Status: research synthesis for the primary AI/LLM proposal; further review
required. Imported on 2026-10-01 from the 2026-09-28 draft. This note
records the evidence available now, the conclusions it supports, and the
experiment needed before Coral attributes model failures to tokenization or
changes the language for model convenience. It does not claim provider
quality, authorize a syntax change, or supersede the Language 1.0
specification.

The primary proposal is the
LLM–language reliability scope.
Preservation-first modification of existing diagrams remains separately
described by its companion
LLM diagram-editing proposal.

## Research question

Do textual diagram notations such as Coral, Mermaid, PlantUML, and DOT
sometimes trip up large language models because of tokenization or an
embedding process?

The short answer is qualified:

- tokenization can be a direct cause when an editor completion begins or ends
  inside a token the model normally observes as one unit;
- there is no direct evidence that tokenization is the primary cause of
  full-document diagram-generation failures;
- Coral's ordinary syntax is not unusually token-expensive in the small local
  comparison performed for this investigation;
- incomplete language instructions, low training exposure, transfer from
  similar diagram languages, unconstrained decoding, and graph/identity
  reasoning are stronger current explanations for full-document failures; and
- “embedding problem” is not a useful diagnosis unless it names token
  embeddings, contextual model states, or a separate retrieval system and
  supplies an experiment for that specific mechanism.

## Method

The investigation used three passes.

1. A broad web-evidence pass looked for diagram-generation benchmarks,
   controlled tokenizer studies, DSL-generation studies, and structured-output
   enforcement research.
2. A local Coral pass inspected the normative language, the compact LLM grammar
   reference, accuracy and repair designs, defect fixtures, and parser tests.
   It also tokenized equivalent graph descriptions under two public tokenizer
   encodings.
3. A second web-evidence pass received the local findings and tested the
   narrower hypotheses: partial-token editor boundaries, pretraining exposure
   versus tokenizer effects, the meanings of “embedding,” benchmark
   limitations, and a discriminating Coral experiment.

This is a literature synthesis plus a small tokenizer measurement. It is not a
live-provider scorecard. No existing accuracy-harness output was found in the
repository, and this investigation made no provider calls.

## Terms and mechanisms

Several mechanisms that are easy to conflate must remain separate.

### Tokenization efficiency

A tokenizer maps source bytes or characters to token IDs. Tokens per character,
operator fragmentation, and effective context length measure efficiency. A
shorter sequence is cheaper and leaves more context, but does not by itself
prove better grammar or semantics.

### Partial-token boundaries

Autoregressive APIs receive a sequence of complete token IDs. If the user stops
after a character that normally belongs to a larger token, the visible prefix
can retokenize into an unusual complete token. The model must then continue
from a token boundary unlike the boundaries common in training. This is a
specific, causal autocomplete and infill problem.

### Token frequency and contextual exposure

An operator can be represented by one token and still be poorly predicted in a
Coral context. Atomicity says nothing about how often the token appeared with
Coral-like declarations, whether its examples belonged mainly to another
language, or whether the model learned the intended relation semantics.

### Token embeddings and contextual states

Each token ID selects a learned input vector. Transformer layers then construct
context-dependent hidden states. A claim that two operators have “similar
embeddings” is not enough to predict generation: later contextual states,
attention, training frequency, and decoding all intervene. No direct evidence
found in this investigation shows that current model representations generally
collapse Coral `->` with Mermaid `-->`, or Coral `:` with compatibility `=`.

### Retrieval embeddings

Retrieval embeddings are a different system: they select documentation or
examples for a prompt. A dense retriever can underweight exact symbols or rare
terms, and some retrieval architectures explicitly filter punctuation. That
mechanism matters only when retrieval exists. Coral's current prompt builder
directly includes `CORAL_GRAMMAR_REFERENCE` and notation references; this path
does not retrieve the language rules through a vector index.

### Grammar, decoding, and meaning

A parser defines accepted strings. Grammar-constrained decoding can prevent
many invalid continuations. Neither proves that identifiers resolve to the
right entities, requested nodes and edges are present, unchanged content was
preserved, layout intent is correct, or a parse-valid attribute has its intended
meaning.

## External evidence

### Diagram languages are difficult structured-output targets

[StructEval](https://arxiv.org/abs/2505.20139) evaluated structured generation
over 18 formats. Its Text-to-Mermaid scores ranged from 6.04 to 43.46 across the
reported models, while Text-to-HTML scores were approximately 72.52 to 99.44.
This supports a large Mermaid task gap, not a tokenizer attribution. Each
format has a small task set, and the renderable-format score combines render,
keyword, and visual-question-answering results with 70% weight on the visual
component. It is not a parser-only syntax rate.

[MermaidSeqBench](https://openreview.net/pdf/3c2901f6e6c202948f6c5290af82685055c2adc6.pdf)
reports substantial model-size and model-family differences on 132 Mermaid
sequence-diagram examples. Its syntax dimension is judged by LLMs, not by an
authoritative Mermaid parser, and the two judges differ materially on some
models. The benchmark begins from ten hand-authored seeds, adds selected
synthetic examples, and expands them with rules. It proves neither a general
Mermaid parse rate nor a tokenization mechanism.

The small multimodal
[From Image to UML study](https://ceur-ws.org/Vol-3727/paper5.pdf) found invalid
or missing PlantUML in 44.4% of Gemini Pro trials, 44.4% of Gemini Ultra trials,
and 55.6% of CogVLM trials, while GPT-4V had no syntax error in 36 generations.
It directly demonstrates notation fragility in that task. Because model,
visual understanding, and generation behavior vary together, it cannot isolate
tokenization, exposure, or instruction following.

Diagram notation can also help rather than hurt. [FlowBench](https://aclanthology.org/2024.findings-emnlp.638/)
found that Mermaid flowcharts were useful representations of workflow
knowledge and that combining representations could improve task performance.
Generation fragility and reasoning utility are therefore separate questions.

### Token boundaries can causally damage editor completion

[TokenAlign](https://aclanthology.org/2024.findings-acl.929/) constructs code
completion prompts that stop inside punctuation tokens. Token alignment raised
StarCoder pass@1 on punctuation-cut MBXP from 45.10 to 59.35 for Python, 31.78
to 48.80 for Java, and 24.23 to 46.03 for JavaScript. LLaMA-7B rose from 22.11
to 31.75, 11.85 to 20.93, and 14.87 to 26.79 respectively. Control prompts
ending at ordinary complete-token boundaries changed little.

This is the strongest causal evidence relevant to Coral. Its applicability is
narrow: autocomplete or infill whose cursor cuts an operator, indentation,
whitespace group, quote, escape, or identifier token. It should not be
generalized to full-document generation.

### Punctuation grouping is not intrinsically harmful

[CodeBPE](https://arxiv.org/abs/2308.00683) trained code models with controlled
subtokenization choices. Grouping punctuation combinations reduced average
sequence length by 17% without downstream performance loss; other choices
changed quality by roughly 0.5–2%. More aggressive composites could save more
tokens and sometimes hurt generation. The work used relatively small PLBART
models retrained on Python and Java, so its quantitative results do not
transfer directly to a frontier model or diagram DSL. It does refute the
simple premise that punctuation-rich syntax is inherently represented badly.

[Getting the most out of your tokenizer](https://proceedings.mlr.press/v235/dagan24a.html)
also finds that vocabulary, pre-tokenization rules, and tokenizer training data
affect code-generation efficiency and downstream performance. Specializing a
pretrained model's tokenizer became useful only with very large continued
training. For Coral, tokenizer replacement is not a plausible application-level
remedy without much stronger evidence.

### Grammar information and constraints solve different problems

[Grammar Prompting for Domain-Specific Language Generation](https://proceedings.neurips.cc/paper_files/paper/2023/file/cd40d0d65bfebb894ccc9ea822b47fa8-Paper-Conference.pdf)
separates ordinary prompting, grammar prompting, and constrained decoding on
several semantic-parsing DSLs. With Codex-davinci-002, a full-grammar
constraint alone gave modest gains, grammar prompting gave larger gains, and
an oracle specialized grammar plus constraints produced very large gains. The
oracle gap shows that choosing the relevant structure remains a planning and
meaning problem after illegal strings are removed.

[Grammar masking](https://arxiv.org/abs/2407.06146) likewise improves syntactic
validity for modeling DSLs. Google's
[automata-based constraints](https://research.google/pubs/automata-based-constraints-for-language-model-decoding/)
explain why subword tokens do not naturally align with grammar terminals and
how decoding can account for that mismatch. These works justify evaluating a
grammar-constrained Coral path; they do not justify changing Coral syntax or
equating valid syntax with a correct graph.

### Retrieval evidence is adjacent, not dispositive

[SPAR](https://aclanthology.org/2022.findings-emnlp.19/) finds cases where
dense retrieval lags sparse matching on rare entities and exact salient
phrases. [ColBERT](https://arxiv.org/abs/2004.12832) filters document-side
punctuation embeddings in one retrieval architecture. These results make an
exact-symbol or hybrid retrieval control prudent if Coral later retrieves
language rules. They do not demonstrate an embedding failure in Coral's
current direct-prompt path.

## Local tokenizer measurement

### Setup

The local test used `tiktoken` 0.11.0 with the `cl100k_base` and `o200k_base`
encodings. One equivalent seven-node, six-edge graph was written in Coral,
Mermaid flowchart syntax, PlantUML, DOT, minified JSON, and prose. The graph
contained API Gateway, Order Service, Payment Service, Order DB, Stripe,
Customer, and “Is payment valid?” nodes plus request, checkout, persistence,
charge, validation, and processing edges.

The test measures representation length and token boundaries only. It does not
measure next-token probabilities, model accuracy, training frequency, or the
semantic equivalence of rendered layouts.

### Results

| Representation | Characters | `cl100k_base` tokens | `o200k_base` tokens |
| --- | ---: | ---: | ---: |
| Coral | 429 | 97 | 97 |
| Mermaid | 443 | 109 | 109 |
| PlantUML | 514 | 113 | 113 |
| DOT | 599 | 141 | 141 |
| JSON | 837 | 186 | 188 |
| Prose | 298 | 56 | 56 |

Coral was the most token-efficient DSL in this sample. It was not as compact
as prose, and a single graph cannot establish a general ordering.

Selected token splits were identical across the two encodings:

| Source atom | Token count | Token pieces |
| --- | ---: | --- |
| ` ->` | 1 | ` ->` |
| ` -->` | 1 | ` -->` |
| `-.->` | 2 | `-.`, `->` |
| ` [label:` | 3 | ` [`, `label`, `:` |
| `[label="` | 2 | `[label`, `="` |
| `external_api` | 2 | `external`, `_api` |
| `is_payment_valid` | 3 | `is`, `_payment`, `_valid` |
| `flowchart TD` | 3 | `flow`, `chart`, ` TD` |
| `@startuml` | 3 | `@`, `start`, `uml` |
| `"Auth Service (v2)"` | 7 | `"`, `Auth`, ` Service`, ` (`, `v`, `2`, `)"` |

The common Coral and Mermaid arrows are already single tokens. This materially
downgrades “arrows fragment badly” and “Coral consumes too much context” as
full-document hypotheses.

### Editor boundary observation

The same tokenizer represents `a -`, `a ->`, `a --`, and `a -->` using
different complete punctuation tokens. A prompt ending after the first `-`
does not end halfway through the token used for the completed arrow; it ends
with another token. Continuing from that boundary can therefore reproduce the
TokenAlign partial-token condition even though the finished operator is
compact.

Tokenization should consequently be tested independently for:

- full-document generation;
- suffix completion at the end of a source buffer;
- infill between independently tokenized prefix and suffix;
- edits inside a quote, escape, identifier, attribute, or multi-character
  operator; and
- provider APIs that implement token healing or prefix backtracking.

## Coral-specific evidence

### The compact prompt is intentionally not the complete language

The [normative language specification](../../packages/language/SPEC.md) says
the LLM instructions expose a declared safe subset. That is an appropriate
product boundary, but it creates a contract that must be audited rather than
assumed complete.

The current
[`CORAL_GRAMMAR_REFERENCE`](../../packages/diagram-editor/src/llm/prompt.ts)
documents ordinary nodes, properties, nesting, edges, selected spatial hints,
derived IDs, and a deny-list. It uses `as` in spatial examples but does not
teach stable explicit identity as the general solution to rename stability or
derived-ID collision. The
[accuracy-harness design](llm-accuracy-harness.md) independently records that
gap: fixtures that evaluate label changes require explicit IDs or a correct
rename appears as node loss and addition.

This is a stronger immediate explanation than tokenization for failures around
renaming, near-duplicate names, and edge references. A model cannot reliably
apply a language rule the application deliberately omitted from its compact
contract.

### Similar DSLs create conflicting learned defaults

Coral accepts `->`; Mermaid commonly teaches `-->`; PlantUML commonly uses
`-->` plus a colon-separated edge label; DOT uses `->` but a different
attribute grammar. Wrong-arrow output is consistent with transfer from a more
frequent language. The present evidence cannot distinguish that learned prior
from operator-token semantics, so wrong-arrow frequency alone must not be
reported as tokenizer evidence.

### One-character cliffs are real but not uniquely neural

Coral strings use JSON-compatible quotes and escapes. Braces delimit nesting;
commas and colons delimit structured clauses and attributes; IDs resolve edges.
A single missing quote, brace, target, or delimiter can invalidate a document.
The local repair corpus catalogs these failures because they are consequential,
not because their source has been identified.

The focused `@coral-viz/language` repair suite passed all 33 tests during this
investigation. It establishes deterministic handling and refusal boundaries.
It is not evidence about model incidence or cause.

### Parse validity is necessary and insufficient

The repair tests include an omitted comma in an edge attribute list that
remains parser-valid while changing the interpreted attribute. They also keep
a bare bracket value as a valid relation rather than guessing that the author
intended a label. A parser-only benchmark would count those outputs as valid
while missing semantic corruption.

Coral evaluations must therefore compare the parsed graph with a gold or
authorized semantic effect set. Render success, parser success, and model-judge
approval are useful separate signals, never substitutes for that comparison.

### Existing modification magnifies preservation risk

Generating a new diagram and modifying an existing diagram are different
tasks. Full-document reproduction asks the model to serialize requested edits
and every unchanged field correctly. The preservation-first proposal removes
unchanged content from the provider's authority through bounded operations,
deterministic apply, semantic diff, source fidelity, and undo-compatible
history. The language work should measure serialization and token-boundary
behavior without returning whole-document replacement authority to the model.

## Revised causal model

For full-document Coral generation, the current evidence ranks plausible
causes in this order:

1. prompt/spec completeness and language-contract clarity;
2. low Coral exposure and transfer interference from better-known DSLs;
3. semantic graph, identity, and reference reasoning;
4. unconstrained decoding and insufficient parser feedback;
5. tokenization efficiency or token semantics; and
6. a generic embedding problem.

For editor autocomplete and infill, partial-token alignment moves near the top.
For a future retrieval-augmented prompt path, retrieval quality becomes a
separate first-class variable; it remains absent from the present path.

This ordering is provisional. It describes the best current explanation, not
a measured decomposition of Coral errors.

## 0.3.0 design direction

### Keep the normative language human- and tool-centered

Do not rename operators, add whitespace, or introduce aliases solely because a
single tokenizer splits a construct. A syntax change requires user value,
language coherence, migration and round-trip evidence, and improvement across
multiple model/tokenizer families after the confounds below are controlled.

### Audit one explicit LLM-safe language contract

Language 1.0 remains authoritative. The application may expose a smaller LLM
profile, but that profile must be versioned or otherwise identifiable, audited
against every supported generated construct, and tested against the parser and
printer. Stable identity, string escaping, derived-ID collision behavior, and
every supported spatial form need affirmative examples or an explicit refusal.

The compact prompt must not silently drift from the grammar. Whether it is
generated from declarative data or checked against conformance fixtures is a
design choice for 0.3.0; duplicated unverified prose is not an acceptable final
contract.

### Separate semantic planning from Coral serialization

Evaluate two provider boundaries:

1. direct Coral source generation; and
2. a typed node/edge/operation representation that Coral validates and
   deterministically compiles to source.

If the structured representation is semantically correct while direct Coral
is invalid, the failure is serialization or syntax control. If both are wrong,
the likely problem is planning, grounding, or instruction understanding. For
existing diagrams, the structured representation must align with the 0.2.7
bounded-operation protocol rather than becoming another whole-document patch.

### Make validation layered

Measure and report independently:

- output-envelope compliance;
- Coral parser validity and diagnostics;
- AST/GraphIR equivalence or authorized semantic diff;
- reference and identity integrity;
- notation-policy findings;
- render success;
- requested-content fulfillment;
- unintended changes;
- source-fidelity preservation where applicable;
- editor completion accuracy at each character boundary; and
- latency, model tokens, repair turns, and provider cost.

No aggregate score may hide parser-valid semantic failure.

### Evaluate constraints without assuming they are sufficient

Compare ordinary decoding, one bounded diagnostic-feedback repair, and true
grammar-constrained decoding where a provider surface permits it. Record syntax
improvement separately from semantic improvement. The provider-independent
parser, semantic scorer, and fixtures remain the oracle.

### Treat retrieval as an optional future subsystem

Do not add a vector store to solve a failure that direct, versioned prompt
content can solve. If the safe profile later grows beyond the practical prompt
budget, evaluate dense, lexical, and hybrid retrieval on contrastive rules that
differ only in operators, delimiters, quoting, or identity clauses. The exact
rule must be present in the returned evidence before generation proceeds.

### Add token-aware editor evidence before token-aware product behavior

Run completion cuts after every source character around `->`, brackets,
quotes, escapes, whitespace, line starts, identifiers, and optional clauses.
Compare plain completion with provider-supported token healing or controlled
prefix backtracking. Do not ship autocomplete from this program without an
explicit product decision; 0.2.5 intentionally excluded it.

## Minimum causal experiment

### Corpus

Use 100–200 reviewed gold graphs spanning:

- ordinary nodes and edges;
- stable and derived IDs, collisions, renames, and near-duplicate labels;
- quotes, escapes, Unicode, braces, attributes, and structured data;
- nesting and hierarchy;
- notation-specific types and required properties;
- concise spatial intent, exact positions, pins, routes, and waypoints;
- graph metadata and extension fields; and
- local edits, additions, removals, restructures, and ambiguous requests.

Reuse the existing accuracy and defect corpora only after their provenance,
expected semantics, and supported-language version are checked. Add no
production telemetry without a separate privacy and consent decision.

### Paired interventions

Run the same graphs and requests through these factors.

| Factor | Conditions | What it helps isolate |
| --- | --- | --- |
| Language contract | Current prompt; corrected compact profile; profile plus targeted examples | Missing rules and in-context grounding |
| Provider boundary | Direct Coral; typed graph or operation plan plus deterministic compiler | Semantic planning versus serialization |
| Decoding | Unconstrained; one diagnostic retry; grammar-constrained where available | Invalid continuation versus meaning |
| Familiarity | Real Coral; several grammar-isomorphic nonce vocabularies with complete matched instructions | Pretraining familiarity and transfer |
| Token spelling | Parser-equivalent formatting or aliases with different token boundaries | Full-generation boundary sensitivity |
| Editor cut | Every character around critical constructs | Partial-token autocomplete effects |
| Retrieval, if present | Direct profile; dense; lexical; hybrid | Retrieval loss versus generation loss |

Nonce-language results require caution: a changed spelling also changes
training frequency and tokenization. Use multiple randomized variants and
matched token-count bands rather than treating one alias as causal proof.

### Execution controls

- Use temperature zero for deterministic comparison and a bounded repeated
  sample for variance.
- Run multiple provider/model/tokenizer families; do not infer a language
  property from one closed model.
- Pin model identifiers, prompts, profile version, tokenizer implementation,
  sampling parameters, and renderer/parser versions in every result.
- Randomize condition order where provider caching or time trends can matter.
- Treat graph item and model as grouped effects in analysis.
- Retain raw candidate source and diagnostics with secrets removed.
- Report skipped configurations and unavailable constrained-decoding surfaces
  rather than substituting another condition silently.

### Decision thresholds

The 0.3.0 design gate must set numerical thresholds from a recorded baseline,
not invent them after seeing the experiment. At minimum:

- parser validity may never be the sole release gate;
- semantic equivalence or authorized-effect precision must be the principal
  correctness gate;
- no condition may improve syntax by increasing unintended semantic changes;
- a tokenizer-motivated language change requires a repeatable improvement
  across multiple models and tokenizers after contract completeness and
  constraints are controlled; and
- autocomplete requires a separately accepted user interaction, latency, and
  cancellation contract.

## Current conclusions and non-claims

The evidence supports these conclusions:

- diagram DSL output is a difficult structured-generation task;
- Coral's tested ordinary form is compact relative to the compared DSLs;
- common arrows are not fragmented under the two tested encodings;
- partial-token editor boundaries are a real causal risk;
- complete grammar information and constrained decoding address different
  failure classes;
- current Coral prompt/spec gaps can explain identity failures without a
  tokenizer theory; and
- semantic evaluation is required beyond parsing and rendering.

The evidence does not support these claims:

- fewer tokens make Coral more accurate;
- StructEval's Mermaid score is a syntax or tokenizer score;
- wrong arrows prove token confusion;
- a parser-valid result is semantically correct;
- a successful repair identifies the original cause;
- Coral's exact presence in a closed model's training corpus is knowable;
- dense embeddings lose Coral punctuation when no retrieval system is used;
- one AST-equivalent comparison isolates notation from popularity, grammar,
  prompting, or model exposure; or
- Coral should change Language 1.0 syntax for LLMs now.

## Open decisions for 0.3.0

The release design must decide, with evidence:

1. the exact versioned contents and ownership of the LLM-safe Coral profile;
2. whether direct source generation remains an accepted initial-generation
   path or becomes a typed-plan compilation path;
3. which provider surfaces can support real grammar constraints without
   coupling Coral correctness to one vendor;
4. whether token healing is needed for any approved editor completion feature;
5. whether retrieval is necessary and, if so, how exact-symbol recall is
   guaranteed;
6. how live-provider evaluation is authorized, budgeted, redacted, retained,
   and reproduced; and
7. which measured thresholds block the release versus inform later work.

Until those decisions close, 0.3.0 owns the investigation and reliability
boundary, not a claim that tokenization or embeddings are the root cause.
