# Documentation governance

Ownership and lifecycle boundaries for public guidance, current program
records, and indexed history; authoring rules live outside the public site.

| Class | Path | Reader and authority |
| --- | --- | --- |
| Use Coral | `docs/use/**` | Application users; shipped behavior and limits |
| Embed Coral | `docs/embed/**` and package READMEs | Published-package consumers; public APIs, requirements, and examples |
| Contribute to Coral | `docs/contribute/**` | Repository contributors; setup, maintenance, tests, and release operations |
| Current program records | `dev/requirements.md`, `dev/requirements/**`, `dev/ARCHITECTURE.md`, `dev/documentation-style.md`, designs, and active release records | Product authority, decisions, design, plans, style, and current evidence; not published by VitePress |
| Indexed history | `dev/archive/**` | Recoverable provenance; non-authoritative and excluded from current documentation gates |

## Fact ownership

A fact has one owning surface. Other pages link to that owner or stay silent
when a link would import a claim they cannot verify. Contributor pages cite
commands and paths, while manifests, workflows, scripts, and program records
remain canonical for executable facts.

| Fact | Canonical owner | Drift evidence |
| --- | --- | --- |
| Toolchain, workspaces, and npm commands | Root and workspace manifests, lockfile, and toolchain script | Toolchain tests and contributor documentation contract |
| CI and release behavior | Workflow and release scripts | Workflow-policy, release, and contributor checks |
| User features and figures | Use Coral feature and figure records | Documentation structure check |
| Bundled editor and website examples | Editor `src/example-sources/catalog.json` and its authored sources | Shared catalog, generated download/preview and editor handoff checks |
| Package APIs and examples | Package READMEs and Embed Coral examples | Library documentation, API, and consumer checks |
| Authoring rules | `dev/documentation-style.md` | Markdown lint, documentation checks, and review values named there |
| Historical lifecycle | Archive index and approved dispositions | Contributor contract and current-link resolver |

## Page lifecycle

New public guidance goes under the audience whose reader performs the task.
Lookup records belong in `reference/`; one ordered task belongs in `how-to/`;
each audience has at most one `get-started.md`. Every public page ends with a
Related section so readers can move without search.

The root README routes audiences rather than duplicating their facts. Optional
hooks, coding-agent tooling, and local integrations can point to the durable
rules but are not contributor prerequisites or documentation authorities.

## Current records and history

Active release evidence stays under `dev/releases/<version>/`. After a release
is complete and archival is approved, its evidence moves as one recoverable
Git unit under `dev/archive/releases/<version>/`; the archive index and every
live pointer change in the same patch. Historical text is not rewritten to
current terminology or tool versions.

Behavioral designs remain current under `dev/designs/` after implementation.
Release-specific closure designs move with their release. Status metadata may
be corrected without rewriting the design substance.

## Validation ownership

`npm run check:docs` composes the user page/feature/figure check, library
README/example/package check, contributor route and hygiene contract, and
current-link resolution. VitePress and static builds prove emitted routes.
Slice 77 closes final whole-corpus Markdown semantics after the Slice 75
implementation handoff; Slice 80 owns final registry, deployment, platform,
performance, and release claims.

## Related

- [Contribute to Coral](../index.md)
- [Testing](testing.md)
- [Generated assets and dependencies](generated-assets-and-dependencies.md)
