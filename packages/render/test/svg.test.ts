import { afterEach, describe, it, expect, vi } from 'vitest';
import { prepareSpatialScene028, renderSvg, svgFontFaceRequests } from '../src/svg/serialize.js';
import { renderHtml } from '../src/html/serialize.js';
import { measureText, measureLine, isCovered } from '../src/text/metrics.js';
import type { GraphNode, GraphEdge } from '../src/types.js';
import { glyphRegistry } from '../src/glyphs/index.js';
import { symbolRegistry } from '../src/symbols/index.js';
import { markerDomId028, markerPrimitives } from '../src/scene.js';
import { visualDashPattern028, visualStyle028 } from '../src/visualStyle028.js';

/**
 * SVG serialization and deterministic metrics - R-022, R-023.
 */

const graph = {
  nodes: [
    { id: 'a', type: 'service', label: 'API Gateway', position: { x: 0, y: 0 } },
    { id: 'b', type: 'database', label: 'Orders', position: { x: 220, y: 0 } },
  ] as unknown as GraphNode[],
  edges: [
    { id: 'e', source: 'a', target: 'b', label: 'writes', style: { lineStyle: 'dashed' } },
  ] as unknown as GraphEdge[],
};

describe('R-022: deterministic text metrics', () => {
  it('measures the same string identically on every call', () => {
    expect(measureLine('API Gateway', 12)).toBe(measureLine('API Gateway', 12));
  });

  it('measures to exact pixels', () => {
    expect(measureLine('', 12)).toBe(0);
    expect(measureLine('iii', 12)).toBeLessThan(measureLine('WWW', 12));
  });

  it('wraps on whitespace without breaking a word', () => {
    const result = measureText({ text: 'Payment Processing Service', fontSize: 12, maxWidth: 100 });

    expect(result.lines.length).toBeGreaterThan(1);
    for (const line of result.lines) {
      expect(line).not.toMatch(/^\s|\s$/);
    }
  });

  it('reports coverage so unsupported scripts can be flagged rather than mis-measured', () => {
    expect(isCovered('Order Service')).toBe(true);
    expect(isCovered('注文サービス')).toBe(false);
  });
});

describe('R-023: SVG export', () => {
  it('emits a standalone document sized to its content', () => {
    const svg = renderSvg(graph);

    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toMatch(/width="\d+" height="\d+"/);
  });

  it('embeds the release font instead of depending on an installed font', () => {
    const svg = renderSvg(graph);

    expect(svg).toContain('font-family="Coral Lowfi Caveat"');
    expect(svg).toContain('@font-face');
    expect(svg).toContain('data:font/woff2;base64,');
  });

  it('draws every node and edge label', () => {
    const svg = renderSvg(graph);

    expect(svg).toContain('API Gateway');
    expect(svg).toContain('Orders');
    expect(svg).toContain('writes');
  });

  it('renders verified resolved edge sections instead of recomputing centre routes', () => {
    const options = { edgeRoutes: new Map([['e', [{
      startPoint: { x: 10, y: 20 },
      bendPoints: [{ x: 180, y: 200 }],
      endPoint: { x: 130, y: 40 },
    }]]]) };
    const prepared = prepareSpatialScene028(graph, options);
    expect(prepared.resolved.edges[0]!.points).toContainEqual({ x: 180, y: 200 });
    const svg = renderSvg(graph, options);
    const shaft = /data-coral-part-id="e:shaft" d="([^"]+)"/.exec(svg)?.[1];
    expect(shaft).toContain(`${180 + prepared.viewport.shiftX} ${200 + prepared.viewport.shiftY}`);
    expect(shaft).toMatch(/^M/);
  });

  it('refuses authored route intent without a verified route and malformed label placement', () => {
    expect(() => renderSvg({
      nodes: graph.nodes,
      edges: [{ ...graph.edges[0], routeIntent: { waypoints: [{
        id: 'relative', placement: {
          kind: 'relative', anchor: { kind: 'port', nodeId: 'a', portId: 'out' }, offset: { x: 0, y: 0 },
        },
      }] } }] as GraphEdge[],
    })).toThrow(/requires a verified resolved route/);
    expect(() => renderSvg({
      nodes: graph.nodes,
      edges: [{ ...graph.edges[0], routeIntent: { waypoints: [] } }] as GraphEdge[],
    }, { edgeRoutes: new Map([['e', []]]) })).toThrow(/requires a verified resolved route/);
    expect(() => renderSvg({
      nodes: [{ ...graph.nodes[0], labelPlacement: { side: 'above', offset: -1 } }] as GraphNode[], edges: [],
    })).toThrow(/invalid authored.*label placement/);
  });

  it('carries the edge line style', () => {
    expect(renderSvg(graph)).toContain(`stroke-dasharray="${visualDashPattern028('e', 'lowfi', 'dashed')}"`);
  });

  it('resolves canonical symbols and type fallbacks to visibly distinct shapes', () => {
    const svg = renderSvg({
      nodes: [
        { id: 'explicit', type: 'service', symbol: 'arch-database', position: { x: 0, y: 0 } },
        { id: 'typed', type: 'database', position: { x: 200, y: 0 } },
        { id: 'plain', type: 'service', position: { x: 400, y: 0 } },
      ] as GraphNode[],
      edges: [],
    });

    const paths = [...svg.matchAll(/<path[^>]* d="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(paths).size).toBeGreaterThan(1);
  });

  it('escapes markup in labels rather than emitting it', () => {
    const svg = renderSvg({
      nodes: [{ id: 'x', type: 'service', label: '<script>&"' }] as unknown as GraphNode[],
      edges: [],
    });

    expect(svg).toContain('&lt;script&gt;&amp;&quot;');
    expect(svg).not.toContain('<script>');
  });

  it('is byte-identical for the same input', () => {
    expect(renderSvg(graph)).toBe(renderSvg(graph));
  });

  it('renders shared notation styles, endpoint semantics, and accessible glyphs', () => {
    const notationGraph = {
      nodes: [
        { id: 'web', type: 'service', symbol: 'arch-service', variant: 'web', label: 'Web', position: { x: 0, y: 0 } },
        { id: 'db', type: 'database', symbol: 'arch-database', label: 'DB', position: { x: 200, y: 0 } },
      ] as GraphNode[],
      edges: [{
        id: 'data', source: 'web', target: 'db', type: 'data',
        sourceEnd: { role: 'writer', navigability: 'non-navigable', marker: { kind: 'diamond', fill: 'open' } },
        targetEnd: { multiplicity: { lower: 0, upper: '*' }, navigability: 'navigable', marker: { kind: 'triangle', fill: 'filled' } },
      }] as GraphEdge[],
      metadata: { notation: 'architecture' },
    };
    const svg = renderSvg(notationGraph);
    expect(svg).toContain(`stroke="${visualStyle028('lowfi').ink}" stroke-width="2.3"`);
    expect(svg).toContain('marker-start="url(#coral-instance-');
    expect(svg).toContain('marker-end="url(#coral-instance-');
    expect(svg).toContain('data-coral-navigability="non-navigable"');
    expect(svg).toContain('data-coral-endpoint-label="target:multiplicity"');
    expect(svg).toContain('role="img" aria-labelledby="coral-glyph-title-');
    expect(svg).toContain('Web globe</title>');
    expect(svg).toBe(renderSvg(notationGraph));
    expect([...svg.matchAll(/<text[^>]*data-coral-endpoint-label="([^"]+)"[^>]*x="([^"]+)" y="([^"]+)"/g)]
      .map((match) => match[1])).toEqual(['source:role', 'target:multiplicity']);
  });

  it.each([
    ['code-class', 'abstract', 'font-style="italic"'],
    ['code-variable', 'static', 'text-decoration="underline"'],
  ])('styles the exported %s/%s node label with %s', (symbol, variant, attribute) => {
    const styled = { nodes: [{ id: 'n', type: 'class', symbol, variant, label: 'Styled', position: { x: 0, y: 0 } }] as GraphNode[], edges: [] };
    for (const options of [{}, { fontSettings: { default: { family: 'serif' as const } } }]) {
      expect(/<text [^>]*>Styled<\/text>/.exec(renderSvg(styled, options))?.[0]).toContain(attribute);
    }
  });

  const markerKinds = ['arrow', 'triangle', 'diamond', 'circle', 'bar', 'crow-foot', 'zero-or-one', 'one', 'zero-or-many', 'one-or-many'] as const;
  const markerFills = ['open', 'filled', 'unspecified'] as const;
  const markerMatrix = markerKinds.flatMap((kind) => markerFills.map((fill) => ({ kind, fill })));
  const markerElements = (svg: string) => new Map([...svg.matchAll(/<marker id="([^"]+)"([^>]*)>(.*?)<\/marker>/g)]
    .map(([, id, attributes, body]) => [id, { attributes, paths: [...body.matchAll(/<path d="([^"]+)" fill="([^"]+)" stroke="([^"]+)"/g)].map((path) => path.slice(1)) }]));

  it('exports every marker descriptor with its fill rule and reversible orientation', () => {
    const stroke = visualStyle028('lowfi').ink;
    const svg = renderSvg({
      nodes: [
        { id: 'a', type: 'service', symbol: 'arch-service', label: 'A', position: { x: 0, y: 0 } },
        { id: 'b', type: 'database', symbol: 'arch-database', label: 'B', position: { x: 300, y: 0 } },
      ] as GraphNode[],
      edges: markerMatrix.map((marker, index) => ({ id: `e${index}`, source: 'a', target: 'b', type: 'data', targetEnd: { marker } })) as GraphEdge[],
      metadata: { notation: 'architecture' },
    });
    const markers = markerElements(svg);
    expect(markers.size).toBe(markerMatrix.length);
    for (const marker of markerMatrix) {
      const element = markers.get(markerDomId028(marker, stroke, 'standalone'));
      const filled = marker.fill === 'filled' && ['arrow', 'triangle', 'diamond', 'circle'].includes(marker.kind);
      expect(element?.attributes, `${marker.kind}/${marker.fill}`).toContain('orient="auto-start-reverse"');
      expect(element?.paths, `${marker.kind}/${marker.fill}`).toEqual(markerPrimitives(marker).map(({ d }) => [d, filled ? stroke : 'none', stroke]));
    }
  });

  it('exports the catalog source arrow of a bidirectional style as marker-start', () => {
    const svg = renderSvg({
      nodes: [
        { id: 'a', type: 'service', symbol: 'arch-service', label: 'A', position: { x: 0, y: 0 } },
        { id: 'b', type: 'service', symbol: 'arch-service', label: 'B', position: { x: 300, y: 0 } },
      ] as GraphNode[],
      edges: [{ id: 'bi', source: 'a', target: 'b', type: 'bidirectional' }] as GraphEdge[],
      metadata: { notation: 'architecture' },
    });
    const stroke = visualStyle028('lowfi').ink;
    const id = markerDomId028({ kind: 'arrow', fill: 'unspecified' }, stroke, 'standalone');
    expect(svg).toContain(`marker-start="url(#${id})" marker-end="url(#${id})"`);
    expect(markerElements(svg).get(id)?.paths).toEqual([['M2 2 L14 8 L2 14', 'none', stroke]]);
  });

  it('deduplicates one marker descriptor across style-matched edges', () => {
    const svg = renderSvg({
      nodes: [
        { id: 'a', type: 'service', symbol: 'arch-service', label: 'A', position: { x: 0, y: 0 } },
        { id: 'b', type: 'database', symbol: 'arch-database', label: 'B', position: { x: 300, y: 0 } },
      ] as GraphNode[],
      edges: [
        { id: 'data', source: 'a', target: 'b', type: 'data' },
        { id: 'async', source: 'a', target: 'b', type: 'async' },
      ] as GraphEdge[],
      metadata: { notation: 'architecture' },
    });
    const arrow = { kind: 'arrow', fill: 'unspecified' } as const;
    const markers = markerElements(svg);
    const id = markerDomId028(arrow, visualStyle028('lowfi').ink, 'standalone');
    expect([...markers.keys()]).toEqual([id]);
    expect(markers.get(id)?.paths[0]?.[2]).toBe(visualStyle028('lowfi').ink);
    expect(svg).toContain(`marker-end="url(#${id})"`);
  });

  it.each(glyphRegistry.getAll().map((glyph) => [glyph.id, glyph.name]))(
    'exports the %s glyph as an accessible image named %s', (token, name) => {
      const [symbol, variant] = symbolRegistry.getAll().flatMap((candidate) =>
        Object.entries(candidate.variants ?? {}).flatMap(([id, value]) =>
          value.icon === token ? [[candidate.id, id]] : []))[0]!;
      const svg = renderSvg({
        nodes: [{ id: `n-${token}`, type: 'service', symbol, variant, label: 'N', position: { x: 0, y: 0 } }] as GraphNode[],
        edges: [],
      });
      const match = /<g role="img" aria-labelledby="([^"]+)"[^>]*><title id="([^"]+)">([^<]*)<\/title>/.exec(svg);
      expect(match?.[1]).toBe(match?.[2]);
      expect(match?.[3]).toBe(name);
    });

  it('labels exported endpoint groups with their endpoint semantics', () => {
    const svg = renderSvg({
      nodes: [
        { id: 'a', type: 'service', label: 'A', position: { x: 0, y: 0 } },
        { id: 'b', type: 'service', label: 'B', position: { x: 200, y: 0 } },
      ] as GraphNode[],
      edges: [{
        id: 'e', source: 'a', target: 'b',
        sourceEnd: { role: 'writer', multiplicity: { lower: 1, upper: 1 }, navigability: 'non-navigable' },
        targetEnd: { navigability: 'navigable' },
      }] as GraphEdge[],
    });
    expect(svg).toContain('<g data-coral-endpoint="source" data-coral-navigability="non-navigable" aria-label="source non-navigable, role writer, multiplicity 1"><title>source non-navigable, role writer, multiplicity 1</title></g>');
    expect(svg).toContain('<g data-coral-endpoint="target" data-coral-navigability="navigable" aria-label="target navigable"><title>target navigable</title></g>');
  });

  it('renders finite BPMN marker geometry and shared rounded rectangles', () => {
    const svg = renderSvg({
      nodes: [
        { id: 'event', type: 'gateway', symbol: 'bpmn-gateway-event', label: 'Event', position: { x: 0, y: 0 } },
        { id: 'service', type: 'service', symbol: 'arch-service', label: 'Service', position: { x: 100, y: 0 } },
      ] as GraphNode[],
      edges: [],
    });
    expect(svg).toContain('data-coral-symbol-marker="pentagon"');
    expect(svg).not.toContain('>pentagon<');
    expect(svg).toContain('M8 2 L14 6.5 L11.7 14');
    expect(svg).toContain('M 8,0 L 92,0 Q 100,0 100,8');
  });

  it.each([
    ['bpmn-gateway-exclusive', 'X', 'Exclusive gateway marker'],
    ['bpmn-gateway-parallel', '+', 'Parallel gateway marker'],
    ['bpmn-gateway-inclusive', 'O', 'Inclusive gateway marker'],
    ['bpmn-gateway-event', 'pentagon', 'Event-based gateway marker'],
  ])('exports the %s marker %s as an accessible image named %s', (symbol, marker, name) => {
    const svg = renderSvg({
      nodes: [{ id: 'g', type: 'gateway', symbol, label: 'G', position: { x: 0, y: 0 } }] as GraphNode[],
      edges: [],
    });
    const match = /<g role="img" aria-label="([^"]+)" data-coral-symbol-marker="([^"]+)"[^>]*><title>([^<]*)<\/title><path /.exec(svg);
    expect(match?.slice(1)).toEqual([name, marker, name]);
  });

  describe('catalog double outline', () => {
    afterEach(() => { vi.restoreAllMocks(); });
    it('exports the inset second outline', () => {
      const original = symbolRegistry.get;
      vi.spyOn(symbolRegistry, 'get').mockImplementation((id) => id === 'synthetic-double'
        ? { id, name: 'Double', shape: 'rectangle', tags: [], defaults: { doubleOutline: true } } : original(id));
      const svg = renderSvg({
        nodes: [{ id: 'n', type: 'service', symbol: 'synthetic-double', label: 'N', position: { x: 0, y: 0 } }] as GraphNode[],
        edges: [],
      });
      expect(svg).toContain('data-coral-part-id="n:outline"');
      expect(svg).toContain('data-coral-part-id="n:inner-outline"');
      expect(svg).toContain('transform="translate(2 2) scale(0.96 0.9333)"');
    });
  });

  it('exports a wide actor without stretching the person stencil', () => {
    const svg = renderSvg({ nodes: [{ id: 'person', type: 'actor', symbol: 'arch-actor',
      label: 'Person', dimensions: { width: 240, height: 200 }, position: { x: 0, y: 0 } }],
      edges: [] }, { notation: 'architecture' });
    // Option 2 canonical 72x56 glyph box normalizes 60x100 actor uniformly to scale(0.56) without stretching.
    expect(svg).toContain('scale(0.56)');
    expect(svg).not.toMatch(/scale\([^)]*,[^)]*\)/);
  });

  it('honours the dark theme', () => {
    expect(renderSvg(graph, { theme: 'dark' })).toContain('#1e1e1e');
  });

  it('accumulates parent coordinates when rendering nested nodes', () => {
    const svg = renderSvg({
      nodes: [{
        id: 'platform', type: 'group', position: { x: 100, y: 200 },
        children: [{ id: 'api', type: 'service', position: { x: 25, y: 35 } }],
      }] as GraphNode[],
      edges: [],
    });

    const prepared = prepareSpatialScene028({
      nodes: [{ id: 'platform', type: 'group', position: { x: 100, y: 200 },
        children: [{ id: 'api', type: 'service', position: { x: 25, y: 35 } }] }] as GraphNode[],
      edges: [],
    });
    const platform = prepared.nodes.find((node) => node.node.id === 'platform')!;
    const api = prepared.nodes.find((node) => node.node.id === 'api')!;
    expect(api.x - platform.x).toBe(25);
    expect(api.y - platform.y).toBe(35);
    expect(svg).toContain('data-coral-node="platform"');
    expect(svg).toContain('data-coral-node="api"');
  });

  it('includes a title and description when given', () => {
    const svg = renderSvg(graph, { title: 'Payments', description: 'Order flow' });

    expect(svg).toContain('<title>Payments</title>');
    expect(svg).toContain('<desc>Order flow</desc>');
  });

  it('rejects an edge whose endpoints are not in the graph', () => {
    expect(() => renderSvg({
      nodes: [{ id: 'a', type: 'service', label: 'A' }] as unknown as GraphNode[],
      edges: [{ id: 'e', source: 'a', target: 'missing' }] as unknown as GraphEdge[],
    })).toThrow(/missing-endpoint/);
  });

  it('keeps scalar options in the portable serialization mode', () => {
    const familyOnly = renderSvg(graph, { fontFamily: 'Arbitrary Consumer Stack' });
    const sizeOnly = renderSvg(graph, { fontSize: 17 });
    const both = renderSvg(graph, { fontFamily: 'Arbitrary Consumer Stack', fontSize: 17 });

    expect(familyOnly).toContain('font-family="Coral Inter"');
    expect(sizeOnly).toContain('font-size="17"');
    expect(both).toContain('font-family="Coral Inter"');
    expect(both).toContain('font-size="17"');
    expect([familyOnly, sizeOnly, both]
      .every((svg) => svg.includes('data:font/woff2;base64,'))).toBe(true);
  });

  it('renders aggregate symbol overrides and embeds only used portable faces', () => {
    const svg = renderSvg({
      nodes: [{
        id: 'a', type: 'service', symbol: 'flowchart-process', label: 'Overridden',
        position: { x: 0, y: 0 },
      }] as GraphNode[],
      edges: [],
    }, {
      fontSettings: {
        default: { family: 'serif', size: 14, weight: 'normal', lineHeight: 1.4 },
        symbolOverrides: {
          'flowchart-process': { family: 'monospace', size: 20, weight: 'bold' },
        },
      },
    });

    expect(svg).toContain('font-family="Coral JetBrains Mono"');
    expect(svg).toContain('font-size="20"');
    expect(svg).toContain('font-weight="700"');
    expect(svg).toContain("font-family:'Coral JetBrains Mono'");
    expect(svg).not.toContain("font-family:'Coral Source Serif 4'");
  });

  it('lets valid scalars override aggregate fields without dropping other override fields', () => {
    const svg = renderSvg({
      nodes: [{ id: 'a', type: 'service', symbol: 'flowchart-process', label: 'Both' }] as GraphNode[],
      edges: [],
    }, {
      fontSettings: {
        default: { family: 'serif', size: 13, lineHeight: 1.2 },
        symbolOverrides: { 'flowchart-process': { family: 'monospace', size: 19 } },
      },
      fontFamily: 'serif',
      fontWeight: 'bold',
    });

    expect(svg).toContain('font-family="Coral Source Serif 4"');
    expect(svg).toContain('font-size="19"');
    expect(svg).toContain('font-weight="700"');
  });

  it('enters portable mode for the new weight and line-height scalars', () => {
    const weighted = renderSvg(graph, { fontWeight: 'bold' });
    const spaced = renderSvg(graph, { lineHeight: 2 });

    expect(weighted).toContain('font-weight="700"');
    expect(weighted).toContain('data:font/woff2;base64,');
    expect(spaced).toContain('line-height="2"');
    expect(spaced).not.toBe(renderSvg(graph));
  });

  it('safely normalizes partial and malformed direct-render aggregates', () => {
    const svg = renderSvg(graph, {
      fontSettings: {
        default: { family: '', size: -1, weight: Number.NaN, lineHeight: 0 },
        symbolOverrides: { service: [] as unknown as never },
      },
    });

    expect(svg).toContain('font-family="Coral Inter"');
    expect(svg).toContain('font-size="12"');
    expect(svg).toContain('font-weight="400"');
  });

  it('enumerates and deduplicates the exact node and edge-label faces', () => {
    expect(svgFontFaceRequests({
      nodes: [{
        id: 'parent', type: 'group', symbol: 'flowchart-process',
        children: [{ id: 'child', type: 'service', symbol: 'flowchart-process' }],
      }] as GraphNode[],
      edges: [{ id: 'e', source: 'parent', target: 'child', label: 'contains' }] as GraphEdge[],
    }, {
      fontSettings: {
        default: { family: 'serif', weight: 'normal' },
        symbolOverrides: { 'flowchart-process': { family: 'monospace', weight: 'bold' } },
      },
    })).toEqual([
      { id: 'mono', weight: 700 },
      { id: 'serif', weight: 400 },
    ]);
  });
});

describe('R-028: HTML export', () => {
  it('emits a self-contained, printable document around the SVG', () => {
    const html = renderHtml(graph, { title: 'Payments & Orders' });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>Payments &amp; Orders</title>');
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(html).toContain('@media print');
    expect(html).toContain('data:font/woff2;base64,');
    expect(html).not.toMatch(/(?:src|href)="https?:/);
  });

  it('is byte-identical for the same input', () => {
    expect(renderHtml(graph)).toBe(renderHtml(graph));
  });

  it('uses the same aggregate font contract as SVG', () => {
    const html = renderHtml(graph, {
      fontSettings: { default: { family: 'serif', size: 18, weight: 'bold', lineHeight: 1.5 } },
    });
    expect(html).toContain('font-family="Coral Source Serif 4"');
    expect(html).toContain('font-weight="700"');
  });
});

describe('Slice 40 profile-scoped SVG symbols', () => {
  it.each(['io', 'document'])('draws the flowchart %s shape only under that profile', (type) => {
    const node = { id: 'n', type, label: 'N', position: { x: 0, y: 0 } };
    const svg = (extra: object, notation?: string) => renderSvg({ nodes: [{ ...node, ...extra }] as unknown as GraphNode[], edges: [],
      ...(notation ? { metadata: { notation } } : {}) });
    expect(svg({}, 'flowchart')).toBe(svg({ symbol: `flowchart-${type}` }, 'flowchart'));
    expect(svg({})).not.toBe(svg({}, 'flowchart'));
    expect(svg({}, 'flowchart')).not.toBe(svg({ type: 'process' }, 'flowchart'));
  });
});
