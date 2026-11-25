# Release compliance checklists

Historical release-compliance evidence retained for maintainer reference.

| Release | State |
| --- | --- |
| 0.2.4 | Published and verified |
| 0.2.2 | Closed without publication |

## 0.2.4 published release

- [x] Root, six workspace manifests, internal pins, lockfile, and MCP server
  report 0.2.4 atomically; GraphIR remains 0.2.0/schema 1.0.0.
- [x] The Slice 60 design narrows R-039 to a compatibility shared engine,
  conservative opt-in profiles, an editor-only worker, and focused performance
  gates; independent design review accepted with no medium/high findings.
- [x] Shared ELK and 500-node drag/zoom budgets pass initial exact-toolchain
  calibration on the attributable controlled release machine with 20 samples,
  zero browser retries, and recorded raw evidence. GitHub-hosted shared runners
  are explicitly non-authoritative for hard timing budgets.
- [x] Final committed candidate reruns both performance gates on that controlled
  machine with exact SHA/tree, commands, environment, raw samples, and zero
  retries recorded.
- [x] Exact Node 24.19.0/npm 12.0.2 clean install, lint, typecheck, builds, all
  unit/coverage/browser/API/consumer/native/package/doc/diff gates pass.
- [x] Exact `npm audit --audit-level=high` exits zero with three moderate
  transitive findings and no high/critical finding; no breaking force-fix was
  applied. CI and registry-consumer audit evidence remain separately required.
- [x] Guarded OIDC commit/version checks, contiguous partial-publication
  recovery, structural npm provenance validation, registry-only verification,
  and adversarial closure tests pass independent review and full verification.
- [x] Release-branch CI run
  [`34562701499`](https://github.com/coreyt/coral/actions/runs/34562701499)
  passes the then-defined ten jobs on exact candidate
  `cb1440e44f924e9b7a6a53bb34e521952dc0ee8a`: maintained Linux/macOS/Windows,
  Windows full verify/consumer smoke, pristine Chromium 59/59, historical
  hosted performance,
  API compatibility, React 18/19, coverage, audit, packages and docs.
- [x] NVDA/Windows and VoiceOver/Safari are explicitly experimental and
  untested for 0.2.4; their retained optional script is non-blocking and no
  automated result is represented as screen-reader evidence.
- [x] Final candidate push run `34598566896`, PR run `34599676223`, and merged
  `main` run `34600831120` pass all nine deterministic jobs; independently
  audited PR/main Chromium runs are 59/59 without retry or flaky annotation.
- [x] OIDC publication, registry-only 0.2.4 verification, tag, GitHub release
  and issue closure complete in their real environments.

The 0.2.4 release is complete. Controlled-machine timing evidence and external
CI evidence remain distinct; neither substitutes for the other.

## 0.2.3 published baseline

- [x] `@graph-ir/core@0.2.0` is published, public, and installable with the
  expected registry integrity.
- [x] A clean checkout runs `npm ci` on Node 24.19.0/npm 12.0.2 using only the
  public registry dependency.
- [x] `npm run verify` succeeds on Node 24.19.0/npm 12.0.2: 1,700 tests
  pass and one intentionally skipped MCP transport test remains documented.
- [x] Tree-sitter generation and 27 corpus tests succeed on the local release
  platform.
- [x] Vite output contains the lazy Whisper worker and required WASM assets.
- [x] `npm audit --audit-level=high` reports no high/critical advisory on the
  final lockfile.
- [x] Each public package passes `npm pack --dry-run`.
- [x] Public blank-consumer ESM/type smoke passes for every public package on
  Linux x64 using public `@graph-ir/core@0.2.0`.
- [x] Native install smoke passes on Linux x64.
- [x] Registry-backed clean install, all 1,700 tests, blank-consumer checks, and
  native install smoke pass on Windows x64 in the maintained on-host VM.
- [x] Native install smoke passes on macOS 14 arm64 in CI.
- [x] A clean-source Windows x64 VM run passes toolchain validation, lint,
  typecheck, production builds, 1,700 unit tests with one intentional skip,
  and all 27 Tree-sitter corpus cases using public `@graph-ir/core@0.2.0`.
- [x] All 17 Chromium tests pass, including downloaded content, raster decode,
  conversion-loss reporting, and recovery geometry.
- [x] Coverage gates pass for viz and MCP.
- [x] Requirements, architecture, roadmap, public docs, and package docs use
  the unpublished-0.2.2 / first-supported-0.2.3 boundary.
- [x] The five 0.2.2 release-review defects retain permanent regression tests.
- [x] PDF, Node 26, and TypeScript 7 are assigned to 0.3.0.
- [x] npm confirms `coreyt100` as owner of the `coral-viz` organization; all
  scoped Coral packages use `@coral-viz/*`.
- [x] Revalidate the renamed Coral artifacts with the clean install, full unit,
  coverage, browser, documentation, audit, pack, consumer, and native Linux gates.
- [x] Publish and registry-verify all five renamed Coral artifacts. A blank
  registry-only consumer passes runtime, type, executable, dependency, and
  native-parser checks with zero audit findings.

0.2.2 remains closed without publication. This checklist governs the first
supported/public release of its repaired and extended feature set.

## Related

- [Release and recover](../how-to/release-and-recover.md)
- [Documentation governance](documentation-governance.md)
