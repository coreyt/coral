# Diagram Fonts

Status: approved and implemented; C10.1–C10.5 complete with independent
verification
Requirement: [REQ-B2](../requirements/system-requirements.md#req-b2-deterministic-text-measurement-and-cross-surface-scene-parity) (legacy `R-033`)
Release work: 0.2.4 C10
Historical source: issue #33 and commit `e4565c5a1fbe8543231ec536519271634b4af613`

## Dated external research record

The C10 completion research gate was refreshed on 2026-09-08 from primary
sources. This record is design input, not a reason to upgrade dependencies.

| Source | Finding | C10 disposition |
| --- | --- | --- |
| npm registry metadata for `npm` | `12.0.2` is the current `latest`; its engine range includes Node 24.19.0 | Keep the exact Node 24.19.0/npm 12.0.2 release contract and align the local executable path; do not move to Node 26 or regenerate unrelated dependencies |
| React Flow `useUpdateNodeInternals` API documentation and installed `@xyflow/react@12.11.6` declarations | The hook refreshes internal dimensions and repositions handles; the installed `NodeDimensionChange` distinguishes active user resize with `resizing` | Keep the C10.3 hook call. Treat passive/internal dimension notifications as view maintenance, not a new document edit; only active user resize invalidates edit ownership |
| W3C CSS Font Loading Module Level 3 | `FontFaceSet` supplies explicit load/check/readiness boundaries | C10.5 positively loads and checks selected embedded faces before geometry/raster assertions; raster failure remains visible and aborts the download |
| Playwright Download and Page APIs | Tests register for a download before its trigger and inspect artifacts while the browser context is alive; page evaluation can inspect `document.fonts` and computed styles | Keep unconditional event-first downloads and loaded-face/computed-style assertions in the page |
| npm registry metadata for the four Fontsource 5.3.0 packages | Inter, Source Serif 4, JetBrains Mono, and Comic Neue 5.3.0 report OFL-1.1, immutable integrity, and the Fontsource font-files repository | Retain pinned 5.3.0 assets and the committed license/integrity manifest; do not upgrade fonts during C10.3–C10.5 without a reviewed asset/metric migration |

Research URLs and applicable pinned versions are also recorded in the C10
status. Current web documentation is advisory where it describes a newer
React Flow or Playwright version; installed source and the pinned Chromium
suite are the compatibility authority.

## Problem

The historical font work published useful types, constants, and a
`FontSettingsForm`, but no production path consumes the selected settings.
The reference editor does not show the form. Nodes and edge labels use
hard-coded sizes and families, ELK receives symbol-default bounds, and all
exports use Coral Inter regardless of the saved document.

Two text-measurement systems now coexist. `@coral-viz/render` uses a fixed
advance table so Node, the MCP server, and export are reproducible.
`@coral-viz/viz` uses browser Canvas and a different fallback approximation.
Adding family selection to only the CSS would therefore change glyphs without
changing layout, permit clipping, and make the live editor disagree with
export.

The repair must also preserve a permissive 0.2.3 data contract. The public
font family is an arbitrary CSS string, the numeric weight is not an enum, the
font object is optional, and the 0.2.3 validator accepts absent, partial, and
otherwise unusable font values. C10 resolves those values safely; it does not
introduce a stricter document-validation boundary or a schema-version bump.

## Goals

- Make family, size, weight, and line height selectable in the reference
  editor and effective in the canvas, sizing/layout, persistence, recovery,
  and SVG/HTML/PNG/JPEG output.
- Preserve node positions, pins, waypoints, selection, and coherent undo/redo
  while applying new font-derived dimensions.
- Make every family displayed by the selector portable and reproducible, with
  local release assets, committed deterministic metrics, and no runtime
  network request.
- Retain every 0.2.3 public type, constant, export, option, family spelling,
  and accepted document shape. All new API is optional or additive.
- Honor `DiagramFontSettings.symbolOverrides` even though the first editor UI
  edits only the diagram default.
- Use one DOM-free measurement implementation across render, viz, the editor,
  and MCP/shared rendering.

## Non-goals

- A general web-font downloader, operating-system font inventory, or arbitrary
  font-file upload.
- Pixel-identical rasterization across browser engines. Geometry, wrapping,
  font selection, and embedded inputs are deterministic; antialiasing is not.
- Full Unicode shaping metrics. Unsupported code points have a deterministic
  sizing fallback and may use the browser's local fallback glyph.
- Font controls for editor chrome, DSL source text, diagnostics, or dialogs.
- Per-node authoring UI for symbol overrides. Existing saved overrides are
  applied and preserved; authoring that map remains public-API/document work.
- A document schema increment. Font was already an optional 1.0.0 field.

## Contract and compatibility

### Stored contract remains open

The exact additive `@coral-viz/viz` root surface is `FontSettings`,
`DiagramFontSettings`, `FontFamilyPreset`, `FontSizePreset`,
`DEFAULT_FONT_SETTINGS`, `DEFAULT_DIAGRAM_FONT_SETTINGS`,
`FONT_FAMILY_PRESETS`, `FONT_SIZE_PRESETS`, `getFontFamilyPreset`,
`getFontSizePreset`, `normalizeDiagramFontSettings`, `FontSettingsForm`, and
`FontSettingsFormProps`. The historical implementation created all but the
new diagram default and normalizer in source but did not expose them through a
published entry point; this design does not inaccurately treat that source-only
surface as an existing public contract. Existing preset strings and values
remain unchanged because source consumers may compare or persist them. New
optional preset metadata may identify the portable profile, but no existing
property changes meaning or becomes required.

At a consumption boundary, `normalizeDiagramFontSettings(unknown)` returns a
complete safe requested value without mutating its input:

- an absent font object yields `DEFAULT_DIAGRAM_FONT_SETTINGS`;
- an absent or invalid member yields the corresponding default;
- family must be a non-empty string after trimming, otherwise the default
  family is used;
- any finite positive size and line height are preserved; absent, non-finite,
  non-numeric, or non-positive values use the corresponding default;
- `normal`, `bold`, and finite numeric weights are preserved in the normalized
  document value; an unusable weight becomes `normal`;
- only object-valued override entries are copied into the safe view; each known
  member is retained only when valid and remains partial until resolution.
  Scalar, array, `null`, and unusable-object overrides are omitted from the
  safe view.

`DEFAULT_DIAGRAM_FONT_SETTINGS` is exactly the historical document UI default:
the existing system-family stack, 14px, normal weight, and 1.3 line height.
It is intentionally distinct from render's Inter-compatible 12px/1.4 default,
which preserves the existing two-argument measurement and renderer API. Every
document consumer normalizes the diagram setting before passing it to render;
a caller that supplies no diagram setting continues to receive render's old
default.

The 8–32 size range and 1.0–2.5 line-height range remain editor-input limits,
not document limits. Rendering preserves any finite positive requested value.
This normalization is intentionally not an error in `validateDocument`.
Documents accepted by 0.2.3 remain accepted. Supplied valid family strings,
positive sizes/line heights, numeric weights, override keys, malformed
override entries, and unknown extension members retain their spelling/value
in the stored requested object. The normalizer is a derived view: opening,
deserializing, migrating, or merely displaying an old document never writes
defaults back into that stored object. Resolution ignores malformed overrides
and never throws.

Every `createDocument` call creates a new document and fills a cloned complete
font default when `settings.font` is absent, including when the caller supplies
other partial settings. `useSettings()` does the same only when
`initialDocumentSettings` is absent. An explicitly supplied old document may
continue to omit `font`: `serialize`, `deserialize`, and `migrateDocument`
carry its raw requested settings without injection or canonicalization and keep
schema 1.0.0. The reference App explicitly supplies a cloned default for its
initial new document. Recovery already stores the full serialized document,
so it uses the same boundary rather than a second migration. Tests cover
independent nested default clones, non-mutation, exact absent/partial/arbitrary/
malformed/extension-bearing round trips, and a font change, save/reload, and
second font change, both with derived dimensions and with truly explicit
GraphIR dimensions.

### Requested settings and effective render settings

The requested family string is distinct from the portable face used for
deterministic rendering. The DOM-free render package exposes additive types
and functions along these lines:

```ts
type PortableFontId = 'sans' | 'serif' | 'mono' | 'handwritten';

interface ResolvedFont {
  id: PortableFontId;
  requestedFamily: string;
  cssFamily: string;
  size: number;
  weight: 400 | 700;
  lineHeight: number;
  usedFallback: boolean;
}

resolveFont(settings?: Partial<RenderFontSettings>): ResolvedFont;
resolveDiagramFont(settings, symbolId?, nodeType?): ResolvedFont;
embeddedFontCssFor(ids: Iterable<PortableFontId>): string;
```

Names may be adjusted during implementation, but these semantics are fixed.
`INTER_FONT_DATA`, `INTER_FONT_FAMILY`, and `embeddedFontCss()` remain working
compatibility exports and delegate to the sans registry entry.

Weight resolution is deliberately bounded: `bold` or a numeric value of 600
or greater uses the committed 700 face; all other valid weights use the 400
face. The requested numeric value remains in the document, while effective
layout and render use the same available face. This avoids browser-dependent
synthetic weight behavior.

### Family resolution

The registry has four portable profiles:

| Profile | Bundled face | Historical selector mapping | Generic aliases |
| --- | --- | --- | --- |
| `sans` | Inter | `system`, `sans` | system-ui, sans-serif, Inter, Helvetica, Arial, Segoe UI, Roboto |
| `serif` | Source Serif 4 | `serif` | serif, Georgia, Times New Roman |
| `mono` | JetBrains Mono | `mono` | monospace, JetBrains Mono, Fira Code, Consolas |
| `handwritten` | Comic Neue | `handwritten` | cursive, Comic Neue, Comic Sans MS, Caveat |

Release assets are pinned to Fontsource 5.3.0's Latin normal faces: variable
Inter, Source Serif 4, and JetBrains Mono plus static Comic Neue 400 and 700.
The source URLs use Fontsource's versioned jsDelivr paths recorded in the asset
manifest; no unversioned `latest` URL is accepted. Fontsource distributes the
upstream OFL assets and provides the exact Latin unicode range. Coral does not
rename or further subset the font binaries; its `Coral ...` CSS family is an
`@font-face` alias, not a modification of the font name table. The committed
manifest must include each exact URL, Fontsource package/version, upstream
family metadata, unicode range, SHA-256, byte size, license text/path,
reserved-font-name assessment, metric-generation command/tool versions, and
generated metric digest. The implementation must not download anything at
build or runtime.

The aggregate raw WOFF2 payload must be at most 400 KiB and the packed render
package increase at most 600 KiB over `d08688f`. These are pre-implementation
budgets, not reasons to omit a selector profile. Exceeding either is a material
design delta requiring review with the measured asset breakdown.

Resolution tokenizes a CSS family list without evaluating CSS. It compares
case-insensitive unquoted family tokens to the registry aliases. The first
known alias chooses the profile. If none is known, a trailing generic `serif`,
`monospace`, or `cursive` chooses that profile. Everything else uses `sans`
with `usedFallback: true`. Historical preset strings therefore remain saved
unchanged while resolving predictably.

Every selector option gets an explicit portable profile. A selector may show
the historical friendly name, but its preview uses the resolved release face,
not whichever local font happens to match the stored stack.

## Deterministic metrics

`@coral-viz/render/src/text/metrics.ts` remains the single implementation. Its
existing two-argument `measureLine(text, fontSize)` and current
`measureText(options)` behavior remain the sans/400 default. Additive optional
`fontFamily`/profile and `fontWeight` inputs choose a committed advance table.

Metric tables are generated from the exact bundled font assets. Each table
contains advances for the supported release subset, units-per-em provenance,
and a stable fallback ratio for missing code points. Line height remains the
explicit CSS multiplier and is rounded by the existing deterministic rule.
Wrapping continues to split at whitespace and never breaks a long word.
Kerning, standard/contextual ligatures, and optical sizing are disabled in the
live HTML and exported SVG (`font-kerning: none`, ligature feature settings
off, and `font-optical-sizing: none`), so the committed per-codepoint advances
describe the requested Latin glyph sequence. Metric generation instantiates
variable fonts at the effective 400 and 700 weights with a fixed default
optical-size axis before reading advances.

Chromium evidence showed that grid fitting may move an individual glyph to
either adjacent whole pixel; Source Serif 4 bold `P`, for example, occupies
11 pixels at 16px even though its unhinted advance is 10.496 pixels. The
deterministic rule therefore rounds each glyph advance upward before summing.
This is intentionally conservative: the browser fixture pins the actual
loaded-face widths for all eight profile/weight pairs and separately proves
that each rendered width fits inside the deterministic measurement. Shared
`text-rendering: geometricPrecision` keeps production text geometry stable
through zoom. Its loaded-face widths differ from the earlier `auto` grid-fitted
widths; browser fixtures explicitly assert the production shaping mode. The
portable-font shaping probe retains a same-font, same-browser comparison of
both modes without changing the conservative metric tables.

Deterministic advances alone are insufficient: SVG currently uses a simple
120x60 rule while viz applies each shape's text bounds, minimums, and padding.
The complete shape-aware sizing contract therefore moves to a DOM-free render
module. It owns `computeNodeSize`, uniform sizing, safe text-box calculation,
and `layoutNodeLabel`, which returns the node bounds, safe text bounds,
deterministic lines, line-height pixels, and baseline/line positions for a
known box. Both SVG and live `SymbolNode` use that result rather than asking
CSS or Canvas to choose line breaks. The fixture matrix includes rectangles,
diamonds, explicit newlines, whitespace wrapping, and unbroken long words.

`@coral-viz/viz/src/layout/nodeSizing.ts` keeps its public exports but becomes
a compatibility wrapper over the render metrics and sizing functions. It must
not create a Canvas or branch on `document`. `TextMeasureOptions` and
node-sizing options retain their current required/optional fields.
`computeNodeSize` begins passing line height and profile data through; hybrid
height takes the maximum of default shape height and measured content height
so large fonts cannot clip.

Compatibility here means the existing function names, call shapes, defaults,
and result fields remain—not that every old approximate pixel is frozen.
Replacing the generic sans approximation with metrics extracted from bundled
Inter is one intentional tripwire update recorded with before/after golden SVG
dimensions. Tests pin exact widths and wraps for representative narrow/wide strings at
400/700 in every profile, numeric-weight threshold behavior, missing-glyph
fallback, explicit newlines, long words, and repeatability. A test also proves
the viz wrapper returns the render result in both jsdom and Node-like
environments.

## Editor data flow

```text
saved/recovered DocumentSettings.font
              |
              v
 normalizeDiagramFontSettings
              |
        SettingsPanel/Form
              |
      Apply Font Changes (commits staged draft)
              |
              v
 dedicated font transition -- resolve per node --> deterministic label layout
      |                                      |
      v                                      v
 SymbolNode symbol metadata     same positions/pins/waypoints/selection
      |                                      |
 live label/input/edge style       next ELK input/shared render options
                                             |
                                   SVG -> HTML / PNG / JPEG
```

`SettingsPanel` gains an additive optional
`onApplyFont(settings: DiagramFontSettings)` callback and renders
`FontSettingsForm` unconditionally under a Font section. `useSettings`, which
stays mounted when the inspector is collapsed or switches to a selected node,
owns the reference editor's staged safe view. `SettingsPanel` gains additive
optional controlled draft/value callbacks and retains a local fallback for
standalone consumers. The view is initialized from the raw requested document
settings and presents the diagram default when `documentSettings.font` is
absent. Form change events update only that draft and preview.

Apply creates a raw-preserving committed object: edited known default fields
overlay a clone of the raw default, unknown top-level/default extensions stay
intact, and raw `symbolOverrides` is copied verbatim because C10 has no
override-authoring UI. The same committed object instance is inserted into the
next `DocumentSettings` and passed directly to `onApplyFont`, avoiding both
data loss and a stale React state read. Before Apply, save/recovery/export
continue using the old raw committed font and matching old geometry.

An additive `documentKey` identifies load/recovery transitions. A changed key
or externally changed `documentSettings.font` resets the draft, including when
two consecutive old documents both omit `font`; unrelated notation, layout,
and annotation updates retain an in-progress draft. Direct load, full-document
recovery, and legacy recovery advance the key. `InspectorPane` forwards the
key, controlled draft, and typed settings callbacks rather than `any`.
Real-App tests stage a draft, select/deselect a node, and collapse/reopen the
inspector without losing it.

The form displays an explicit selected Custom option and the exact requested
family for arbitrary strings; editing size, weight, or line height retains
that string. Its preview independently resolves through the C10.1 registry,
embeds the selected local face, and applies resolved family, requested size,
effective 400/700 weight, and requested line height. Free-form family authoring
remains out of scope. The line-height control covers the documented 1.0–2.5
range. Tests query the Font section, controls, custom state, requested-family
display, preview style/embedded CSS, and apply button unconditionally and cover
draft survival, reset, raw-data preservation, callback identity, commit, and
negative evidence that Font Apply never invokes Apply Layout/Reflow.

C10.2 makes Apply commit requested document settings and forwards the optional
font callback. It does not connect that callback to ordinary `handleReflow`;
C10.3 supplies the dedicated geometry transition.

The reference editor must not pass ordinary `handleReflow` as `onApplyFont`:
that action intentionally clears waypoints and is allowed to reposition
unpinned nodes. A dedicated transition maps current nodes to new resolved
fonts, deterministic label layouts, and derived
dimensions while retaining each node position, pin/draggable state, selected
state, parent relation, and canonical data. It retains the waypoint map and
lets React Flow reconnect edges to the resized bounds. Font settings, like
other document settings, are not added to the current layout/DSL undo model in
C10; applying a font neither clears nor adds to those stacks, and subsequent
undo/redo continues to restore its pre-existing position/waypoint revisions
under the currently committed font. This is the explicit meaning of
"preserve undo history" in the completion plan. Initial parse,
format switch, explicit reflow, load, and recovery also pass the current
normalized font settings to `layoutNodes`; those existing transitions retain
their separately documented geometry semantics. The settings object is held
in a current ref with a monotonically increasing font revision rather than
added to a callback dependency that would accidentally reparse the DSL. Every
asynchronous layout captures the revision and discards its result if a newer
committed font or edit exists. The synchronous Apply transition cannot be
overwritten by an older ELK promise.

For each node, the editor resolves in this order:

1. a matching `symbolOverrides[symbolId]`;
2. a matching `symbolOverrides[node.type]` for older callers that used semantic
   type names;
3. the diagram default.

An explicit GraphIR `dimensions` value remains authoritative, but provenance
cannot be inferred from `data.canonical` alone: public viz consumers have long
supplied only `CoralNode.width`/`height` and expected `serialize` to persist
them. The existing data interfaces also accept arbitrary string extension
keys, so adding typed `font`, `lines`, or provenance properties would narrow
objects that 0.2.3 accepted under those names.

The additive public contract therefore uses collision-safe metadata:

```ts
type DimensionSource = 'graph' | 'editor-font';

const CORAL_NODE_VIEW_METADATA: unique symbol;
const CORAL_EDGE_VIEW_METADATA: unique symbol;

interface CoralNodeViewMetadata {
  dimensionSource?: DimensionSource;
  font?: ResolvedFont;
  lines?: string[];
  lineHeightPx?: number;
}

interface CoralEdgeViewMetadata {
  font?: ResolvedFont;
}

type FontAwareCoralNodeData = CoralNodeData & {
  [CORAL_NODE_VIEW_METADATA]?: CoralNodeViewMetadata;
};
type FontAwareCoralEdgeData = CoralEdgeData & {
  [CORAL_EDGE_VIEW_METADATA]?: CoralEdgeViewMetadata;
};
```

The symbols use `Symbol.for('@coral-viz/viz/node-view-metadata')` and
`Symbol.for('@coral-viz/viz/edge-view-metadata')` respectively and are exported
with the metadata/refined types from the viz root. Runtime readers validate the
metadata object before using it. Existing string properties named `font`,
`lines`, `lineHeightPx`, or `dimensionSource` remain uninterpreted extension
data, preserving source and runtime behavior for prior consumers.

Nodes constructed by the reference editor mark parsed GraphIR dimensions as
`graph` and computed display bounds as `editor-font`. Every GraphIR projection
uses one exact dimension policy after spreading canonical data:

1. `graph`: use canonical GraphIR dimensions when both are finite; otherwise
   use finite current `node.width`/`height` as a pair; otherwise omit.
2. `editor-font`: delete/omit `dimensions` entirely, including any value that
   arrived through a canonical spread.
3. absent or unrecognized metadata: preserve 0.2.3 behavior—use finite current
   width/height as a pair, then canonical dimensions, then omit.

Half-present or non-finite current bounds never form a dimensions value.
Previously saved documents whose dimensions have no metadata remain authored,
which is the compatible and non-destructive choice. The policy is shared by
`serialize`, `convertFlowToGraphNodes`, `SplitEditor`, and
`useBidirectionalSync`; GraphIR-to-flow paths `convertNode`,
`convertGraphToFlow`, and `deserialize` install provenance-only `graph`
metadata before React Flow has measured the node. Those document-agnostic
public converters receive no font settings and otherwise retain their 0.2.3
visual behavior.

Visual-to-GraphIR synchronization begins with the matching canonical node from
the supplied original graph, not a newly constructed subset. It overlays only
fields owned by the current visual edit, then applies the shared dimension
policy. This preserves symbol, variant, ports, hierarchy, layout options,
source information, and extension data while omitting only editor-derived
bounds. `SplitEditor`, `useBidirectionalSync`, `serialize`, and
`convertFlowToGraphNodes` share this full-field fixture.

The reference editor supplies complete node/edge view metadata on every
construction path. It is derived state and is never written into GraphIR or
JSON. Standalone components that omit it retain their 0.2.3 appearance and
behavior.

When dimensions are not authored, the shape's sizing metadata, selected
`LayoutSettings.sizingMode` (default `adaptive`), label, and effective font
determine the ELK width and height. The resolved font and deterministic display
lines are copied into the collision-safe node view metadata; the same settings
drive inline edit style.
For `uniform` sizing, authored nodes bypass the derived uniform calculation and
do not enlarge its peer-group maximum. Each derived node is first measured with
its own resolved override; derived nodes of the same shape then receive the
maximum of those individually measured bounds. This keeps uniform sizing
compatible with per-symbol fonts instead of forcing one diagram-wide metric.
`convertEdges` receives the effective diagram default and uses it in the React
Flow edge label style and collision-safe edge view metadata. Built-in
smoothstep labels consume `labelStyle`; `CompatibilityEdge`, which renders
routed and waypoint labels in its own HTML overlay, consumes that metadata.
Edge updates during reflow, validation decoration, waypoint edits, and reconnection
must spread that data rather than rebuilding it without the font. Tests cover
smoothstep, routed, and waypoint labels.

One pure editor projection path derives symbol, effective font, dimensions,
label lines, line-height pixels, and provenance. Full/fallback layout,
incremental parse, direct load, Font Apply, and the compatibility hook reuse it.
An inline or inspector label commit immediately reruns this projection for the
affected derived node under the committed font while retaining its position and
history; a graph-authored dimension remains fixed but receives refreshed lines.

Font reprojection is a view merge, not a canonical-node replacement. Apply Font
may replace current width, height, symbol mapping, and collision-safe font/line/
provenance metadata, but it retains the current node's label, description,
properties, pin/draggable state, parent, selection, canonical data, and arbitrary
extensions. A label edit overlays only the target label plus its recalculated
font-derived view fields. It must not spread a stale `lastParsedRef` projection
across current node data. Tests perform property/description edits followed by
label edit and Font Apply before text synchronization and require those current
edits to survive.

When view metadata is present, `SymbolNode` renders one explicit marked element
per deterministic line with browser wrapping, ellipsis, and automatic line
breaking disabled. The label and inline input share the resolved CSS family,
requested size/line height, effective 400/700 weight, and deterministic kerning/
ligature/optical-sizing rules. After a projected width or height changes,
`SymbolNode` invokes React Flow's `useUpdateNodeInternals(id)` from an effect so
handles and connected-edge anchors are remeasured. Focused tests require exact
line elements and styles, the invalidation call after Font Apply, and path
recomputation from updated endpoint coordinates; the real connected-edge
geometry remains part of C10.5's browser gate.

Built-in edge `labelStyle` carries resolved family, size, effective weight,
line height, and the same deterministic shaping properties. `CompatibilityEdge`
applies those values to its HTML overlay. No-font standalone node/edge data
continues down the existing 0.2.3 style path.

To preserve the standalone public component contract, a `SymbolNode` with no
font in its data keeps its current sketch/non-sketch styles. The reference
editor now always supplies its resolved document font after load/layout, even
for an old document that omitted `settings.font`; its sketch nodes therefore
adopt the document default. That intentional completion behavior is not
described as visual preservation. A symbol override can select the handwritten
profile where desired.

The editor injects the registry's `@font-face` rules once at its application
boundary. An additive small viz helper/component is exported for library
consumers that assemble `SymbolNode` themselves. It is SSR-safe markup with no
global mutation; omitting it leaves the existing CSS fallback behavior. The
component is named `DiagramFontFaces`, accepts the current optional diagram
font settings, resolves the default and declared overrides, deduplicates the
effective profile/weight pairs, and emits one marked `<style>` element. The
viz root exports both `DiagramFontFaces` and
`DiagramFontFacesProps { settings?: DiagramFontSettings }`. Its stable SSR and
DOM marker is `data-coral-diagram-font-faces`; malformed overrides are ignored
by the same safe resolver. Tests cover root runtime/type imports, server-side
markup, deduplication, malformed input, and the no-helper compatibility path.

## Shared rendering and export

`SvgOptions` gains exactly three additive properties: `fontWeight?:
RenderFontWeight`, `lineHeight?: number`, and `fontSettings?:
DiagramRenderFontSettings`. `DiagramRenderFontSettings` is the existing
DOM-free render type with optional `default` and optional partial
`symbolOverrides`; viz's `DiagramFontSettings` is structurally assignable to
it. Existing `fontSize` and `fontFamily` remain source-compatible.

There are two deliberately distinct compatibility modes. Compatibility mode
applies only when `fontSettings`, `fontWeight`, and `lineHeight` are all absent.
In that mode the two pre-0.2.4 scalars retain their exact serialization:
`fontFamily` is emitted verbatim, `fontSize` drives the old metrics when valid,
and the old Inter-compatible defaults and embedding remain. This includes
arbitrary CSS stacks and prevents an additive release from silently replacing
legacy output with a Coral alias. Direct-render fixtures pin default,
`fontFamily`-only, `fontSize`-only, and family-plus-size compatibility output.

Portable mode begins when `fontSettings`, `fontWeight`, or `lineHeight` is
present. It resolves the aggregate default plus symbol/type override first,
then overlays each supplied valid scalar (`fontFamily`, `fontSize`,
`fontWeight`, `lineHeight`) on that requested node setting and resolves the
result to a bundled profile. `fontWeight` alone therefore selects effective
400/700 metrics and embedding over the render defaults; `lineHeight` alone
changes shared measurement/baselines over those defaults. A scalar wins its
field even over a symbol override, while untouched fields retain the override.
Empty families,
non-finite/non-positive sizes or line heights, non-finite weights, scalar/
array/null aggregate values, and unusable override entries are ignored by the
same non-throwing normalization rules as the existing render resolver. Tests
pin compatibility output, direct `fontWeight`-only and `lineHeight`-only
portable output, aggregate-only override behavior, both together, partial/
malformed aggregates, used-face embedding, and edge-default use.

The SVG serializer resolves each node's effective profile, measures it with
that profile, asks the shared shape-aware sizing/text-box helper for bounds and
lines, emits the effective CSS family and 400/700 weight, and uses the same
line-height value for baseline placement. Edge labels use the diagram default.
It embeds rules only for the profiles used by the graph. Node `dimensions`
remain authoritative, matching the editor.

The reference editor does not render from the persistence graph verbatim.
`currentRenderGraph` builds an export-only clone using an id-keyed map of the
flat current React Flow nodes and a recursive walk of canonical GraphIR nodes.
Canonical order and nesting are retained. For each matching id it overlays the
current relative `position`, resolved non-empty `data.symbolId`, and current
display bounds. A node carrying C10 `graph` or `editor-font` provenance uses
its finite positive `width`/`height` pair first, because that pair is the
explicit projection; an unmarked compatibility node uses finite positive
`measured`, then `width`/`height`, then numeric `data.width`/`data.height`.
If no complete view pair exists, canonical dimensions remain. A canonical node
without a view match remains recursively unchanged; a view-only id is ignored
rather than synthesized without canonical GraphIR. Reordering cannot associate
one node's values with another, and the walk never flattens children. This
captures uniform/adaptive/hybrid results and notation mapping without requiring
the renderer to reconstruct editor-only inputs. Authored dimensions keep the
same projected values; editor-derived dimensions and resolved symbols exist
only in this clone and are never written by Save or GraphIR export. Reordered,
nested, missing-id, and Save-unchanged fixtures are mandatory. SVG/HTML/raster
all consume this clone and the same committed `fontSettings`.

`renderHtml` continues to derive from SVG. Browser raster export uses one
ordered, last-attempt-wins asynchronous operation. It first enumerates and
deduplicates the exact profile/weight requests used by the materialized graph;
for each request it creates a `FontFace` from the registry's exact data URL,
awaits `load()`, adds the loaded face to `document.fonts`, and confirms the
matching family/weight face has status `loaded`. Only then does it create the
SVG object URL, assign it to an image, await `decode()` (with the load/error
events wrapped only as the browser compatibility fallback), draw into a
non-null 2D context, and await a non-null `toBlob` result before calling the
shared download helper. The embedded SVG CSS and already-loaded document faces
therefore agree before image decoding; an image `onload` followed by font load
is explicitly insufficient.

Every attempt owns a monotonically increasing token. A newer PNG/JPEG attempt
makes an older one stale at each awaited boundary; stale attempts clean up but
cannot clear the newer alert or download. FontFace rejection, missing loaded
face, image error/decode rejection, null 2D context, and null `toBlob` all set
one visible `role="alert"` for the owning attempt and produce no download.
Every created object URL is tracked and revoked in `finally`, including stale
and failed attempts; the download helper retains its immediate download-URL
revocation. Browser failure coverage deterministically installs an init-script
override of `FontFace.prototype.load` for the selected Coral family, waits for
the alert and a download-event counter, and proves zero downloads and balanced
create/revoke calls. No external URL is introduced.

The MCP renderer remains document-agnostic because its input is GraphIR. Both
the advertised JSON input schema and Zod `RenderOptionsSchema` gain the exact
additive fields `fontSettings`, `fontFamily`, `fontSize`, `fontWeight`, and
`lineHeight`. `fontSettings` has optional `default` and optional
`symbolOverrides`, whose values use the same four optional requested fields;
the advertised JSON schema and Zod schema accept arbitrary family strings,
positive finite size/line-height values, and `normal`, `bold`, or finite numeric
weights. Partial objects are accepted; invalid MCP values are rejected at the
input boundary rather than silently rewritten. The same scalar-over-aggregate
precedence above is passed to pre-layout sizing and final serialization.
MCP has no historical scalar-font compatibility surface: if any MCP font
scalar is supplied, its adapter passes `fontSettings: options.fontSettings ??
{}` to force portable mode for both pre-ELK sizing and serialization. With no
font field at all it omits the aggregate so default MCP output retains the old
renderer mode. Consequently MCP family-only, size-only, weight-only, and line-
height-only calls cannot lay out portably and serialize through the legacy
branch.
Aggregate-only, scalar-only, both, symbol/type override, partial, malformed,
and advertised-schema parity fixtures are mandatory. These options are not
passed only to final serialization: `coral_render` must size
each node that lacks explicit GraphIR dimensions with the same resolved font,
symbol/shape, and shared sizing helper before building the ELK input. The
resulting dimensions then remain authoritative through layout and final SVG or
HTML serialization. Complete positioned geometry retains its explicit bounds;
partial, absent, and nested geometry use the font-aware pre-ELK path only for
nodes without dimensions. `coral_layout` remains unchanged in C10: it has no
render-font option and retains its 150x60 fallback. This deliberate difference
is acceptable because `coral_layout` returns geometry rather than a text
render; Slice 60's shared layout consolidation may add a broader sizing
contract. Neither path interpolates a non-embedded external font into a
supposedly self-contained export.

## State transitions and failure behavior

| Event | Document value | Canvas/layout | Export |
| --- | --- | --- | --- |
| Open old document without `font` | raw field remains absent; form/consumers derive the diagram default | portable sans/400 effective profile is supplied during layout | portable sans effective profile |
| Select preset/change size | staged draft only; document/recovery stay unchanged | preview changes; existing geometry remains | export uses committed old settings and matching old geometry |
| Apply font | exact draft becomes requested document value | synchronous in-place resize; positions, pins, waypoints, selection, existing history, and canonical dimensions keep their authority | subsequent export matches the new derived or explicit geometry |
| Load partial/arbitrary font | raw value retained; derived view defaults missing/unusable known members | known alias/generic profile or explicit sans fallback | same resolver/profile and embedded assets |
| Missing glyph | original text retained | committed fallback advance determines bounds; browser fallback may draw glyph and portable non-clipping is not guaranteed | same advance; bundled glyph portability is guaranteed only for the manifest's Latin range |
| Font asset load fails for raster | settings unchanged | live canvas retains CSS fallback | raster operation reports failure and produces no misleading download |

## Testing strategy

Implementation is divided into C10.1–C10.5 and uses RED/GREEN increments.

1. Registry/metric tests fail first for each profile, weight, fallback,
   self-contained CSS, digests, and the viz-wrapper parity contract.
2. Document tests fail first for absent/partial/arbitrary/malformed/extension
   settings, exact diagram defaults, create/serialize/deserialize/migration/
   recovery behavior, non-mutation, and preservation of supplied family/weight
   values. Root-import tests prove the newly additive public font surface.
   Settings tests require the section and controls to exist before exercising
   them; they also cover raw-preserving Apply, custom display, unrelated-change
   draft retention, and same-font/absent-font document-key reset. A
   packed/public-style consumer proves that unmarked `CoralNode.width`/`height`
   still serialize, while editor-derived provenance omits only generated
   bounds.
3. Editor unit/component tests fail first for resolved node/edge styles,
   symbol overrides, explicit-dimension provenance, large-text non-clipping,
   deterministic display lines, the dedicated apply transition, preservation
   of positions/pins/waypoints/selection/existing history, stale-layout
   rejection, direct load, recovery, full/incremental parse, explicit reflow,
   and saved/recovered settings.
4. Renderer/MCP tests fail first for all four profiles, both effective weights,
   line height, used-profile embedding, old-option precedence, exact
   shape-aware bounds/line agreement, and pre-ELK font sizing for nodes without
   explicit dimensions. Editor export tests materialize actual display bounds
   and resolved symbols for uniform sizing, a non-default notation, and an
   explicit-dimension node without changing the saved GraphIR; another changes
   font, saves/reloads, changes font again, and proves derived bounds remain
   responsive.
5. Playwright fails first while selecting serif or mono and a larger size. It
   requires the matching `FontFace` entry to exist in `document.fonts` with
   `status === 'loaded'` for every selected profile/effective weight, asserts
   computed node and edge typography plus changed bounds/deterministic lines,
   and compares downloaded SVG/HTML/raster geometry with the canvas. It drives
   the real recovery lifecycle: wait for the full auto-recovery snapshot,
   reload, require the recovery UI, restore it, then compare the selected font,
   positions, pins, and waypoints. A representative glyph-region assertion
   must differ between two profiles while background/control regions remain
   stable. A deterministic init-script FontFace rejection must show a visible
   error, produce no download event, and balance every object-URL create/revoke.

A browser registry test loads and positively checks all four profiles at both
effective weights, independent of the one end-user selection scenario. It
cannot be satisfied by a CSS family string or `document.fonts.check()` alone:
CSS Font Loading permits `check()` to return true when no matching face exists
or the text is outside a face's unicode range. The matching face must be in
`document.fonts` with loaded status, a representative canvas width must match
that profile's expected relationship, raster glyph pixels must be present, and
the browser must observe no external font request.

### C10.5 executable closure matrix

The closure gate is pinned to Node 24.19.0, npm 12.0.2, TypeScript 6.0.3, the
repository's Playwright/Chromium version, `@xyflow/react@12.11.6`, and exact
`@graph-ir/core@0.2.0`. It runs the following without changing a manifest or
lockfile:

| Evidence | Command/procedure | Passing threshold |
| --- | --- | --- |
| Cache RED/GREEN | focused render cache tests, then full render suite/typecheck/build | 128 entries exactly; hit refresh, least-recent eviction, fallback, exact normalized-string keys, and size/weight/line-height independence all pass; test controls are imported only from an internal non-barrel module |
| Unit/coverage | render and diagram-editor `test:coverage`; repository `npm run test:coverage:gate` | every suite exits zero; the existing viz/MCP thresholds remain statements/lines/functions 80% and branches 75%; render/editor totals and every changed-file percentage are recorded, never hidden by exclusions |
| Browser | full `npm run test:e2e -- --project=chromium` plus the focused C10 font cases | zero failures or conditional skips; real matching loaded faces, selected typography/geometry/recovery, SVG/HTML/raster pixels, failure/no-download/URL balance, and zero external font requests all pass |
| Regression | `npm run verify`, docs links, changed-file ESLint `--quiet`, and `git diff --check` | every command exits zero; only separately identified pre-existing warnings/skips may remain |
| Security | `npm audit --audit-level=high` using the committed lockfile | exit zero with no high or critical advisory; lower findings, if any, are recorded and assessed; `npm audit fix` is never run |
| Packages/budget | npm 12 `pack --dry-run --json` for every publishable workspace plus actual isolated packs used by consumer smoke; sum `bytes400` + `bytes700` in the generated source manifest; create a detached temporary worktree at `d08688f`, install with the exact lockfile/toolchain, build and pack render, then compare its tarball byte count with the current pack before removing the worktree | required files/metadata present; aggregate raw embedded face byte total stays within 400 KiB and packed render increase stays within 600 KiB; both exact totals/deltas are recorded |
| React consumers | two fresh blank temporary consumers install the exact packed render/viz artifacts, GraphIR 0.2.0, React Flow 12.11.6, and respectively React/React DOM 18.3.1 with `@types/react@18.3.31`/`@types/react-dom@18.3.7`, and React/React DOM 19.2.8 with the repository's `@types/react@19.2.18`/`@types/react-dom@19.2.7` | each imports the public font API, server-renders `DiagramFontFaces`, hydrates it in a DOM while capturing console/runtime failures, exercises a public conversion, and compiles strict TypeScript; zero captured failure, no peer override, and no repository dependency edit |

React 18.3.1 is the latest 18.3 maintenance release and the warning-bearing
migration line declared by the package peer range. React 19.2.8 is the current
repository pin and compatible current-19 test, avoiding an unrelated floating
upgrade. Temporary consumers and packs are created under exact, recorded paths
and removed after evidence is captured.

C10.3's provenance matrix covers graph-authored, editor-derived, absent,
unrecognized, half-present, and non-finite metadata/bounds before and after
React Flow measurement. It runs through `convertNode`, `convertGraphToFlow`,
`deserialize`, `serialize`, `convertFlowToGraphNodes`, `SplitEditor`, and
`useBidirectionalSync`, and proves that legacy string extension keys named like
the new metadata fields still compile and remain uninterpreted. Deferred-layout
tests resolve an old request during the text debounce window and after label,
position, connection, and waypoint edits. Component tests require exact marked
line elements/styles, root/SSR font-face imports, and the React Flow node-
internals refresh rather than merely inspecting cached node data.

## Assigned implementation paths

The C10.1–C10.4 work-unit audits must enumerate and keep these callers in the
test matrix; this list is a minimum, not permission to skip newly discovered
callers:

| Boundary | Required paths |
| --- | --- |
| Public schema/settings | `schema.ts` defaults/presets/types, collision-safe view metadata, `createDocument`, `serialize`, `deserialize`, `convertFlowToGraphNodes`, `SplitEditor`, `useBidirectionalSync`, `validateDocument`, `useSettings`, `FontSettingsForm`, `SettingsPanel` |
| Shared metrics/sizing | render `measureLine`/`measureText`, shape registry sizing, new label-layout helpers, viz `nodeSizing` compatibility exports |
| Canvas construction | `getNodeDimensions`, `layoutNodes` success/fallback, `updateDiagram` full and incremental branches, `convertEdges`, direct `handleLoadDocument`, recovery, explicit Reflow, currently-unused `useDiagramLayout` compatibility characterization |
| Canvas drawing | `SymbolNode` deterministic display/input and `useUpdateNodeInternals`, built-in React Flow edge labels, `CompatibilityEdge` routed/waypoint labels, label/property edits, reflow/validation/waypoint/reconnect data updates |
| Export | `currentRenderGraph`, `currentSvg`, SVG, HTML, PNG/JPEG font loading and failure cleanup |
| MCP | advertised `renderTool.inputSchema`, Zod `RenderOptionsSchema`, `toRenderGraph` complete/partial/absent/nested geometry, pre-ELK sizing, SVG/HTML output |

Every asynchronous editor layout carries both an edit generation and font
revision. Invalidation increments synchronously when an intent enters
application state, before a text debounce starts or any asynchronous work is
awaited. Text edits, format/notation/layout changes, LLM and DSL undo/redo, node
moves/resizes/property or label edits, connection/reconnection, waypoint
mutations, direct load, both recovery forms, and explicit Reflow increment
`editGeneration`. Font Apply synchronously installs its exact callback settings
into the current ref and increments only `fontRevision`; it does not increment
`editGeneration`. The intent that starts a replacement request owns the
corresponding loading flag; an intent that cancels without replacement clears
the flag it invalidated. Selection-only changes do not cancel a pending parse.

React Flow may emit a passive `dimensions` change after
`useUpdateNodeInternals(id)` remeasures a programmatically resized font node.
That notification updates view state but does not increment `editGeneration`;
otherwise Font Apply would cancel its required font-only rebase. A dimensions
change with `resizing === true` is an active user resize and does invalidate.
Add/remove/replace and position changes retain their edit-intent semantics. A
composed test dispatches the passive dimension notification while ELK is
pending and proves that the newest font revision still rebases and commits.

Parsing stores its candidate in a pending request and does not update the
committed parsed/diff refs before layout succeeds. If only the font
revision changes while ELK is pending, the request retains its edit generation
and reruns/rebases layout for the already parsed newest graph with the latest
font; one rebase iteration uses the latest revision and commits only when both
tokens still match. A further font revision repeats that bounded-per-revision
check; it must not require another
text-change effect. If the edit generation changes—newer text, format switch,
load, or recovery—the old request exits without retry, so it cannot resurrect
the prior document. Only the current request may commit nodes, edges,
waypoints, parsed/diff refs, history snapshots, diagnostics, or loading flags.
Text parse, format/notation/layout change, LLM or DSL undo/redo, direct load,
either recovery path, and explicit Reflow all invalidate older asynchronous
work. Direct load installs its requested settings/ref and bumps
the edit generation before synchronously constructing font-bearing nodes; it
does not implicitly run ELK or move loaded nodes. Full-document recovery uses
that same direct projection. Legacy recovery installs font-absent settings,
retains recovered positions as position-only overrides, and then uses the
normal parsed-layout path. The incremental parse branch computes new-node dimensions with the
committed font while preserving existing node positions and refreshing the
node view metadata on retained nodes. Explicit Reflow uses the committed font
and retains its existing documented waypoint-clearing behavior; only Apply Font is
the preservation transition. A deferred-ELK test interleaves new DSL and Font
Apply and requires the newest text plus newest font; a second test proves a
later document load wins and suppresses every old retry.

A font-only rebase replaces rather than appends the request's prospective
history snapshot. A stale request cannot append history, clear a loading flag
owned by a newer request, or commit diagnostics. Deferred tests resolve old ELK
work during the text debounce window and after label, position, and waypoint
edits, in addition to the font-rebase and later-load cases.

The final gate runs targeted suites during each unit, then package coverage,
the full browser suite, `npm run verify`, documentation checks, package
consumers, and the compatibility slice gate where applicable. Test code may
not use conditional element checks that turn a missing control into a pass.

## Performance and packaging

Font data increases `@coral-viz/render` and therefore editor/MCP package size.
Only the Latin release subsets and two effective weights are included. The
status record captures raw asset, generated source, built, and packed byte
deltas per profile and enforces the 400/600 KiB budgets above. Deleting a
profile to hide an increase is not acceptable because every visible selector
choice must remain portable.

Metric lookup is linear in label code points and does not perform DOM work.
Family resolution uses a module-local bounded 128-entry LRU keyed by the exact
normalized requested family string. A hit refreshes recency; insertion evicts
the least-recently-used entry. Only the family-to-profile/fallback decision is
cached—size, weight, and line height remain per call—so arbitrary user strings
cannot grow memory without bound or cross-contaminate resolved values. C10.5
adds resettable test instrumentation kept outside the public package surface
and covers hits, eviction, fallback, and field independence. CSS generation
deduplicates profile/weight pairs. Slice 60 measures the resulting layout and
browser interaction costs at release graph tiers.

## Rejected alternatives

- **Use installed system fonts.** This preserves the old preset strings but
  makes layout and export depend on the host and breaks self-contained output.
- **Change only CSS and keep one advance table.** This can clip text and makes
  the selected family cosmetically unrelated to computed geometry.
- **Use Canvas for “accurate” editor metrics.** Browser engines and font-load
  timing vary, and Node/MCP cannot share the result.
- **Replace the public family string with a closed font ID union.** That is a
  breaking API and document change. Resolution must sit behind the open 0.2.3
  contract.
- **Reject malformed font settings during validation.** The 0.2.3 validator
  accepted them, so strict rejection violates the compatibility boundary.
- **Embed only Inter and label aliases as different fonts.** The selector would
  claim visual choices it does not provide.
- **Defer export or browser evidence.** That would repeat the historical #33
  failure mode: locally tested scaffolding marked complete without proving the
  user-visible path.

## Review questions

The independent reviewer must specifically challenge:

- whether normalizing instead of rejecting fully preserves the 0.2.3 data/API
  boundary;
- whether the exact font/profile set and weight mapping are honest and
  adequately licensed;
- whether any editor, recovery, export, raster, or MCP path still bypasses the
  effective settings;
- whether explicit GraphIR dimensions and sketch behavior have unambiguous
  precedence;
- whether the proposed tests could still pass when the UI or font asset is
  absent;
- whether package-size and Unicode limitations are documented rather than
  silently treated as complete support.
