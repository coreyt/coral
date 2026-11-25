# Coral Tier 3: Engineering, Compatibility and Release Constraints

Tier 3 governs **how Coral is built, verified, packaged, and governed** across
releases. Separating these engineering constraints from Tier 1
[User Needs](user-needs.md) and Tier 2
[System Requirements](system-requirements.md) keeps product requirements
focused on user outcomes while preserving strict release discipline.

## ENG-01: Deterministic Release Toolchain and Atomic Versioning

- **Toolchain:** Release builds and validation run on exact Node.js `26.8.2`
  and npm `12.0.2` (TypeScript `6.0.3`, Node 24 public types). Published
  packages retain Node.js `24.19.0` as their minimum supported runtime and are
  verified separately under Node 24.
- **Atomic Release Identity:** Every workspace `package.json`, the root
  manifest, lockfile workspace entries, internal `@coral-viz/*` pins, site
  `version.json`, and browser/MCP/editor version displays move atomically.
  Mixed-version or partial candidate sets fail release guards.
- **Verification:** `npm run check:toolchain`, clean `npm ci`,
  `npm run test:release-version`, `npm run test:release-closure`,
  `npm run check:minimum-runtime`.

## ENG-02: Canonical Dependency and Candidate Artifact Integrity

- **Dependency Identity:** External `@graph-ir/core` declarations, registry
  source, integrity hashes, lockfile entries, and installed/packed inputs must
  agree exactly. Equal version strings without matching provenance do not
  establish identity.
- **Fresh Candidate Identity:** Inherited `dist/` directories never establish
  release acceptance. Generated Tree-sitter sources precede native compilation,
  and fresh package/site/editor builds precede browser and delivery gates.
- **Verification:** `npm run check:graphir-adoption`, `npm run ci:packages`,
  `npm run ci:site`, `npm run smoke:consumer`.

## ENG-03: Automated Quality, Coverage and Benchmark Gates

- **Coverage Floors:** `@coral-viz/viz`, `@coral-viz/mcp-server`, and
  `@coral-viz/diagram-editor` (including critical state owners) maintain the
  coverage thresholds in
  [budgets-and-ceilings.md](specs/budgets-and-ceilings.md).
- **Mandatory Suites:** Exact-candidate `npm run verify`, portable Markdown
  linting and link/anchor validation (`npm run lint:md`,
  `npm run test:markdownlint`, repository link/anchor checks), Playwright E2E
  (`npm run test:e2e`), route-robustness (`npm run test:route-robustness`),
  and controlled-hardware performance suites (`npm run test:performance`) pass
  before release closure. Shared hosted runners reporting `NOT MEASURED` never
  satisfy controlled-hardware latency gates.
- **Catch-Up Separation:** Failures in P4 catch-up accessibility suites
  (`REQ-C3` / `UN-12`) are recorded transparently in release status but do not
  block non-accessibility feature releases unless explicitly promoted to the
  release gate.

## ENG-04: Cross-Platform Support Matrix Honesty

- **Supported Package Platforms:** Linux x64, Windows x64, and macOS arm64 on
  Node.js >= 24.19.0, with `@coral-viz/viz` validated on React 18.3 and 19.
- **Supported Web Application Platform:** Desktop Chrome. Edge, Safari, and
  Firefox are labeled experimental; mobile browsers are unsupported.
- **Attribution Rule:** Prior-release platform evidence does not transfer
  automatically to a new release candidate. Unrun cells stay `NOT MEASURED`.

## ENG-05: Security, Secret Scanning and License Hygiene

- **Dependency Audit:** `npm run audit:dependencies` retains raw findings and
  blocks unresolved high/critical npm advisories. Any residual exception
  requires an explicit current-release owner decision; prior-release exceptions
  never auto-transfer.
- **Secret Scanning:** Pinned `gitleaks` must actually execute (including
  synthetic positive detection and bad-path refusal); skipped scanner tests
  fail verification.
- **License & Notice Hygiene:** Third-party notices and non-Apache-2.0 model
  licenses (e.g., LFM Open License v1.0 for `coralsmol`) remain accurate and
  bundled where disclosed; model weights never enter npm packages.

## ENG-06: Human-in-the-Loop (HITL) Source-Notation and IR Governance

- **Source-Notation HITL Gate:** Any change to human-authored Coral syntax,
  relation/keyword spellings, or canonical printer output requires an explicit
  human before/after review (showing representative source before/after,
  canonical printed output, and affected diagnostics) recorded in the owning
  slice status before implementation. Agent reviews do not satisfy this gate.
- **Coordinated GraphIR Governance:** Because the Coral maintainers also own
  `graph-ir` and `graph-ir-tools`, schema changes are straightforward when
  portable authored meaning justifies them, provided they follow coordinated
  versioning, validator updates in `graph-ir-tools`, migration adapters for
  older schemas, and synchronized lockfile/round-trip adoption in Coral.
- **Immutable Published Releases:** Published release tags and release branches
  are never rewritten. Active release work stays on `release/<version>` in its
  dedicated worktree, never on `main`.
