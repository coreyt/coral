# Coral 0.2.15 local verification

The owner requested publication of the reviewed editor hotfix as `0.2.15`.
The source-coordinate behavior was approved before implementation. The final
release requires successful exact-SHA CI and retained-artifact verification.

## Completed local checks

- Exact build toolchain: Node.js `26.8.2`, npm `12.0.2`.
- Full configured public-package and editor build: passed.
- All workspace typechecks and ESLint: passed, with zero lint errors.
- Release, workflow, archive, and example-catalog contracts: `69/69` passed.
- Complete CI contract function: `164/164` script checks passed, together with
  workspace typechecks, bounded model fuzzing, language-spec verification,
  and installed GraphIR provenance verification.
- Browser bundle/package checks: `22/22` passed. The IIFE is `818996` bytes
  gzip (`799.80 KiB`), below the `819200`-byte hard ceiling.
- Post-cutover Chromium interaction checks: `23/23` passed, zero retries.
- Documentation, workflow policy and its mutation tests, Markdownlint, and
  secret scanning: passed.
- Fresh dependency audit: zero high or critical findings; the 11 moderate
  findings remain within the existing audit policy.

Before package cutover, the final interaction behavior passed all 274 Chromium
checks with zero retries. The final hosted candidate must repeat the full
matrix for the committed `0.2.15` source and its exact frozen package/site
artifacts. Local checks do not substitute for that proof.

## Preserved boundaries

The language and rendering implementations, saved-source catalogs, language
specification, and Tree-sitter grammar authorities are unchanged. Package
version `0.2.15` does not introduce a source edition `0.2.15`.

The published `0.2.14` release, its records, and its frozen artifacts remain
unchanged. Publication promotes the selected new CI artifacts after all
required checks pass and independently verifies npm, Pages, and GitHub Release
identities against the selected source SHA.
