import { describe, expect, it } from 'vitest';
import type { GraphIR, NodeLabelPlacement } from '@graph-ir/core';
import { prepareSpatialScene028, renderSvg } from '../src/svg/serialize.js';
import { authoredEdgeLabelBox028 } from '../src/edgeLabelPlacement028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { projectInstalledSourceToSuccessor028, successorSourceDisplayWithSemanticPorts028 } from '../src/index.js';

const graph = (placement: NodeLabelPlacement): GraphIR => ({ version: '3.0.0', id: 'node-placement',
  metadata: { notation: 'architecture' }, nodes: [{ id: 'api', type: 'service', label: 'API\ngyp',
    position: { x: 100, y: 100 }, dimensions: { width: 120, height: 60 }, labelPlacement: placement }], edges: [] });

describe('authored spatial node label placement', () => {
  it.each(['above', 'below', 'left', 'right', 'center'] as const)('executes %s in both shared visual styles', (side) => {
    for (const style of ['hifi', 'lowfi'] as const) {
      const meaning = graph({ side, offset: side === 'center' ? 0 : 12 });
      const before = JSON.stringify(meaning);
      const scene = prepareSpatialScene028(meaning, { style });
      const node = scene.nodes.find((item) => item.node.id === 'api')!;
      const label = scene.parts.find((part) => part.id === 'api:label:1')!;
      expect(label.geometry).toMatchObject({ kind: 'text', text: 'API\ngyp' });
      const centerX = node.x + scene.viewport.shiftX + node.width / 2;
      const centerY = node.y + scene.viewport.shiftY + node.height / 2;
      if (side === 'above') expect(label.bounds.y + label.bounds.height).toBeCloseTo(node.y + scene.viewport.shiftY - 12);
      if (side === 'below') expect(label.bounds.y).toBeCloseTo(node.y + scene.viewport.shiftY + node.height + 12);
      if (side === 'left') expect(label.bounds.x + label.bounds.width).toBeCloseTo(node.x + scene.viewport.shiftX - 12);
      if (side === 'right') expect(label.bounds.x).toBeCloseTo(node.x + scene.viewport.shiftX + node.width + 12);
      if (['above', 'below', 'center'].includes(side)) expect(label.bounds.x + label.bounds.width / 2).toBeCloseTo(centerX);
      if (['left', 'right', 'center'].includes(side)) expect(label.bounds.y + label.bounds.height / 2).toBeCloseTo(centerY);
      expect(scene.viewport.width).toBeGreaterThanOrEqual(label.bounds.x + label.bounds.width);
      expect(scene.viewport.height).toBeGreaterThanOrEqual(label.bounds.y + label.bounds.height);
      expect(renderSvg(meaning, { style })).toContain('>gyp</tspan>');
      expect(JSON.stringify(meaning)).toBe(before);
    }
  });

  it.each((['lowfi', 'hifi'] as const).flatMap((style) =>
    (['RIGHT', 'DOWN', 'LEFT', 'UP'] as const).map((direction) => [style, direction] as const)))(
    'executes the committed node and edge source spelling in %s/%s', async (style, direction) => {
    const source = '@diagram architecture\napi service as "API" label below offset 12\nstore database\n' +
      'request = api -> store as "Request" label above at 0.25 offset 8\n';
    const projection = projectInstalledSourceToSuccessor028(source);
    expect(projection.diagnostics).toEqual([]);
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projection.graph!);
    const before = JSON.stringify(display);
      const laid = await layoutGraphForSvg(display, { direction, semanticInterpretations, svgOptions: { style } });
      const scene = prepareSpatialScene028(laid, { style, layoutDirection: direction, edgeRoutes: laid.edgeRoutes, semanticGraph: display });
      expect(scene.parts.find((part) => part.id === 'api:label:1')).toBeDefined();
      expect(scene.parts.find((part) => part.id === 'request:label')).toBeDefined();
    expect(JSON.stringify(display)).toBe(before);
  });

  it('refuses colliding exact placement rather than moving or hiding the label', () => {
    const meaning = graph({ side: 'right', offset: 12 });
    meaning.nodes.push({ id: 'obstacle', type: 'service', position: { x: 232, y: 100 }, dimensions: { width: 120, height: 60 } });
    expect(() => prepareSpatialScene028(meaning, { style: 'hifi' })).toThrow(/api.*label.*overlap/i);
  });

  it('rejects a connector crossing an external caption, including its own connector', () => {
    const meaning = graph({ side: 'below', offset: 12 });
    meaning.nodes.push({ id: 'store', type: 'service', position: { x: 100, y: 400 }, dimensions: { width: 120, height: 60 } });
    meaning.edges.push({ id: 'request', source: 'api', target: 'store' });
    expect(() => prepareSpatialScene028(meaning, { style: 'hifi' })).toThrow(/api.*label.*overlap/i);
  });

  it('checks external captions against each other independent of node array order', () => {
    const meaning = graph({ side: 'right', offset: 12 });
    meaning.nodes.push({ ...meaning.nodes[0], id: 'other', position: { x: 290, y: 100 },
      labelPlacement: { side: 'left', offset: 12 } });
    for (const nodes of [meaning.nodes, [...meaning.nodes].reverse()])
      expect(() => prepareSpatialScene028({ ...meaning, nodes }, { style: 'hifi' })).toThrow(/label.*overlap/);
  });

  it('places a nested node caption in graph coordinates without treating its container interior as an obstacle', () => {
    const meaning = graph({ side: 'below', offset: 12 });
    meaning.nodes = [{ id: 'group', type: 'group', position: { x: 300, y: 200 },
      dimensions: { width: 500, height: 400 }, children: meaning.nodes }];
    const scene = prepareSpatialScene028(meaning, { style: 'hifi' });
    const label = scene.parts.find((part) => part.id === 'api:label:1')!;
    expect(label.bounds.y).toBeCloseTo(200 + 100 + 60 + 12 + scene.viewport.shiftY);
    expect(scene.ownerLookup.hitBounds['node:api'].height).toBeGreaterThan(60);
  });

  it('keeps an explicitly empty label empty', () => {
    const meaning = graph({ side: 'below', offset: 12 });
    meaning.nodes[0].label = '';
    expect(prepareSpatialScene028(meaning).parts.some((part) => part.role === 'node-label')).toBe(false);
  });

  it('evaluates an exact edge-label fraction after removing generated caption-detour retraces', async () => {
    const source = projectInstalledSourceToSuccessor028('@diagram architecture\napi service as "API" label below offset 12\nstore database\nrequest = api -> store as "Request" label above at 0.25 offset 8\n').graph!;
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(source);
    const original = structuredClone(display);
    const svgOptions = { style: 'hifi' as const, fontSettings: {
      default: { family: 'Coral Inter', size: 18, weight: 600, lineHeight: 1.4 },
    } };
    const laid = await layoutGraphForSvg(display, { direction: 'DOWN', svgOptions, semanticInterpretations });
    const scene = prepareSpatialScene028(laid, { ...svgOptions, layoutDirection: 'DOWN',
      edgeRoutes: laid.edgeRoutes, semanticGraph: display, successorSource: source });
    const points = scene.resolved.edges.find(edge => edge.id === 'request')!.points;
    for (let i = 2; i < points.length; i++) {
      const a = points[i - 2]!, b = points[i - 1]!, c = points[i]!;
      const first = { x: b.x - a.x, y: b.y - a.y }, second = { x: c.x - b.x, y: c.y - b.y };
      if (Math.abs(first.x * second.y - first.y * second.x) < 1e-6)
        expect(first.x * second.x + first.y * second.y).toBeGreaterThanOrEqual(0);
    }
    const label = scene.parts.find(part => part.id === 'request:label')!;
    const shaft = scene.parts.find(part => part.id === 'request:shaft')!;
    expect(shaft.geometry.kind).toBe('route');
    if (shaft.geometry.kind !== 'route') throw new Error('Expected route geometry');
    const expectedBounds = authoredEdgeLabelBox028(shaft.geometry.points,
      { side: 'above', at: .25, offset: 8 }, label.bounds.width, label.bounds.height);
    expect(label.bounds.x).toBeCloseTo(expectedBounds.x, 10);
    expect(label.bounds.y).toBeCloseTo(expectedBounds.y, 10);
    expect(label.bounds.width).toBeCloseTo(expectedBounds.width, 10);
    expect(label.bounds.height).toBeCloseTo(expectedBounds.height, 10);
    const api = scene.nodes.find(node => node.node.id === 'api')!;
    expect(label.bounds.x + label.bounds.width <= api.x + scene.viewport.shiftX ||
      label.bounds.x >= api.x + scene.viewport.shiftX + api.width ||
      label.bounds.y + label.bounds.height <= api.y + scene.viewport.shiftY ||
      label.bounds.y >= api.y + scene.viewport.shiftY + api.height).toBe(true);
    expect(display).toEqual(original);
  });

  it('refuses classifier heading relocation rather than ignoring the authored placement', () => {
    const meaning = graph({ side: 'below', offset: 12 });
    meaning.metadata = { notation: 'uml-class' };
    meaning.nodes[0].type = 'class';
    meaning.nodes[0].classifier = { kind: 'class', name: 'API', compartments: [] };
    expect(() => prepareSpatialScene028(meaning)).toThrow(/classifier heading label placement is not executable/);
  });

  it.each([{ side: 'below', offset: -1 }, { side: 'center', offset: 1 }, { side: 'diagonal' }])(
    'refuses malformed node placement: %j', (placement) => {
      expect(() => prepareSpatialScene028(graph(placement as NodeLabelPlacement))).toThrow(/placement/i);
    });
});
