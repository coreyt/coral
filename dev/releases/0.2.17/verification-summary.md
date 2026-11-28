# Coral 0.2.17 local verification summary

The original pre-text-renderer local verification completed on `dev/0.2.17`,
branched from released `0.2.15` commit `78b1c4cc`, with Node.js `26.8.2`,
npm `12.0.2`,
TypeScript `6.0.3`, and `@graph-ir/core@0.2.4`.

## Original consolidated baseline gates

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

## Original promotion status

Remote push, final-candidate GitHub Actions CI dispatch, npm publication,
GitHub Pages deployment, and GitHub release creation were intentionally not
executed.

## Candidate consolidation and capability audit

The audit covers the consolidated `dev/0.2.17` worktree based on `db0eb06a`.
It includes both renderer phases, surface integration, and roadmap updates.

1. **Consolidation.** The branch contains the standalone CLI, documentation
   reconciliation, Edition 0.2.17 visual UML State, Mermaid transpiler, Anemone
   v2 and Parrotfish classic. The relevant commits are `21e03ccf`, `d2acb26e`,
   `d71426d3`, and `a0929904`. The old `release/0.2.16` worktree retains an
   untracked draft release plan. Earlier experiment branches retain their own
   scope and history. Consolidation here covers the approved 0.2.17 product.
2. **Text rendering.** Phases 1 and 2 implement all thirteen notations with ASCII,
   `utf8-box`, and verified MonoTrue Regular output. Letter/A4/custom pages,
   comments, continuations and all AC-1 through AC-9 have automated coverage.
   Valid MonoTrue needs the exact capability described in the design. An
   unavailable or invalid
   capability produces ASCII and a diagnostic.
3. **Mermaid conversion.** Flowchart, Sequence, Class, ER and State use the
   same verified transpiler in the API, CLI, MCP and editor. The retained
   60-case benchmark records 60 successful renderings and 41 lossless
   conversions. Conversion diagnostics remain part of the contract. Additional
   Mermaid families have detection and unsupported-family diagnostics. The
   editor file-open path uses that same transpiler for sequences. Lossless
   imports open as verified Coral. Lossy or refused inputs retain exact Mermaid
   source for explicit review and conversion.
4. **Editor readiness.** Unit coverage includes export/copy controls,
   loss review, failed conversion, atomic conversion and Undo. Real Chromium
   checks cover TXT download, Unicode/ASCII clipboard output and five-family
   Mermaid conversion. The targeted 63-case browser suite passes, followed by
   ten repetitions each of the three formerly intermittent cases with four
   workers and zero retries (30/30 passed).
5. **Roadmap.** `dev/ROADMAP.md` now maps all ten ranked market priorities to
   the proposed release train and records the input branch, commit and file
   paths. It includes purposeful payload measurement and budgeting. Those
   future allocations need implementation plans and their own verification.

### Surface capability boundaries

| Capability | API | CLI | MCP | Editor |
| --- | --- | --- | --- | --- |
| Seven-family ASCII / Unicode text | Yes | Yes | Yes | Yes |
| Verified MonoTrue capability | Option object | JSON capability file | Option object | Two standard charsets in UI |
| Text pagination and diagnostics | Structured result | Text and stderr | Structured result | Preview and notices |
| Custom text dimensions | Options | Width and height flags | Options | Letter/A4 and comment widths |
| GraphIR 3 text input | Graph function | Saved Coral source input | Graph or source input | Current Coral source |
| Five-family Mermaid conversion | Verified function | Convert command | Convert tool | Reviewed conversion with Undo |
| Validate / conformance / layout | Library functions | Validate and render workflow | Dedicated tools | Live diagnostics and Reflow |
| Semantic edit plans | Editor-owned executor | Future work | Future work | Review and atomic apply |

The browser ESM and IIFE expose `renderText` with the API's source/options
contract. The IIFE is 827,550 bytes at gzip level 9.
The owner-approved IIFE ceiling is 835,584 bytes (816 KiB).

### Current local verification

- The final `npm test` passed all workspaces and native/packed grammar checks.
  The render workspace passed 3,170 tests, the browser workspace passed 354,
  and the editor workspace passed 2,294 with one existing skip.

- `npm run verify` passed after the owner-approved bundle update, including
  source and contract suites, public build, workspace types, coverage gates,
  native grammar/parity and packed language checks.
- Seven new Chromium acceptance tests passed for TXT download, Unicode and
  ASCII clipboard output, and editor/API conversion equality for all five
  supported Mermaid families.
- The final CLI regression file passed 10 tests, including all three text
  charsets, custom page dimensions and malformed capability-file refusal.
- The surface parity file passed 5 tests, including browser ESM/IIFE,
  real CLI execution, MCP structured metadata and editor controls.
- `npm run api-compat`, `npm run check:docs`, `npm run lint` and
  `npm run lint:md` passed after the audit changes. ESLint reports 125
  warnings and zero errors. The corpus audit passed all 21 tests.
- The earlier local delivery integration passed reproducible builds and
  Chromium API search, including the deprecated legacy export.

The focus fix initializes dialogs in their open autofocus event and prevents
closing dialogs from stealing focus from a newly opened modal. The connector
inspector test selects its edge through the keyboard, avoiding a stale
coordinate after asynchronous Fit. The full browser suite passes all 281 tests
with four workers and zero
retries. The final editor artifact also passes 30 repeated checks of the
formerly intermittent cases.
Cross-platform installed
consumer smoke and final-candidate remote release checks remain separate
acceptance evidence.

## Final implementation scope

All thirteen text notation adapters are implemented. Sequence file opening
uses the shared verified Mermaid transpiler. The full local verifier passed
coverage, native and packed-consumer gates. Final-candidate CI and publication
use the retained exact-SHA artifacts through the repository release workflows.
The owner authorized commit, push, publication and closure. Browser payload
measurement and budgeting carry forward to the 0.2.18 roadmap.
