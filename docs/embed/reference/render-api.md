# Render API

Use the render package for DOM-free registries, deterministic text measurement,
layout, SVG or standalone HTML serialization, and bounded character output.

| Entry point | Main exports | Boundary |
| --- | --- | --- |
| `@coral-viz/render` | shapes, symbols, notations, text metrics, `renderSvg`, `renderHtml` | Serializes supplied geometry |
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

`renderInstalledCharacterPreview028(source, { columns: 120 })` reads current
Coral source and returns `text`, `charset`, `width`, `height`, `diagnostics` and
a copied GraphIR 3 display `graph`. Saved source remains authoritative. The API
validates its exact successor/catalog and U1/U2 before composing a picture.
`renderCharacterGraph028` retains the strict Block/Flowchart ledger contract.

| Family | Character subset |
| --- | --- |
| Block | Flat generic blocks and directed captioned connections |
| Flowchart | Start/end, process, decision, branches and feedback |
| BPMN | Flat none start/end events, tasks, exclusive gateways and Sequence Flow |
| UML Class | Flat classes, supported compartments, association, composition and inheritance |
| UML Sequence | Flat participants and synchronous, asynchronous and return messages, including reverse direction |
| UML State | One initial, one final, 1–8 named simple states, at most 20 reachable transitions, branches, joins and feedback |

Choose 40, 80 or 120 columns. Copy/export contains printable ASCII and LF.
Controlled MonoTrue output requires the exact supported font-face hash and all
required validated glyph roles; missing capability falls back to ASCII for the
whole output. `createCharacterDebugView028(text)` adds a coordinate grid and CSV
for inspecting an existing preview.

Validated text fields are limited to 2,048 UTF-16 units each. Block, Flowchart
and BPMN also limit their aggregate fields to 8,192 units. UML class, sequence
and state retain their finite family sizes and per-field limits; that aggregate
limit does not apply to them. Every complete preview is bounded at 1,024 rows
and 65,536 cells, and all rows fit the requested width. Aliased state pictures
retain separate IDs and captions, including initial/final captions.

::: info
Character output has bounded capability. Authored placement, semantic ports,
routes, constraints, layout controls, nonbaseline proximity and unsupported
family constructs throw `CharacterRenderError`; its `code` and `diagnostics`
identify the refusal. Source-level placement refusals include line/column paths.
UML State is a source/character edition; SVG and editor visual authoring refuse
it.
:::

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
