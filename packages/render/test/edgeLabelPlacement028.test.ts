import { describe, expect, it } from 'vitest';
import type { EdgeLabelPlacement, GraphIR } from '@graph-ir/core';
import { authoredEdgeLabelBox028 } from '../src/edgeLabelPlacement028.js';
import { prepareSequenceScene028, prepareSpatialScene028, renderSvg } from '../src/svg/serialize.js';
import { projectInstalledSourceToSuccessor028, successorSourceDisplay028, successorSourceDisplayWithSemanticPorts028 } from '../src/index.js';
import { resolveSpatialLayout } from '../src/layout/spatial.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { retargetSpatialEdgeParts028 } from '../src/renderScene028.js';
import { fontMetrics, resolveFont } from '../src/text/fonts.js';

const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 300 }];
const graph = (placement: EdgeLabelPlacement): GraphIR => ({ version: '3.0.0', id: 'placed-label',
  metadata: { notation: 'flowchart' }, nodes: [
    { id: 'a', type: 'process', position: { x: 0, y: 100 }, dimensions: { width: 100, height: 60 } },
    { id: 'b', type: 'process', position: { x: 600, y: 100 }, dimensions: { width: 100, height: 60 } },
  ], edges: [{ id: 'review', source: 'a', target: 'b', label: 'Review', labelPlacement: placement }] });

describe('authored edge label placement', () => {
  it.each([1, .6])('contains descender ink in spatial label bounds at line-height %s', (lineHeight) => {
    for (const text of ['gyp', 'gyp\ngyp']) {
      const meaning = graph({ side: 'above', at: .5, offset: 0 });
      meaning.edges[0].label = text;
      const options = { fontSize: 18, fontFamily: 'Coral Inter', lineHeight, style: 'hifi' as const };
      const scene = prepareSpatialScene028(meaning, options);
      const part = scene.parts.find((part) => part.id === 'review:label')!;
      if (part.geometry.kind !== 'text') throw new Error('missing text');
      const font = resolveFont({ family: part.geometry.fontFamily, size: part.geometry.fontSize, weight: part.geometry.fontWeight });
      const metrics = fontMetrics(font.id, font.weight);
      const top = part.geometry.y - metrics.ascent * font.size;
      const bottom = part.geometry.y + (text.split('\n').length - 1) * Math.ceil(font.size * lineHeight) + metrics.descent * font.size;
      expect(top).toBeGreaterThanOrEqual(part.bounds.y - 1e-8);
      expect(bottom).toBeLessThanOrEqual(part.bounds.y + part.bounds.height + 1e-8);
      expect(renderSvg(meaning, options)).toContain('data-coral-label-background="review:label"');
    }
  });

  it.each([
    ['above', { x: 80, y: 70 }], ['below', { x: 80, y: 110 }],
    ['left', { x: 50, y: 90 }], ['right', { x: 110, y: 90 }],
    ['center', { x: 80, y: 90 }],
  ] as const)('places %s page-relative around final route arc length', (side, expected) => {
    const bounds = authoredEdgeLabelBox028(points, { side, offset: side === 'center' ? 0 : 10 }, 40, 20);
    // Arc midpoint lies at (100,100), not the endpoint midpoint (50,150).
    expect(bounds).toEqual({ ...expected, width: 40, height: 20 });
  });

  it.each([[0, 0, 0], [.25, 100, 0], [.75, 100, 200], [1, 100, 300]])(
    'honors inclusive at=%s in written path order', (at, x, y) => {
      expect(authoredEdgeLabelBox028(points, { side: 'center', at }, 40, 20))
        .toEqual({ x: x - 20, y: y - 10, width: 40, height: 20 });
    });

  it('handles a coincident route and omitted defaults', () => {
    expect(authoredEdgeLabelBox028([{ x: 3, y: 4 }, { x: 3, y: 4 }], { side: 'above', at: 1 }, 40, 20))
      .toEqual({ x: -17, y: -16, width: 40, height: 20 });
  });

  it.each([{ side: 'above', at: -1 }, { side: 'above', at: Number.NaN },
    { side: 'below', offset: -2 }, { side: 'center', offset: 1 }, { side: 'diagonal' }])(
    'refuses malformed placement rather than using the midpoint: %j', (placement) => {
      expect(() => authoredEdgeLabelBox028(points, placement as EdgeLabelPlacement, 40, 20)).toThrow();
    });

  it.each(['lowfi', 'hifi'] as const)('executes exact authored placement in the shared %s scene', (style) => {
    const meaning = graph({ side: 'above', at: .25, offset: 16 });
    const before = JSON.stringify(meaning);
    const scene = prepareSpatialScene028(meaning, { style });
    const shaft = scene.parts.find((part) => part.id === 'review:shaft')!;
    const label = scene.parts.find((part) => part.id === 'review:label')!;
    expect(shaft.geometry.kind).toBe('route');
    if (shaft.geometry.kind !== 'route') return;
    const [a, b] = [shaft.geometry.points[0], shaft.geometry.points.at(-1)!];
    expect(label.bounds.x + label.bounds.width / 2).toBeCloseTo(a.x + (b.x - a.x) * .25);
    expect(label.bounds.y + label.bounds.height).toBeCloseTo(a.y - 16);
    expect(label.geometry).toMatchObject({ kind: 'text', labelPlacement: meaning.edges[0].labelPlacement });
    expect(renderSvg(meaning, { style })).toContain('Review');
    expect(JSON.stringify(meaning)).toBe(before);
  });

  it('refuses an exact placement that overlaps a node rather than moving the label', () => {
    expect(() => prepareSpatialScene028(graph({ side: 'above', at: 0, offset: 0 }), { style: 'hifi' }))
      .toThrow(/review.*label.*overlap|label.*review.*overlap/i);
  });

  it('rejects overlapping exact authored labels without using edge-array order as priority', () => {
    const meaning = graph({ side: 'above', at: .5, offset: 16 });
    meaning.edges.push({ ...meaning.edges[0], id: 'other' });
    for (const edges of [meaning.edges, [...meaning.edges].reverse()])
      expect(() => prepareSpatialScene028({ ...meaning, edges }, { style: 'hifi' })).toThrow(/overlap/);
  });

  it('rejects another connector crossing the exact label rectangle', () => {
    const meaning = graph({ side: 'above', at: .5, offset: 16 });
    meaning.edges.push({ id: 'other', source: 'a', target: 'b' });
    const routes = new Map([
      ['review', [{ startPoint: { x: 100, y: 130 }, bendPoints: [], endPoint: { x: 600, y: 130 } }]],
      ['other', [{ startPoint: { x: 100, y: 130 }, bendPoints: [{ x: 350, y: 75 }, { x: 350, y: 130 }], endPoint: { x: 600, y: 130 } }]],
    ]);
    expect(() => prepareSpatialScene028(meaning, { style: 'hifi', edgeRoutes: routes })).toThrow(/review.*overlap/);
  });

  it('does not silently omit placement from sequence messages', () => {
    const source = projectInstalledSourceToSuccessor028('@diagram uml-sequence\na participant\nb participant\ncall = a -> b as "Call"').graph!;
    source.edges[0].labelPlacement = { side: 'above' };
    expect(prepareSequenceScene028(successorSourceDisplay028(source)).scene.messages[0].labelBounds).toBeDefined();
  });

  it('uses container interiors while retaining their border and title as obstacles', () => {
    const meaning: GraphIR = { version: '3.0.0', id: 'inside-container', metadata: { notation: 'architecture' },
      nodes: [{ id: 'team', type: 'group', position: { x: 0, y: 0 }, dimensions: { width: 800, height: 400 }, children: [
        { id: 'a', type: 'service', position: { x: 50, y: 150 }, dimensions: { width: 100, height: 60 } },
        { id: 'b', type: 'service', position: { x: 600, y: 150 }, dimensions: { width: 100, height: 60 } },
      ] }], edges: [{ id: 'review', source: 'a', target: 'b', label: 'Review', labelPlacement: { side: 'above', offset: 16 } }] };
    const scene = prepareSpatialScene028(meaning, { style: 'hifi' });
    expect(scene.parts.find((part) => part.id === 'review:label')).toBeDefined();
    expect(scene.parts.find((part) => part.id === 'team:outline')!.geometry).toMatchObject({ fill: 'none' });
    meaning.edges[0].labelPlacement!.offset = 154;
    expect(() => prepareSpatialScene028(meaning, { style: 'hifi' })).toThrow(/overlap/);
  });

  it('treats omitted and empty children equally on an ordinary leaf node', () => {
    const meaning = graph({ side: 'above', at: .5, offset: 200 });
    meaning.nodes[0].position!.y = 270; meaning.nodes[1].position!.y = 270;
    meaning.nodes.push({ id: 'obstacle', type: 'process', position: { x: 250, y: 40 }, dimensions: { width: 200, height: 200 } });
    for (const children of [undefined, []]) {
      meaning.nodes[2].children = children;
      expect(() => prepareSpatialScene028(meaning, { style: 'hifi' })).toThrow(/review.*overlap/);
    }
  });

  it('uses the actual full container frame rather than an aspect-fitted inner glyph', () => {
    const meaning: GraphIR = { version: '3.0.0', id: 'fitted-container', metadata: { notation: 'architecture' },
      nodes: [{ id: 'team', type: 'group', position: { x: 0, y: 0 }, dimensions: { width: 800, height: 400 }, children: [
        { id: 'a', type: 'service', position: { x: 50, y: 150 }, dimensions: { width: 100, height: 60 },
          ports: [{ id: 'W', side: 'WEST', position: .5 }] },
        { id: 'b', type: 'service', position: { x: 600, y: 150 }, dimensions: { width: 100, height: 60 } },
      ] }], edges: [{ id: 'review', source: 'a', sourcePort: 'W', target: 'b', label: 'Review',
        labelPlacement: { side: 'above', at: 0, offset: 40 } }] };
    const edgeRoutes = new Map([['review', [{ startPoint: { x: 50, y: 180 },
      bendPoints: [{ x: 20, y: 180 }, { x: 20, y: 100 }, { x: 600, y: 100 }], endPoint: { x: 600, y: 180 } }]]]);
    for (const style of ['lowfi', 'hifi'] as const) {
      expect(prepareSpatialScene028(meaning, { style, edgeRoutes }).parts.find(part => part.id === 'review:label')).toBeDefined();
      meaning.edges[0].labelPlacement!.at = .5;
      expect(prepareSpatialScene028(meaning, { style, edgeRoutes }).parts.find((part) => part.id === 'review:label')).toBeDefined();
      meaning.edges[0].labelPlacement!.at = 0;
    }
  });

  it.each(['lowfi', 'hifi'] as const)('refuses a label crossing triangle marker ink even when it misses its shaft and node in %s', (style) => {
    const meaning = graph({ side: 'above', at: .38, offset: 133 });
    meaning.edges[0].label = 'X';
    meaning.nodes.push({ id: 'c', type: 'process', position: { x: 300, y: -30 }, dimensions: { width: 100, height: 60 } });
    meaning.edges.push({ id: 'other', source: 'a', target: 'c', targetEnd: { marker: { kind: 'triangle', fill: 'filled' } } });
    const routes = new Map([
      ['review', [{ startPoint: { x: 100, y: 130 }, bendPoints: [], endPoint: { x: 600, y: 130 } }]],
      ['other', [{ startPoint: { x: 100, y: -70 }, bendPoints: [{ x: 200, y: -70 }, { x: 200, y: 0 }], endPoint: { x: 300, y: 0 } }]],
    ]);
    expect(() => prepareSpatialScene028(meaning, { style, edgeRoutes: routes })).toThrow(/review.*overlap/);
  });

  it('retargets authored at=.25 against the new path instead of translating its midpoint', () => {
    const scene = prepareSpatialScene028(graph({ side: 'above', at: .25, offset: 16 }), { style: 'hifi' });
    const parts = scene.parts.filter((part) => part.owner.kind === 'edge');
    const moved = retargetSpatialEdgeParts028(parts, points, 'hifi');
    const label = moved.find((part) => part.id === 'review:label')!;
    expect(label.bounds.x + label.bounds.width / 2).toBe(100);
    expect(label.bounds.y + label.bounds.height).toBe(-16);
  });

  it.each(['load', 'reflow'] as const)('executes placement after %s resolves its final path', async (operation) => {
    const meaning = graph({ side: 'above', at: .5, offset: 60 });
    const resolved = await resolveSpatialLayout({ revision: 'placed-' + operation, graph: meaning, operation, defaults: { algorithm: 'layered', direction: 'RIGHT' } });
    const byId = new Map(resolved.nodes.map((node) => [node.id, node]));
    const drawing = { ...meaning, nodes: meaning.nodes.map((node) => ({ ...node,
      position: byId.get(node.id)!.absolutePosition })) };
    const scene = prepareSpatialScene028(drawing, { style: 'hifi',
      edgeRoutes: new Map(resolved.edges.map((edge) => [edge.id, edge.sections])) });
    expect(scene.parts.find((part) => part.id === 'review:label')).toBeDefined();
    expect(resolved.diagnostics.some((item) => item.severity === 'error')).toBe(false);
  });

  it('keeps at in written endpoint order when the authored arrow points backward', async () => {
    const source = projectInstalledSourceToSuccessor028('@diagram flowchart\na process\nb process\nreview = a <- b as "Review"').graph!;
    source.edges[0].labelPlacement = { side: 'above', at: .25, offset: 60 };
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(source);
    expect(display.edges[0].source).toBe('a');
    const laid = await layoutGraphForSvg(display, { semanticInterpretations, svgOptions: { style: 'hifi' } });
    const scene = prepareSpatialScene028(laid, { style: 'hifi', successorSource: source, semanticGraph: display, edgeRoutes: laid.edgeRoutes });
    const shaft = scene.parts.find((part) => part.id === 'review:shaft')!;
    const label = scene.parts.find((part) => part.id === 'review:label')!;
    if (shaft.geometry.kind !== 'route') throw new Error('missing shaft');
    const expected = authoredEdgeLabelBox028(shaft.geometry.points, source.edges[0].labelPlacement, label.bounds.width, label.bounds.height);
    expect(label.bounds).toEqual(expected);
  });

  it('draws center placement with a paper background and preserves multiline label rows', () => {
    const meaning = graph({ side: 'center' });
    meaning.edges[0].label = 'Review\nrequest';
    const svg = renderSvg(meaning, { style: 'hifi' });
    expect(svg).toContain('data-coral-label-background="review:label"');
    expect(svg.match(/<tspan[^>]*>Review<\/tspan>/)).not.toBeNull();
    expect(svg.match(/<tspan[^>]*>request<\/tspan>/)).not.toBeNull();
  });

  it('retains placement through layout, route and reflow without changing authored meaning', async () => {
    const meaning = graph({ side: 'above', at: .5, offset: 60 });
    const before = JSON.stringify(meaning);
    const laid = await layoutGraphForSvg(meaning, { svgOptions: { style: 'hifi' } });
    expect(laid.edges[0].labelPlacement).toEqual(meaning.edges[0].labelPlacement);
    const scene = prepareSpatialScene028(laid, { style: 'hifi', edgeRoutes: laid.edgeRoutes, semanticGraph: meaning });
    expect(scene.parts.find((part) => part.id === 'review:label')).toBeDefined();
    expect(JSON.stringify(meaning)).toBe(before);
  });
});
