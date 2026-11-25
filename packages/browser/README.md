# @coral-viz/browser

## Coral 0.2.14

Install verified 0.2.14 archives together with the matching published GraphIR
Core 0.2.4 dependency. The commands below use exact local archive names.
Existing examples retain their documented compatibility API contracts.

Render [Coral](https://github.com/coreyt/coral) diagram source to accessible
SVG in an ordinary web page. The package has no React or editor dependency,
makes no network request, and never evaluates code. It ships as one ES module
and one self-contained script that defines a single `Coral` global.

The package accepts Coral source only. Each source document requires its saved
`@diagram` header. Headerless or retired Coral source is refused with a located
`header.diagram.required` diagnostic and no diagram. The preview `edition`
option is retired; the saved source selects its language and notation.

To render Mermaid, DOT, PlantUML, or GraphIR JSON, import or convert it in the
Coral editor first.

## Install

Install the browser package with its Core type dependency. Language/render
are bundled into the browser artifacts:

```sh
npm install ./graph-ir-core-0.2.4.tgz ./coral-viz-browser-0.2.14.tgz
```

## Render from an ES module

```javascript
import { render, renderTo } from '@coral-viz/browser';

const source = '@diagram block\napi block as "API"\norders block as "Orders"\napi -> orders';
const { svg, sourceGraph, diagnostics } = await render(source, { style: 'hifi' });

await renderTo('#diagram', source, { style: 'lowfi', theme: 'dark' });
```

`render(source, options)` resolves with the SVG text, authored `sourceGraph`,
compatibility display graph, and every warning or informational diagnostic.
`renderTo(target, source?, options?)` replaces the content of an element or
selector with the diagram, drawn inside a shadow root so page CSS cannot
restyle it. The target gets an open shadow root when it can take one; an
element that cannot, such as `<pre>`, or one whose page already attached a
shadow root, gets a single `<span data-coral-surface>` child that holds it.
Look for the SVG in that shadow root, not in the target's light DOM.
Without `source`, it reads the element's text the first time and reuses that
text afterwards. The target may belong to another window, such as a
same-origin iframe.

The options include `style` (`lowfi` or `hifi`), `theme`
(`light` or `dark`), `direction` (`RIGHT`, `DOWN`,
`LEFT`, or `UP`), and `title`. Reserved or unsupported options are refused.

## Render from a script tag

Copy `dist/coral-browser.iife.js` from the installed package alongside your
page, then load the local bundle:

```text
<script src="./coral-browser.iife.js"></script>
<pre data-coral>
@diagram block
api block as "API"
orders block as "Orders"
api -> orders
</pre>
<coral-diagram>@diagram block
worker block as "Worker"</coral-diagram>
<script>
  Coral.scan();
  Coral.defineCustomElement();
</script>
```

Nothing renders or registers automatically:

- `scan(root?, options?)` renders each `[data-coral]` element under `root`
  (an element, document, or document fragment; the page's document by
  default) once. It never scans an element again, even after a failure; call
  `renderTo` to retry.
- `defineCustomElement(tagName?)` registers `<coral-diagram>`, or the name you
  pass. The element renders its text content into its shadow root. Set its
  `source` property to render new source. It fires `coral-render` or
  `coral-error` after each render. To hide an element until it is defined,
  add `coral-diagram:not(:defined) { visibility: hidden; }`.

## Errors

Failures reject with `CoralRenderError`, which has a `code` and a list of
`diagnostics` with 1-based `line` and `column`. The ES module and the script
are separate copies, so check `error.name === 'CoralRenderError'` or
`error.code` rather than `instanceof`. The DOM helpers also show an accessible
inline error (`role="alert"`) in their own target only.

| Code | Meaning |
| --- | --- |
| `coral.browser.input.type` | The source is not a string |
| `coral.browser.input.format` | The source is another format, or is unrecognized |
| `coral.browser.input.invalid` | The source has errors or characters SVG cannot hold |
| `coral.browser.input.empty` | The source declares no nodes |
| `coral.browser.option.invalid` | An option is unknown or has an invalid value |
| `coral.browser.render.failed` | Layout or drawing failed |
| `coral.browser.target.missing` | The target is not an element or matches nothing, or the scan root is not an element, document, or fragment |
| `coral.browser.element.conflict` | The element name is invalid or already taken |
| `coral.browser.environment.unsupported` | A DOM helper ran without a browser DOM |

## Content Security Policy

The diagrams need `style-src 'unsafe-inline'`, for the SVG `<style>`, and
`font-src data:`, for the embedded Inter/Caveat faces. Scripts need only the origin
that serves this package; `unsafe-eval` is not required. Without inline
styles, the diagram is still inserted, but its text styling degrades.

Successor schema validation is compiled at build time from the exact installed
GraphIR schema. Core's structural, semantic and exact-catalog checks remain in
the bundle; no schema compiler or runtime code generation is shipped. The
derived GraphIR 3 view uses semantic validation. A request for unavailable
GraphIR 3 schema validation fails explicitly. This adds no public typed-graph
validation API or new Coral source syntax.

The SVG `<style>` stays inside the diagram's shadow root and does not apply to
the page. Embedded faces are registered once per document, because browsers
ignore `@font-face` inside shadow trees.

Pages that require Trusted Types (`require-trusted-types-for 'script'`) are not
supported, because the SVG is parsed with `DOMParser`.

## Custom-element presentation

Coral 0.2.9 exposes `renderOptions` on `CoralDiagramElement`, using
the same options as `render` and `renderTo`. Assign it before appending the
element, or replace it later to render a new presentation of the same source:

```javascript
const diagram = document.createElement('coral-diagram');
diagram.renderOptions = { style: 'hifi', theme: 'dark' };
diagram.source = '@diagram flowchart\nwork process as "Work"';
document.body.append(diagram);
```

The options are copied on assignment and read. Source meaning is preserved;
late results from previous options cannot overwrite the current shadow view.
Options assigned before custom-element registration survive upgrade. Reset
`renderOptions` to `undefined` to restore defaults. This API is part
of Coral 0.2.9.

## License

Apache-2.0. The bundles include elkjs (EPL-2.0), `@graph-ir/core`, Ajv runtime
helpers and fast-deep-equal (MIT), and
the Inter and Caveat fonts (OFL-1.1);
see `THIRD_PARTY_NOTICES.md`.

The maintained public guide includes executable ESM and script-tag examples:
[Render in an ordinary browser page](https://coreyt.github.io/coral/docs/embed/how-to/render-in-a-browser).
