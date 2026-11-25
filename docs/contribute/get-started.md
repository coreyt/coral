# Get started with Coral

Install a clean Coral checkout and run the local verification chain. Browser,
delivery and controlled performance checks have separate commands.

For language work, begin with [Specification 1.3.0](../embed/reference/language-specification-1.3.0.md)
and the [evolution policy](reference/language-evolution.md).

## Before you start

- Use Git and a clean clone or dedicated worktree. Keep concurrent slices in
  separate worktrees and do not mix another contributor's changes into yours.
- Release development uses Node.js 26.8.2 and npm 12.0.2. Node.js 24.19.0 is a
  consumer compatibility control, not the release-development toolchain.
- Python 3 and platform C/C++ tools are conditional native-build prerequisites.
  Repository hooks, coding-agent integrations, and local protocol integrations
  are optional and not required.

## 1. Confirm the checkout boundary

From the repository root, inspect the worktree before installing anything:

```sh
git status --short
```

A clean checkout prints no entries. In an assigned worktree, every listed path
belongs to the work you intend to preserve.

## 2. Select the release toolchain

Activate Node.js 26.8.2 with your normal version manager, then install and
check the exact npm version:

```sh
npm install --global npm@12.0.2
npm run check:toolchain
```

The check reports Node 26.8.2 and npm 12.0.2 as the verified release
toolchain.

## 3. Install the locked dependency graph

Install from the root lockfile without updating it:

```sh
npm ci
```

npm completes with the 7 workspaces linked and `package-lock.json`
unchanged. If the native grammar must compile locally, install Python 3 and
the platform C/C++ toolchain named by the native-build error, then repeat the
command.

## 4. Verify the checkout

The release branch pins published `@graph-ir/core@0.2.4` exactly in every
direct consumer manifest and the lockfile. Confirm the registry-backed install with:

```sh
npm ls @graph-ir/core
```

Then run the repository's ordered verification chain:

```sh
npm run verify
```

The command then exits successfully after the toolchain, policy, lint,
documentation, type, build, unit, and release-contract gates pass. Do not use
a local or no-save GraphIR substitution to manufacture a green checkout.

## What you built

A dependency-locked Coral development checkout on the release toolchain, with
the local checks separated from browser, delivery and performance verification.

## Related

- [Testing](reference/testing.md)
- [Architecture](reference/architecture.md)
- [How to build and preview](how-to/build-and-preview.md)
