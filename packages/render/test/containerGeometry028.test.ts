import { describe, expect, it } from 'vitest';
import { shapeRegistry } from '../src/shapes/index.js';
import { svgPathContour028 } from '../src/svgPathContour028.js';
import { spatialQualityFixtures029 } from './fixtures/spatialQuality029.js';
import { completeSpatialSource029 } from './helpers/spatialQuality029.js';
import { prepareSpatialScene028, type PreparedSpatialScene028 } from '../src/svg/serialize.js';
import type { ScenePartRecord028 } from '../src/renderScene028.js';

function paintedBounds(part: ScenePartRecord028) {
  if (part.geometry.kind !== 'stencil-path') throw new Error('Expected painted outline');
  const { d, transform } = part.geometry;
  // Read actual emitted ink coordinates rather than the layout part's nominal bounds.
  const contour = svgPathContour028({ ...shapeRegistry.get('rectangle')!, path: d, viewBox: '0 0 1 1' });
  const points = contour.flatMap(segment => [segment.start, segment.end]).map(point => ({
    x: transform.x + point.x * transform.scale, y: transform.y + point.y * transform.scale,
  }));
  return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
    top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) };
}
function checkContainer(scene: PreparedSpatialScene028, id: string, children: string[]) {
  const frame = paintedBounds(scene.parts.find(part => part.id === `${id}:outline`)!);
  const titleParts = scene.parts.filter(part => part.owner.id === id && part.role === 'node-label');
  const title = { x: Math.min(...titleParts.map(part => part.bounds.x)), y: Math.min(...titleParts.map(part => part.bounds.y)),
    width: Math.max(...titleParts.map(part => part.bounds.x + part.bounds.width)) - Math.min(...titleParts.map(part => part.bounds.x)),
    height: Math.max(...titleParts.map(part => part.bounds.y + part.bounds.height)) - Math.min(...titleParts.map(part => part.bounds.y)) };
  expect(title.y).toBeGreaterThan(frame.top + 3);
  expect(title.y + title.height).toBeLessThan(frame.bottom);
  for (const child of children) {
    const body = paintedBounds(scene.parts.find(part => part.id === `${child}:outline`)!);
    expect(body.left, child).toBeGreaterThan(frame.left + 4);
    expect(body.right, child).toBeLessThanOrEqual(frame.right - 4 + 1e-6);
    expect(body.top, child).toBeGreaterThan(title.y + title.height + 4);
    expect(body.bottom, child).toBeLessThanOrEqual(frame.bottom - 4 + 1e-6);
  }
  for (const shaft of scene.parts.filter(part => part.geometry.kind === 'route')) {
    if (shaft.geometry.kind !== 'route') continue;
    const points = shaft.geometry.points;
    for (let i = 1; i < points.length; i++) for (let step = 0; step <= 64; step++) {
      const t = step / 64, a = points[i - 1], b = points[i];
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      expect(x > title.x - 2 && x < title.x + title.width + 2 &&
        y > title.y - 2 && y < title.y + title.height + 2, `${shaft.id} crosses ${id} header`).toBe(false);
    }
  }
}
describe('elastic container frames', () => {
  it.each(['lowfi', 'hifi'] as const)('preserves the frozen hard frame and explicit child coordinates in %s', style => {
    const graph = { nodes: [{ id: 'nested', type: 'process', symbol: 'flowchart-process',
      label: 'Nested review and long-label content', dimensions: { width: 250, height: 165 },
      position: { x: 6000, y: 1625 }, children: [{ id: 'nested-child', type: 'process', symbol: 'flowchart-process',
        label: 'Nested approval', position: { x: 25, y: 70 }, dimensions: { width: 190, height: 70 } }] }], edges: [] };
    const original = structuredClone(graph);
    const scene = prepareSpatialScene028(graph, { style, notation: 'flowchart' });
    checkContainer(scene, 'nested', ['nested-child']);
    const parent = scene.nodes.find(node => node.node.id === 'nested')!;
    const child = scene.nodes.find(node => node.node.id === 'nested-child')!;
    expect(child.x - parent.x).toBe(25); expect(child.y - parent.y).toBe(70);
    expect(parent.width).toBe(250); expect(parent.height).toBe(165);
    expect(graph).toEqual(original);
  });
  it.each(['lowfi', 'hifi'] as const)('paints the nested corpus frame around its children with a clear %s header', async style => {
    const source = spatialQualityFixtures029.find(fixture => fixture.id === 'nested')!.source;
    const result = await completeSpatialSource029(source, style, 'DOWN');
    checkContainer(result.scene, 'cluster', ['cluster.api', 'cluster.worker']);
  });
  // The frame is sized by its children, not its title, so the header must hold
  // the title wrapped at the frame's narrowest width (widest child plus insets).
  it.each(['lowfi', 'hifi'] as const)('reserves a %s header for a long title wrapped at the frame width', async style => {
    for (const title of ['Deliver Marmot and Dispatch', 'A much longer label that keeps on going and going',
      'A much longer label that keeps on going and going and on and on and on forever more']) {
      const source = `@diagram flowchart\nstart terminal as "Begin Quillon"\na group as "${title}" {\n` +
        '  r process as "Review Zephyr"\n}\nship process as "Ship Marmot"\nstart -> a.r\na.r -> ship\n';
      const result = await completeSpatialSource029(source, style, 'DOWN');
      checkContainer(result.scene, 'a', ['a.r']);
    }
    const title = 'A much longer label that keeps on going and going';
    const sideBySide = `@diagram flowchart\nstart terminal as "Begin"\na group as "${title}" {\n` +
      '  r process as "Review"\n  s process as "Sign"\n}\nstart -> a.r\nstart -> a.s\n';
    checkContainer((await completeSpatialSource029(sideBySide, style, 'DOWN')).scene, 'a', ['a.r', 'a.s']);
    const nested = `@diagram flowchart\nstart terminal as "Begin"\no group as "${title}" {\n` +
      `  i group as "${title}" {\n    r process as "Review"\n  }\n}\nstart -> o.i.r\n`;
    const scene = (await completeSpatialSource029(nested, style, 'DOWN')).scene;
    checkContainer(scene, 'o', ['o.i', 'o.i.r']);
    checkContainer(scene, 'o.i', ['o.i.r']);
  });
  it.each(['lowfi', 'hifi'] as const)('preserves exact container semantic-port contacts on its %s frame', async style => {
    const source = '@diagram architecture\ncluster group as "Cluster" {\n' +
      '  exit port [direction: out, anchor: E]\n  api service\n  worker service\n}\nstore database\n' +
      'call = cluster.api -> cluster.worker\nsave = cluster:exit -> store\n';
    const result = await completeSpatialSource029(source, style, 'DOWN');
    checkContainer(result.scene, 'cluster', ['cluster.api', 'cluster.worker']);
    const frame = result.scene.nodes.find(node => node.node.id === 'cluster')!;
    const route = result.scene.resolved.edges.find(edge => edge.id === 'save')!;
    expect(route.points[0].x).toBeCloseTo(frame.x + frame.width, 5);
    expect(route.points[0].y).toBeCloseTo(frame.y + frame.height / 2, 5);
  });
  it.each(['lowfi', 'hifi'] as const)('keeps connected minimum-gap row and column arrangements readable in %s', async style => {
    const source = '@diagram architecture\nsales group {\n  a service\n  b service\n' +
      '  route = a -> b\n  lane = arrange row: a, b\n}\n' +
      'ops group {\n  a service\n  b service\n  route = a -> b\n  lane = arrange column: a, b\n}\n';
    const result = await completeSpatialSource029(source, style, 'DOWN');
    for (const [group, axis, size] of [['sales', 'x', 'width'], ['ops', 'y', 'height']] as const) {
      checkContainer(result.scene, group, [`${group}.a`, `${group}.b`]);
      const a = result.scene.nodes.find(node => node.node.id === `${group}.a`)!;
      const b = result.scene.nodes.find(node => node.node.id === `${group}.b`)!;
      expect(b[axis] - a[axis] - a[size]).toBeGreaterThanOrEqual(40);
      const route = result.scene.resolved.edges.find(edge => edge.id === `${group}.route`)!;
      expect(Math.hypot(route.points.at(-1)!.x - route.points[0].x,
        route.points.at(-1)!.y - route.points[0].y)).toBeGreaterThan(35);
    }
  });
  it.each(['lowfi', 'hifi'] as const)('lets authored preferences override automatic shaft spacing in %s', async style => {
    const bX = style === 'hifi' ? 140 : 160;
    const source = `@diagram architecture\na service\nb service @ (${bX}, 0) pinned\n` +
      'c service @ (40, 250) pinned\ne = a -> b\nlane = arrange row: a, b\n' +
      'constraint align: node a above node c [preferred]\n';
    const result = await completeSpatialSource029(source, style, 'RIGHT');
    const a = result.scene.nodes.find(node => node.node.id === 'a')!;
    const b = result.scene.nodes.find(node => node.node.id === 'b')!;
    expect(a.x).toBeCloseTo(40);
    expect(b.x - a.x - a.width).toBeGreaterThan(0);
    expect(b.x - a.x - a.width).toBeLessThan(40);
  });
  it.each(['lowfi', 'hifi'] as const)('routes a child north-port escape around its %s ancestor title', async style => {
    const source = '@diagram architecture\ncluster group as "Cluster" @ (0, 240) pinned {\n' +
      '  api service @ (20, 70) pinned {\n    north port [direction: out, anchor: N]\n  }\n}\n' +
      'outside service @ (20, 0) pinned\nrequest = cluster.api:north -> outside\n';
    const result = await completeSpatialSource029(source, style, 'UP');
    checkContainer(result.scene, 'cluster', ['cluster.api']);
    const route = result.scene.resolved.edges.find(edge => edge.id === 'request')!;
    expect(route.points.length).toBeGreaterThan(2);
    const child = result.scene.nodes.find(node => node.node.id === 'cluster.api')!;
    const body = paintedBounds(result.scene.parts.find(part => part.id === 'cluster.api:outline')!);
    expect(Math.abs(route.points[0].y + result.scene.viewport.shiftY - body.top)).toBeLessThan(0.75);
    expect(route.points[0].x).toBeCloseTo(child.x + child.width / 2, 4);
    expect(route.points[1].y).toBeLessThan(route.points[0].y);
  });
  it.each(['lowfi', 'hifi'] as const)('diagnoses a child authored into the %s container header', style => {
    const graph = { version: '3.0.0' as const, id: 'header-child', nodes: [
      { id: 'group', type: 'group', label: 'Cluster', dimensions: { width: 300, height: 250 }, children: [
        { id: 'child', type: 'service', label: 'Child', position: { x: 90, y: 4 }, dimensions: { width: 120, height: 72 } },
      ] },
    ], edges: [] };
    const original = structuredClone(graph);
    expect(() => prepareSpatialScene028(graph, { style })).toThrow(/Child child overlaps container group caption/);
    expect(graph).toEqual(original);
  });
  it('diagnoses an exact route crossing an existing container header without moving authored points', () => {
    const graph = { version: '3.0.0' as const, id: 'exact-header', nodes: [
      { id: 'group', type: 'group', label: 'Cluster', dimensions: { width: 300, height: 250 }, children: [
        { id: 'child', type: 'service', position: { x: 70, y: 100 }, dimensions: { width: 120, height: 72 } },
      ] },
      { id: 'outside', type: 'service', position: { x: 400, y: 0 }, dimensions: { width: 120, height: 72 } },
    ], edges: [{ id: 'conflict', source: 'child', target: 'outside', routeIntent: { waypoints: [
      { id: 'pin', placement: { kind: 'absolute' as const, position: { x: 150, y: 20 } } },
    ] } }] };
    const original = structuredClone(graph);
    expect(() => prepareSpatialScene028(graph, { style: 'hifi', edgeRoutes: new Map([['conflict', [{
      startPoint: { x: 130, y: 100 }, bendPoints: [{ x: 150, y: 20 }, { x: 370, y: 20 }], endPoint: { x: 400, y: 36 },
    }]]]) })).toThrow(/container.*caption|header/);
    expect(graph).toEqual(original);
  });
});
