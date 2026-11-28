# @coral-viz/render

## Coral 0.2.17

Install verified 0.2.17 archives together with the matching published GraphIR
Core 0.2.4 dependency. The commands below use exact local archive names.
Existing examples retain their documented compatibility API contracts.

DOM-free Coral shapes, symbols, notations, text measurement, layout, SVG, and
standalone HTML rendering.

```sh
npm install ./graph-ir-core-0.2.4.tgz ./coral-viz-language-0.2.17.tgz ./coral-viz-render-0.2.17.tgz
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

Use `await renderText(source)` for US Letter ASCII pages or
`await renderText(source, { profile: 'comment', commentStyle: 'slash' })`
for a UTF-8 code comment. Use `renderTextGraph` with GraphIR 3. Both return
the complete text, individual pages, dimensions, continuation links, and
diagnostics. Architecture, infrastructure, flowchart, ERD, UML class,
UML sequence, UML state, block, BPMN, AI/ML, data engineering, code, and
sketch have text adapters.

The legacy `renderInstalledCharacterPreview028`, `renderCharacterGraph028`,
`adaptCharacterGraph028`, and `createCharacterDebugView028` exports are
deprecated and unsupported. Controlled `monotrue-v1` displays supply the
MonoTrue v0.2.0 Regular font and its verified roles.

Coral 0.2.17 keeps `lowfi` and `hifi` as basic monochrome black-and-white
outputs, exports `parrotfish` (`anemone`) for modeled presentation styling
without changing layout, flow, or routing, adds visual and hierarchical
`@diagram uml-state` in edition `0.2.17`, exports
`transpileAndVerifyMermaidToCoral` for verified Top-5 Mermaid transpilation, and
ships the standalone `coral` CLI (`validate`, `render --format svg|html|txt|ascii`,
`convert --from ... --to coral|json`):

```sh
npx -y --package=@coral-viz/render -- coral validate diagram.coral
npx -y --package=@coral-viz/render -- coral render --format svg diagram.coral > diagram.svg
```

The default SVG path embeds one deterministic Inter face. Portable per-family
and per-weight font embedding is enabled by font settings, weight, or line
height—not by family or size alone. The packaged font assets cover the pinned
Latin range and carry four OFL-1.1 notices under `third_party/fonts/`.

See the
[Render API](https://coreyt.github.io/coral/docs/embed/reference/render-api)
and the executable
[rendering workflow](https://coreyt.github.io/coral/docs/embed/how-to/render-a-diagram).

Apache-2.0. See `LICENSE`.

For custom text pages, use `coral render --format txt --page-width 50
--page-height 30`. Controlled MonoTrue environments can supply their capability
JSON with `--charset monotrue-v1 --monotrue-capability font.json`.
