# Render in an ordinary browser page

Use `@coral-viz/browser` when a page needs accessible SVG from Coral source
without React or editor integration.

The package accepts Coral source only. Import Mermaid, DOT, PlantUML, or GraphIR
through an explicit supported conversion first; this API does not accept their
text or GraphIR JSON directly. Source writers cover bounded subsets and can
refuse input; preserve the original document when conversion is unavailable.
Rendering makes no network request, and nothing scans the document or registers
an element automatically.

## Install the package

Use the verified 0.2.17 archive with the published Core dependency:

```sh
npm install @graph-ir/core@0.2.4 ./coral-viz-browser-0.2.17.tgz
```

The archive bundles its Coral language and render implementation. Use local
assets from the same verified package version.

## ES module

Bundle the package with your application and provide a target element whose id
is `diagram`:

<<< ../examples/browser-esm.mjs

`render` returns `svg`, diagnostics, authored GraphIR 4 `sourceGraph`, and
`graph`, a temporary GraphIR 3 display projection before layout. Layout produces
the SVG geometry. Keep the original source for editing and saving; neither a
display projection nor generated SVG replaces its authored meaning.

`renderTo` inserts accessible SVG into a shadow root on the target (or on a
`<span data-coral-surface>` child of a target that cannot have one), so page
CSS cannot restyle the diagram. The closed option set is
`theme` (`light` or `dark`), `style` (`lowfi` or `hifi`), `direction` (`RIGHT`,
`DOWN`, `LEFT`, or `UP`), and `title`; unknown options fail.
The default style is `lowfi`; the example explicitly selects `hifi`.
Invalid source is rejected with
located diagnostics. Preserve rejected text for correction.

## Self-contained script

Copy the package's built IIFE to the shown local asset path (or another path
you control), then call the helpers explicitly:

<<< ../examples/browser-script.html

`scan()` processes each `[data-coral]` target once. `defineCustomElement()`
registers `<coral-diagram>` idempotently. The script adds only the `Coral`
global. Keep that asset version aligned with the installed package.

Reference owners: [Shared examples and editable
source](../../use/how-to/start-from-an-example.md), [Language Specification
1.3.0](../reference/language-specification-1.3.0.md), [Language evolution
policy](../../contribute/reference/language-evolution.md).

## Related

- [Embed Coral](../index.md)
- [Render API](../reference/render-api.md)
- [Render a diagram with the low-level packages](render-a-diagram.md)
- [Capability matrix](../../use/reference/capabilities.md)
