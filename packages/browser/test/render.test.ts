import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateIR } from '@graph-ir/core';
import { parseInstalledDocument028, shapeRegistry, stencilFitPoint028,
  stencilRayPoint028 } from '@coral-viz/render';
import { layoutGraphForSvg } from '@coral-viz/render/svg-layout';
import { handleRender } from '../../mcp-server/src/tools/render.js';
import { CoralRenderError, render, version, type CoralRenderOptions } from '../src/index.js';
import { UNAVAILABLE_FACE, assertAvailableFaces, toCoralDiagnostic } from '../src/render.js';
import { ACTIVE_RENDERER_SOURCE_CASES_028 } from '../../../scripts/renderer-source-cases.mjs';

const fixtures = resolve(import.meta.dirname, 'fixtures');
const fixture = (name: string): string => readFileSync(resolve(fixtures, name), 'utf8');
const normalizedSvg = (svg: string): string => {
  const ids = new Map<string, string>();
  return svg.replace(/(?:coral-instance|coral-glyph-title)-[0-9a-f]+(?:-[0-9a-f]+)*/g, (id) => {
    if (!ids.has(id)) ids.set(id, `DOM-SCOPE-${ids.size + 1}`);
    return ids.get(id)!;
  });
};
const FIXTURES = ['flowchart-25.coral', 'bpmn.coral', 'relationship-ends.coral', 'uml-class.coral', 'uml-sequence.coral'];
const SAVED_HEADER_PARITY = [
  ['architecture', '@diagram architecture\napi service\n'],
  ['flowchart', '@diagram flowchart\nstart process\n'],
  ['bpmn', '@diagram bpmn\nreceived event\n'],
  ['uml-class', '@diagram uml-class\nOrder class\n'],
  ['uml-sequence', '@diagram uml-sequence\nclient participant\n'],
  ['uml-sequence reverse', '@diagram uml-sequence\nclient participant\nserver participant\n' +
    'reply = client <- server as "reverse reply"'],
] as const;

async function failure(promise: Promise<unknown>): Promise<CoralRenderError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CoralRenderError);
    return error as CoralRenderError;
  }
  throw new Error('expected a CoralRenderError');
}

async function mcpSvg(content: string): Promise<string> {
  const result = await handleRender({ content });
  const text = (result.content[0] as { text: string }).text;
  if (result.isError || !text.includes('<svg')) throw new Error(`MCP render failed: ${text.slice(0, 300)}`);
  return text.slice(text.indexOf('<svg'));
}

describe('render', () => {
  it('uses enabled saved-header Coral source for every browser package fixture', () => {
    for (const name of FIXTURES) {
      expect(fixture(name), name).toMatch(/^@diagram (?!erd\b)[a-z][a-z-]*\n/);
    }
  });

  it('refuses disabled Chen source instead of rendering a diagram', async () => {
    const error = await failure(render('@diagram erd\ncustomer entity\n'));
    expect(error.code).toBe('coral.browser.input.invalid');
    expect(error.diagnostics.map((item) => item.code)).toContain('header.diagram.disabled');
  });

  it('renders the bundled BPMN example from saved 0.2.8 Coral source', async () => {
    const source = fixture('bpmn.coral');
    expect(source).toMatch(/^@diagram bpmn\n/);
    const result = await render(source);
    expect(result.sourceGraph?.nodes).toHaveLength(5);
    expect(result.sourceGraph?.nodes.find((node) => node.id === 'task')).toMatchObject({ variant: 'user' });
    expect(result.sourceGraph?.edges.map((edge) => edge.id))
      .toEqual(['toTask', 'toGateway', 'toEnd', 'toRevise', 'retry']);
    expect(result.svg).toContain('Approve invoice');
  });

  it('renders the bundled sequence example from saved 0.2.8 Coral source', async () => {
    const source = fixture('uml-sequence.coral');
    expect(source).toMatch(/^@diagram uml-sequence\n/);
    const result = await render(source);
    expect(result.sourceGraph?.interaction?.activations?.map((item) => item.id)).toEqual(['work']);
    expect(result.sourceGraph?.interaction?.fragments?.map((item) => item.id)).toEqual(['choice']);
    expect(result.sourceGraph?.interaction?.notes?.map((item) => item.text)).toEqual(['Passwords are never logged']);
    expect(result.svg).toContain('data-coral-sequence-fragment="choice"');
  });

  it('renders the bundled UML class example from saved 0.2.8 Coral source', async () => {
    const source = fixture('uml-class.coral');
    expect(source).toMatch(/^@diagram uml-class\n/);
    const result = await render(source);
    expect(result.sourceGraph?.nodes.map((node) => node.id)).toEqual(['order', 'repository', 'state']);
    expect(result.sourceGraph?.edges.map((edge) => edge.id)).toEqual(['orderRepository', 'orderState']);
    expect(result.svg).toContain('id: UUID');
    expect(result.svg).toContain('save(order: Order): Void');
  });

  it('renders a saved-header 0.2.8 document without a preview option', async () => {
    const source = '@diagram architecture\napi service as "API"\nstore database\n' +
      'reads = api -> store [reads] as "Read"\n';
    const result = await render(source);
    expect(result.graph.metadata?.notation).toBe('architecture');
    expect(result.graph.edges[0]).toMatchObject({ id: 'reads', type: 'reads', label: 'Read' });
    expect(result.svg).toContain('API');
    expect(result.svg).toContain('Read');
  });

  it('retains an explicit keyed symbol and variant through the browser render path', async () => {
    const source = '@diagram architecture\napi service [symbol: "arch-service", variant: "gateway"] as "API"\n';
    const result = await render(source);
    expect(result.sourceGraph?.nodes[0]).toMatchObject({ symbol: 'arch-service', variant: 'gateway' });
    expect(result.graph.nodes[0]).toMatchObject({ symbol: 'arch-service', variant: 'gateway' });
    expect(result.svg).toContain('API');
    const web = await render(source.replace('"gateway"', '"web"'));
    expect(web.sourceGraph?.nodes[0]).toMatchObject({ variant: 'web' });
    expect(web.svg).not.toBe(result.svg);
  });

  it('reports an unresolved keyed catalog choice at its authored source value', async () => {
    const source = '@diagram architecture\napi service [symbol: "missing-symbol"]\n';
    const error = await failure(render(source));
    expect(error.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.symbol.unknown', subject: { kind: 'node', id: 'api' },
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('"missing-symbol"'),
      }) }),
    }));
  });

  it('renders a flat saved-header alt without replacing its source-owned branches', async () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n  a -> b as "go"\n' +
      '} else "no" {\n  b -> a as "return"\n}\n';
    const result = await render(source);
    expect(result.sourceGraph?.interaction?.items).toEqual([{ kind: 'fragment', id: 'choice' }]);
    expect(result.sourceGraph?.interaction?.fragments?.[0]?.operands.map((item) =>
      [item.guard.text, item.items.map((child) => child.id)]))
      .toEqual([['yes', ['edge-1']], ['no', ['edge-2']]]);
    expect(result.svg).toContain('data-coral-sequence-fragment="choice"');
    expect(result.svg).toContain('[yes]');
    expect(result.svg).toContain('[no]');
    expect(normalizedSvg(await mcpSvg(source))).toBe(normalizedSvg(result.svg));
  });

  it('keeps a known out-of-profile symbol visible during ordinary strict-source rendering', async () => {
    const source = '@diagram flowchart\n@conformanceLevel strict\napi process [symbol: "arch-service"]\n';
    const result = await render(source);
    expect(result.sourceGraph?.nodes[0]).toMatchObject({ id: 'api', symbol: 'arch-service' });
    expect(result.graph.nodes[0]).toMatchObject({ id: 'api', symbol: 'arch-service' });
    expect(result.svg).toContain('api');
    const excepted = await render(source.replace('symbol: "arch-service"',
      'symbol: "arch-service", conformanceException: "arch-service"'));
    expect(excepted.sourceGraph?.conformanceExceptions).toEqual([
      { kind: 'explicit-symbol', nodeId: 'api', symbol: 'arch-service' },
    ]);
    expect(normalizedSvg(excepted.svg)).toBe(normalizedSvg(result.svg));
  });

  it('keeps a saved-header crow-foot end through successor meaning and SVG', async () => {
    const source = '@diagram architecture\ncustomer service\norder service\n' +
      'orders = customer --{ order [reads]\n';
    const parsed = parseInstalledDocument028(source);
    expect(parsed.header.diagnostics).toEqual([]);
    expect(parsed.syntax.diagnostics).toEqual([]);
    const result = await render(source);
    expect(result.sourceGraph?.edges[0]?.secondEnd?.marker)
      .toEqual({ kind: 'crow-foot', fill: 'unspecified' });
    expect(result.graph.edges[0]?.targetEnd?.marker)
      .toEqual({ kind: 'crow-foot', fill: 'unspecified' });
    expect(result.svg).toContain('M14 8 L3 2');
  });

  it('executes proximity in browser/MCP with the same geometry and retained source identity', async () => {
    const source = '@diagram flowchart\na process\nb process\nc process\n' +
      'near = a -> b\nfar = b ------> c\n';
    const far = await render(source);
    const near = await render(source.replace('------>', '->'));
    const width = (svg: string) => Number(/<svg[^>]*\bwidth="([\d.]+)"/.exec(svg)![1]);
    expect(width(far.svg)).toBeGreaterThan(width(near.svg) + 100);
    expect(far.sourceGraph?.edges[1]).toMatchObject({ proximityHint: 6,
      first: { node: 'b' }, second: { node: 'c' }, direction: 'first-to-second' });
    expect(far.diagnostics.some((item) => item.code === 'coral.layout.proximity.unapplied')).toBe(false);
    expect(normalizedSvg(await mcpSvg(source))).toBe(normalizedSvg(far.svg));
  });

  it('keeps unsupported self-message proximity located while ordinary proximity executes', async () => {
    const source = '@diagram uml-sequence\napi participant\nstore participant\napi -.-> api\n';
    const result = await render(source);
    expect(result.sourceGraph?.edges[0]?.proximityHint).toBe(3);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning', code: 'coral.layout.proximity.unapplied', line: 4,
      subject: { kind: 'edge', id: 'edge-1' },
    }));
    const mcp = await handleRender({ content: source });
    const browserNotice = result.diagnostics.find((item) => item.code === 'coral.layout.proximity.unapplied');
    const mcpNotice = mcp.structuredContent?.diagnostics.find((item) =>
      item.code === 'coral.layout.proximity.unapplied');
    expect(mcpNotice?.message).toBe(browserNotice?.message);
    expect(mcpNotice?.range?.start.line).toBe(4);
    expect(result.svg).toContain('<svg');
  });

  it('renders saved-header semantic-port references through the shared browser SVG path', async () => {
    const source = '@diagram architecture\napi service\nstore database\n' +
      'read = api:out -> store:query [reads] as "Orders"\n';
    const result = await render(source);
    expect(result.graph.edges[0]).toMatchObject({
      source: 'api', sourcePort: 'out', target: 'store', targetPort: 'query',
    });
    expect(result.svg).toContain('Orders');
  });

  it('renders authored node-local ports from saved Coral source without persisting geometric ports', async () => {
    const source = '@diagram architecture\napi service {\n  audit port [direction: out, anchor: side]\n}\nstore database {\n  receive port [direction: in, anchor: auto]\n}\napi:audit -> store:receive [reads]';
    const result = await render(source, { direction: 'RIGHT' });
    expect(result.sourceGraph?.nodes[0]?.semanticPorts).toMatchObject([
      { id: 'audit', direction: 'out', anchor: { kind: 'side' } },
    ]);
    expect(result.sourceGraph?.nodes[1]?.semanticPorts).toMatchObject([
      { id: 'receive', direction: 'in', anchor: { kind: 'auto' } },
    ]);
    expect(result.graph.nodes.every((node) => node.ports === undefined)).toBe(true);
    expect(result.svg).toContain('<svg');
    expect(normalizedSvg(await mcpSvg(source))).toBe(normalizedSvg(result.svg));
  });

  it('renders an authored corner-port hint from saved source in both layout directions', async () => {
    const source = '@diagram architecture\napi service {\n' +
      '  audit port [direction: out, anchor: corner]\n}\n' +
      'store database\napi:audit -> store:query [reads]';
    const right = await render(source, { direction: 'RIGHT' });
    const down = await render(source, { direction: 'DOWN' });
    for (const result of [right, down]) {
      expect(result.sourceGraph?.nodes[0]?.semanticPorts).toMatchObject([
        { id: 'audit', anchor: { kind: 'corner' } },
      ]);
      expect(result.graph.nodes.every((node) => node.ports === undefined)).toBe(true);
      expect(result.svg).toContain('<svg');
    }
    expect(down.svg).not.toBe(right.svg);
    expect(normalizedSvg(await mcpSvg(source))).toBe(normalizedSvg(right.svg));
  });

  it('locates an authored port collision before layout rather than returning a generic render failure', async () => {
    const source = '@diagram architecture\napi service {\n  out port [direction: out]\n}';
    const error = await failure(render(source));
    expect(error.code).toBe('coral.browser.input.invalid');
    expect(error.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.port.duplicate', line: 3,
      range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('out port') }) }),
      subject: { kind: 'node', id: 'api' },
    }));
  });

  it('locates an unavailable named anchor at its authored value', async () => {
    const source = '@diagram architecture\napi service {\n  audit port [direction: out, anchor: unknownRim]\n}';
    const error = await failure(render(source));
    expect(error.code).toBe('coral.browser.input.invalid');
    expect(error.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.port.anchor.symbol-unknown', line: 3,
      range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('unknownRim') }) }),
    }));
  });

  it('locates a grouped child anchor under its qualified node identity', async () => {
    const source = '@diagram architecture\nteam group {\n  api service {\n' +
      '    audit port [direction: out, anchor: unknownRim]\n  }\n}';
    const error = await failure(render(source));
    expect(error.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.port.anchor.symbol-unknown', subject: { kind: 'node', id: 'team.api' },
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('unknownRim'),
      }) }),
    }));
  });

  it('reports unsupported sequence participant ports at their declarations', async () => {
    const source = '@diagram uml-sequence\nclient participant {\n  send port [direction: out]\n}\nserver participant\nclient -> server';
    const error = await failure(render(source));
    expect(error.diagnostics).toContainEqual(expect.objectContaining({
      code: 'render.capability.sequence-semantic-port', line: 3,
      range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('send port') }) }),
    }));
  });

  it('renders nested quoted alternatives while retaining their source-owned order', async () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n  retry = alt "again" {\n    a -> b\n' +
      '  } else "stop" {\n    b -> a\n  }\n} else "no" {\n  b -> a\n}';
    const result = await render(source);
    expect(result.sourceGraph?.interaction?.items).toEqual([{ kind: 'fragment', id: 'choice' }]);
    expect(result.sourceGraph?.interaction?.fragments?.map((fragment) => fragment.id))
      .toEqual(['choice', 'retry']);
    expect(result.svg).toContain('data-coral-sequence-fragment="choice"');
    expect(result.svg).toContain('data-coral-sequence-fragment="retry"');
    expect(result.svg).toContain('[again]');
    expect(result.svg).toContain('[stop]');
    expect(result.svg).toContain('[no]');
    expect(normalizedSvg(await mcpSvg(source))).toBe(normalizedSvg(result.svg));
  });

  it.each([
    ['empty alternative', 'choice = alt "yes" {\n} else "no" {\n  b -> a\n}', 'choice'],
    ['guarded loop', 'retry = loop "more" {\n  call = a -> b\n}\n', 'retry'],
  ])('renders a %s with exact source meaning and MCP parity', async (_name, body, id) => {
    const source = `@diagram uml-sequence\na participant\nb participant\n${body}`;
    const result = await render(source);
    expect(result.svg).toContain(`data-coral-sequence-fragment="${id}"`);
    expect(result.sourceGraph?.interaction?.fragments?.[0]?.id).toBe(id);
    expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(normalizedSvg(await mcpSvg(source))).toBe(normalizedSvg(result.svg));
  });

  it('locates a dotted port token without treating it as a valid source reference', async () => {
    const source = '@diagram architecture\napi service\nstore database\n' +
      'api:out.extra -> store';
    expect(parseInstalledDocument028(source).header.source).toBe(source);
    const error = await failure(render(source));
    expect(error.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.syntax.edge.invalid',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('out.extra'),
      }) }),
    }));
    const mcp = await handleRender({ content: source });
    expect(mcp.isError).toBe(true);
    expect((mcp.content[0] as { text: string }).text).toContain('coral.syntax.edge.invalid');
  });

  it('keeps separate flat alternatives and intervening messages in source order', async () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'first = alt "one" {\n  a -> b\n} else "other" {\n  b -> a\n}\n' +
      'a -> b\n' +
      'second = alt "two" {\n  b -> a\n} else "last" {\n  a -> b\n}\n';
    const result = await render(source);
    expect(result.sourceGraph?.interaction?.items).toEqual([
      { kind: 'fragment', id: 'first' }, { kind: 'message', id: 'edge-3' },
      { kind: 'fragment', id: 'second' },
    ]);
    expect(result.svg).toContain('data-coral-sequence-fragment="first"');
    expect(result.svg).toContain('data-coral-sequence-fragment="second"');
    expect(result.svg).toContain('data-coral-sequence-message="edge-3"');
  });

  it('attaches the same authored output port to the right or bottom as layout direction changes', async () => {
    const source = '@diagram architecture\napi service\nworker service\n' +
      'call = api:out -> worker:in [calls]\n';
    const graph = parseInstalledDocument028(source).graph!;
    const right = await layoutGraphForSvg(graph, { direction: 'RIGHT' });
    const down = await layoutGraphForSvg(graph, { direction: 'DOWN' });
    const endpoint = (laidOut: typeof right) => {
      const api = laidOut.nodes.find((node) => node.id === 'api')!;
      const start = laidOut.edgeRoutes.get('call')![0]!.startPoint;
      return { api, start };
    };
    const horizontal = endpoint(right);
    const vertical = endpoint(down);
    const outline = shapeRegistry.get('rectangle')!;
    const fitted = (toward: { x: number; y: number }, dimensions: { width: number; height: number }) =>
      stencilFitPoint028(outline, stencilRayPoint028(outline, toward, { cornerRadius: 8 }),
        dimensions.width, dimensions.height);
    const rightSide = fitted({ x: 1, y: 0.5 }, horizontal.api.dimensions!);
    const bottomSide = fitted({ x: 0.5, y: 1 }, vertical.api.dimensions!);
    expect(horizontal.start.x).toBeCloseTo(horizontal.api.position!.x +
      horizontal.api.dimensions!.width * rightSide.x);
    expect(vertical.start.y).toBeCloseTo(vertical.api.position!.y +
      vertical.api.dimensions!.height * bottomSide.y);
    expect(graph.edges[0]).toMatchObject({ sourcePort: 'out', targetPort: 'in' });
    expect(graph.nodes.every((node) => node.ports === undefined)).toBe(true);
  });

  it('reports a missing semantic port at its authored browser location', async () => {
    const source = '@diagram architecture\napi service\nstore database\n' +
      'read = api:missing -> store:query [reads]\n';
    const error = await failure(render(source));
    expect(error.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.port.reference.missing', line: 4,
      column: source.indexOf('missing') - source.lastIndexOf('\n', source.indexOf('missing')),
      range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('missing') }) }),
    }));
  });

  it('reports a saved-header error at its authored browser location', async () => {
    const error = await failure(render('@diagram not-installed\napi service\n'));
    expect(error.code).toBe('coral.browser.input.invalid');
    expect(error.diagnostics).toContainEqual(expect.objectContaining({
      code: 'header.diagram.unsupported', line: 1, column: 10,
      range: expect.objectContaining({ start: expect.objectContaining({ offset: 9 }) }),
    }));
  });

  it('reports a saved-header body error at the offending token', async () => {
    const source = '@diagram flowchart\nreview decision\napprove process\n' +
      'review -> approve [flow, "Yes"]\n';
    const error = await failure(render(source));
    const token = source.indexOf('"Yes"');
    expect(error.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.syntax.bracket.unknown-positional', line: 4,
      column: token - source.lastIndexOf('\n', token),
    }));
  });

  it('retains the exact authored range and first occurrence for a duplicate node', async () => {
    const source = '@diagram architecture\napi service\nstore database\napi service\n';
    const error = await failure(render(source));
    const duplicate = error.diagnostics.find((item) => item.code === 'coral.identity.node.duplicate');
    expect(duplicate?.range).toMatchObject({
      start: { line: 4, column: 1, offset: source.lastIndexOf('api service') },
      end: { line: 4, column: 4, offset: source.lastIndexOf('api service') + 3 },
    });
    expect(duplicate?.related).toEqual([expect.objectContaining({
      message: 'First node declaration',
      range: expect.objectContaining({
        start: expect.objectContaining({ line: 2, column: 1, offset: source.indexOf('api service') }),
      }),
    })]);
  });

  it('renders Coral source to SVG with the parsed graph', async () => {
    const result = await render(fixture('flowchart-25.coral'));
    expect(result.svg.startsWith('<svg')).toBe(true);
    expect(result.svg).toContain('Step 25');
    expect(result.graph.nodes).toHaveLength(25);
    expect(result.diagnostics).toEqual([]);
  });

  it('renders ID-first nodes, a named edge, and an arrangement through public source', async () => {
    const source = '@diagram architecture\n' +
      'api service as "API"\nworker service\n' +
      'call = api -> worker [calls] as "Invoke"\nserviceRow = arrange row: api, worker';
    const result = await render(source);
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(false);
    expect(result.graph.nodes).toMatchObject([
      { id: 'api', type: 'service', label: 'API' },
      { id: 'worker', type: 'service', label: 'worker' },
    ]);
    expect(result.sourceGraph?.constraints?.[0]).toMatchObject({
      id: 'serviceRow', kind: 'arrangement', axis: 'row',
      subjects: [{ kind: 'node', nodeId: 'api' }, { kind: 'node', nodeId: 'worker' }],
    });
    expect(result.graph.edges[0]).toMatchObject({
      id: 'call', source: 'api', target: 'worker', type: 'calls', label: 'Invoke',
    });
    expect(result.svg).toContain('API');
    expect(result.svg).toContain('worker');
    expect(result.svg).toContain('Invoke');
  });

  it.each([
    'service "Old API" as oldApi',
    'service as oldWorker',
  ])('rejects retired kind-first %s in saved 0.2.8 source', async (line) => {
    const source = `@diagram architecture\n${line}\nnewApi service`;
    const error = await failure(render(source));
    expect(error.code).toBe('coral.browser.input.invalid');
    expect(error.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.syntax.legacy-node.unsupported', line: 2,
    }));
  });

  it('keeps an authored blank node label visually blank while defaulting only an omitted label', async () => {
    const source = '@diagram architecture\n' +
      'hidden service as ""\nvisible service';
    const result = await render(source);
    expect(result.graph.nodes.map((node) => node.label)).toEqual(['', 'visible']);
    expect(result.svg).not.toContain('>hidden<');
    expect(result.svg).toContain('>visible<');
  });

  it('renders two-ended and dashed-neutral saved connectors without changing endpoint order', async () => {
    const source = '@diagram architecture\n' +
      'a service\nz service\nboth = a <-> z\ndashed = a -.- z';
    const result = await render(source);
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(false);
    expect(result.graph.edges.map((edge) => [edge.id, edge.source, edge.target])).toEqual([
      ['both', 'a', 'z'], ['dashed', 'a', 'z'],
    ]);
    expect(result.graph.edges[0]?.sourceEnd?.marker).toMatchObject({ kind: 'arrow', fill: 'open' });
    expect(result.graph.edges[0]?.targetEnd?.marker).toMatchObject({ kind: 'arrow', fill: 'open' });
    expect(result.graph.edges[1]?.style?.lineStyle).toBe('dashed');
    expect(result.svg).toMatch(/marker-start="url\(#coral-instance-[^)]+-coral-marker-/);
    expect(result.svg).toMatch(/marker-end="url\(#coral-instance-[^)]+-coral-marker-/);
    expect(result.svg).toMatch(/stroke-dasharray="(?:\d+(?:\.\d+)?\s+)+\d+(?:\.\d+)?"/);
  });

  it('renders approved sequence message operators and an introduced creation target', async () => {
    const source = '@diagram uml-sequence\n' +
      'client participant\nserver participant\nworker participant\n' +
      'client -#> server as "load()"\nserver -> worker as "enqueue()"\n' +
      'server -.-> client as "result"\nclient -.-> child [create] as "spawn()"';
    const result = await render(source);
    expect(result.graph.interaction?.messages.map((message) => message.kind)).toEqual([
      'synchronous', 'asynchronous', 'return', 'create',
    ]);
    expect(result.graph.edges[0]?.targetEnd).toMatchObject({ marker: { kind: 'triangle', fill: 'filled' } });
    expect(result.graph.interaction?.participants.some((participant) => participant.id === 'child')).toBe(true);
    expect(result.svg).toContain('spawn()');
  });

  it('renders a saved-header reverse sequence from successor meaning without rewriting endpoint order', async () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'reply = client <- server as "reverse reply"';
    const result = await render(source);
    expect(result.sourceGraph?.edges[0]).toMatchObject({
      id: 'reply', first: { node: 'client' }, second: { node: 'server' },
      direction: 'second-to-first',
    });
    expect(result.graph.edges[0]).toMatchObject({ id: 'reply', source: 'server', target: 'client' });
    expect(result.graph.interaction?.messages[0]).toMatchObject({
      id: 'reply', sourceParticipantId: 'server', targetParticipantId: 'client',
    });
    expect(result.svg).toContain('reverse reply');
    expect(result.svg).toContain('data-coral-sequence-message="reply"');
  });

  it('points at an unresolved reverse-message endpoint instead of the left-arrow operator', async () => {
    const error = await failure(render('@diagram uml-sequence\nclient participant\nclient <- absent'));
    expect(error.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.reference.target.unresolved', line: 3, column: 11,
    }));
    expect(error.diagnostics.some((item) => item.code === 'coral.sequence.operator.unsupported')).toBe(false);
  });

  it('keeps a conflicting explicit sequence type visible for a separate U2 check', async () => {
    const source = '@diagram uml-sequence\n' +
      'client participant\nserver participant\nload = client -#> server [async] as "load()"\n' +
      'reply = server -.-> client [sync] as "result"';
    const result = await render(source);
    expect(result.graph.edges.map((edge) => edge.type)).toEqual(['async', 'sync']);
    expect(result.graph.interaction?.messages.map((message) => message.kind)).toEqual(['synchronous', 'return']);
    expect(result.svg).toContain('data-coral-sequence-message="load"');
    expect(result.svg).toContain('data-coral-sequence-message="reply"');
    expect(result.svg).toContain('load()');
  });

  it('renders an ID-first UML class with a named compartment and member', async () => {
    const source = '@diagram uml-class\n' +
      'Order class {\n  fields = attributes {\n    orderId = public attribute id: String\n  }\n}';
    const result = await render(source);
    expect(result.graph.nodes[0]?.classifier?.compartments[1]).toMatchObject({
      id: 'fields', items: [{ id: 'orderId', name: 'id', type: 'String' }],
    });
    expect(result.svg).toContain('Order');
    expect(result.svg).toContain('id: String');
  });

  it.each(SAVED_HEADER_PARITY)('matches MCP coral_render byte for byte for saved-header %s', async (_diagramType, source) => {
    expect(normalizedSvg((await render(source)).svg)).toBe(normalizedSvg(await mcpSvg(source)));
  });

  it('renders class and sequence notation through their shared scenes', async () => {
    const sequence = await render(fixture('uml-sequence.coral'));
    expect(sequence.svg).toContain(`data-coral-sequence="${sequence.sourceGraph?.id}"`);
    const uml = (await render(fixture('uml-class.coral'))).svg;
    expect(uml).toContain('Repository');
  });

  it('applies theme, direction, and an explicit title', async () => {
    const source = fixture('bpmn.coral');
    const plain = (await render(source)).svg;
    expect(plain).not.toContain('<title>Invoices</title>');
    expect((await render(source, { title: 'Invoices' })).svg).toContain('<title>Invoices</title>');
    expect((await render(source, { theme: 'dark' })).svg).not.toBe(plain);
    expect((await render(source, { direction: 'DOWN' })).svg).not.toBe(plain);
    expect(normalizedSvg((await render(source, { theme: undefined, direction: undefined, title: undefined })).svg))
      .toBe(normalizedSvg(plain));
  });

  it('embeds only available portable faces for every fixture and corpus source', async () => {
    const sources = [
      ...FIXTURES.map(fixture),
      ...ACTIVE_RENDERER_SOURCE_CASES_028.map((name) => fixture(`acceptance028/${name}.coral`)),
    ];
    let rendered = 0;
    for (const source of sources) {
      let svg: string;
      ({ svg } = await render(source));
      rendered += 1;
      const faces = svg.match(/@font-face\{[^}]*\}/g) ?? [];
      expect(faces.length).toBeGreaterThanOrEqual(1);
      expect(faces.every((face) => /font-family:'Coral (?:Lowfi Caveat|Inter)'/.test(face))).toBe(true);
      expect(svg).not.toContain(UNAVAILABLE_FACE);
    }
    expect(rendered).toBe(FIXTURES.length + ACTIVE_RENDERER_SOURCE_CASES_028.length);
  });
});

describe('render failures', () => {
  it('rejects an unknown diagram profile at the saved-header boundary', async () => {
    const source = '@diagram not-installed\napi service as "A"';
    const error = await failure(render(source));
    expect(error.code).toBe('coral.browser.input.invalid');
    expect(error.diagnostics).toContainEqual(expect.objectContaining({
      code: 'header.diagram.unsupported',
    }));
  });

  it('propagates the shared resolver capability diagnostic for an unknown explicit symbol', async () => {
    const source = '@diagram architecture\napi service [symbol: "missing-symbol"] as "A"';
    const error = await failure(render(source));
    expect(error.code).toBe('coral.browser.input.invalid');
    expect(error.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.symbol.unknown',
      subject: { kind: 'node', id: 'api' },
    }));
  });

  it('requires a saved header before interpreting retired node data', async () => {
    const source = 'service "A" as api data {"symbol":"missing-symbol"}';
    const error = await failure(render(source));
    expect(error.diagnostics).toContainEqual(expect.objectContaining({
      code: 'header.diagram.required', line: 1, column: 1,
    }));
  });
  it.each([42, null, undefined, { version: '3.0.0', id: 'g', nodes: [], edges: [] }])(
    'refuses a non-string source: %j', async (source) => {
      const error = await failure(render(source as unknown as string));
      expect(error.code).toBe('coral.browser.input.type');
      expect(error.name).toBe('CoralRenderError');
    },
  );

  it.each([
    ['mermaid flowchart', 'flowchart TD\nA-->B', /mermaid/],
    ['mermaid sequence', 'sequenceDiagram\nA->>B: hi', /mermaid/],
    ['DOT', 'digraph { a -> b }', /dot/],
    ['PlantUML', '@startuml\nA -> B\n@enduml', /plantuml/],
    ['GraphIR JSON', JSON.stringify({ version: '3.0.0', id: 'g', nodes: [{ id: 'a', type: 'service' }], edges: [] }), /graphir-json/],
  ])('refuses %s as a second format', async (_label, source, format) => {
    const error = await failure(render(source));
    expect(error.code).toBe('coral.browser.input.format');
    expect(error.message).toMatch(format);
    expect(error.message).toMatch(/Coral editor/);
  });

  it.each(['{"version":"3.0.0"}', '{ not json'])('reports unrecognized input: %s', async (source) => {
    const error = await failure(render(source));
    expect(error.code).toBe('coral.browser.input.format');
    expect(error.message).toMatch(/unrecognized/i);
  });

  it.each([
    ['NUL', 'service "A\u0000"'],
    ['U+0001', 'service "A"\nservice "B\u0001"'],
    ['U+FFFE', 'service "￾"'],
    ['lone surrogate', 'service "\uD800"'],
  ])('refuses the XML-illegal character %s with a positioned diagnostic', async (_label, source) => {
    const error = await failure(render(source));
    expect(error.code).toBe('coral.browser.input.invalid');
    expect(error.diagnostics[0]).toMatchObject({
      severity: 'error', code: 'coral.browser.input.character', line: expect.any(Number), column: expect.any(Number),
    });
  });

  it('refuses semantically invalid GraphIR exactly where MCP does', async () => {
    const source = '@diagram architecture\na service\nb service\na:alt -> b';
    const error = await failure(render(source));
    expect(error.code).toBe('coral.browser.input.invalid');
    expect(error.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', code: 'coral.port.reference.missing' }));
    const mcp = await handleRender({ content: source });
    expect(mcp.isError).toBe(true);
  });

  it('refuses retired metadata escapes before they can reach graph or SVG output', async () => {
    const source = '@graph {"id":"g","name":"N\\u0001"}\nservice "A"';
    const error = await failure(render(source));
    expect(error.code).toBe('coral.browser.input.invalid');
    expect(error.diagnostics).toContainEqual(expect.objectContaining({ code: 'header.diagram.required' }));
  });

  it('rejects an unapproved Unicode escape in a current-source quoted label', async () => {
    const source = '@diagram architecture\napi service as "bad\\u0001"';
    const error = await failure(render(source));
    expect(error.code).toBe('coral.browser.input.invalid');
    expect(error.diagnostics).toContainEqual(expect.objectContaining({ code: 'coral.syntax.string.invalid-escape' }));
  });

  it('refuses an XML-illegal title as an invalid option', async () => {
    expect((await failure(render(fixture('bpmn.coral'), { title: 'x\u0001y' }))).code).toBe('coral.browser.option.invalid');
  });

  it('renders label text that merely resembles the font sentinel', async () => {
    expect((await render(`@diagram architecture\napi service as "${UNAVAILABLE_FACE}"`)).svg).toContain(UNAVAILABLE_FACE);
  });

  it('reports every parser error with 1-based positions', async () => {
    const error = await failure(render('@diagram architecture\na service as "A"\n  bogus ((( line'));
    expect(error.code).toBe('coral.browser.input.invalid');
    expect(error.diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', code: 'coral.syntax.node.kind-required', line: 3, column: 3 }),
    ]);
  });

  it.each(['@diagram architecture\n', '@diagram flowchart\n  \n'])('refuses an empty diagram: %j', async (source) => {
    expect((await failure(render(source))).code).toBe('coral.browser.input.empty');
  });

  it.each<[string, unknown]>([
    ['fontSettings', { fontSettings: {} }],
    ['theme value', { theme: 'blue' }],
    ['direction value', { direction: 'NORTH' }],
    ['title type', { title: 5 }],
    ['null', null],
    ['array', []],
  ])('refuses an invalid option: %s', async (_label, options) => {
    const error = await failure(render(fixture('bpmn.coral'), options as CoralRenderOptions));
    expect(error.code).toBe('coral.browser.option.invalid');
  });

  it('refuses SVG that references an unavailable face', () => {
    expect(() => assertAvailableFaces('<svg><style>ok</style></svg>')).not.toThrow();
    expect(() => assertAvailableFaces(`<svg><text>${UNAVAILABLE_FACE}</text></svg>`)).not.toThrow();
    let error: unknown;
    try { assertAvailableFaces(`<svg><style>src:url('${UNAVAILABLE_FACE}')</style></svg>`); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(CoralRenderError);
    expect((error as CoralRenderError).code).toBe('coral.browser.render.failed');
  });

});

describe('diagnostic projection', () => {
  it('uses 1-based columns and keeps the subject', () => {
    expect(toCoralDiagnostic({
      severity: 'warning', code: 'coral.x.degraded', message: 'm',
      position: { line: 3, column: 0, offset: 10 }, subject: { kind: 'node', id: 'a' },
    })).toEqual({ severity: 'warning', code: 'coral.x.degraded', message: 'm', line: 3, column: 1, subject: { kind: 'node', id: 'a' } });
    expect(toCoralDiagnostic({ severity: 'info', code: 'c', message: 'm' })).toEqual({ severity: 'info', code: 'c', message: 'm' });
  });
  it('keeps a typed qualified node subject without inferring it from a property path', () => {
    expect(toCoralDiagnostic({
      severity: 'error', code: 'layout.capability.unsupported', message: 'm',
      path: 'nodes.team.api.labelPlacement', subject: { kind: 'node', id: 'team.api' },
    })).toEqual({ severity: 'error', code: 'layout.capability.unsupported', message: 'm',
      subject: { kind: 'node', id: 'team.api' } });
  });
});

describe('parser output is schema-valid, so the browser validates semantics only', () => {
  it('finds no schema error in any public current-source display projection', async () => {
    const sources = [...FIXTURES.map(fixture),
      ...ACTIVE_RENDERER_SOURCE_CASES_028.map((name) => fixture(`acceptance028/${name}.coral`))];
    expect(sources.length).toBeGreaterThan(20);
    for (const source of sources) {
      const parsed = parseInstalledDocument028(source);
      expect(parsed.header.diagnostics).toEqual([]);
      expect(parsed.syntax.diagnostics).toEqual([]);
      const { graph } = await render(source);
      expect(validateIR(graph, { mode: 'schema' }).errors).toEqual([]);
    }
  }, 20_000);
});

describe('version', () => {
  it('equals the package manifest version', () => {
    const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'));
    expect(version).toBe(manifest.version);
  });
});


it('renders the exact Batch pipeline source with both approved portable relation types', async () => {
  const source = readFileSync(new URL('../../diagram-editor/src/example-sources/data-engineering.coral', import.meta.url), 'utf8');
  const rendered = await render(source);
  expect(rendered.diagnostics).toEqual([]);
  const expected = ['batch-flow', 'batch-flow', 'quality', 'quality'];
  expect(rendered.graph.edges.map(({ type }) => type)).toEqual(expected);
  expect(rendered.sourceGraph?.edges.map(({ type }) => type)).toEqual(expected);
  expect(rendered.svg).toContain('Source');
  expect(normalizedSvg(await mcpSvg(source))).toBe(normalizedSvg(rendered.svg));
  await expect(render(source.replace('[batchFlow]', '[batch-flow]')))
    .rejects.toMatchObject({ code: 'coral.browser.input.invalid' });
});

it('keeps captioned AI/ML glyphs invariant and agrees with MCP SVG output (REQ-B1 / ISC-7)', async () => {
  const source = [
    '@diagram aiml',
    'base model [symbol: "aiml-model"] as "SmolLM2-135M base checkpoint fine-tuned on the Coral source corpus"',
    'tuned model [symbol: "aiml-model"] as "Model"',
    'e = base -> tuned [training]',
    '',
  ].join('\n');
  const rendered = await render(source);
  expect(rendered.diagnostics).toEqual([]);
  // Both 67-char and 5-char brain nodes keep identical canonical 72x56 glyph scale (56/90 = 0.6222).
  expect(rendered.svg.match(/scale\(0\.6222222222222222\)"><path data-coral-part-id="(?:base|tuned):outline"/g)).toHaveLength(2);
  expect(normalizedSvg(await mcpSvg(source))).toBe(normalizedSvg(rendered.svg));
});
