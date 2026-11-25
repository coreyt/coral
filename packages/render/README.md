# @coral-viz/render

## Coral 0.2.12

Install verified 0.2.12 archives together with the matching published GraphIR
Core 0.2.4 dependency. The commands below use exact local archive names.
Existing examples retain their documented compatibility API contracts.

DOM-free Coral shapes, symbols, notations, text measurement, layout, SVG, and
standalone HTML rendering.

```sh
npm install ./graph-ir-core-0.2.4.tgz ./coral-viz-language-0.2.12.tgz ./coral-viz-render-0.2.12.tgz
```

```javascript
import { renderSvg, resolveRenderScene, glyphRegistry } from '@coral-viz/render';
import { computeElkLayout } from '@coral-viz/render/layout';
```

The root `renderSvg` and `renderHtml` functions serialize supplied geometry;
they don't perform layout. Call the additive `/layout` entry explicitly, then
apply its positions, dimensions, and route sections. The `/svg-layout` entry's
`layoutGraphForSvg` does both for a validated graph and returns the flattened
nodes and `edgeRoutes` that `renderSvg` expects; MCP `coral_render` and
`@coral-viz/browser` use it.

The additive `/artwork-import` entry provides bounded SVG import normalization
and measurement. It is separate from the root entry and does not provide
a worker or storage; see the Render API for its bounds-engine contract.

`resolveRenderScene` is the DOM-free notation boundary shared by SVG and the
reference canvas. It resolves symbol variants, the finite accessible glyph
registry, notation edge styles, and independent GraphIR source/target endpoint
semantics into deterministic JSON-safe values. Unknown advertised glyphs fail
closed instead of silently substituting a placeholder.

The 0.2.8 `renderInstalledCharacterPreview028(source, options)` API renders
bounded Block, Flowchart, BPMN, UML Class, UML Sequence and UML State source.
It validates the exact source successor/catalog and shared U1/U2 before making
a picture and ledger. Use `columns: 40`, `80` or `120`. Copy/export is printable
ASCII plus LF; controlled MonoTrue needs its exact font-face hash and validated
glyph roles, otherwise the whole output falls back to ASCII. Unsupported
placement, ports, routes, constraints, controls, nonbaseline proximity and
family constructs throw `CharacterRenderError` without changing the source.
State is a bounded source/character edition; SVG/editor visual paths refuse it.

Coral 0.2.9 adopts **MonoTrue v0.2.0** at
`1dfda76a564716e6148a342592b264a5b8b211e4`, **Diagram Set 1**. Character pictures
continue to require the Regular face; its TTF SHA-256 is
`1725392f1253a23ce6131879ec279e68e3a83695b838586ff7afe6268a55fd89`.
The older face hashes do not enable this update. Hosts provide the font and
validate every required role before supplying `monoTrue.validatedRoles`.
Coral does not bundle or embed these fonts. The selected upstream license and
attribution are retained under `third_party/monotrue/`.

Controlled pictures use Diagram Set endpoints with the correct shaft approach
and wall tees. UML synchronous calls use filled triangles; asynchronous calls
and returns use open arrows, with dashed return shafts. Class composition and
inheritance markers stay at their authored ends. These private-use characters
require the verified font; copying them into an unknown-font destination would
lose that guarantee, so `target: 'copy-export'` always returns ASCII. Missing
roles or a mismatched face/hash also select ASCII for the complete picture.
The existing supported source subset and refusals are unchanged.

`createCharacterDebugView028(text)` returns numbered row/column inspection and
a per-cell Unicode CSV for the returned preview text.

The default SVG path embeds one deterministic Inter face. Portable per-family
and per-weight font embedding is enabled by font settings, weight, or line
height—not by family or size alone. The packaged font assets cover the pinned
Latin range and carry four OFL-1.1 notices under `third_party/fonts/`.

See the
[Render API](https://coreyt.github.io/coral/docs/embed/reference/render-api)
and the executable
[rendering workflow](https://coreyt.github.io/coral/docs/embed/how-to/render-a-diagram).

Apache-2.0. See `LICENSE`.
