# Completion evidence and closure

Status: historical C50 evidence design, amended by R-043 and the 2026-09-14
explicit Fix/retry policy.

## Scope and ownership

C50 is the evidence-and-closure gate for work attributed to 0.2.3 but shipped
from the active `release/0.2.4` branch. It owns no new notation grammar,
provider protocol, retry policy, or spatial algorithm. R-033, R-040, R-041,
and R-042 remain authoritative for the prerequisite implementation.

`@coral-viz/render` owns shape, symbol, and notation definitions and registries.
`@coral-viz/viz` re-exports those definitions and owns React rendering.
`@coral-viz/diagram-editor` is the supported browser integration that replaced
the historical `viz-demo` path. For Mermaid generation, `App` supplies current
format/context to `useLlmChat`; the hook supplies `outputFormat`; `generate`
selects prompt and validation; and the accepted result crosses the existing
revision-gated commit boundary back into `App`.

## Interfaces and compatibility

No public or persisted interface changes. C50 tests the existing public
registries/re-exports and existing optional LLM request/result fields. Package
manifests, export maps, dependencies, lockfile, GraphIR 1.0.0 contract, and
React peer ranges remain unchanged. Published 0.2.3 packages are an immutable
comparison baseline, not a target to modify.

## Browser evidence

One #58 test changes the document notation through the production settings UI,
enters notation-specific Coral declarations, and asserts both the resolved
symbol identity and distinctive registered SVG path in rendered React Flow
nodes. AI/ML is representative because the issue requires at least one new
library; existing exhaustive render tests retain AI/ML, data-engineering, and
sketch registry coverage.

One #62 test begins in Mermaid, injects only a fake local key, intercepts the
provider request, returns valid Mermaid, and asserts request format/context,
visible Mermaid result, node rendering, and retained Mermaid selection. It
must not depend on a live provider, retry, arbitrary delay, or a mocked hook.
Existing focused invalid-Mermaid repair/exhaustion tests characterize code that
must change. Current negative evidence must prove rejection without commit or an
automatic second provider call, retained diagnostics, and explicit user Fix/retry;
compose those unit cases with one positive production browser path rather than
duplicating the matrix in Chromium.

These are evidence additions. If they pass against the accepted implementation,
record characterization GREEN and do not manufacture a production change. If
either exposes a defect, add the smallest focused RED reproducer before fixing
production code and repeat design/code review for that change.

## Failure, privacy, and performance

Invalid output must fail closed as proven by the focused generator tests. The
browser interception, Playwright reports/traces, command output, status, and
issue text must not emit the captured fake key, request body, current source,
or response. Normal in-browser editor state, conversation state, and recovery
may retain accepted document content under their existing contracts. The test
uses an isolated Playwright context; its local storage is discarded with that
context and generated reports are removed after verification. `.env` is never
read or copied. Browser tests add two small deterministic cases and no new
timing budget. Existing stale-result, cancellation, retry, recovery, and layout
rules remain unchanged.

## Alternatives

- A packed-consumer-only #58 test would prove exports but not the editor mapping
  and React/SVG boundary named by the retired demo acceptance criterion.
- A hook-only #62 test already exists and mocks the generator, so it cannot
  prove prompt selection, Mermaid validation, and visible commit together.
- Live-provider evidence would be slower, credential-bearing, and less
  deterministic without improving contract coverage.

## Traceability

| Requirement | Evidence |
| --- | --- |
| R-043 AC-1 | existing render registry/notation suites; render/viz build and package dry-run |
| R-043 AC-2 | new Chromium AI/ML notation-to-SVG case |
| R-043 AC-3 | new Chromium intercepted Mermaid generation plus generator/hook tests proving invalid-Mermaid rejection, no automatic candidate repair, diagnostics, and explicit Fix/retry |
| R-043 AC-4 | status record and sanitized GitHub issue updates after verification |
| R-043 AC-5 | exact-toolchain aggregate commands and published-package inventory |
