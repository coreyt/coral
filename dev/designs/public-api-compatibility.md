# Public API Compatibility Gate

Status: implemented in 0.2.4 Slice 10;
the immutable comparison baseline advanced to published 0.2.4 in
0.2.5 Slice 7, and the GraphIR 2
transition model was implemented in
0.2.5 Slice 76.

For the 0.2.6 release branch, Slice 20 replaces the active pre-version-bump
`api-compat` job with the exact GraphIR 3 adoption, transition-fixture, and
source/type compatibility foundation. The prior 0.2.4-to-0.2.5 comparator is
retained only as `api-compat:published-0.2.4`; it is not current 0.2.6 evidence.
Slice 100 advances the published baseline to 0.2.5, atomically bumps all Coral
packages to 0.2.6, and restores the final packed declaration, shared-consumer,
React 18/19, and Node 24/26 artifact gates. The foundation fails closed rather
than pretending still-versioned-0.2.5 workspaces are final 0.2.6 artifacts.

For 0.2.9 the author decided on 2026-10-31 that compatibility is checked
against released 0.2.8. `scripts/api-baseline.mjs` names the five published
0.2.8 packages and their registry integrities, and `npm run
smoke:api-compat-consumers` runs the baseline consumer cases against them on
Node 24.19.0. The `api-compat:published-0.2.4` declaration comparator
described below, which encoded the GraphIR 0.2.0-to-0.2.1 transition, was
deleted for 0.2.9; the sections below are its history.

## Decision and scope

The compatibility gate turns the published five-package 0.2.4 set into an
executable compatibility baseline. It changes release evidence, not package
behavior. The 0.2.6 candidate has six intended public packages:
`@coral-viz/language`, `@coral-viz/render`, `@coral-viz/browser`,
`@coral-viz/viz`, `@coral-viz/mcp-server`, and `tree-sitter-coral`; the diagram
editor remains a private integration consumer. The browser package has no
published baseline and is not a registry/CDN claim until Slice 100 publishes
and verifies the exact 0.2.6 artifact.

Consumer execution uses Node 24.19.0, npm 12.0.2, and TypeScript 6.0.3. Published 0.2.4
tarball integrity values are fixed in the 0.2.4 Slice 60 closure
record. Current
artifacts are produced by `npm pack --workspace` and are never installed back
into the repository. All extraction, aliasing, installs, and generated source
live in uniquely named temporary directories and are removed in `finally`.

## Artifact and manifest flow

`scripts/api-compat.mjs` owns the comparison orchestration:

1. Fetch each exact `name@0.2.4` registry tarball with scripts disabled and
   reject a missing artifact, unexpected name/version, or ledger integrity
   mismatch before reading members. Materialize only validated regular files;
   reject absolute/traversing paths, links, devices, and other special entries.
2. Pack the matching current workspace and inspect the artifact rather than
   comparing source files. Derive its candidate version from the root manifest
   and require all five artifacts and internal Coral runtime pins to match it.
3. Compare the published manifest contract structurally. Every existing
   `exports` condition/subpath, `main`, `types`, and `bin` key must remain and
   its current target must exist and load or type-resolve. Target strings may
   move because internal artifact layout is not itself the public contract.
   Existing required dependencies must stay required. Approved external
   runtime dependency versions may advance without changing dependency class;
   peer ranges stay unchanged, and published optional peers remain optional.
   Internal `@coral-viz/*` dependency versions advance together to the current
   release version.
4. Assert every 0.2.4 GraphIR dependency is exactly core 0.2.0 and every 0.2.5
   dependency is exactly core 0.2.1, then use each consumer install tree to
   prove that its artifact generation resolves only the expected version.

Additional exports are accepted and their targets must be safe existing files,
but only published subpaths are loaded and declaration-compared; this permits
new runtime-only or platform-specific surfaces. The comparator reports the package and JSON
path of every incompatibility and exits nonzero; it never silently regenerates
an accepted baseline.

## Declaration compatibility

The comparison loads published and current declaration graphs into TypeScript
6.0.3 programs. Published packages are copied under private aliases and only
static declaration module specifiers are rewritten. The actual baseline
resolves an integrity-pinned private core 0.2.0 graph; the candidate resolves
integrity-pinned core 0.2.1. Seven additional private baseline graphs apply
the other subsets of the three approved, fingerprinted GraphIR edits. Module
resolution audits reject an edge that escapes its private Coral/core graph.

For every published export subpath, the checker requires:

- every published symbol name and value/type meaning in the current module;
- every current value type assignable to its published value type, catching
  literal widening as well as removed overloads, narrowed inputs, and
  incompatible returns;
- published/current type meanings mutually assignable, including named-member
  presence, optionality and `readonly` state, string/number indexes, and
  call/construct signatures. New public object members must be optional unless
  a separately reviewed opaque/non-constructible contract says otherwise.

Generic constraints are compared separately. A generic comparison may
normalize only paired type-parameter identities while normalized syntax,
constraints, defaults, heritage, and recursively resolved paired declarations
remain equivalent. Traversal is memoized and cycle-safe; an equal rendered
alias name is never sufficient. This prevents two copies of an unchanged
self-referential generic declaration from failing without hiding a changed
alias, import-type, callback, or heritage target.

The only cross-graph `unique symbol` identity rule is a closed map for the
node/edge view metadata exports and their optional computed properties. Both
artifacts must export actual symbols with the exact reviewed `Symbol.keyFor`
keys and strict shared runtime identity; declaration optionality and value
types must remain unchanged.

Value and type meanings are compared separately for mixed symbols, and all
published overloads must remain callable. Packages with an `exports` map expose
only its declared subpaths. For the MCP and Tree-sitter packages, which have no
`exports` map, every packed baseline `.js` entry with a corresponding `.d.ts`
and every declared `main`, `types`, or `bin` target is treated as an importable
deep entry and compared. This records the existing Node package boundary
without accidentally opening blocked deep paths in the mapped packages.

Compiler diagnostics in any graph fail the gate. A GraphIR-independent source
set is compiled and run unchanged against both artifact generations. Disjoint
GraphIR cases pass GraphIR 1 directly to 0.2.4 and require the named `migrateIR`
adapter before a GraphIR 1 value reaches 0.2.5. The latter proves lossless
migration, default refusal of ambiguous `routingPoints`, and explicit,
attributed loss under the opt-in drop policy. Native lifecycle scripts remain
explicitly reviewed and opt-in; current-only additive API smoke remains a
separate case.

The declaration/manifest comparison and candidate packing run under the Node 26
release toolchain. CI transfers and hash-verifies those exact candidate
tarballs, then `scripts/api-compat-consumers.mjs` runs the shared runtime and
type fixture set against both candidate and integrity-pinned published artifacts under the
separate Node 24.19.0/npm 12.0.2 minimum-runtime control.

This is deliberately not a source-text diff: declaration reformatting and
additive exports are harmless. It is also not a general semantic-versioning
oracle; requirements that depend on runtime semantics continue to need focused
tests.

## React consumer isolation

`scripts/consumer-smoke.mjs` retains one definition for all blank-consumer
cases and accepts a closed case selector. An unknown or empty selection fails.
CI invokes the React 18.3 and React 19 cases in separate jobs. Each installs the
packed current render/viz artifacts plus exact React, React DOM, matching type
packages, React Flow, and GraphIR versions; then it imports, server-renders,
hydrates in JSDOM while capturing runtime/console failures, and compiles strict
TypeScript. The existing general consumer smoke may still run as broader
evidence, but it cannot substitute for either named React job.

## GraphIR boundary

Published Coral 0.2.4 remains paired with GraphIR 1/core 0.2.0. Coral 0.2.5 is
paired with GraphIR 2/core 0.2.1. The one approved compatibility exception is
closed over three upstream deltas: `GraphIR.version`, the
`GraphEdge.routingPoints` to `routeIntent` transition, and removal of
`LayoutOptions.algorithmOptions`.

The gate fingerprints the old and new declarations, applies each of the eight
delta subsets to a private copy of core 0.2.0, and gives every semantic finding
exactly one inclusion-minimal cause set. The checked-in transition ledger must
equal the observations exactly; missing, extra, stale, ambiguous, or
wrong-cause entries fail. The full counterfactual must contain no remaining
finding, so unrelated Coral or core drift stays blocking. See the
[GraphIR migration guide](../../docs/embed/reference/graphir-migration.md).

The published six-code `LayoutDiagnosticCode` stays narrow on the legacy
layout APIs. The five GraphIR 2 spatial diagnostics use the additive
`SpatialLayoutDiagnosticCode`; only `ResolvedLayoutDiagnostic` combines them.

## Failure, security, and performance

Registry and install failures are hard failures. SHA-512 is checked before
member inspection; only validated regular tar members are materialized and
links or special entries fail before extraction. Package lifecycle scripts are
disabled except for the reviewed native grammar build, and no credential or
`.env` content is read or recorded. Output contains package names, contract
paths, versions, and compiler diagnostics, not consumer documents.

The API job downloads five immutable baseline artifacts once and compares all
entry points in one compiler program. React installs remain two independent
jobs because attribution and peer resolution matter more than deduplicating
those minutes. No browser is required for this package compatibility boundary;
real Chromium remains covered by the release browser suites.

## Alternatives rejected

- Declaration text snapshots reject harmless formatting and additive changes.
- Representative fixtures alone cannot detect an unexercised removed export.
- Adding a third-party API-diff dependency broadens the pinning surface when
  TypeScript already provides the required assignability checker.
- Treating core 0.2.1 wholesale as a compatibility oracle would authorize
  unrelated upstream drift; exact fingerprints and selective counterfactuals
  keep the exception bounded.
- A raw diagnostic-message allowlist is unstable and cannot prove causality;
  the ledger uses semantic identities and unique minimal delta subsets.

## Requirement-to-test traceability

| Requirement | Evidence |
| --- | --- |
| R-034 AC-1 | focused comparator fixtures for type-only and mixed exports, removed symbols/properties/overloads, literal widening, required/readonly/index/call/construct changes, generic and unique-symbol identity, all counterfactual subsets, ledger exactness, and the live published/current artifact comparison including unmapped deep entries |
| R-034 AC-2 | manifest-classification fixtures; exact baseline/candidate GraphIR integrity and direct-pin assertions; isolated install-tree resolution |
| R-034 AC-3 | unchanged GraphIR-independent fixtures against both generations plus disjoint GraphIR 1 and GraphIR 1-to-2 migration runtime/type fixtures |
| R-034 AC-4 | filtered React 18 and React 19 packed-consumer runs with exact install-tree, SSR, hydration, runtime, and type assertions |
| R-034 AC-5 | three separately named CI jobs; malicious-link/integrity and negative selector/comparator tests |
