# Documentation governance

Status: approved for Slice 70 implementation after independent review on
2026-09-17. Implements the contributor portion of R-049-AC3 without taking
Slice 75/77 whole-corpus implementation and closure or Slice 80 release
closure.

## Decision

Coral documentation has three public audience trees and two non-public record
classes. A fact has one owning surface. Other surfaces link to that owner or
stay silent when linking would import a claim they cannot verify.

| Class | Path | Reader and authority |
| --- | --- | --- |
| Use Coral | `docs/use/**` | Packaged-application users; shipped behavior and limits. |
| Embed Coral | `docs/embed/**`, package READMEs | Consumers of published packages; public APIs, requirements, and examples. |
| Contribute to Coral | `docs/contribute/**` | People working from a repository checkout; setup, maintenance, tests, and release operations. |
| Current program records | `dev/requirements.md`, `dev/ARCHITECTURE.md`, `dev/documentation-style.md`, `dev/designs/**`, active release records | Product authority, decisions, designs, authoring rules, plans, and current evidence. These are not built into the public site. |
| Indexed history | `dev/archive/**` | Immutable or superseded provenance. It is non-authoritative and excluded from current documentation gates. |

The repository root README is an audience router. `CLAUDE.md`, skills, hooks,
and `.mcp.json` are optional tooling surfaces rather than contributor
prerequisites or documentation authority. `CLAUDE.md` may point to the durable
authoring rules but does not restate them.

## Contributor information architecture

The contributor tree stays small and task-shaped:

```text
docs/contribute/
  index.md
  get-started.md
  how-to/
    build-and-preview.md
    release-and-recover.md
  reference/
    architecture.md
    testing.md
    generated-assets-and-dependencies.md
    documentation-governance.md
    coverage-baseline.md
    performance-budgets.md
    release-compliance-checklist.md
    clean-room-process.md
```

The index routes by goal. Get started is the only clone-to-green tutorial.
Reference pages state facts readers look up; how-to pages state ordered
operations. Existing historical measurements and compliance records retain
their text except for path corrections needed by relocation.

## Canonical sources and drift control

Contributor prose does not become the source of truth for executable facts.

| Fact | Canonical source | Drift evidence |
| --- | --- | --- |
| Toolchain, workspace set, and npm commands | root and workspace manifests, lockfile, `.nvmrc` | toolchain test plus contributor-docs contract |
| Language syntax, meaning and entry-point contracts | `packages/language/SPEC.md` and normative `spec/` assets | normal specification/conformance and packed-asset checks |
| Language evolution criteria and proposal review | `dev/designs/language-design-and-evolution.md` | independent review and existing-decision assessment; public reference includes this owner |
| Package dependency direction | `dev/ARCHITECTURE.md` and manifests | build/type/API compatibility gates |
| CI jobs and release inputs/order | `.github/workflows/*.yml` and release scripts | workflow-policy and release tests plus contributor-docs contract |
| Documentation authoring rules | `dev/documentation-style.md` | Markdown tests, docs checks, and review values named by the rules |
| Docs preview/build routes | `docs/.vitepress/config.mts` and root npm scripts | VitePress build plus contributor-docs contract |
| User feature coverage and figures | Slice 60 feature map, figure manifest, shipped pages | docs structure check |
| Package README links and executable examples | package READMEs and Embed canonical examples | library-docs and packed-consumer checks |
| LLM corpus and harness operation | tracked fixture metadata, harness sources, and `.gitignore` | deterministic harness/corpus tests plus contributor review |
| Dependency and Action policy | root manifests/lockfile, Dependabot config, workflows | toolchain, workflow-policy, audit, install, and contributor-docs checks |
| Licence sources and distribution | root/package licences, font pins/notices, manifests | API compatibility and online-delivery tests |
| Package, hosted site, and licence contents | manifests and online-delivery/API compatibility scripts | existing package/online tests; Slice 100 final artifact evidence |
| Historical lifecycle | archive index and approved disposition record | contributor-docs contract plus current-link resolver |

The contributor contract checks stable relationships and closed names. It does
not duplicate implementation behavior already proved by a focused owner test.
For example, it asserts that the release guide names `version` and `commit` and
that the workflows expose them; `release-guard.mjs` tests their behavior.

## Validation boundaries

`npm run check:docs` composes four checks:

1. Slice 60 page/feature/figure structure.
2. Slice 65 package README and executable-example structure.
3. Slice 70 contributor routes, executable fact references, lifecycle, and
   hygiene.
4. Slice 75/77 cross-file links/anchors, VitePress containers, remaining
   corpus prohibitions, and the Profile V fence-language allowlist.

VitePress and online-delivery builds prove emitted routes and combined-site
integration. API compatibility, packed consumers, and online tests prove
package/site/licence contents. Slice 75 implemented and Slice 77 closes destination-shape,
cross-file-anchor, container, custom-anchor, trailing-newline, ordered-list,
comment, and fence-language semantics. Slice 100 alone makes final registry,
deployment, controlled-host, and release claims.

`npm run docs:dev` is the interactive preview contract: wait for VitePress to
print its local URL, open that URL's `/contribute/` route, observe the
Contribute index, and stop the server with Ctrl+C. `npm run docs:build` is the
non-interactive route proof and must emit `contribute/index.html`. Verification
stages only an explicit Slice 70 path manifest, obtains a tree with
`git write-tree`, and extracts `git archive <tree>` so intended new files are
included while ignored output and unrelated untracked files are excluded.

## Closed derived-asset inventory

The following table is the complete Slice 70 generated-asset obligation. The
authored Language specification and conformance fixtures are source, not
generated output. Build, package, and consumer directories are disposable and
are not tracked assets.

| Family | Canonical input | Producer | Tracked output | Prerequisite | Freshness gate | Class |
| --- | --- | --- | --- | --- | --- | --- |
| Embedded fonts and notices | `scripts/font-assets.json`, pinned Fontsource archives and licence bytes | `scripts/generate-font-assets.py` | `packages/render/src/text/generated-fonts.ts`, `packages/render/third_party/fonts/**` | Python 3, pinned `scripts/font-requirements.txt`, network only to acquire the pinned archives | `packages/render/test/fonts.test.ts`, API/package/static tests | tracked derived |
| Tree-sitter parser | `packages/tree-sitter-coral/grammar.js` | pinned `tree-sitter generate` | `src/grammar.json`, `src/node-types.json`, `src/parser.c`, `src/tree_sitter/alloc.h`, `src/tree_sitter/array.h`, `src/tree_sitter/parser.h` | native build prerequisites and package toolchain | `npm run generate -w tree-sitter-coral`, native/corpus tests, packed native consumer | tracked derived |
| Reviewed docs figure | Slice 60 Coral source and review decision named by `docs/figures.json` | reviewed Slice 60 render/export | `docs/public/figures/coral-overview.svg` and its manifest hashes | built Coral renderer plus human visual review | `scripts/check-docs-structure.mjs` source/output hashes and SVG metadata | tracked derived |
| npm dependency graph | root and workspace manifests plus approved dependency policy | npm 12.0.2 | `package-lock.json` | exact release npm | `npm ci`, toolchain/workflow policy, audit, build/test gates | tracked derived |
| Site, package, consumer, coverage, and report output | tracked sources above | VitePress, online delivery, npm pack, tests | `docs/.vitepress/dist/`, `build/`, `packages/*/dist/`, temporary consumers, coverage and reports | owning command | owning build/test plus cleanup | disposable |

Networked font regeneration is maintainer-only; ordinary setup, build, test,
and publish do not download fonts or require Python. The contributor contract
checks the closed paths and command relationships but does not reimplement the
producer-specific freshness gates.

## LLM harness and retention boundary

Tracked `fixtures/accuracy/**/prompt.txt` and corpus descriptions are authored
synthetic/reviewed test inputs and are permitted source. Deterministic unit and
corpus tests inject fake provider behavior and need no key or network.

Slice 70 verifies no-key behavior through the focused injected-boundary test,
not by running the manual live CLI through the application build graph. The
clean application/static build retains Slice 65's explicit GraphIR 0.2.1
adoption dependency and remains a Slice 80 release-closure gate.

The manual live surfaces are exactly:

| Script | Keys | Output and retention |
| --- | --- | --- |
| `accuracy-harness.ts` | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `MISTRAL_API_KEY` | Timestamped scorecard/candidates under gitignored `accuracy-harness-output/`; no-key execution records skips; delete output after review. |
| `test-live.ts` | `LLM_API_KEY`, with optional provider/model selectors | Writes results to stdout only; do not redirect provider responses into tracked files. |
| `test-e2e.ts` | `LLM_API_KEY`, with optional provider/model selectors | Writes results to stdout only; do not redirect provider responses into tracked files. |
| `test-mermaid-adjust.ts` | `LLM_API_KEY` | Writes the fixed prompt, converted source, and provider result to stdout only; do not redirect it into tracked files. |

These scripts are opt-in, cost/network bearing, outside CI and `npm run
verify`, and may run only with explicit authorization. Keys, live/user-derived
prompts, provider responses, scorecards, and terminal captures are local data
and are never committed or treated as product telemetry. Coral adds no
production telemetry for these contributor runs.

## Historical-record policy

An active release lives under `dev/releases/<version>/`. When a release is
complete and approved for archival, its evidence moves as one recoverable Git
unit under `dev/archive/releases/<version>/`, the archive index gains an entry,
and every live pointer changes in the same patch. Historical content is not
rewritten to current vocabulary or tool versions. A current behavioral design
remains under `dev/designs/`; only release-specific closure designs move with
their release. Stale status banners on retained behavioral designs are metadata
defects and may be corrected without rewriting design substance.

S2-P3 has a closed 36-source manifest: `dev/releases/0.2.2/closure.md`, the 34
files currently under `dev/releases/0.2.4/`, and
`dev/designs/release-0.2.4-closure.md`. Destinations are respectively
`dev/archive/releases/0.2.2/closure.md`, the same relative 0.2.4 subtree under
`dev/archive/releases/0.2.4/`, and
`dev/archive/releases/0.2.4/release-0.2.4-closure.md`. The release-specific
design keeps its filename while joining the release archive. A new 0.2.4
archive README lists the moved set; move-time byte hashes establish that
content was not rewritten. Current authorities, designs, JSON evidence, public docs,
README files, and scripts are scanned for old linked or plain paths. Approved
records that describe the former paths as decision history are exempt by exact
path: `dev/releases/0.2.5/02-cruft-inventory.md`,
`06-decision-register.md`, `07-implementation-plan.md`, and Slice 70's own
plan/prework/review/status records.

S2-P4 changes only status metadata and completion pointers in this closed set:
`editor-state.md`, `editor-shell-state.md`, `graphir-coral-projection.md`,
`structured-editor.md`, `public-api-compatibility.md`,
`pointer-free-authoring.md`, and `consolidated-layout.md`. Each becomes
`Status: implemented` with its owning 0.2.4/0.2.5 completion record.
`completion-evidence-closure.md` already says historical and is not edited.

Release-local documentation rules are promoted once to
`dev/documentation-style.md`. The original Slice 60 path becomes a short
historical pointer so completed records retain a valid destination without
creating two normative copies. Current scripts and planning prompts read the
durable path.

## Security and environment independence

Published contributor pages may name environment-variable placeholders but
must not contain credential-shaped values, private filesystem paths,
maintainer hostnames, or links presented as required private context. Public
historical identities, including registry ownership evidence, are provenance
rather than credentials and may remain in a historical checklist. Controlled-
host numbers identify the scope of the claim and never become product
guarantees. Optional hooks, agent tooling, skills, and repository-local MCP
wiring may be described as optional discovery surfaces only; the setup page
does not invoke them, and a clean-snapshot walkthrough succeeds without them.

## Rejected alternatives

- A generated command reference was rejected: manifests and workflows are
  already readable, while a focused relationship test catches drift without
  publishing machine-oriented configuration.
- One contributor page for every script was rejected as navigation and
  maintenance overhead. The command/test-tier page groups by contributor goal.
- Duplicating Slice 75 rules was rejected because partial-corpus enforcement
  would create two owners for the same Markdown semantics.
- Treating skills, hooks, or `.mcp.json` as canonical setup was rejected because
  they are optional tool integrations and not required by R-049-AC3.
