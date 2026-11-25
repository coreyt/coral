# How to release and recover Coral

Use immutable candidate inputs, publish the package prefix in order, and
deploy the exact retained Pages artifact; final execution belongs to Slice 100.

The active 0.2.14 release workspace uses public GraphIR Core 0.2.4 and prepares
frozen 0.2.14 package/site artifacts. Publication requires the exact-source
final matrix and explicit release execution authorization. Source edition 0.2.8
and [Language Specification 1.3.0](../../embed/reference/language-specification-1.3.0.md)
remain independent of the package version.

`npm run verify` covers the local source/contracts/unit/native checks. Browser,
delivery and controlled timing are separate: prepare fresh packages with
`npm run ci:packages`, then `npm run ci:site`; verify the package/site
identities
and site digest, restore with `npm run ci:browser-prepare`, then run
`npm run test:e2e` and `npm run ci:delivery` with consistent candidate inputs
and
`EXPECTED_SITE_SHA256`. Controlled timing also needs the matching exclusive
host/browser profile; shared hosted NOT MEASURED is not controlled acceptance.

1. Run `npm run verify`, then choose one candidate `version` and one full
   40-character `commit`. Push it to
   `release/0.2.14` and dispatch CI with `final_candidate=true`.

   The aggregate `final-candidate` job must prove every required result for
   that exact source, run and attempt. Its proof binds the six frozen package
   tarballs and their manifest, the frozen site `site.tar` and its identity
   digests. It makes no measured-performance claim.

   If a job fails, re-run only the failed jobs, and only while the commit is
   unchanged. The retry counts only when the proof binds the latest attempt of
   every required cell in that run. Do not re-run a selected successful final
   candidate while its packages or site are being published. A changed commit
   needs a new final-candidate run.
   Run the six-package consumer smoke from those tarballs on the Windows 11
   VM under Node 24.19.0 and 26.8.2, then decide go or no-go. On go,
   fast-forward `main` to the commit; `main` must stay there until the GitHub
   release completes.

2. Start the package publication workflow with the exact version, commit,
   final-candidate run ID. Its `verify` job runs without the npm OIDC token.
   It verifies the final-candidate proof and the retained tarball digests,
   inspects registry state, then runs the workspace audit. Publication
   promotes those frozen bytes; it does not run `npm run verify`, rebuild or
   repeat the product matrix. The audit blocks a fresh publication. Once a
   published prefix exists, a new advisory is reported in the job output
   without blocking. Only the exact release-specific approved braces risk is
   accepted; raw
   findings remain visible, and changed or additional findings block.
   Only its `publish` job can request the token: it installs with
   `npm ci --ignore-scripts`, re-verifies the proof and tarballs, and runs
   `release-guard.mjs`, which checks the clean checkout,
   workflow SHA, requested version, and atomic manifests, before
   `release-registry.mjs preflight` inspects public registry state.

   Preflight emits a `start-index` for one valid contiguous published prefix.

3. The guarded workflow publishes the retained candidate tarballs in this
   dependency-safe order:
   `@coral-viz/language`, `@coral-viz/render`, `@coral-viz/browser`,
   `@coral-viz/viz`, `@coral-viz/mcp-server`, then `tree-sitter-coral`.
   All six frozen packages publish with npm trusted publishing (OIDC); no npm
   token is used. The workflow has no authority to change npm accounts or
   package settings.
   The `registry` job finishes with `release-registry.mjs verify`, which
   waits up to 15 minutes for registry propagation.

   Every package resolves from the registry with the candidate identity,
   integrity, provenance or approved private-repository digest, runtime import,
   type, native, and signature checks intact. A post-publication audit
   advisory appears as a workflow warning without blocking, because the
   packages are already immutable; no audit file is kept.

4. If only the `registry` job fails, for example after the propagation
   window, re-run that failed job in the same run. If publication stops
   earlier, dispatch the workflow again with the same `version`, `commit`, and
   candidate run ID. Preflight verifies the existing prefix and resumes at its
   `start-index`; a gap, mismatched artifact, or different source fails closed.

   Already verified packages are not republished, and recovery continues only
   from the first missing package. The release ledger keeps each package's
   publishing run, even when a later run completed the set.

5. Start the Pages workflow with the same immutable inputs and candidate run
   ID. It runs the guard, verifies the final-candidate proof against the
   frozen `site.tar`, restores that site and checks its identity records
   against the proof, then uploads it as the Pages artifact. It does not
   build the site or publish an application ZIP or checksum download. The
   registry job must verify all six packages before the deploy job can write.

   The deployed bytes are the frozen site that the final candidate tested.

6. To restore a successful retained Pages deployment, start
   `pages-restore.yml` from `main`. Supply the original Pages run ID and
   attempt, exact retained `github-pages` artifact ID and outer digest, the
   `artifact.tar` SHA-256, and its embedded `version` and `commit`.

   The restore workflow verifies the original successful build, registry, and
   deploy jobs; checks the unexpired artifact and embedded identity without
   extracting or executing it; relays the exact tar bytes; checks the relay;
   then deploys. It contains no source build or npm command. Do not use a job
   rerun for this recovery: GitHub also reruns dependency jobs and rebuilds the
   site.

7. Run the isolated GitHub release workflow with the exact candidate and
   Pages run IDs. Its read-only verification job checks packages, the Pages
   deployment made by that Pages run, hosted identity, and conflicting
   identities. Check the immutable-release setting yourself beforehand
   (`gh api repos/coreyt/coral/immutable-releases`), because the job token
   cannot read it. The
   contents-write-only job then creates the annotated tag as
   `github-actions[bot]` and the release, and requires the release to read
   back as immutable.

   If a re-run finds the job's own unpublished draft with the same
   `release-evidence.json`, it publishes the draft. A draft with other or
   missing evidence stops the job; after HITL approval, delete that
   unpublished draft (`gh release delete v0.2.14 --yes` keeps the tag) and
   re-run the `release` job.

   Read back the complete release and remove or explicitly retain the
   candidate ref only if it is actually temporary; keep the ongoing release
   branch. Rendering the release ledger is optional.

## Result

One source identity has an ordered, resumable package publication, a Pages
deployment of the frozen tested site, and an independently guarded
retained-artifact restore path.

## Related

- [Testing](../reference/testing.md)
- [Release compliance checklist](../reference/release-compliance-checklist.md)
