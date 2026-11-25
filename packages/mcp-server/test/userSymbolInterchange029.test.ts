import { describe, expect, it } from 'vitest';
import { convertTool, handleConvert } from '../src/tools/convert.js';
import { handleRender } from '../src/tools/render.js';
import { handleValidate } from '../src/tools/validate.js';
import { projectInstalledSourceToSuccessor028, successorCoreValidationInput029 } from '@coral-viz/render';

const ARTWORK = ['  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""'];
const doc = (...lines: string[]) => ['@diagram architecture', '@coralVersion "0.2.9"', ...lines, ''].join('\n');
const used = doc('@symbol gate {', '  name "Gate"', '  size 40 x 40', '  login port [direction: in]', ...ARTWORK, '}',
  'g service [symbol: "local.gate"]', 'a service', 'a -> g:login');

describe('MCP user-symbol GraphIR interchange (R-065 AC-8)', () => {
  it('validates a user-symbol document', async () => {
    const checked = await handleValidate({ content: used });
    expect(checked.structuredContent.diagnostics.filter((item: { severity: string }) => item.severity === 'error'))
      .toEqual([]);
    expect(checked.isError).toBeUndefined();
  });

  it('converts a user-symbol document to Coral unchanged', async () => {
    const converted = await handleConvert({ content: used, from: 'coral', to: 'coral' });
    expect(converted.isError).toBeUndefined();
    expect(converted.content[0]!.text).toContain(used);
  });

  it('exports and verifies user-symbol definitions as GraphIR 4 candidate JSON', async () => {
    const converted = await handleConvert({ content: used, from: 'coral', to: 'json' });
    expect(converted.isError).toBeUndefined();
    const graph = JSON.parse(converted.content[0]!.text.slice(converted.content[0]!.text.indexOf('{')));
    expect(graph.documentCatalog[0]).toMatchObject({ id: 'local.gate', name: 'Gate',
      artwork: { profile: { id: 'coral.svg-artwork', version: '1' } } });
    expect(graph).not.toHaveProperty('userSymbols029');
    const checked = await handleValidate({ content: JSON.stringify(graph) });
    expect(checked.isError).toBeUndefined();
  });

  it('exports port connection limits as GraphIR 4 candidate JSON', async () => {
    const converted = await handleConvert({ content: doc('g service {', '  p port [direction: in, maxConnections: 2]', '}'),
      from: 'coral', to: 'json' });
    expect(converted.isError).toBeUndefined();
    const json = JSON.parse(converted.content[0]!.text.slice(converted.content[0]!.text.indexOf('{')));
    expect(json.nodes[0].semanticPorts).toEqual([{ id: 'p', direction: 'in', maxConnections: 2 }]);
    expect(json).not.toHaveProperty('userSymbols029');
  });

  it('refuses an edition 0.2.8 document over a bundled limit, located on the endpoint', async () => {
    const content = '@diagram flowchart\na process\nb process\nd decision\na -> d:in\nb -> d:in\n';
    const converted = await handleConvert({ content, from: 'coral', to: 'json' });
    expect(converted.isError).toBe(true);
    expect(converted.structuredContent.diagnostics).toEqual([expect.objectContaining({
      severity: 'error', code: 'export.graphir.port-limit.exceeded',
      range: expect.objectContaining({ start: expect.objectContaining({ line: 6 }) }) })]);
  });

  it('offers no GraphIR 3 target for saved Coral source', () => {
    expect(convertTool.inputSchema.properties.to.enum).toEqual(['coral', 'json']);
  });

  it('checks GraphIR 4 JSON artwork with the real frozen profile admission', async () => {
    const graph = successorCoreValidationInput029(projectInstalledSourceToSuccessor028(used).graph!, { limits: true }).graph;
    const checked = await handleValidate({ content: JSON.stringify(graph) });
    expect(checked.isError).toBeUndefined();
    graph.documentCatalog![0]!.artwork.profile.version = '2';
    const unknown = await handleValidate({ content: JSON.stringify(graph) });
    expect(unknown.isError).toBe(true);
    expect(unknown.structuredContent.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error',
      code: 'ARTWORK_PROFILE_UNSUPPORTED' }));
  });

  it('keeps refusing GraphIR 4 JSON input that carries Coral-only symbol fields', async () => {
    const json = { version: '4.0.0', profile: { id: 'architecture', version: '1.0.0' },
      catalog: { id: 'architecture', version: '1.0.0', digest: 'x' }, nodes: [], edges: [],
      userSymbols029: [] };
    const checked = await handleValidate({ content: JSON.stringify(json) });
    expect(checked.isError).toBe(true);
  });
});

describe('MCP renders user-symbol documents (R-065 AC-4)', () => {
  it('renders a user-symbol document to SVG', async () => {
    const rendered = await handleRender({ content: used, format: 'svg' });
    expect(rendered.isError).toBeUndefined();
    expect(rendered.content[0]!.text).toContain('<svg');
  });
});
