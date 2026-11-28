# Coral 0.2.17 release plan

## Scope and authorization

The owner authorized preparing **Coral 0.2.17** on `dev/0.2.17` from published
`0.2.15` (`78b1c4cc`), leaving published `0.2.15` and the draft
`release/0.2.16` worktree untouched. Release `0.2.17` folds in the unimplemented
`0.2.16` draft release plan alongside Edition `0.2.17` visual UML State and the
Mermaid-to-Coral transpiler, delivering four coordinated capabilities:

- **Standalone `coral` CLI (`bin.coral` on `@coral-viz/render`)**: keeps the
  six-package `expectedPackages` inventory closed while exposing `coral
  validate [file]`, `coral render --format svg|html|ascii [file]`, and `coral
  convert --from auto|coral|mermaid|dot|plantuml --to coral|json [file]` via a
  dedicated Node entrypoint (`dist/cli.js`) with stdin (`-` or omitted),
  strict exit codes (`0`/`1`/`2`), and zero partial stdout on failure.
- **Gate 1 documentation audit & Gate 2 executable smoke**: reconciles
  `docs/use/reference/{capabilities,notations,conversion-support}.md`,
  `docs/embed/{index,reference/mcp-server}.md`, package READMEs,
  `scripts/capability-truth.test.mjs`, `scripts/fixtures/capability-matrix.json`,
  and `scripts/library-docs.test.mjs` with shipped `0.2.14` and `0.2.17`
  capabilities and public `npx` workflows, and exercises npm's resolved
  `node_modules/.bin/coral` and `node_modules/.bin/coral-mcp` executables
  (verifying every stdout frame as MCP JSON-RPC) in `scripts/consumer-smoke.mjs`.

- **Saved-source edition `0.2.17` visual and hierarchical UML State**
  (`@diagram uml-state` with `@coralVersion "0.2.17"`): adds `uml-state@1.1.0`
  with 8 visual symbols (`state`, `composite`, `initial`, `final`, `choice`,
  `fork`, `join`, `note`), nested composite states, `[description]`, `[style]`,
  `[annotation]`, `layout`, `lowfi`/`hifi`/`anemone` rendering, and the
  `0.2.17` U2 `uml-state` conformance ruleset. Frozen `0.2.8`, `0.2.9`, and
  `0.2.14` catalogs and `uml-state@1.0.0` character-only behavior remain
  immutable. See `dev/designs/uml-state-visual-support.md`.
- **Deterministic zero-LLM Mermaid.js-to-Coral transpiler (Phases 1A–1C)**:
  adds `'inheritance'` to `KNOWN_RELATIONS_0214['uml-class']`, updates
  `detect.ts` for all 30 Mermaid.js diagram headers, implements the 5-stage
  transpiler in `@coral-viz/language` (`transpileMermaidToCoral`) and Stage 4B
  verified wrapper in `@coral-viz/render` (`transpileAndVerifyMermaidToCoral`)
  covering Flowchart, Sequence, Class, ER, and State (defaulting to Edition
  `0.2.17` visual UML State with `'0.2.8'` retained as opt-in), wires MCP
  `coral_convert`, and adds explicit zero-LLM "Convert to Editable Coral" UI
  with pre-commit loss review and single atomic Undo in
  `@coral-viz/diagram-editor`. See `dev/designs/mermaid-transpiler/`.

## Independent identities

- Package and hosted application version: `0.2.17`.
- Language Specification: `1.3.0`.
- Saved-source editions: `0.2.8`, `0.2.9`, `0.2.14`, and additive `0.2.17`
  (`uml-state@1.1.0`).
- External dependencies: `@graph-ir/core@0.2.4` and `libavoided-js@0.1.3`.
- Build runtime: Node.js `26.8.2`, npm `12.0.2`, TypeScript `6.0.3`.
- Minimum published consumer runtime: Node.js `24.19.0`.

Frozen `0.2.8`, `0.2.9`, and `0.2.14` catalogs remain byte-identical. Browser
IIFE gzip remains strictly below the 800 KiB (`819,200` B) hard ceiling.

## Verification and promotion

Local verification runs `npm run check:toolchain`, `npm run build`, browser
bundle size verification (`<= 800 KiB` gzip), and full `npm run verify`
(`node scripts/ci-local.mjs`) on `dev/0.2.17`. Remote push, CI dispatch,
registry publication, Pages deployment, and GitHub release remain gated on
explicit owner authorization.
