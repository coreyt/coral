# Structured editor foundation

Status: implemented in 0.2.4 Slice 30
after three design-review rounds.

## Decision and ownership

`@coral-viz/viz/text-editor` owns one controlled native-textarea foundation.
Its public `value`/`onChange` contract and existing props remain valid. The
legacy `errors` prop keeps its one-based column convention. Distinct additive
`diagnostics` and `decorations` props use absolute, zero-based, UTF-16 half-open
offsets. `analysisOwner: { source, language }` identifies the controlled text
and format that produced them. The private diagram editor adopts this component
instead of maintaining another textarea.

The language package owns diagnostic source truth. `SourcePosition` remains a
one-based line, zero-based column, absolute UTF-16 offset. `Diagnostic` gains an
optional immutable half-open range `{ start, end }`; `position` remains the
range start for compatibility. Parser callsites compute exact ends. A helper
may infer a range only after verifying that the proposed source slice occurs
exactly at the computed raw-line offset, including indentation; otherwise the
diagnostic remains positioned but rangeless. Start/end offset, line, and column
must agree in UTF-16 units. Unknown and line-only editor diagnostics remain
legal.

`diagram-editor/src/editorAnalysis.ts` owns pure occurrence extraction. It
accepts source, format, and successfully parsed nodes/edges, and emits
non-overlapping half-open decorations. It recognizes only tokens already
accepted by the corresponding app parser:

- Coral: a declaration's quoted label token and accepted explicit `as` ID token
  use the actual parsed node ID. An omitted ID uses the parser-allocated node in
  source/preorder. A duplicate/degraded explicit ID is not decorated because it
  does not identify that node. Nested declarations follow preorder. Quoted IDs
  are decoded for identity comparison while the complete quoted token range is
  retained. Only edge endpoint tokens whose decoded IDs equal parsed endpoints
  are marked.
- Mermaid: explicit declaration IDs and parsed edge endpoint IDs are marked.
  Labels, directives, class/style statements, comments, and ignored lines are
  not. Slice 30 does not turn intentionally ignored Mermaid syntax into new
  errors.

Neither extractor searches arbitrary prose or label occurrences.

## Rendering and control flow

The textarea stays the only editable text surface. A sibling `pre`, with the
same font, padding, tab size, dimensions, and wrapping mode, renders escaped
text split into spans. Its glyphs are transparent; entity backgrounds and error
underlines remain visible beneath the transparent textarea background. The
overlay is `aria-hidden` and ignores pointer events. An additive `wrap` prop
preserves the public component's current soft-wrap default; `EditorPane` passes
`wrap="off"` so logical lines and gutter rows stay aligned. In soft-wrap mode,
markers remain an accessible ordered gutter list without claiming pixel
alignment to a logical row. Input, selection, clipboard, native undo, and
composition remain browser-native.

Every error has a keyboard-focusable marker in a compact gutter. Its accessible
name and tooltip contain the complete message; hover and focus display the
tooltip. A ranged diagnostic underlines the exact range. A known but invalid
line is clamped to a real logical line. A diagnostic with no known line uses an
editor-level marker and is never assigned a guessed line. Multiple errors are
not collapsed.

Scrolling copies `scrollTop` and `scrollLeft` to the text overlay but only
`scrollTop` to the marker gutter. Decorations render only when
`analysisOwner.source === value` and its language matches the current language;
otherwise the overlay is empty during the debounce window. App commit guards
reject late parse/layout results and commit analysis plus owner together.

A sibling React error boundary contains only overlay/marker rendering and
falls back to `null`; the textarea and external diagnostics surface remain
mounted. Invalid ranges are discarded inside that isolated subtree. Diagnostic
underlines take precedence over entity backgrounds when ranges overlap.

Entity colors use a stable UTF-16 ID hash mapped into fixed light/dark palettes.
The same ID selects the same palette slot in both themes. Palette tests require
text against the highlight fill at 4.5:1, a 3:1 entity indicator edge against
the editor background, a fill/background ratio of at least 1.5:1, and a 3:1
error squiggle against the editor and every entity fill.

## Preferences, compatibility, and performance

`UserPreferences.editorEntityHighlighting?: boolean` is optional for additive
0.2.x source compatibility. Its default is `false`; loading normalizes with
`=== true`, so old saved preferences remain disabled. The preference is local
UI state rather than document state. Disabled mode does not call the occurrence
extractor and renders no entity spans.

No editor dependency is added, avoiding a new peer or lockfile change and a
dependency-driven bundle expansion. Slice 30 records a browser
`performance.now()` sample from input until
the expected decoration is observable for Slice 60; this is a baseline rather
than a new release threshold.

## Alternatives

CodeMirror and Monaco would add a large dependency and change native-input
behavior before a measured need. A contenteditable surface would require custom
selection, undo, paste, and IME ownership. Both are rejected. Absolute
per-token geometry is rejected in favor of a text-flow overlay.

## Traceability

| Requirement | Evidence |
| --- | --- |
| R-036 AC-1 | language diagnostic/range tests; Coral and Mermaid adapter tests |
| R-036 AC-2 | range, multiple-marker, hover/focus, fallback, and isolated-failure tests |
| R-036 AC-3 | occurrence token matrix; palette contrast, theme, and overlap tests |
| R-036 AC-4 | preference default/load/UI tests; disabled extractor spy; owner/stale-result tests |
| R-036 AC-5 | native input/selection/undo/paste/composition tests; Playwright scroll/format/theme flows and paint baseline |
| Compatibility | Slice 10 API/declaration comparison and React 18.3/19 consumers; no dependency change |
