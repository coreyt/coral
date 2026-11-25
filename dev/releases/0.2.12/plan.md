# Coral 0.2.12 public repository launch plan

Status: active (`2026-11-24`).

Release `0.2.12` prepares and launches **Coral** (`coreyt/coral`) as a clean,
public Apache-2.0 open-source repository while preserving full historical R&D
and prior release records privately.

## Scope

1. **Decouple live fixtures from internal R&D paths:** relocate font assets,
   renderer/editor test fixtures, legacy service-worker test fixtures,
   documentation figure sources, and audit/capability fixtures into package,
   `docs/`, `e2e/`, and `scripts/` locations.
2. **Prune heavy internal artifacts and scrub personal notes:** export prior
   experiments, archives, research, and historical release logs to a private
   companion repository; remove `.wake/` tracking and hooks; strip local
   environment references.
3. **Clean up internal-era scripts and Playwright configs:** rename legacy
   `slice92`/`slice100`/`028`/`029` scripts to capability-oriented names and
   retire redundant Playwright configs.
4. **Open-source documentation and package metadata:** refresh `README.md` with
   visual previews and quick starts, add `CONTRIBUTING.md`, `SECURITY.md`,
   `CODE_OF_CONDUCT.md`, and GitHub issue/PR templates, and populate
   `homepage`, `bugs`, and `keywords` across all six public packages.
5. **Version bump and public release cutover:** bump all packages and docs to
   `0.2.12`, update `dev/release-policy.json` for public repository visibility,
   verify all local gates, and run the hosted CI, npm publish, GitHub Pages,
   and immutable `v0.2.12` release workflows.

## Working constraints

- Maintain backward-compatible public APIs (`npm run test:api-compat`).
- Use the workspace release toolchain (`Node.js 26.8.2`, `npm 12.0.2`,
  `TypeScript 6.0.3`, `npm run check:toolchain`).
- Published packages retain `Node.js 24.19.0` as their minimum runtime.
