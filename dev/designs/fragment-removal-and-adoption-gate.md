# Fragment removal and extraction-adoption gate

Status: accepted after independent review pass 2

Implements R-012, R-030, and R-031 AC-4. The design removes private owners that
were extracted but never adopted, preserves public compatibility, and makes
future extraction claims observable without turning static analysis into a
new source of release noise.

## Ownership and control flow

The current `App` and its mounted panes are authoritative. The disconnected
`useDslEditor`, `useDiagramLayout`, `useInspector`, and
`useKeyboardShortcuts` generations are deleted rather than upgraded. Slice 40
will extract boundaries from live state. `useLlmChat` remains the only editor
generation owner; `useGenerate` and the misleading private LLM barrel are
deleted. `BottomPanel` owns `DiagnosticEntry`, because it renders those values,
and `turnCount` follows the existing App → EditorPane → BottomPanel prop path.

A private removal is allowed when reference inspection shows no non-test
production caller or when a mounted newer implementation is documented as its
owner. Test-only reachability does not keep a superseded implementation alive.
Behavioral tests and manual utilities are retargeted to the current owner;
only tests whose entire subject disappears are removed. Because the three live
provider utilities are intentionally excluded from Vitest and the application
TypeScript project, `tsconfig.manual.json` and `typecheck:manual` compile them
without executing their provider calls; `@types/node@24.13.3` is a direct
development dependency for their environment.

## Published compatibility

Render default exports that cannot cross the package export map and YAML files
excluded from the package payload have no public owner and may be deleted.
Viz types or re-export statements may change only when the built four-entry
declaration surface is unchanged and the 0.2.3 additive API gate passes.
`DiagramNodeData` remains internally live and loses only an unnecessary export.
`@xyflow/system@0.0.82` becomes a direct dependency because its types appear in
the published `useAxisConstrain` declaration; this removes reliance on npm
hoisting without changing runtime behavior. ELK algorithms and layout behavior
do not change in this slice.

## Gates and failure behavior

Diagram-editor coverage uses the existing all-source model and the R-030 floor:
80% statements, lines, and functions; 75% branches. No new exclusion is
permitted. If deletion does not raise the remaining function metric, focused
tests cover live behavior. Enforcement RED uses a temporary threshold above
the measured result; the committed threshold is the requirement floor.

Knip 6.35.1 runs from a checked-in configuration and script. Its CI step is
explicitly non-blocking (`continue-on-error`) because public consumer surfaces
and tests create intentional export findings that require human
classification. A report failure is visible but does not replace typecheck,
API compatibility, coverage, or code review. The slice itself records and
dispositions findings in scope.

Strict no-unused compilation follows diagram-editor source aliases into other
packages with known existing findings. Slice acceptance therefore requires no
diagnostic rooted under `packages/diagram-editor`, plus the unchanged normal
workspace typecheck; it does not claim global strict cleanliness.
No-unused failures and reference census results are deletion/refactoring
evidence, not protocol RED. Missing behavior is demonstrated only by failing
tests for turn-count forwarding, direct dependency declaration, and coverage
enforcement.

The execution protocol adds one question for commits described as extracting,
adopting, migrating, or replacing: identify a non-test production caller and
either remove the superseded path or name its owning follow-up. A missing
answer blocks slice acceptance; it does not prescribe module size or force an
abstraction.

## Compatibility, accessibility, privacy, and performance

No persisted format, parser, provider request, telemetry, cancellation, stale
result, or accessible editor contract changes. Removed UI is unmounted. The
only visible change is the existing AI turn count becoming connected. Native
editing and keyboard behavior remain covered by the editor browser flow.
Deletion reduces shipped app source; Knip is development-only and never enters
a package artifact.

## Alternatives rejected

- Upgrading the four stale hooks would reconcile two generations and create
  risk before Slice 40; extracting anew from live state is smaller and safer.
- Changing MCP `box` would remove valid ELK behavior and is excluded.
- Making Knip blocking now would confuse intentionally public exports with
  fragments; reporting plus review supplies signal without a false gate.
- Deferring editor coverage again would allow test-only dead code to inflate
  the metric; cleanup and the package-wide gate belong in one slice.

## Traceability

| Requirement | Evidence |
| --- | --- |
| R-012 | full editor unit suite and focused Chromium editor flows |
| R-030 | all-source diagram-editor coverage and root coverage gate |
| R-031 AC-1–4 | strict no-unused/reference census, pane tests, turn-count forwarding test, manual-script typecheck |
| Slice 10 compatibility | public declaration comparison, `api-compat`, React consumer smoke, package build |
| Adoption protocol | protocol diff plus pinned non-blocking Knip CI execution |
