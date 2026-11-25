import assert from 'node:assert/strict';

import { render } from '@coral-viz/browser';

// Keep this exact text as the document. The saved header selects its notation.
export const source = `@diagram architecture
api service as "API"
orders database as "Orders"
writes = api -> orders as "writes"
`;

// The production source path parses, checks, lays out, and renders the document.
// A rejected input throws CoralRenderError with located diagnostics and no SVG.
export const result = await render(source, {
  style: 'hifi', direction: 'RIGHT', title: 'Order service',
});
export const { svg } = result;
assert.equal(result.sourceGraph.version, '4.0.0');
assert.equal(result.sourceGraph.nodes.length, 2);
assert.equal(result.sourceGraph.edges.length, 1);
assert.match(svg, /^<svg/);
assert.match(svg, /API/);

// The SVG includes its font resources. Wrap that exact result for a standalone
// document; no second projection, layout, script, or network renderer is needed.
export const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Order service</title>
<style>body{margin:1rem}svg{max-width:100%;height:auto}</style>
</head>
<body>${svg}</body>
</html>`;
assert.ok(html.includes(svg));
assert.ok(result.sourceGraph.nodes.every((node) => node.position === undefined),
  'generated layout must not become authored source geometry');

// Persist source as text. sourceGraph is authored portable meaning; result.graph
// is a temporary GraphIR 3 display view, not a document to save or print.
console.log(`Rendered ${result.sourceGraph.nodes.length} nodes from saved Coral to SVG and standalone HTML.`);
