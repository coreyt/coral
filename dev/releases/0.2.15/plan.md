# Coral 0.2.15 release plan

## Scope and authorization

The owner authorized publishing this editor hotfix as `0.2.15` after reviewing
its behavior. The published `0.2.14` release and its frozen artifacts remain
immutable. Work belongs on `release/0.2.15`.

- Start Properties closed in each session, including older saved workspaces.
- Keep selection, inline editing, creation, and movement from opening Properties.
- Save first pointer and keyboard moves with existing Coral coordinates.
- Restore the current command-palette invoker after repeated openings.

Properties remains available through its header and command-palette controls.
Workspace sizes and selected tabs remain available across sessions.

## Source review

Before implementation, the owner approved adding or updating the existing
coordinate form when moving a symbol. For a displayed position of `(223, 131)`,
a move by `(100, 40)` changes this declaration:

```coral
review process as "Review request"
```

The resulting declaration, also its canonical printed node, is:

```coral
review process as "Review request" @ (323, 171)
```

Both forms parse without diagnostics. Displayed local coordinates allow the
first move instead of the former `coral.editor.source-position.missing`
refusal. Existing coordinates, pins, comments, connection declarations, group
locality, and source history remain preserved. No new syntax is introduced.

## Independent identities

- Package and hosted application version: `0.2.15`.
- Language Specification: `1.3.0`.
- Saved-source editions: `0.2.8`, `0.2.9`, and `0.2.14`.
- External dependencies: `@graph-ir/core@0.2.4` and `libavoided-js@0.1.3`.
- Build runtime: Node.js `26.8.2`, npm `12.0.2`, TypeScript `6.0.3`.
- Minimum published consumer runtime: Node.js `24.19.0`.

The saved-source catalogs and grammar authorities are unchanged. Browser gzip
remains subject to the existing 800 KiB hard ceiling.

## Verification and promotion

The interaction fixes passed the complete 274-case Chromium suite before the
package cutover. Final release evidence must come from the committed `0.2.15`
source and its retained artifacts.

1. Validate the atomic manifests, workflow policy, documents, source safety,
   public package builds, and browser size gate.
2. Push one candidate SHA and dispatch CI with `final_candidate=true` on
   `release/0.2.15`. Require every check in `dev/release-policy.json` and the
   final-candidate aggregate to pass.
3. Validate the proof against the live run, latest job attempt, package
   manifest, six frozen tarballs, and frozen site payload.
4. Fast-forward `main` to that SHA under the owner's publication instruction.
   Keep it pinned through release completion.
5. Publish the retained packages in dependency order through `publish.yml`.
   Require fresh audit and complete public registry verification.
6. Deploy the retained site through `pages.yml` and verify its live identity.
7. Create annotated `v0.2.15` and an immutable GitHub release through
   `release.yml`; verify the tag, release, evidence asset, and hosted bytes.
