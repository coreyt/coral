# Generated assets and dependencies

Closed inventory of derived repository assets and dependency-policy gates;
authored language specifications and conformance fixtures are source.

| Family | Canonical input and producer | Output | Freshness and class |
| --- | --- | --- | --- |
| Embedded fonts and notices | `scripts/font-assets.json`; `scripts/generate-font-assets.py` with pinned archives and `scripts/font-requirements.txt` | `packages/render/src/text/generated-fonts.ts`; `packages/render/third_party/fonts/` | Font tests plus API, package, and static checks; tracked derived |
| Tree-sitter parser | `packages/tree-sitter-coral/grammar.js`; pinned `tree-sitter generate` | `packages/tree-sitter-coral/src/parser.c`, `packages/tree-sitter-coral/src/grammar.json`, `packages/tree-sitter-coral/src/node-types.json`, `packages/tree-sitter-coral/src/tree_sitter/alloc.h`, `packages/tree-sitter-coral/src/tree_sitter/array.h`, `packages/tree-sitter-coral/src/tree_sitter/parser.h` | Generation, native, corpus, and consumer tests; tracked derived |
| Reviewed documentation figure | Slice 60 Coral source and review recorded by `docs/figures.json` | `docs/public/figures/coral-overview.svg` | Source/output hashes, SVG metadata, and human review; tracked derived |
| npm dependency graph | Root and workspace manifests plus approved policy; npm 12.0.2 | `package-lock.json` | Clean install, policy, audit, build, and test gates; tracked derived |
| Library API reference | Public manifests and fresh declarations; TypeDoc 0.28.20 via `npm run docs:api` | `docs/public/api/`, including inventory, reflection model and static HTML | `npm run test:api-docs` and assembled-site checks; disposable |
| Site and test output | Tracked source and the owning build or test | `docs/.vitepress/dist/`, `build/`, package distributions, coverage, reports, and temporary consumers | Owning command and cleanup; disposable |

## Regeneration boundaries

- Ordinary install, build, test, and publication use the committed fonts and
  do not download or regenerate them. Font regeneration is maintainer-only,
  needs Python plus the pinned requirements, and acquires only pinned archives.
- `npm run generate -w tree-sitter-coral` updates parser artifacts from
  `grammar.js`; native and corpus checks validate the result.
- The reviewed documentation figure changes only with its Coral source,
  manifest hashes, exported SVG, and human visual decision together.
- `npm run docs:api` builds public packages before converting declarations.
  `npm run docs:build` and `npm run build:online` include this stage. Warnings,
  missing declarations and broken local reference links fail the build. A failed
  conversion preserves the prior generated reference; unsafe output paths are
  refused. Frozen-site verification reads retained bytes without regeneration.
- Generated site, package, coverage, report, and consumer directories are
  disposable. Never treat them as canonical input.

## Caveat provenance

The lowfi face is the separate Caveat Latin variable pipeline, pinned to the
Google Fonts `v23` asset URL and SHA256 in `scripts/font-assets.json` under
`bundledFonts`. This is an asset revision, independent of Coral package and
source versions. The live experiment font is the canonical input to
`scripts/generate-caveat-metrics.mjs`; `caveat028.ts` embeds the same bytes.
The inventory pins the unchanged metrics and ink outputs and both OFL copies.
The upstream OFL differs only by one trailing space; its license text and
notices are retained. Browser/editor builds consume the render font and keep
Caveat notices. `packages/render/test/fonts.test.ts` checks input/embedded-byte,
license, source identity and metric/ink consistency through the normal render
suite. This provenance repair does not regenerate or relocate the approved
font, metrics or experiment inputs. The Fontsource generator still owns only
`fonts[]`; its pinned toolchain and budgets are unchanged.

## Dependency update policy

| Policy | Owner and evidence |
| --- | --- |
| Compatible dependency updates | Dependabot groups development and production minor and patch updates separately; review the lockfile and owning gates |
| Deferred major updates | TypeScript 7 and Node 26 types remain intentional deferrals until a separately reviewed migration |
| Runtime and release pins | Root and workspace manifests plus `package-lock.json`; exact-toolchain and consumer checks |
| GitHub Actions | Every external Action uses a full commit SHA with an exact version comment; workflow-policy tests enforce it |
| Vulnerabilities | `npm run audit:dependencies` is the selected CI source/lock-change/prepublication audit; retain raw findings, block unknown/new prepublication failures and require a release-specific residual-risk decision. Immutable-prefix resume records later findings visibly; fragment review stays separate |
| Install scripts | Root `allowScripts` is the closed approval for reviewed build dependencies and native tooling |
| Licences | Root and package licences, embedded-font notices, package manifests, API compatibility, and online-delivery checks |

For the raw upstream high/critical result, `npm audit --audit-level=high`
remains useful; the selected `npm run audit:dependencies` command owns the
release-specific disposition and preserves raw findings.

The bounded `smol-toml` 1.9.1 override fixes GHSA-r4xh-jqrq-34v2 for the
selected Markdown toolchain. Coral's actual configurations use JSONC; existing
Markdown checks exercise object-valued rule options there. Upstream
markdownlint 0.41.1/0.42.0 still checks options with `instanceof Object`, so the
null-prototype tables returned by smol-toml 1.9.x can cause nested TOML rule
options to be ignored. This unused TOML configuration path is a known
compatibility limit, not a claim of full upstream TOML compatibility. Do not
switch Coral configuration to nested TOML options without resolving and testing
that parent-tool behavior; no local dependency patch or fork is adopted.

Update canonical inputs first, regenerate only the affected family, and run its
focused freshness gate before widening verification to the blast radius.

## Related

- [Testing](testing.md)
- [Architecture](architecture.md)
- [How to build and preview](../how-to/build-and-preview.md)
