import assert from 'node:assert/strict';
import test from 'node:test';

test('the documented saved-reader example executes valid and invalid source without losing authored bytes', async () => {
  const { readCoralSource } = await import('../docs/embed/examples/read-coral-source.mjs');
  const language = await import('@coral-viz/language');
  const interchange = await import('@coral-viz/language/parser');
  assert.equal(language.parse, language.parseDocument028);
  assert.notEqual(language.parse, interchange.parse);
  const valid = "@diagram architecture\r\napi service as 'API'\r\n";
  const parsed = readCoralSource(valid);
  assert.equal(parsed.header.source, valid);
  assert.equal(parsed.graph.nodes[0].id, 'api');
  for (const source of ['@diagram architecture\napi -> missing\n', '@diagram erd\nentity entity\n']) {
    const invalid = readCoralSource(source);
    assert.equal(invalid.header.source, source);
    assert.equal(invalid.graph, undefined);
    assert.ok(invalid.header.diagnostics.length || invalid.syntax.diagnostics.some((entry) => entry.severity === 'error'));
  }
});

test('documented graph-only interchange executes and refuses saved-source authority', async () => {
  const { interchangeSource, interchangeResult } = await import('../docs/embed/examples/read-graph-interchange.mjs');
  assert.equal(interchangeResult.success, true);
  assert.equal(interchangeResult.graph.version, '3.0.0');
  assert.deepEqual(interchangeResult.graph.nodes.map((node) => node.id), ['api', 'db']);
  assert.equal(interchangeResult.graph.edges[0].source, 'api');
  assert.equal(interchangeResult.graph.edges[0].target, 'db');
  assert.equal(interchangeSource, 'service "API"\ndatabase "DB"\napi -> db');
  const { parse } = await import('@coral-viz/language/parser');
  const saved = '@diagram architecture\napi service as "API"';
  const refused = parse(saved);
  assert.equal(refused.success, false);
  assert.equal(refused.graph, undefined);
  assert.ok(refused.diagnostics.some((entry) => entry.code === 'coral.source.reader.unsupported'));
});

test('the browser ESM example executes explicit style and preserves source ownership', async () => {
  const example = await import('../docs/embed/examples/browser-esm.mjs');
  const { render } = await import('@coral-viz/browser');
  assert.equal(example.options.style, 'hifi');
  assert.equal(example.result.sourceGraph.version, '4.0.0');
  assert.equal(example.result.graph.version, '3.0.0');
  const rendered = await render(example.source, example.options);
  assert.deepEqual(example.result.sourceGraph, rendered.sourceGraph);
  assert.match(example.result.svg, /<title>Order service<\/title>/);
  assert.match(example.result.svg, /data-coral-edge=/);
  assert.deepEqual(example.result.diagnostics, []);
  await assert.rejects(render(example.source, { style: 'unknown' }));
});
