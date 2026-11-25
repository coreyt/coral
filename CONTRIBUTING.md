# Contributing to Coral

Thank you for your interest in contributing to Coral. This repository is
Apache-2.0 licensed and hosts the Coral DSL parser, deterministic layout and
SVG renderer, browser bundle, React editor components, MCP server, Tree-sitter
grammar, and web editor.

## Getting started

Read the [contributor setup guide](docs/contribute/get-started.md) for the
exact Node.js and npm toolchain, workspace installation steps, and local
verification workflow.

- [Architecture overview](docs/contribute/reference/architecture.md) explains
  the workspace package boundaries.
- [Testing and verification](docs/contribute/reference/testing.md) lists local
  unit, contract, end-to-end, and consumer smoke checks.
- [Build and preview](docs/contribute/how-to/build-and-preview.md) covers
  running the documentation site and web editor locally.
- [Language evolution policy](docs/contribute/reference/language-evolution.md)
  defines how Coral syntax and edition changes are reviewed.

## Toolchain

Coral builds and validates with Node.js `26.8.2` and npm `12.0.2`. Published
packages retain Node.js `24.19.0` as their minimum consumer runtime.

```sh
npm run check:toolchain
npm ci
npm run verify
```

## Pull requests

1. Open an issue first for substantial features, new diagram notations, or
   language syntax changes.
2. Keep pull requests focused and include unit or end-to-end tests covering new
   behavior or bug fixes.
3. Run `npm run verify` locally before opening a pull request.
4. Follow the [documentation authoring style](dev/documentation-style.md) when
   editing Markdown files; run `npm run lint:md` and `npm run check:docs` to
   verify formatting and links.

## Code of Conduct

All contributors and community participants are expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Do not open public issues for security vulnerabilities. Follow the private
reporting process in [SECURITY.md](SECURITY.md).
