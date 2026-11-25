# Testing

Executable verification for repository changes. Publication and deployment
remain separate release operations.

| Tier | Command or source | Use |
| --- | --- | --- |
| Local full verification | `npm run verify` | Source, contract, unit, native and packed checks in one checkout |
| Focused checks | Root and workspace npm scripts | Fast feedback in the affected blast radius |
| CI stages | `npm run ci:<stage>` | Stage commands composed by `.github/workflows/ci.yml` |
| Performance | `npm run test:performance` | Strict local or controlled-host timing budgets |
| Manual live harnesses | Four opt-in TypeScript scripts | Provider behavior with local credentials and retention controls |

## Local full verification

`npm run verify` runs `scripts/ci-local.mjs`. It needs no GitHub context and no
frozen candidate. It runs the source checks, builds the public packages once
with `npm run build:public`, then runs the contract, unit and native stages
against those outputs. The native and language packed-consumer checks pack the
current source freshly. Browser, delivery and performance checks are separate
commands; run them when a change affects those boundaries.

## CI stages

Each stage reads declared inputs and writes only its own outputs. A check never
builds as a side effect; `npm run typecheck` reads prepared declarations, so
run `npm run prepare:typecheck` in a fresh checkout. Stages that consume the
candidate verify `candidate-manifest.json` against the exact source commit and
version before using an archive. `CORAL_ARTIFACT_DIR` and
`CORAL_SITE_ARTIFACT_DIR` select the frozen packages and site.

CI runs in three phases. Early checks start at once. Candidate checks start as
soon as the frozen packages, and the site where needed, exist. Product checks
start only after every early and candidate check passes. The final-candidate
attestation then requires every result.

| Phase | Command | Contract |
| --- | --- | --- |
| Early | `npm run ci:source` | Toolchain, workflow policy, lint, Markdown, docs structure, links, dependency audit and root script tests; no builds |
| Early | `npm run ci:windows-risk` | Real Windows source and native builds, browser build-output tests, plus path, process and API-doc tests |
| Early | `npm run ci:packages` | Ordered public and native-input build, browser build-output tests, six prepared packs and the candidate manifest |
| Candidate | `npm run ci:site` | Assemble the production site from hydrated declarations and freeze `site.tar` with its digests |
| Candidate | `npm run ci:contracts` | Read-only typecheck, contract script tests, bounded seeded fuzz and the language specification |
| Candidate | `npm run ci:native` | Native compile, corpus, parity and the packed frozen native consumer on Linux, macOS and Windows |
| Candidate | `npm run ci:browser-prepare` | Replace the editor output with the frozen site for the browser smoke and full browser run |
| Product | `npm run ci:unit` | Every product unit suite once against packaged `dist`, except browser build-output tests; viz, MCP and editor only with coverage floors |
| Product | `npm run ci:windows-unit` | The same unit selection once on Windows, without coverage |
| Product | `npm run ci:delivery` | Frozen-site serving, API search, tamper rejection and comparison with one fresh build |
| Helper | `npm run ci:hydrate` | Verify the candidate and restore only its compiled `dist` outputs |
| Helper | `npm run ci:restore-site` | Verify the frozen site digest, archive entries, source identity and integrity manifest |

A pull request runs only the source checks when every changed path is a
passive release record or root prose. Current authorities (`PLAN.md`,
`CLAUDE.md`, release plans, and every plan or design of the active release at
any depth), any `docs/` change, an unknown base and a final-candidate dispatch
run everything.

The candidate phase also runs the installed consumers: `npm run smoke:consumer`
for Node 26, Node 24 and React 18 and 19, and
`npm run smoke:api-compat-consumers` for the published baseline. Other stages
call the helper commands themselves.

The Node 26 cell also runs the `installed-renderer` case. One consumer
installs the frozen language, render, browser, viz and MCP archives and checks
the language reader and the MCP Mermaid conversion chain. It renders every
active source in each style and theme through the browser, MCP and public
editor, and checks that disabled and headerless sources are refused. It then
drives the installed browser bundles in Chromium as ESM, IIFE and a custom
element, and compares browser and Node successor validation under a strict
no-eval Content Security Policy. Run it locally with
`CORAL_CONSUMER_CASES=installed-renderer npm run smoke:consumer` after
`npm run build:public`; it needs the Playwright Chromium browser.

The delivery stage copies the frozen site into a disposable directory and
passes it to `npm run test:online-delivery:integration` as
`CORAL_FROZEN_SITE`. The test serves and tampers with that copy and compares
it byte for byte with exactly one fresh build. Run without that variable, the
test builds both sides itself.

## Focused checks

| Command | Use |
| --- | --- |
| `npm run test:e2e` | Chromium end-to-end behavior after `npm run build`; four workers, zero retries |
| `npm run test:e2e:robustness` | Focused robustness browser selection |
| `npm run test:e2e:robustness:pairwise` | Bounded deterministic UI robustness profile |
| `npm run test:fuzz` | Bounded seeded language, open, GraphIR, SVG and browser-boundary fuzz |
| `npm run test:fuzz:extended` | Longer seeded fuzz campaign |
| `npm run test:coverage:gate` | Viz, MCP and editor coverage floors |
| `npm run test:api-docs` | Generated reference contracts, failure behavior and build wiring |
| `npm run test:online-delivery:integration` | Reproducible site build, serving, API search and tamper rejection |
| `npm run check:docs` | User, library, contributor, example and link checks |
| `npm run audit:fragments` | Non-blocking source and dependency fragment candidates |
| `npm run smoke:consumer` | Packed blank-consumer runtime and type behavior |
| `npm run smoke:api-compat-consumers` | Node.js 24.19.0 consumers of the immutable published 0.2.8 baseline |
| `npm run api-compat` | API comparator fixtures, GraphIR adoption and read-only typecheck; run `npm run prepare:typecheck` or `npm run build:public` first |
| `npm run smoke:native` | Packed native grammar build and load |

`npm run test:api-compat` checks the comparator against its own fixtures. It
does not by itself compare the current declarations with a published release.

Package-level test scripts are appropriate while resolving a focused finding.
Run broader checks when changes cross workspace or product boundaries.

## GraphIR release dependency

All direct consumers pin one exact published `@graph-ir/core` version, and the
lockfile records its registry identity. `npm run test:graphir-adoption` checks
the pin, schema, migration, order and installed-bridge refusals. Do not
substitute a no-save dependency, local path, sibling checkout or unpublished
archive. GraphIR specification publication is outside this release.

## Browser and performance tests

Normal browser tests use four workers and zero retries, and they run every
functional assertion from the benchmark fixtures without timing loops.

`npm run test:performance` runs the language, render, viz and editor benchmark
suites, then `npm run test:e2e:performance`. Build the editor first. Each runs
with one worker and zero retries and fails on any functional error, invalid
sample or budget overrun. A budget overrun reports PERFORMANCE BENCHMARKS
FAILED.

A controlled host declares its comparable profile with
`CORAL_PERFORMANCE_PROFILE`; a mismatch fails. GitHub-hosted shared runners are
not measurement machines. On an unclassified GitHub environment the benchmark
commands print PERFORMANCE BENCHMARKS NOT MEASURED and skip the sampling loops
instead of reporting a pass. CI has no benchmark job. See
[performance budgets](performance-budgets.md) for fixtures and limits.

## LLM harness boundary

Deterministic unit and corpus tests use synthetic fixtures and fake provider
behavior. They require no network or key. The manual surfaces below are
outside CI and `npm run verify` and require explicit authorization before any
live provider call.

The no-key behavior is verified without invoking a provider or running an
application build:
`npm test -w @coral-viz/diagram-editor -- --run
test/llm/accuracy-harness.test.ts -t 'no configured API key'`.

| Script | Credential names | Output and retention |
| --- | --- | --- |
| `accuracy-harness.ts` | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `MISTRAL_API_KEY` | Timestamped scorecards and candidates under gitignored `accuracy-harness-output/`; delete after review |
| `test-live.ts` | `LLM_API_KEY` | Results to stdout only |
| `test-e2e.ts` | `LLM_API_KEY` | Results to stdout only |
| `test-mermaid-adjust.ts` | `LLM_API_KEY` | Fixed prompt, converted source, and result to stdout only |

Live or user-derived prompts, responses, scorecards, terminal captures, and
keys stay local and are never committed. There is no production telemetry from
these contributor harnesses.

## Related

- [Get started with Coral](../get-started.md)
- [Architecture](architecture.md)
- [Coverage baseline](coverage-baseline.md)
- [Performance budgets](performance-budgets.md)
