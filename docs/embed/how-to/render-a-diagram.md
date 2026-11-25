# How to render a diagram

Render saved Coral source to SVG and a standalone HTML document using the
production source reader, checks, layout, and renderer.

## Before you begin

Use Node.js 24.19.0 or later. Install the verified Coral 0.2.14 browser archive
with its exact published GraphIR Core pin:

```sh
npm install @graph-ir/core@0.2.4 ./coral-viz-browser-0.2.14.tgz
```

Use the archive names delivered with your verified packages. The browser
package bundles the language and render implementation; this example does not
require separate language or render installs. Verify archive checksums before
installation.

## Render the document

1. Keep the saved `@diagram` header and ID-first declarations in the source.
2. Call `render` from `@coral-viz/browser` with that exact source text.
3. Use the returned `svg`, authored `sourceGraph`, and diagnostics.
4. For standalone HTML, place the exact self-contained SVG in an HTML document,
   as shown below. Save `source` as text to reopen the diagram.

The executable source is included directly from
[`render-diagram.mjs`](../examples/render-diagram.mjs):

<<< ../examples/render-diagram.mjs

Run the example with `node render-diagram.mjs` from a directory containing the
installed package. Its exported `source`, `result`, `svg`, and `html` values
can also be imported by an application. The example does not write files.

`render` rejects unsupported or invalid input with a `CoralRenderError` carrying
located diagnostics. A missing header cannot select an older reader. Retain
rejected source as text so the author can fix it. Successful rendering returns
warnings and informational diagnostics in `result.diagnostics`.

## Keep source and display geometry distinct

`result.sourceGraph` contains the authored GraphIR 4 meaning. `result.graph` is
a temporary GraphIR 3 display projection; generated positions and connector
routes are display state. Keep the original source for editing and saving.

The lower-level `renderSvg` and `renderHtml` functions in `@coral-viz/render`
serialize supplied geometry and do not perform layout. This example uses the
production source-owned convenience path, which performs the required layout
and keeps semantic ports, connector ends, and source diagnostics paired.

## Related

- [Render API](../reference/render-api.md)
- [Render in a browser page](render-in-a-browser.md)
- [Language API](../reference/language-api.md)
- [MCP server](../reference/mcp-server.md)
- [Embed Coral](../index.md)
