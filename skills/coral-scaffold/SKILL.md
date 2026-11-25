---
name: coral-scaffold
description: Prepare a reviewed Coral language or catalog extension against the current contracts
---

# /coral-scaffold

Use this skill to prepare a small, testable extension after its author-facing
spelling and meaning are approved. Do not claim that a keyword alone adds a
portable type, symbol, relation, or render capability.

## Before editing

1. Read `PLAN.md`, the active release plan and its recorded author decisions.
   Confirm that the requested meaning is approved for the current release.
   AI/voice and new deterministic Mermaid-to-editable-Coral conversion are
   deferred to 0.2.10. Language 1.3.0 in `packages/language/SPEC.md` owns the
   current source editions; do not treat implementation acceptance as approval.
2. Read `packages/language/spec/grammar-028.ebnf`, the production
   `packages/language/src/parser/candidate028.ts`, and the packaged
   `packages/tree-sitter-coral/grammar.js`. These are distinct syntax,
   semantic-reader, and editor-tooling contracts.
3. For portable meaning, inspect the installed GraphIR 0.2.4 Core and Tools
   contracts and Coral's local bridge. Do not add a new package
   dependency, publish, or silently project a field into a GraphIR 3 display
   copy.

## Test-first slice

- Write a positive authored source and a nearby negative source with exact
  diagnostic ranges and source-retention assertions.
- Establish the failing acceptance test, then change the smallest source
  grammar, reader, and GraphIR contract needed for the approved meaning.
- Add packaged native Tree-sitter parity and exact source-to-GraphIR Tools
  validation. Run the focused language and affected consumer tests.
- If the feature needs a new scene or renderer capability, leave a durable
  contract note for the renderer owner. Do not claim visual support from a
  successful parse or GraphIR projection.

## Scope limits

The old `packages/ir/src` and `packages/language/grammar.js` paths are not
the 0.2.8 implementation locations. A generic `node-type`, `relation-type`,
or `full-feature` request needs its profile and portable semantics settled
before code is generated. Keep authored text saveable when the meaning is
malformed, conflicts with notation, or lacks a supported consumer.
