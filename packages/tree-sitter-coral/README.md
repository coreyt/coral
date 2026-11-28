# tree-sitter-coral

## Coral 0.2.17

Install the verified 0.2.17 grammar archive with its exact Tree-sitter peer.
Existing examples retain their documented compatibility API contracts.

Native Tree-sitter grammar for Coral syntax tooling. This package implements Language Specification 1.3.0 syntax for saved source/header
editions 0.2.8 and explicitly pinned 0.2.9, including raw `@symbol` blocks.
It recognizes the saved `@diagram` document syntax: ID-first declarations,
paired-quoted rendered labels, keyed node and edge fields, ports, groups,
arrangements, UML class members, and recursive UML sequence fragments, notes,
and activations. The older kind-first syntax is not an alias in this grammar.

Tree-sitter supplies syntax trees, highlighting, and source spans. The
`@coral-viz/language` TypeScript reader owns profile meaning, reference
resolution, diagnostics, conformance, and source preservation. A Tree-sitter
error must not prevent an author from saving malformed text.

The package name remains `coral` for its native binding. Its grammar is kept in
sync with `packages/language/spec/tree-sitter-028/grammar.js` by a repeatable
test. The package manifest identifies this version as 0.2.17.

## Install the grammar

```sh
npm install ./tree-sitter-coral-0.2.17.tgz tree-sitter@0.25.1
```

Coral 0.2.8 is the compatibility baseline; 0.2.9 retains its default saved
source edition and adds the explicitly pinned 0.2.9 extension.
Use the [Tree-sitter embedding reference](https://coreyt.github.io/coral/docs/embed/reference/tree-sitter)
for installation and native binding examples.
This package compiles from source during installation; it doesn't ship
prebuilt binaries. Syntax queries
do not interpret a document: semantic diagnostics,
canonicalization, and repair remain owned by `@coral-viz/language`.

## Candidate verification

The repository package test generates and builds the native parser, runs the
0.2.8 syntax corpus, and compares the native parser with the runtime reader on
accepted and rejected authored examples. Its highlighting query is also
compiled against the generated node types.

Python is required on every supported native-build platform. Linux/Unix also
needs `make` and a C/C++ toolchain; macOS needs Xcode Command Line Tools;
Windows needs Visual Studio C++ build tools. npm 12 consumers
must approve the native lifecycle scripts for `tree-sitter-coral` and
`tree-sitter` in their root `allowScripts` setting.

Apache-2.0. See `LICENSE`.
