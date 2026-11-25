# Node 26 Upgrade Evaluation

Status: evaluated 2026-09-11 against `main` at 5e08330. Not adopted.

Coral 0.2.x pins Node 24.19.0, npm 12.0.2 and TypeScript 6.0.3. The roadmap files
"Node 26 and TypeScript 7" together as one 0.3.0 toolchain migration. This records
what happens when the Node half is tested on its own, on Linux and on the
maintained Windows VM, and what a 0.2.x line should do about it.

The short version: the Node bump is small, safe and measured — six files, fourteen
lines, all of them a version string. The dangerous part of the migration is not
Node at all. It is the assumption that Node 26 brings its bundled npm with it. It
must not. npm 11 does not enforce `allowScripts`; npm 12 does. Pairing Node 26 with
its bundled npm 11.19.1 would silently re-enable arbitrary dependency install
scripts across the tree while emitting a warning that looks like enforcement.

## Why this was tested now

Node 25 reached end of life on 2026-06-01 and is the default runtime on at least
one development host, which makes unqualified local command output invalid as
release evidence. Node 24.19.0 remains Active LTS but enters maintenance on
2026-10-20. Node 26 was released 2026-05-05 and is promoted to LTS on 2026-10-28.
The relevant dates are therefore close enough that deferring the question to 0.3.0
by default, rather than by decision, was worth challenging.

TypeScript 7 is not implicated. `tsc` is JavaScript and runs on whatever Node it is
given; TypeScript 7 is a compiler implementation port, not a runtime requirement.
Every result below was produced with TypeScript 6.0.3 and `@types/node` 24.13.3
unchanged, which is the point: the two halves of the roadmap item are separable,
and only one of them was exercised here.

## What was performed

Work was isolated in a dedicated worktree and branch, `experiment/node-26-npm-11`,
cut from `main` at 5e08330 so that any failure was attributable to the toolchain
rather than to in-flight release work. Nothing was merged and nothing was
committed.

Two configurations were run, not one.

**Configuration A — Node 26.8.2 with its bundled npm 11.19.1.** This was the
original hypothesis, on the reasoning that Node 26 bundles npm 11.19.1 and that
adopting the bundled pair would let the separately installed `npm-12.0.2`
directory be retired from the Windows provisioning. Every functional gate passed.
The hypothesis was nonetheless wrong, for the reason given below.

**Configuration B — Node 26.8.2 with npm 12.0.2, unchanged.** npm 12.0.2 declares
`engines` of `^22.22.2 || ^24.15.0 || >=26.0.0`, so Node 26 is an explicitly
supported target — and Node 25 is explicitly excluded, consistent with its status.
This is also the arrangement already in use: Node 24.19.0 bundles npm 11.17.0, not
npm 12, so the project has never run the bundled npm on any line. Configuration B
is therefore not a workaround. It is the current arrangement moved up one Node
major.

### The allowScripts probe

Between the two configurations, a synthetic package with an `install` script was
built and installed against an `allowScripts` policy that deliberately did not
cover it. The marker file written by the script was the observable. The tarball
was confirmed to contain only `package/package.json` and `package/install.js`, so
the marker's presence could only mean execution.

| Runtime | npm | Message | Script ran | Behaviour |
| --- | --- | --- | --- | --- |
| Windows x64 | 11.19.1 | "not yet covered by allowScripts" | yes | fail-open |
| Linux x64 | 11.19.1 | "not yet covered by allowScripts" | yes | fail-open |
| Windows x64, Node 24.19.0 | 12.0.2 | "blocked because they are not covered" | no | fail-closed |
| Windows x64, Node 26.8.2 | 12.0.2 | "blocked because they are not covered" | no | fail-closed |

The wording difference is the whole finding. npm 11 reports uncovered install
scripts and runs them; npm 12 reports them and does not. A first reading of npm 11's
warning on a clean install mistook it for enforcement. It is advisory.

This is not academic for this repository. The clean install surfaces exactly two
uncovered packages — `onnxruntime-node@1.24.3` and `protobufjs@7.6.6`, both
`postinstall` — which npm 12 blocks and npm 11 would execute.

The related Windows path defect documented in `windows-validation.md`, where npm
records a local tarball as `file:C:\...` but normalises `allowScripts` file keys
differently and so cannot match its own key, is present in **both** npm 11 and npm
12. npm 11 does not fix it. The direct `node-gyp` invocation in
`scripts/native-smoke.mjs` keeps its justification, and nothing in that script or in
`scripts/consumer-smoke.mjs` becomes removable.

## Results

Configuration B, which is the proposed one, was run to completion on both
platforms.

| Gate | Linux x64 | Windows x64 |
| --- | --- | --- |
| `check:toolchain` | Node 26.8.2, npm 12.0.2 | Node 26.8.2, npm 12.0.2 |
| `npm ci` | 397 packages, zero lockfile churn | 396 packages |
| `npm run verify` | pass | pass |
| Unit tests | 2,105 passed (306 / 285 / 672 / 731 / 111) | 2,105 passed, identical |
| Lint | 0 errors, 104 warnings | 0 errors, 104 warnings |
| tree-sitter corpus | 30/30 parses | 30/30 parses |
| `smoke:native` | pass, linux-x64 | pass, win32-x64 |
| `smoke:consumer` | pass, linux-x64 | pass, win32-x64 |
| `api-compat` | pass, 5 packages, 17 declaration entries | not run |
| `test:e2e` | 59 passed | not run |
| `test:e2e:performance` | drag p95 40.4 ms, zoom p95 29.9 ms | not run |
| `test:coverage:gate` | pass | not run |
| `audit:fragments` | reports only, see below | not run |

The 396 against 397 package count is platform-optional dependencies, not a
discrepancy. `package-lock.json` was byte-identical after install under both npm
11.19.1 and npm 12.0.2, so `lockfileVersion: 3` round-trips without rewrite.

The native results carry the most weight. `tree-sitter-coral` has no checked-in
prebuilds and compiles at install through `node-gyp-build`; `node-addon-api` 8.9.2
makes it N-API rather than NAN, so there is no ABI break across the Node major. On
Windows the MSVC toolchain compiled it against Node 26 headers and the packed
consumer loaded the resulting addon and parsed successfully.

Browser interaction performance is within budget with room to spare — the S60
assertion is a 50 ms p95 on a 500-node diagram, and both measured interactions sit
around 40 ms and 30 ms. The figures were materially the same under Configuration A
(drag p95 41.3 ms, zoom p95 29.6 ms), which is expected, since the npm version does
not participate at runtime.

`audit:fragments` exits non-zero whenever knip reports anything, and CI already
runs it as a reporting-only step with `continue-on-error: true` per the decision in
`dev/archive/releases/0.2.4/slice-35/draft-plan.md`. Its output is static analysis over
package sources that this change does not touch, so none of it is attributable to
the runtime.

## What the change actually is

Against `main`, Configuration B is six files and fourteen lines. Every changed line
is a Node version string; no npm version changes anywhere, and `packageManager`
stays `npm@12.0.2`, identical to `main`.

```
.github/workflows/ci.yml      | 14 +++++-------   (7 jobs)
.github/workflows/publish.yml |  2 +-
.nvmrc                        |  2 +-
scripts/api-compat.mjs        |  4 ++--
scripts/check-toolchain.mjs   |  2 +-
scripts/consumer-smoke.mjs    |  4 ++--
```

`.nvmrc` is easy to miss. It is not read by any gate, so a migration that patches
only the enforcing pins will pass every check while still directing contributors at
Node 24.

Four of these are hard equality pins rather than floors — `check-toolchain.mjs`
compares exact strings, and `api-compat.mjs` and `consumer-smoke.mjs` each throw on
an exact mismatch. That is a deliberate property and should be preserved. It means
the toolchain cannot drift silently, and it also means every Node 26 patch release
is a deliberate, re-validated change rather than an automatic one.

## What was not tested

Stated plainly, because the gaps bound what the evidence supports.

A **control run** of the same commit under Node 24.19.0 and npm 12.0.2 was not
performed, by decision. The figures above are therefore absolute results, not a
proven no-delta against the current toolchain. The 0.2.4 status documents cite
roughly 2,041 tests and 135 lint warnings, but those were recorded on a different
branch state and are not a valid comparison.

Windows coverage is partial. `api-compat`, the Playwright suites, the coverage gate
and the fragment audit were run on Linux only. The Windows boundary as defined in
`windows-validation.md` — clean install, full repository verification, published
packages importing and typechecking, and the Tree-sitter package compiling under
MSVC — was met.

`engines` floors were deliberately left at `">=24.19.0"` in the root and in five
package manifests. Node 26 satisfies them, so nothing needed to change for the
experiment, but a real migration has to decide about them and that decision is
consumer-facing.

Nothing was run on macOS, and no `npm audit` posture change was assessed beyond the
three pre-existing moderate advisories reported by both npm versions.

## Proposal for a 0.2.x Node 26 upgrade

The roadmap's pairing of Node 26 with TypeScript 7 should be separated. It is a
scoping convenience, not a technical dependency, and keeping them married defers a
fourteen-line change behind a compiler port. The recommendation is that the Node
half becomes eligible for 0.2.x on its own, and that TypeScript 7 and Node 26 type
adoption stay 0.3.0 as written.

**Ship it as a standalone toolchain release with no package source changes.** The
value of this change is that its diff is trivially auditable and any regression is
unambiguously attributable to the runtime. Bundling it with feature work destroys
that property. The release should change version strings, the provisioning, and
nothing else. Per the standing rule that any changed package artifact ships as
0.2.4 or later, the rebuilt artifacts take the next patch version even though no
source changed, because the build environment did.

**Keep npm 12.0.2 exactly as it is.** This is the non-negotiable part. The
separately installed npm is what makes `allowScripts` enforcing, and no Node line
bundles npm 12. Any proposal that adopts Node 26's bundled npm should be rejected
on the evidence above. If npm is ever to move, it moves as its own change with its
own enforcement probe, not as a side effect of a Node bump.

**Do not raise the `engines` floors in the 0.2.x line.** Building on Node 26 and
requiring Node 26 are different things. The compiled output targets ES2020 and
ES2022 and `@types/node` stays at 24.13.3, so packages built on Node 26 continue to
install and run for consumers on Node 24. Raising `engines.node` to `>=26` would be
a consumer-facing break that a patch release has no business making; it belongs to
0.3.0 alongside the types bump. The release toolchain pin and the consumer floor
should be allowed to diverge, and that divergence should be stated in the release
notes so it is not later read as an oversight.

**Wait for LTS on 2026-10-28.** There is no technical reason the change could not
land sooner, but a release toolchain on a Current line inherits a faster patch
cadence and a shorter support horizon for no benefit. Node 24 enters maintenance on
2026-10-20, eight days earlier, so the two events are close enough that the wait
costs very little and removes the awkwardness of pinning release evidence to a
non-LTS runtime. The exact patch chosen at that time will not be 26.8.2, and it
must be re-validated rather than assumed, because the pins are exact by design.

**Sequence the work as follows.** Re-run the evaluation on the Node 26 patch
current at adoption, on both platforms, including the control run against Node
24.19.0 and npm 12.0.2 that was skipped here so the release can claim a measured
delta rather than an absolute pass. Extend the Windows leg to the gates that only
ran on Linux. Provision the VM additively, leaving `node-v24.19.0-win-x64` and
`npm-12.0.2` in place so the previous toolchain stays reproducible for as long as
0.2.x artifacts might need rebuilding. Update the seven CI jobs and `publish.yml`
together, since a partial update produces a matrix that validates one runtime and
publishes from another. Update `.nvmrc`. Amend `windows-validation.md`, which
currently names Node 24.19.0 as the VM's release tool, and `ROADMAP.md`, which
currently binds Node 26 to TypeScript 7.

**Treat the `allowScripts` finding as the release's headline risk control.** The
migration's most likely failure mode is not a broken build, which the gates catch
loudly. It is a quiet downgrade of install-script enforcement introduced by someone
reasoning, as this evaluation initially did, that the bundled npm is the natural
companion to the runtime. The enforcement probe in this document is cheap and
should be run as part of the adoption evidence, so that the property is asserted
rather than assumed.

## Reproduction

The experiment worktree is `experiment/node-26-npm-11`, cut from `main` at 5e08330,
uncommitted, with Configuration B applied. The branch name describes the rejected
pairing and should be renamed if the work is carried forward.

The Windows VM `gh-runner-wonl-win11` was provisioned additively. Node 26.8.2 was
installed to `C:\coral-toolchains\node-v26.8.2-win-x64` after verifying its SHA-256
against `nodejs.org`; `node-v24.19.0-win-x64` and `npm-12.0.2` were not modified.
Build and evidence artifacts were confined to `C:\temp`. Validation addressed Node
by exact path and prepended that directory to `PATH`, per the existing convention,
and invoked `C:\coral-toolchains\npm-12.0.2\npm.cmd` directly.
