import { describe, expect, it } from 'vitest';
import { handleLayout } from '../src/tools/layout.js';
import { handleValidate } from '../src/tools/validate.js';
import { handleConvert } from '../src/tools/convert.js';
import { handleRender } from '../src/tools/render.js';
import { handleExplain } from '../src/tools/explain.js';

const dsl = `@diagram architecture
api service as "API"
store database as "Store"

api -> store`;

describe('Coral MCP tools', () => {
  it.each([handleValidate, handleConvert, handleLayout, handleRender, handleExplain])('retains all parser failures in text and structured output (%#)', async (handler) => {
    const response = await handler({ content: '@diagram architecture\na service\nb service\na service\na -> b [flow, label: "one"] as "two"\na -> missing' });
    expect(response).toMatchObject({ isError: true, structuredContent: { diagnostics: expect.any(Array) } });
    const diagnostics = (response as { structuredContent: { diagnostics: Array<{ code: string; message: string; related?: unknown[] }> } }).structuredContent.diagnostics;
    expect(diagnostics).toHaveLength(3);
    expect(diagnostics[0].related).toHaveLength(1);
    expect(response.content[0].text).toContain('Related (line 2, column');
    for (const diagnostic of diagnostics) expect(response.content[0].text).toContain(diagnostic.code);
    expect(response.content[0].text).toMatch(/column \d+/);
    expect(response.content[0].text).not.toContain('<svg');
  });
  it('validates DSL through the shared language and GraphIR contracts', async () => {
    const response = await handleValidate({ content: dsl });
    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain('Validation: valid coral-dsl');
  });

  it.each([
    ['headerless', 'service "API" as api'],
    ['retired header', '@graph {"id":"old"}\nservice "API" as api'],
  ])('refuses %s Coral instead of validating it with the old reader', async (_name, content) => {
    const response = await handleValidate({ content });
    expect(response.isError).toBe(true);
    expect(response.structuredContent.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'header.diagram.required',
        range: expect.objectContaining({ start: expect.objectContaining({ line: 1 }) }) }),
    ]));
  });

  it('rejects legacy GraphIR 1.0 input from the validation boundary', async () => {
    const response = await handleValidate({
      content: JSON.stringify({ version: '1.0', id: 'legacy', nodes: [], edges: [] }),
    });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toMatch(/schema|version/i);
  });

  it('returns geometry produced by ELK', async () => {
    const response = await handleLayout({ content: dsl });
    expect(response.content[0].text).toContain('Layout computed with ELK for 2 nodes');
    const json = JSON.parse(response.content[0].text.split('\n\n')[1]);
    expect(json.layout.nodes).toHaveLength(2);
    expect(json.layout.width).toBeGreaterThan(0);
  });

  it('lays out nested nodes and edges that cross hierarchy boundaries', async () => {
    const response = await handleLayout({
      content: `@diagram architecture
platform group as "Platform" {
  api service as "API"
}
store database as "Store"
platform.api -> store`,
    });
    const json = JSON.parse(response.content[0].text.split('\n\n')[1]);
    expect(json.layout.nodes).toHaveLength(3);
    expect(json.layout.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'platform.api', parentId: 'platform' }),
      expect.objectContaining({ id: 'store' }),
    ]));
    expect(json.layout.edges[0].sections.length).toBeGreaterThan(0);

    const api = json.layout.nodes.find((node: { id: string }) => node.id === 'platform.api');
    const store = json.layout.nodes.find((node: { id: string }) => node.id === 'store');
    const section = json.layout.edges[0].sections[0];
    const inside = (point: { x: number; y: number }, node: {
      x: number; y: number; width: number; height: number;
    }) => point.x >= node.x && point.x <= node.x + node.width
      && point.y >= node.y && point.y <= node.y + node.height;
    expect(inside(section.startPoint, api)).toBe(true);
    expect(inside(section.endPoint, store)).toBe(true);
  });

  it('returns nested sibling edge endpoints in absolute coordinates', async () => {
    const response = await handleLayout({
      content: `@diagram architecture
platform group as "Platform" {
  api service as "API"
  worker service as "Worker"
  api -> worker
}`,
    });
    const { layout } = JSON.parse(response.content[0].text.split('\n\n')[1]);
    const api = layout.nodes.find((node: { id: string }) => node.id === 'platform.api');
    const worker = layout.nodes.find((node: { id: string }) => node.id === 'platform.worker');
    expect(worker.x).toBeGreaterThan(api.x + api.width);
    const section = layout.edges[0].sections[0];
    const inside = (point: { x: number; y: number }, node: {
      x: number; y: number; width: number; height: number;
    }) => point.x >= node.x && point.x <= node.x + node.width
      && point.y >= node.y && point.y <= node.y + node.height;
    expect(inside(section.startPoint, api)).toBe(true);
    expect(inside(section.endPoint, worker)).toBe(true);
  });

  it('returns multilevel internal edge endpoints in absolute coordinates', async () => {
    const response = await handleLayout({
      content: `@diagram architecture
outer group as "Outer" {
  inner group as "Inner" {
    a service as "A"
    b service as "B"
    a -> b
  }
}`,
    });
    const { layout } = JSON.parse(response.content[0].text.split('\n\n')[1]);
    const a = layout.nodes.find((node: { id: string }) => node.id === 'outer.inner.a');
    const b = layout.nodes.find((node: { id: string }) => node.id === 'outer.inner.b');
    expect(b.x).toBeGreaterThan(a.x + a.width);
    const section = layout.edges[0].sections[0];
    const inside = (point: { x: number; y: number }, node: {
      x: number; y: number; width: number; height: number;
    }) => point.x >= node.x && point.x <= node.x + node.width
      && point.y >= node.y && point.y <= node.y + node.height;
    expect(inside(section.startPoint, a)).toBe(true);
    expect(inside(section.endPoint, b)).toBe(true);
  });
});

// ============================================================================
// Error and option paths (R-030)
// ============================================================================

describe('coral_validate: input shapes', () => {
  it('reports invalid JSON as unrecognized by the shared detector', async () => {
    const r = await handleValidate({ content: '{ not json' });
    expect((r.content[0] as { text: string }).text).toContain('mcp.input.unrecognized');
  });

  it('accepts the legacy 1.0 schema spelling', async () => {
    const r = await handleValidate({
      content: JSON.stringify({ version: '1.0', id: 'g', nodes: [], edges: [] }),
    });
    expect((r.content[0] as { text: string }).text).not.toMatch(/INVALID_JSON/);
  });

  it('migrates GraphIR 2 input to 3.0.0 before validating it (R-064 AC-3)', async () => {
    const r = await handleValidate({
      content: JSON.stringify({ version: '2.0.0', id: 'g', nodes: [{ id: 'a', type: 'service', label: 'A' }], edges: [] }),
    });
    const text = (r.content[0] as { text: string }).text;
    expect(r.isError).toBeFalsy();
    expect(text).toContain('Validation: valid graph-ir-json');
    expect(text).toContain('Migrated GraphIR 2.0.0 to 3.0.0');
  });

  it('routes detected Mermaid through the importer instead of the Coral parser', async () => {
    const r = await handleValidate({ content: 'graph TD\n  A[Alpha] --> B[Beta]' });
    expect(r.isError).toBeFalsy();
    expect((r.content[0] as { text: string }).text).toContain('Validation: valid mermaid');
  });

  it('reports a Coral parse error with its line', async () => {
    const r = await handleValidate({ content: '@diagram architecture\na service\n!!!bad!!!' });
    expect((r.content[0] as { text: string }).text).toMatch(/PARSE_ERROR \(line 3\)/);
  });

  it('prints the diagnostic code on each parse-error line', async () => {
    const r = await handleValidate({ content: '@diagram architecture\na service\n!!!bad!!!' });
    expect((r.content[0] as { text: string }).text).toMatch(/✗ PARSE_ERROR \(line 3\) coral\.syntax\.token\.invalid: /);
  });

  it.each([
    ['a duplicate connector type', 'a service\nb service\na -> b [flow, type: calls]', 'coral.syntax.type.duplicate'],
    ['an equals bracket field', 'a service\nb service\na -> b [label = "x"]', 'coral.syntax.bracket.comma-required'],
    ['a positional second bracket value', 'a service\nb service\na -> b [flow, "Yes"]', 'coral.syntax.bracket.unknown-positional'],
    ['a legacy data clause', 'a service data {"label":"x"}', 'coral.syntax.statement.trailing'],
    ['a duplicate id', 'a service\na database', 'coral.identity.node.duplicate'],
    ['a trailing bracket comma', 'a service\nb service\na -> b [flow,]', 'coral.syntax.bracket.trailing-comma'],
  ])('rejects %s with its 0.2.8 code', async (_name, body, code) => {
    const r = await handleValidate({ content: `@diagram architecture\n${body}` });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toContain(`${code}: `);
  });

  it('flags a dangling edge reference', async () => {
    const r = await handleValidate({
      content: JSON.stringify({
        version: '3.0.0',
        id: 'g',
        nodes: [{ id: 'a', type: 'service', label: 'A' }],
        edges: [{ id: 'e', source: 'a', target: 'missing' }],
      }),
    });
    expect((r.content[0] as { text: string }).text).toMatch(/✗/);
  });

  it('runs in strict mode', async () => {
    const r = await handleValidate({ content: '@diagram architecture\na service as "A"', strict: true });
    expect(r.content[0]).toBeDefined();
  });
});

describe('shared graph reader (R-064)', () => {
  it('lays out every detected text format', async () => {
    for (const content of ['graph TD\n  A --> B', 'digraph G { a -> b }', '@startuml\n[A] --> [B]\n@enduml']) {
      const r = await handleLayout({ content });
      expect(r.isError, content).toBeFalsy();
    }
  });

  it('reports unrecognized input instead of parsing it as Coral', async () => {
    const r = await handleLayout({ content: 'PNG\u0000binary' });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r)).toContain('mcp.input.unrecognized');
  });

  it.each([
    ['coral_layout', handleLayout],
    ['coral_render', handleRender],
    ['coral_explain', handleExplain],
  ])('%s rejects every JSON null-detection as unrecognized', async (_name, handler) => {
    for (const content of ['{"hello":1}', '{ not json']) {
      const r = await handler({ content });
      expect(r.isError, content).toBe(true);
      expect(JSON.stringify(r), content).toContain('mcp.input.unrecognized');
    }
  });

  it.each([
    ['coral_layout', handleLayout],
    ['coral_render', handleRender],
    ['coral_explain', handleExplain],
  ])('%s returns structured reasons for malformed detected GraphIR', async (_name, handler) => {
    const cases = [
      ['mcp.input.graphir.invalid', { version: '3.0.0', id: 'bad', nodes: [{}], edges: [] }],
      ['mcp.input.graphir.migration', { version: '2.0.0', nodes: [], edges: [] }],
    ] as const;
    for (const [code, value] of cases) {
      const r = await handler({ content: JSON.stringify(value) });
      expect(r.isError, code).toBe(true);
      expect(r.structuredContent, code).toMatchObject({
        diagnostics: expect.arrayContaining([expect.objectContaining({ severity: 'error', code })]),
      });
      expect(JSON.stringify(r), code).toContain(code);
    }
  });

  it.each([
    ['coral_layout', handleLayout],
    ['coral_render', handleRender],
    ['coral_explain', handleExplain],
    ['coral_validate', handleValidate],
  ])('%s retains every failed GraphIR 2 migration diagnostic', async (_name, handler) => {
    const r = await handler({ content: JSON.stringify({
      version: '2.0.0', nodes: [{}, {}], edges: [{}],
    }) });
    expect(r.isError).toBe(true);
    expect(r.structuredContent.diagnostics).toHaveLength(8);
    expect(r.structuredContent.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'mcp.input.graphir.migration', message: expect.stringContaining('/id:') }),
      expect.objectContaining({ code: 'mcp.input.graphir.migration', message: expect.stringContaining('/nodes/1/type:') }),
      expect.objectContaining({ code: 'mcp.input.graphir.migration', message: expect.stringContaining('/edges/0/target:') }),
    ]));
  });

  it.each([
    ['coral_layout', handleLayout],
    ['coral_render', handleRender],
    ['coral_explain', handleExplain],
  ])('%s retains every failed GraphIR 1 migration diagnostic', async (_name, handler) => {
    const r = await handler({ content: JSON.stringify({
      version: '1.0.0', nodes: [{}, {}], edges: [{}],
    }) });
    expect(r.isError).toBe(true);
    expect(r.structuredContent.diagnostics).toHaveLength(9);
    expect(r.structuredContent.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'mcp.input.graphir.migration', message: expect.stringContaining('/nodes/1:') }),
      expect.objectContaining({ code: 'mcp.input.graphir.migration', message: expect.stringContaining('/edges/0:') }),
    ]));
  });

  it.each([
    ['JSON matching neither supported shape', '{"hello":1}'],
    ['invalid JSON', '{ not json'],
  ])('coral_validate reports %s as unrecognized', async (_label, content) => {
    const r = await handleValidate({ content });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r)).toContain('mcp.input.unrecognized');
  });

  it('coral_convert reports unrecognized input instead of parsing it as Coral', async () => {
    const r = await handleConvert({ content: '{"hello":1}' });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r)).toContain('mcp.input.unrecognized');
  });

  it('coral_validate names a Coral document instead of reporting GraphIR schema errors', async () => {
    const r = await handleValidate({ content: JSON.stringify({ schemaVersion: '1.0.0', content: { format: 'graph-ir' } }) });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toContain('mcp.input.coral-document');
    expect(r.structuredContent.diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', code: 'mcp.input.coral-document' }),
    ]);
  });

  it('coral_validate returns unrecognized JSON in its structured diagnostic channel', async () => {
    const r = await handleValidate({ content: '{"hello":1}' });
    expect(r.isError).toBe(true);
    expect(r.structuredContent.diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', code: 'mcp.input.unrecognized' }),
    ]);
  });

  it('makes GraphIR 2 migration warnings structured and strict', async () => {
    const content = JSON.stringify({
      version: '2.0.0', id: 'lossy', metadata: { notation: 'unknown-legacy' }, nodes: [], edges: [],
    });
    const permissive = await handleValidate({ content, strict: false });
    expect(permissive.isError).toBeFalsy();
    expect(permissive.structuredContent.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'warning', code: 'UNKNOWN_LEGACY_NOTATION' }),
    ]));

    const strict = await handleValidate({ content, strict: true });
    expect(strict.isError).toBe(true);
    expect((strict.content[0] as { text: string }).text).toContain('Validation: invalid graph-ir-json');
    expect(strict.structuredContent.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'warning', code: 'UNKNOWN_LEGACY_NOTATION' }),
    ]));
  });

  it('rejects a Coral document with a clear reason instead of a schema failure', async () => {
    const r = await handleLayout({ content: JSON.stringify({ schemaVersion: '1.0.0', content: { format: 'graph-ir' } }) });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toMatch(/Coral document/);
  });

  it('renders with the graph header notation when no notation option is given', async () => {
    const architecture = await handleRender({ content: '@diagram architecture\nx service as "First"\ny database as "Next"\nx -> y' });
    const flow = await handleRender({ content: '@diagram flowchart\nx decision as "First"\ny process as "Next"\nx -> y' });
    expect(architecture.isError).toBeFalsy();
    expect(flow.isError).toBeFalsy();
    expect(JSON.stringify(architecture)).not.toBe(JSON.stringify(flow));
    const disabled = await handleRender({ content: '@diagram erd\nx entity\ny entity\nx -> y' });
    expect(disabled.isError).toBe(true);
    expect(disabled.structuredContent?.diagnostics).toContainEqual(expect.objectContaining({
      code: 'header.diagram.disabled',
    }));
  });
});

describe('coral_layout: options and failures', () => {
  it('rejects Coral text that does not parse', async () => {
    await expect(handleLayout({ content: '@diagram architecture\n!!!not coral!!!' })).resolves.toMatchObject({ isError: true,
      structuredContent: { diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'coral.syntax.token.invalid', position: expect.objectContaining({ line: 2 }) }),
      ]) } });
  });

  it('rejects a graph that does not validate', async () => {
    await expect(
      handleLayout({
        content: JSON.stringify({
          version: '3.0.0',
          id: 'g',
          nodes: [{ id: 'a', type: 'service', label: 'A' }],
          edges: [{ id: 'e', source: 'a', target: 'nope' }],
        }),
      })
    ).resolves.toMatchObject({
      isError: true,
      structuredContent: { diagnostics: [expect.objectContaining({
        severity: 'error', code: 'mcp.input.graphir.invalid',
      })] },
    });
  });

  it('accepts the legacy 1.0 schema spelling', async () => {
    const r = await handleLayout({
      content: JSON.stringify({
        version: '1.0',
        id: 'g',
        nodes: [{ id: 'a', type: 'service', label: 'A' }],
        edges: [],
      }),
    });
    expect(r).toBeDefined();
  });

  it.each([['RIGHT'], ['DOWN'], ['LEFT'], ['UP']])('lays out in the %s direction', async (direction) => {
    const r = await handleLayout({
      content: '@diagram architecture\na service as "A"\nb service as "B"\n\na -> b',
      options: { direction },
    });
    expect(r.isError).not.toBe(true);
  });

  it.each([['layered'], ['mrtree'], ['force'], ['box']])('supports the %s algorithm', async (algorithm) => {
    const r = await handleLayout({
      content: '@diagram architecture\na service as "A"\nb service as "B"\n\na -> b',
      options: { algorithm },
    });
    expect(r.isError).not.toBe(true);
  });

  it('honours custom spacing', async () => {
    const r = await handleLayout({
      content: '@diagram architecture\na service as "A"\nb service as "B"\n\na -> b',
      options: { nodeSpacing: 120, layerSpacing: 200 },
    });
    expect(r.isError).not.toBe(true);
  });
});
