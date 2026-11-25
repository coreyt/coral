# Coral language design and evolution

Status: approved direction for 0.2.9 by explicit user instruction on
2026-10-17. The policy guides proposals; its documentation, metadata, and
verification integration are allocated by the
0.2.9 Slice 30 and its
scope. The assigned
target is Language Specification 1.2.0, implemented through that slice.
Publication remains separate from candidate verification.

<!-- #region policy -->

## Authority and purpose

Retain the Coral Language Specification and its normative artifacts as the
definition of accepted source and meaning.
This policy guides decisions about changing that contract. It does not add
syntax, redefine GraphIR, or make parser behavior a competing authority.
Language, package, and GraphIR schema versions remain separate.

Preserve coordinate-free ordinary authoring, progressive disclosure, explicit
guarantees and stable identities, and separation of authored meaning from
computed layout. Consumers preserve and honor authored meaning or report an
explicit capability limitation. Tree-sitter and LLM profiles remain declared
subsets of the language.

## Principles for good syntax

Every proposal evaluates these six criteria. They guide tradeoffs rather than
produce a numerical score; the decision records why a tradeoff is acceptable.

| Principle | Meaning | Evidence expected in a proposal |
| --- | --- | --- |
| Orthogonality | Features combine consistently, with few special cases. | Combine the proposal with identity, nesting, attributes, constraints, and routes where applicable; explain every exception. |
| Composability | Smaller constructs build larger valid constructs with predictable meaning. | Show reuse in supported enclosing contexts, reference resolution, and preservation through parse, print, and supported operations. |
| Unambiguous parsing | Each accepted form has one specified interpretation. | Show grammar and lexical boundaries, clause ordering, keyword collisions, and confusing inputs; define contextual disambiguation explicitly. |
| Expressiveness | Authors can state useful intent directly and precisely. | Show a real diagram task and the meaning it gains over existing constructs; justify added syntax instead of aliases or workarounds. |
| Readability | People can recognize, review, and explain source and diagnostics. | Compare ordinary and advanced examples, similar-looking forms, canonical output, and actionable errors; do not equate readability with character count. |
| Backward compatibility | Existing valid source and supported authored meaning remain dependable. | Compare acceptance, semantics, IDs, defaults, canonical output, and stable diagnostic contracts; identify intentional breaks and migration or refusal behavior. |

Orthogonality concerns consistency across features; composability concerns
building larger expressions or declarations from smaller ones. Neither
requires every combination to be legal. Unsupported combinations need an
explicit reason and diagnostic. Unambiguous parsing does not require a
particular parser algorithm or an LL(1) grammar.

## Vocabulary and extension rules

Use the specification's terms for declarations, node types, labels, IDs,
references, properties, attributes, constraints, route intent, and waypoints.
Distinguish lexical rules, grammar, static semantic validation, operation
capability, and canonical formatting when describing a change. Extend the
owning definition rather than maintaining a second glossary of language facts.

Prefer existing clause patterns and JSON-compatible values. A new keyword,
operator, alias, or contextual spelling needs a collision analysis for bare
and quoted names and a canonical spelling. State what is reserved, what remains
an ordinary identifier, and how errors and future extensions are distinguished.
An editor notation allowlist is consumer policy, not the core type vocabulary.

Add syntax for demonstrated authoring value and coherent semantics. A parser
shortcut, solver option, or single model's tokenization is insufficient
justification. Model-related proposals also use the separate
0.3.0 reliability scope for their empirical claims; see Related in the
canonical policy record.

## Proposal and decision process

1. Record the authoring problem, current behavior, proposed examples, and
   alternatives, including retaining the current language. Evaluate all six
   principles and identify interactions and non-goals.
2. Specify lexical and grammar changes, GraphIR meaning, defaults, identity and
   reference effects, diagnostics, canonical output, and recovery boundaries.
   Classify compatibility and identify affected consumers and tooling subsets.
3. Review the proposal before adoption. The release record names its decision
   owner and a reviewer other than the implementer, records accepted,
   deferred, or rejected status and rationale, and assigns implementation and
   verification work. A prototype is evidence, not approval or language support.
4. Update the specification, grammar, catalogs, mapping matrices, and
   conformance cases together with implementation. Update or explicitly limit
   Tree-sitter, converters, editor behavior, MCP, LLM profiles, and examples.
5. Verify valid, invalid, canonical, and round-trip behavior, including relevant
   feature combinations and old-source compatibility. Publish support claims
   only for the exact tested language and implementation versions.

A proposal has no language authority until adopted into the normative contract.
A breaking grammar or semantic change follows the specification's major-version
and migration/loss rules. Additive changes still require collision and
compatibility evidence; a package release alone does not change the language.

## Worked assessment: existing identity-first saved source

This assesses the already-adopted source edition 0.2.8 decision; it proposes no
new syntax or canonical rewrite. The decision owner is the author, recorded in
the 0.2.8 source-decision history. Slice 30's independent Sol review assesses
its contract reconciliation and tests, rather than approving a new spelling.

The saved form is `api service as "API"`: identity first, semantic kind second,
rendered label in `as`. Optional `=` preserves the same meaning. Deliberate
older graph interchange remains `service "API" as api` on its separate reader.
The alternative was to retain label-derived identity or overload one reader
with both grammars. Separate entry points preserve that older interchange
without silently interpreting it as the saved document edition.

| Criterion | Assessment and tradeoff |
| --- | --- |
| Orthogonality | Stable IDs remain distinct from node/edge labels, semantic ports and catalog symbols. `as` labels both nodes and edges in saved source; it does not assign an ID in that edition. The older interchange meaning is explicitly isolated. |
| Composability | Qualified group identities and nearest-scope references compose with nested declarations and routes. Classifier and sequence bodies retain their own admitted contexts; the decision does not promise every statement inside every block. |
| Unambiguous parsing | ID, optional `=`, kind, bracket fields and quoted label have fixed positions. Quoted labels separate display text from tokens. Keyword/lexical collisions and wrong-reader input receive findings; optional-clause factoring alone does not prove LL(1). |
| Expressiveness | An author can rename visible text without changing references. Explicit edge IDs support routes and constraints; omission remains available when no durable reference is needed. |
| Readability | IDs appear at the front of declarations and references, while quoted labels are recognizable as display text. The extra ID in a small diagram is a deliberate cost for dependable edits and review. |
| Backward compatibility | Current saved files retain exact bytes and existing canonical behavior. Legacy graph text uses the explicit parser/printer contract, with loss diagnostics where needed. The earlier public API boundary is documented rather than presented as source-compatible syntax. |

Evidence is the current entry-point-labelled conformance corpus, qualified
identity/port/route cases, wrong-reader refusal and source save/reopen checks.
Unanswered future questions, including document-local symbols, remain separate
release proposals. This assessment adds no provider or tokenization claim.

## Maintenance

Keep historical baselines separate from current support. Each surface records
its supported version, syntax and semantic scope, limitations, and evidence.
The normal verification and CI paths check the normative artifacts as well as
runtime conformance. Contributor and public reference navigation lead directly
to the versioned specification and this policy without duplicating their rules.

<!-- #endregion policy -->

## Related

- 0.2.9 language guidance scope
- [Normative language requirement](../requirements/system-requirements.md#req-a1-saved-source-authority-and-editioned-language-contract)
- [Documentation governance](documentation-governance.md)

- [Canonical language specification](../../packages/language/SPEC.md)
- 0.3.0 reliability scope
