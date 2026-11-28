# Render API

Use the render package for DOM-free registries, deterministic text measurement,
layout, SVG or standalone HTML serialization, and paginated or comment-ready text.

| Entry point | Main exports | Boundary |
| --- | --- | --- |
| `@coral-viz/render` | shapes, symbols, notations, text metrics, `renderSvg`, `renderHtml`, `renderText`, `renderTextGraph` | Serializes supplied geometry or lays out text |
| `@coral-viz/render/layout` | `computeElkLayout`, `resolveSpatialLayout`, option normalization, layout diagnostics | Computes and resolves geometry |
| `@coral-viz/render/svg-layout` | `layoutGraphForSvg` | Lays out a validated graph for `renderSvg`: sequence graphs keep their interaction without ELK; other graphs get ELK positions and routes |
| `@coral-viz/render/artwork-import` | `prepareSvgIconImport029`, `checkSvgIconBounds029`, `ICON_IMPORT_LIMITS_029` | Bounds SVG normalization and reports import measures; supply a bounds engine before previewing. It does not provide storage or a browser worker. |

## Geometry and spatial behavior

`renderSvg` and `renderHtml` don't run layout. Call the layout subpath, then
apply positions, dimensions, and route sections before rendering. The root
renderer rejects unresolved label placement and route intent rather than
pretending it resolved them.

The layout API supports `layered`, `mrtree`, `stress`, `force`, `radial`,
`box`, and `fixed`; four directions; three routing styles; and nested or
separate hierarchy handling. Invalid options produce `layout.option.invalid`.
Execution, ports, spatial constraints, routes, and worker fallback have their
own closed `LayoutDiagnosticCode` values.

GraphIR 3.0 Exact positions, required/preferred spatial constraints, and route
intent are current. Durable conversational relations such as “keep these
services near each other” aren't a separate persisted 0.2.5 intent model.

The 0.2.8 source path exposes `parseInstalledDocument028`,
`projectInstalledSourceToSuccessor028` and `printSuccessorSource028` at the
root.
Use the successor projection for portable typed spatial constraints and finite
layout controls. `printSuccessorSource028` verifies its supported subset before
returning canonical source; preserve the original text for exact source saves.
A successor-only source document withholds the legacy `document.graph` rather
than returning a GraphIR 3 graph that has lost its spatial meaning.

Derived display fields such as `labelBounds028` are transient geometry. Keep
them out of portable exports. Browser source rendering follows this shared
source-to-scene path and returns the faithful portable `sourceGraph`.

## Character output

Call `await renderText(source, options)` to lay out saved Coral source as text.
Use `renderTextGraph(graph, options)` for GraphIR 3 input. The browser ESM and
the standalone `Coral.renderText` entry accept the same source and options.

The default document profile emits printable ASCII on US Letter pages of up
to 72 columns by 55 lines. Choose `page: 'a4'` for 60 lines or set
`pageWidth` and `pageHeight` for custom pages. A form feed and the selected
line ending separate pages. Follow matching lettered markers across pages.
The result includes `text`, individual `pages`, `pageCount`, `continuationLinks`,
`profile`, effective `charset`, occupied `width` and `height`, and `diagnostics`.

For source comments, select `profile: 'comment'`. The default is compact
UTF-8 box drawing at 80 columns. Set `commentStyle` to `slash`, `hash`, `dash`,
`block-c`, `html`, or `none`. A custom `commentPrefix` counts toward `columns`.
The renderer separates closing delimiters inside the comment body.

Both profiles support architecture, infrastructure, flowchart, ERD, UML
sequence, UML state, UML class, block, BPMN, AI/ML, data engineering, code,
and sketch. Positions guide relative order. Visual
styles and custom symbol artwork produce diagnostics. Set `strict: true` to
refuse lossy output. Long labels wrap or appear in a keyed legend. A structure
that cannot fit raises `TextRenderError` with code `text.width.unfit`.

Controlled displays can request `charset: 'monotrue-v1'` with the MonoTrue
v0.2.0 Regular SHA-256 and verified glyph roles. An absent or mismatched
capability selects ASCII for the whole output.

The legacy `renderInstalledCharacterPreview028`, `renderCharacterGraph028`,
`adaptCharacterGraph028`, and `createCharacterDebugView028` exports are
deprecated and unsupported.

## Explicit conformance reports

`checkInstalledSuccessorSourceConformance028` checks saved Coral source without
rewriting it. A requested level overrides the saved level for that call only.
`checkGraphConformance028` checks deliberate GraphIR input separately.

The ten approved visual profiles use versioned bounded rule inventories.
`report.ruleset.scope === 'coral-bounded-profile'` qualifies a successful strict
claim: it proves only that Coral inventory, never full ISO/UML/BPMN conformance.
State keeps a partial card with a named inventory-evidence obligation. Reports
retain independent integrity/capability errors and applicable direction/port/
scene uncertainty. Notice filtering does not change full findings or claim status.

The bounded strict inventories are:

| Profile | Checks and limits |
| --- | --- |
| Block, Architecture, AI/ML, Code, Data Engineering, Sketch | Shared symbol membership, with independent integrity and capability checks. No additional notation rules. |
| Flowchart | One decision entry and at least two possible exits. Labels do not prove logical branch exclusivity. |
| BPMN | Explicit registered connector relations, Sequence Flow endpoint kinds, concrete event kinds and root Start/End Sequence Flow connection rules. Process/pool/lane ownership is outside this inventory. |
| UML Class | Authored inheritance ends use an open triangle at the general classifier. Wider UML class constraints are outside this inventory. |
| UML Sequence | Explicit message types use the supported vocabulary and agree with operator-derived kinds. Source lifecycle integrity remains independent. |
| UML State | Partial card; the complete bounded notation-rule inventory is unverified. Character subset admission does not certify state conformance. |

Every row also retains shared symbol checks and applicable independent
integrity/capability findings. Only an explicit strict check can certify the
complete bounded cards; save/render success never certifies them.

## Fonts and deterministic output

The default SVG path embeds one 400-weight Inter face (48,256 bytes). Supplying
font settings, `fontWeight`, or `lineHeight` enables portable font resolution;
`fontFamily` or `fontSize` alone doesn't. Portable output embeds each used
family/weight request. Current variable-font assets can embed the same file
twice when both 400 and 700 are requested.

The four packaged fonts contain the pinned Latin range, not arbitrary Unicode.
Unsupported characters can affect both glyph fallback and measured geometry.
Coral disables kerning, optical sizing, ligatures, and related shaping features
for deterministic measurement.

The render tarball carries four OFL-1.1 notices under `third_party/fonts/` for
the sans, serif, monospace, and handwritten assets. Applications that
redistribute the rendered package or its assets must preserve applicable
notices.

## Related

- [Render a diagram](../how-to/render-a-diagram.md)
- [Language API](language-api.md)
- [Viz API](viz-api.md)
- [Export a diagram](../../use/how-to/export-a-diagram.md)

The CLI accepts the same custom document dimensions through `--page-width`
and `--page-height`. Supply `--monotrue-capability FILE` with a JSON
`MonoTrueCapability` when using a verified MonoTrue display. The engine checks
its Regular face, SHA-256 and complete role list before emitting MonoTrue.
