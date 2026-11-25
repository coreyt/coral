/** Installed-renderer consumer runtime. consumer-smoke copies this file and its
 * two sibling helpers into an isolated consumer of the packed archives and runs
 * it there, so every package import resolves to installed bytes. Fixtures are
 * read from the source checkout named by CORAL_SOURCE_ROOT. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider } from '@xyflow/react';
import * as language from '@coral-viz/language';
import { render } from '@coral-viz/browser';
import { CoralEditor, SpatialSceneSvg028, SequenceDiagram, ShapeRenderer,
  CompatibilityEdge, EndpointMarkerDefinitions, SpatialSceneMarkerDefs028 } from '@coral-viz/viz';
import { layoutGraphForSvg } from '@coral-viz/render/svg-layout';
import { renderHtml, prepareSpatialScene028, projectInstalledSourceToSuccessor028, shapeRegistry, stableSvgId,
  successorSourceDisplayWithSemanticPorts028, successorSourceDisplay028 } from '@coral-viz/render';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ACTIVE_RENDERER_SOURCE_CASES_028, DISABLED_RENDERER_SOURCE_CASES_028,
  DISABLED_RENDERER_SOURCE_CODE_028, MISSING_HEADER_RENDERER_SOURCES_028,
  REQUIRED_SOURCE_SCENE_MARKERS_028 } from './renderer-source-cases.mjs';
import { verifyLanguageReader028 } from './packed-language-reader.mjs';

const root = process.env.CORAL_SOURCE_ROOT;
assert.ok(root && isAbsolute(root), 'CORAL_SOURCE_ROOT must name the source checkout');
const consumer = realpathSync(process.cwd());
const inside = (file) => {
  const path = relative(consumer, realpathSync(file));
  return Boolean(path) && !path.startsWith('..') && !isAbsolute(path);
};
// The installed boundary: every package under test resolves from this consumer.
for (const name of ['@graph-ir/core', '@coral-viz/language', '@coral-viz/render',
  '@coral-viz/browser', '@coral-viz/viz', '@coral-viz/mcp-server']) {
  assert.ok(inside(join(consumer, 'node_modules', name)), `${name} must be installed in the consumer`);
}
for (const name of ['@graph-ir/core', '@coral-viz/language', '@coral-viz/render', '@coral-viz/browser', '@coral-viz/viz']) {
  assert.ok(inside(fileURLToPath(import.meta.resolve(name))), `${name} must resolve inside the consumer`);
}
for (const name of Object.keys(REQUIRED_SOURCE_SCENE_MARKERS_028)) {
  assert.ok(ACTIVE_RENDERER_SOURCE_CASES_028.includes(name), `Inactive required scene case: ${name}`);
}
const fixture = (name) => readFileSync(join(root, `packages/browser/test/fixtures/acceptance028/${name}.coral`), 'utf8');
const requireSceneMarks = (markup, name, surface) => {
  for (const [attribute, value] of REQUIRED_SOURCE_SCENE_MARKERS_028[name] ?? []) {
    assert.ok(markup.includes(`${attribute}="${value}"`), `${surface}/${name} omitted required ${attribute}=${value}`);
  }
};
const styles = ['lowfi', 'hifi'];
const themes = ['light', 'dark'];
const textOf = (result) => result.content.find((item) => item.type === 'text')?.text ?? '';
const svgOf = (result) => result.content.find((item) => item.type === 'text' && item.text.includes('<svg'))?.text;

await verifyLanguageReader028(language, { root, packageDirectory: join(consumer, 'node_modules/@coral-viz/language') });

// Low-level compatibility: legacy marker namespaces, scene parts and shapes.
for (const style of styles) for (const theme of themes) {
  const graph = { version: '3.0.0', metadata: { notation: 'flowchart' },
    nodes: [{ id: 'a', type: 'process', label: 'Source', position: { x: 0, y: 0 }, dimensions: { width: 100, height: 60 } },
      { id: 'b', type: 'process', label: 'Target', position: { x: 200, y: 0 }, dimensions: { width: 100, height: 60 } }],
    edges: [{ id: 'e', source: 'a', target: 'b', label: 'Moves',
      sourceEnd: { navigability: 'non-navigable', marker: { kind: 'diamond', fill: 'filled' } },
      targetEnd: { navigability: 'navigable', marker: { kind: 'arrow', fill: 'open' } } }] };
  const scene = prepareSpatialScene028(graph, { style, theme });
  const namespace = `retained-${style}-${theme}`;
  const data = { sourceLabel: 'Source', targetLabel: 'Target', label: 'Moves',
    renderStyle028: style, renderTheme028: theme, markerNamespace028: namespace,
    sourceEndpoint: scene.resolved.edges[0].source, targetEndpoint: scene.resolved.edges[0].target };
  const props = { id: 'e', source: 'a', target: 'b', sourceX: 100, sourceY: 30,
    targetX: 200, targetY: 30, sourcePosition: 'right', targetPosition: 'left' };
  const mount = (edgeData, definitions) => renderToStaticMarkup(React.createElement(ReactFlowProvider, null,
    React.createElement('svg', null, definitions, React.createElement(CompatibilityEdge, { ...props, data: edgeData }))));
  const direct = mount(data, React.createElement(EndpointMarkerDefinitions,
    { edges: [{ id: 'e', source: 'a', target: 'b', data }], markerNamespace028: namespace }));
  assert.ok(direct.includes('react-flow__edge-path') && direct.includes('Connection from Source to Target, Moves'));
  const refs = [...direct.matchAll(/marker-(?:start|end)="([^"]+)"/g)].map((match) => match[1].slice(5, -1));
  assert.equal(refs.length, 2);
  for (const id of refs) assert.ok(direct.includes(`id="${id}"`), 'legacy marker namespace');
  const parts = scene.parts.filter((part) => part.owner.kind === 'edge' && part.owner.id === 'e');
  for (const transient of [false, true]) {
    const markup = mount({ ...data, sceneParts028: parts, sceneTransient028: transient },
      React.createElement(SpatialSceneMarkerDefs028, { scene, namespace: stableSvgId('coral-instance', namespace) }));
    assert.ok(markup.includes('data-coral-part-id="e:shaft"') && !markup.includes('react-flow__edge-path'));
    assert.ok(markup.includes('Connection from Source to Target, Moves, source non-navigable, target navigable'));
    for (const ref of markup.matchAll(/marker-(?:start|end)="([^"]+)"/g)) {
      assert.ok(markup.includes(`id="${ref[1].slice(5, -1)}"`), 'scene marker namespace');
    }
  }
  const empty = mount({ ...data, sceneParts028: [] }, null);
  assert.ok(!empty.includes('react-flow__edge-path') && !empty.includes('data-coral-scene-edge') &&
    !empty.includes('aria-label="Connection from'));
  const shape = renderToStaticMarkup(React.createElement(ShapeRenderer,
    { shape: shapeRegistry.get('rectangle'), ownerId: 'retained', renderStyle028: style }));
  assert.ok(shape.includes('data-coral-part-id="retained:outline"'));
}
const customShape = { id: 'custom-retained', viewBox: '0 0 100 60',
  defaultSize: { width: 100, height: 60 }, path: 'M0 0 L100 0 L100 60 Z' };
assert.ok(renderToStaticMarkup(React.createElement(ShapeRenderer, { shape: customShape })).includes(customShape.path));

const mcpPackage = join(consumer, 'node_modules/@coral-viz/mcp-server');
const mcpManifest = JSON.parse(readFileSync(join(mcpPackage, 'package.json'), 'utf8'));
const mcpBin = resolve(mcpPackage, typeof mcpManifest.bin === 'string' ? mcpManifest.bin : mcpManifest.bin['coral-mcp']);
assert.ok(inside(mcpBin), 'Installed MCP bin must stay inside its package');
const client = new Client({ name: 'installed-renderer', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [mcpBin] }));
try {
  // Mermaid -> Coral -> validate -> GraphIR 4 -> validate -> render, each step
  // consuming the exact generated bytes without a writer or reformat.
  const mermaid = ['sequenceDiagram', 'actor User', 'participant App', 'participant Worker',
    'User->>App: submit', 'App-)Worker: dispatch', 'Worker-->>App: complete'].join('\n');
  const converted = await client.callTool({ name: 'coral_convert', arguments: {
    content: mermaid, from: 'mermaid', to: 'coral', strict: true } });
  assert.ok(!converted.isError, 'installed MCP Mermaid source conversion');
  assert.deepEqual(converted.structuredContent?.diagnostics, []);
  const convertedText = textOf(converted);
  const sourceStart = convertedText.indexOf('@diagram uml-sequence');
  assert.ok(sourceStart >= 0, 'installed MCP conversion must return current Coral source');
  const generated = convertedText.slice(sourceStart);
  const projected = projectInstalledSourceToSuccessor028(generated);
  assert.deepEqual(projected.diagnostics, []);
  assert.equal(projected.graph.nodes.find((node) => node.id === 'User')?.type, 'actor');
  assert.deepEqual(projected.graph.interaction.messages.map((message) => message.kind),
    ['synchronous', 'asynchronous', 'return']);
  const validated = await client.callTool({ name: 'coral_validate', arguments: { content: generated } });
  assert.ok(!validated.isError, 'installed MCP must validate the exact generated Coral');
  assert.deepEqual(validated.structuredContent?.diagnostics, [],
    'installed MCP must complete exact GraphIR successor verification');
  const exported = await client.callTool({ name: 'coral_convert', arguments: {
    content: generated, to: 'json', strict: true } });
  assert.ok(!exported.isError, 'installed MCP must export GraphIR 4 from the exact generated Coral');
  const exportedText = textOf(exported);
  const exportedGraph = exportedText.slice(exportedText.indexOf('{'));
  assert.equal(JSON.parse(exportedGraph).version, '4.0.0');
  const validatedGraph = await client.callTool({ name: 'coral_validate', arguments: {
    content: exportedGraph, strict: true } });
  assert.ok(!validatedGraph.isError, 'installed MCP must validate its exported GraphIR 4');
  assert.deepEqual(validatedGraph.structuredContent?.diagnostics, [],
    'installed GraphIR 4 must pass exact-catalog verification');
  const rendered = await client.callTool({ name: 'coral_render', arguments: { content: generated } });
  assert.ok(!rendered.isError, 'installed MCP must render the exact generated Coral');
  const renderedSvg = svgOf(rendered) ?? '';
  for (const id of ['msg_1', 'msg_2', 'msg_3']) {
    assert.ok(renderedSvg.includes(`data-coral-sequence-message="${id}"`), id);
  }
  assert.ok(renderedSvg.includes('data-coral-sequence-participant="User"'));
  const activation = await client.callTool({ name: 'coral_convert', arguments: {
    content: 'sequenceDiagram\nparticipant A\nparticipant B\nA->>+B: hi\nB-->>-A: done',
    from: 'mermaid', to: 'coral', strict: true } });
  assert.equal(activation.isError, true, 'installed Mermaid import boundary');
  assert.ok(activation.structuredContent?.diagnostics.some((item) => item.code === 'mcp.coral028.import.unsupported'));
  assert.ok(!activation.content.some((item) => item.type === 'text' && item.text.includes('@diagram')));

  for (const name of DISABLED_RENDERER_SOURCE_CASES_028) {
    const source = fixture(name);
    assert.equal(projectInstalledSourceToSuccessor028(source).graph, undefined, name);
    for (const style of styles) for (const theme of themes) {
      await assert.rejects(render(source, { style, theme }), (error) =>
        error.diagnostics?.some(({ code }) => code === DISABLED_RENDERER_SOURCE_CODE_028));
      const result = await client.callTool({ name: 'coral_render', arguments: { content: source, options: { style, theme } } });
      assert.equal(result.isError, true, `${name}/${style}/${theme}`);
      assert.ok(result.structuredContent?.diagnostics?.some(({ code }) => code === DISABLED_RENDERER_SOURCE_CODE_028));
      assert.equal(svgOf(result), undefined);
    }
  }
  const graphJson = JSON.stringify({ version: '3.0.0', id: 'explicit-json',
    nodes: [{ id: 'api', type: 'service', label: 'JSON' }], edges: [] });
  const jsonRender = await client.callTool({ name: 'coral_render', arguments: { content: graphJson } });
  assert.ok(!jsonRender.isError && svgOf(jsonRender)?.includes('>JSON</text>'));
  for (const { name, source } of MISSING_HEADER_RENDERER_SOURCES_028) {
    await assert.rejects(render(source), (error) => error.code === 'coral.browser.input.invalid' &&
      error.diagnostics?.some(({ code, range }) => code === 'header.diagram.required' && range?.start));
    const result = await client.callTool({ name: 'coral_render', arguments: { content: source } });
    assert.equal(result.isError, true, name);
    assert.ok(result.structuredContent?.diagnostics?.some(({ code, range }) =>
      code === 'header.diagram.required' && range?.start), name);
    assert.equal(svgOf(result), undefined, name);
  }
  // Browser columns are one based; language/MCP columns are zero based.
  // Compare source offsets and diagnostic meaning across that documented API difference.
  const warningMeaning = (items) => items.map(({ severity, code, message, subject, range }) =>
    ({ severity, code, message, subject, start: range?.start.offset, end: range?.end.offset }));
  for (const name of ACTIVE_RENDERER_SOURCE_CASES_028) {
    const source = fixture(name);
    const authored = projectInstalledSourceToSuccessor028(source).graph;
    assert.ok(authored, name);
    for (const style of styles) for (const theme of themes) {
      const surface = `${name}/${style}/${theme}`;
      const browser = await render(source, { style, theme });
      assert.deepEqual(browser.sourceGraph, authored, surface);
      requireSceneMarks(browser.svg, name, 'installed Node browser');
      const result = await client.callTool({ name: 'coral_render', arguments: { content: source, options: { style, theme } } });
      assert.ok(!result.isError, JSON.stringify(result));
      const svg = svgOf(result);
      assert.ok(svg?.includes('data-coral-part-id'), surface);
      requireSceneMarks(svg, name, 'installed MCP');
      assert.deepEqual(warningMeaning(result.structuredContent?.diagnostics ?? []), warningMeaning(browser.diagnostics),
        `${surface}: installed warning transport`);
      if (authored.interaction) {
        const canvas = renderToStaticMarkup(React.createElement(SequenceDiagram,
          { graph: successorSourceDisplay028(authored), renderStyle028: style, themeMode: theme }));
        assert.ok(canvas.includes('data-coral-part-id') && !canvas.includes('role="alert"'), surface);
        requireSceneMarks(canvas, name, 'installed sequence canvas');
      } else {
        const pair = successorSourceDisplayWithSemanticPorts028(authored);
        const graph = await layoutGraphForSvg(pair.display, { direction: 'RIGHT',
          semanticInterpretations: pair.semanticInterpretations });
        const scene = prepareSpatialScene028(graph, { style, theme,
          semanticGraph: authored, semanticInterpretations: pair.semanticInterpretations });
        const html = renderHtml(graph, { style, theme });
        assert.ok(html.includes('<svg') && html.includes('data-coral-part-id'), surface);
        assert.ok(renderToStaticMarkup(React.createElement(SpatialSceneSvg028, { scene })).includes('data-coral-part-id'), surface);
        // CoralEditor accepts a GraphIR 3 display graph and the style option.
        // Theme parity is exercised above through its public scene projector.
        const editor = renderToStaticMarkup(React.createElement(CoralEditor, { graph, renderStyle028: style }));
        assert.ok(editor.includes('data-coral-part-id') && !editor.includes('role="alert"'), `${surface}: installed public editor`);
      }
    }
  }
} finally { await client.close(); }
console.log('Installed language reader, low-level compatibility, MCP Mermaid chain and refusals, and the active/disabled/headerless source matrix passed.');
