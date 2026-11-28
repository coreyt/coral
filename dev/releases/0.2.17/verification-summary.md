# Coral 0.2.17 local verification summary

Local pre-publication verification completed on `dev/0.2.17` (branched from
released `0.2.15` commit `78b1c4cc`) with Node.js `26.8.2`, npm `12.0.2`,
TypeScript `6.0.3`, and `@graph-ir/core@0.2.4`.

## Verified gates

| Gate | Result |
| --- | --- |
| `npm run check:toolchain` | Passed (Node `26.8.2`, npm `12.0.2`) |
| `npm run check:workflow-policy` | Passed |
| `npm run lint` (`eslint .`) | Passed (0 errors) |
| `npm run lint:md` (`markdownlint-cli2`) | Passed (0 issues across 160 files) |
| `npm run test:markdownlint` | Passed (70/70) |
| `check-docs-structure.mjs` & `check-markdown-links.mjs` | Passed (56 pages, 24 features) |
| `npm run audit:dependencies` | Passed (`highOrCritical: 0`) |
| Source & contract script suites (`api-compat`, `release-version`, `capability-truth`, `library-docs`, `coral-corpus`, `fuzz-model`, `verify-language-spec`, `verify-graphir-adoption`) | Passed |
| `@coral-viz/language` (`test:run`) | Passed (44/44 files, 1,716/1,716 tests) |
| `@coral-viz/render` (`test:run`) | Passed (139/139 files, 3,117/3,117 tests, including `cli.test.ts` 9/9, `parrotfish0214.test.ts` 11/11, `edition0217StateVisual.test.ts` 6/6, and `mermaidTranspileVerify.test.ts` 11/11) |
| `@coral-viz/browser` (`test:run` + gzip gate) | Passed (21/21 files, 354/354 tests; IIFE `gzip -9` = `818,215` B < `819,200` B / 800 KiB) |
| `@coral-viz/viz` (`test:coverage`) | Passed (51/51 files, 922/922 tests) |
| `@coral-viz/mcp-server` (`test:coverage`) | Passed (23/23 files, 455/455 tests) |
| `@coral-viz/diagram-editor` (`test:coverage`) | Passed (138/138 files, 2,289 passed, 1 skipped) |
| `tree-sitter-coral` native build, corpus, `test:parity`, and `verify-packed-tree-sitter.mjs` | Passed (136/136 parity tests) |
| `scripts/verify-packed-language.mjs` | Passed |
| `npm run smoke:consumer -- --cases=render,mcp-server` (Gate 2 npm bin resolution for `coral` and `coral-mcp` + `installed-renderer`) | Passed on `linux-x64` |
| 60-diagram real-world Mermaid.js complexity-stratified corpus (12 each: Flowchart/FlowSight, Sequence, Class, ER, State) | Passed: 60/60 `mermaid.js` Chromium render, 60/60 Coral transpilation (41/60 lossless), 60/60 Coral `anemone` SVG render + Chromium DOM bbox check |

## Pending owner-gated steps

Remote push, final-candidate GitHub Actions CI dispatch, npm publication,
GitHub Pages deployment, and GitHub release creation were intentionally not
executed.
