# Coverage

Reference measurements and coverage-floor rationale for Coral workspaces.

| Record | Purpose |
| --- | --- |
| Baseline | Preserve comparable package measurements and their enforcement boundary |

Every package sets `coverage.all: true` and an explicit `coverage.include`, so
these numbers describe **all** source files. Figures reported before 0.2.2
counted only files a test happened to import and were not comparable —
`@coral-viz/mcp-server` in particular reported 81% while describing two of its
eight source files.

## Baseline at the start of 0.2.2 (`92dc769`)

| Package | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `@coral-viz/language` | 88.47% | 79.44% | 96.29% | 92.94% |
| `@coral-viz/viz` | 69.97% | 54.35% | 67.19% | 70.63% |
| `@coral-viz/diagram-editor` | 52.72% | 54.31% | 44.93% | 53.51% |
| `@coral-viz/mcp-server` | 5.22% | 8.39% | 10.58% | 5.45% |

## Latest recorded measurements

Slice 40 implementation on 2026-09-10 refreshed diagram-editor after live
shell-state extraction; the other rows retain their most recent accepted
measurements. The supporting historical records are
`dev/archive/releases/0.2.4/status/slice-40.md` and
`dev/archive/releases/0.2.4/status/slice-c20.md` in the repository.

| Package | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `@coral-viz/language` | 90.40% | 82.91% | 95.87% | 94.17% |
| `@coral-viz/render` | 96.31% | 80.53% | 96.49% | 95.96% |
| `@coral-viz/viz` | **87.42%** | **79.11%** | **88.53%** | **88.31%** |
| `@coral-viz/diagram-editor` | **88.13%** | **80.77%** | **84.98%** | **89.84%** |
| `@coral-viz/mcp-server` | **92.63%** | **82.13%** | **95.29%** | **92.23%** |

## The release target

80% statements, lines and functions and 75% branches, for `@coral-viz/viz`,
`@coral-viz/mcp-server`, and `@coral-viz/diagram-editor`. The two published
packages have enforced the target since 0.2.3. Slice 35 adds the private editor
after removing superseded code; thresholds live in each package's Vitest
configuration and `npm run test:coverage:gate` runs them in CI.

Getting there was more work than the target implied. `@coral-viz/mcp-server` began
at 5.22%; retiring the forked renderer and the duplicate converter removed
roughly 800 untested lines, but `explain.ts` (473 lines) and `generate.ts`
(282 lines) were untested and were not covered by any planned deletion, so they
needed tests written rather than code removed. `@coral-viz/viz` began at 69.97%
with eight components in its public surface sitting between 4% and 20% —
`CoralEditor`, `SplitEditor`, `TextEditor`, `FileControls`, `LayoutControls`,
`SettingsPanel`, `FontSettingsForm` and the legacy node set.

`@coral-viz/language` and `@coral-viz/render` comfortably exceed the target but
are not gated, because the target was written for the two packages above.
`@coral-viz/diagram-editor` is not published. Its pre-Slice-35 measurement was
84.03% statements, 78.13% branches, 79.32% functions, and 85.48% lines at
`5ecc2b9`; removing unreachable production owners is expected to lift the one
remaining metric without adding tests for dead behavior. If it does not, Slice
35 adds focused tests for live behavior rather than lowering or excluding the
target. Slice 40 retains the package gate and enforces the same floor per file
for `useEditorController.ts` and `editorRevision.ts`.

## Related

- [Testing](testing.md)
