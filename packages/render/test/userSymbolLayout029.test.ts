import { describe, expect, it } from 'vitest';
import type { GraphNode } from '@graph-ir/core';
import { documentCatalog029 } from '../src/documentCatalog029.js';
import { resolveNotationNode028 } from '../src/notations/index.js';
import { finalSceneRouteIssues028 } from '../src/sceneRouteValidation028.js';
import { layoutPortShape029, semanticLayoutPorts028 } from '../src/semanticLayoutPorts028.js';
import { StencilAnchorGeometryCapabilityError } from '../src/stencilAnchorGeometry028.js';
import { successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { prepareSpatialScene028, renderSvg } from '../src/svg/serialize.js';
import { userBoundaryAnchorPoint029, userCornerAnchorPoint029, userOutlineExitPoint029,
  userOutlineRegion029, type UserOutline029 } from '../src/userSymbolGeometry029.js';

type Kind = UserOutline029['outline'];
const ARTWORK = ['  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""'];
const source = (kind: Kind, body: string[]) => ['@diagram architecture', '@coralVersion "0.2.9"', '',
  '@symbol probe {', '  name "Probe"', '  size 60 x 40', `  outline ${kind}`,
  '  anchor top [side: N, at: 0.3]', '  anchor core [x: 0.5, y: 0.5, exit: E]',
  '  pin port [direction: out, anchor: top]', '  deep port [direction: out, anchor: core]',
  '  south port [direction: out, anchor: S]', '  corner port [direction: out, anchor: NE]',
  '  free port [direction: out]', ...ARTWORK, '}', '', ...body, ''].join('\n');
const MATRIX = ['a service [symbol: "local.probe"]',
  'b1 service', 'b2 service', 'b3 service', 'b4 service', 'b5 service',
  'a:pin -> b1', 'a:deep -> b2', 'a:south -> b3', 'a:corner -> b4', 'a:free -> b5'];
const kinds: readonly Kind[] = ['rectangle', 'rounded', 'ellipse', 'diamond'];
const outline = (kind: Kind): UserOutline029 => ({ symbolId: 'local.probe', outline: kind, width: 60, height: 40 });

async function render(text: string) {
  const graph = projectInstalledSourceToSuccessor028(text).graph!;
  const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(graph);
  const laidOut = await layoutGraphForSvg(display, { direction: 'RIGHT', semanticInterpretations });
  const options = { edgeRoutes: laidOut.edgeRoutes, layoutDirection: 'RIGHT' as const,
    semanticGraph: display, successorSource: graph };
  return { graph, display, laidOut, options, prepared: prepareSpatialScene028(laidOut, options),
    svg: renderSvg(laidOut, options) };
}
const flatNodes = (nodes: readonly GraphNode[]): GraphNode[] =>
  nodes.flatMap((node) => [node, ...flatNodes(node.children ?? [])]);

describe('user-symbol layout ports', () => {
  const graph = () => projectInstalledSourceToSuccessor028(source('rounded', MATRIX)).graph!;
  const ports = () => {
    const interpretation = resolveNotationNode028({ id: 'a', type: 'service', symbol: 'local.probe' },
      'architecture', documentCatalog029('architecture', graph().userSymbols029!));
    return semanticLayoutPorts028(interpretation, interpretation.userSymbol029!.symbol, undefined, 'RIGHT').ports;
  };
  const frame = { symbolId: 'local.probe', outline: 'rounded', width: 60, height: 40 };

  it('pins named, interior and exact generic anchors at exact outline points in frame coordinates', () => {
    const byId = new Map(ports().map((port) => [port.id, port]));
    const top = userBoundaryAnchorPoint029(outline('rounded'), 'N', 0.3);
    expect(byId.get('pin')).toEqual({ id: 'pin', side: 'NORTH', attachment: 'fixed', outlinePoint: top,
      position: top.x, frameOutline029: frame });
    const exit = userOutlineExitPoint029(outline('rounded'), 'E', { x: 0.5, y: 0.5 });
    expect(byId.get('deep')).toEqual({ id: 'deep', side: 'EAST', attachment: 'fixed', outlinePoint: exit,
      position: exit.y, frameOutline029: frame, escape029: { interior: { x: 0.5, y: 0.5 } } });
    expect(byId.get('south')).toMatchObject({ side: 'SOUTH', attachment: 'fixed', outlinePoint: { x: 0.5, y: 1 } });
    const corner = userCornerAnchorPoint029(outline('rounded'), 'NE');
    expect(byId.get('corner')).toMatchObject({ side: 'EAST', attachment: 'fixed', outlinePoint: corner,
      position: corner.y });
    for (const port of byId.values()) expect(port).not.toHaveProperty('stencilShapeId');
  });

  it('leaves auto ports free on the user outline', () => {
    const free = ports().find((port) => port.id === 'free')!;
    expect(free).toMatchObject({ attachment: 'free', side: 'EAST', freeStencil: { shapeId: 'local.probe' },
      frameOutline029: frame });
    expect(layoutPortShape029(free)).toMatchObject({ id: 'local.probe', type: 'path', viewBox: '0 0 60 40' });
  });

  it('never resolves a local outline without its carried value', () => {
    expect(() => layoutPortShape029({ id: 'x', side: 'NORTH', stencilShapeId: 'local.probe' }))
      .toThrow(StencilAnchorGeometryCapabilityError);
    expect(layoutPortShape029({ id: 'x', side: 'NORTH', stencilShapeId: 'diamond' })).toMatchObject({ id: 'diamond' });
  });
});

describe.each(kinds)('Slice 20 placement, contact and routing on a %s user symbol', (kind) => {
  it('keeps the frame, pins contacts to exact outline points and draws the escape segment', async () => {
    const { prepared, laidOut } = await render(source(kind, MATRIX));
    const node = prepared.resolved.nodes.find((item) => item.id === 'a')!;
    expect(node).toMatchObject({ width: 60, height: 40, shapeId: 'local.probe',
      outline029: outline(kind) });
    const at = (point: { x: number; y: number }) => ({ x: node.x + point.x * 60, y: node.y + point.y * 40 });
    const contacts = prepared.portContacts.a!;
    const expected = {
      pin: userBoundaryAnchorPoint029(outline(kind), 'N', 0.3),
      deep: userOutlineExitPoint029(outline(kind), 'E', { x: 0.5, y: 0.5 }),
      south: userBoundaryAnchorPoint029(outline(kind), 'S', 0.5),
      corner: userCornerAnchorPoint029(outline(kind), 'NE'),
    };
    for (const [port, point] of Object.entries(expected)) {
      expect(contacts[port]!.x - prepared.viewport.shiftX).toBeCloseTo(at(point).x, 6);
      expect(contacts[port]!.y - prepared.viewport.shiftY).toBeCloseTo(at(point).y, 6);
    }
    // A layout-chosen contact lies on the outline (sampled corners within tolerance).
    const free = contacts.free!;
    const normalized = { x: (free.x - prepared.viewport.shiftX - node.x) / 60,
      y: (free.y - prepared.viewport.shiftY - node.y) / 40 };
    expect(Math.abs(userOutlineRegion029(outline(kind), normalized))).toBeLessThan(2e-3);
    // The interior anchor's escape is the first segment, axis-aligned toward its exit.
    const deep = prepared.resolved.edges.find((edge) => edge.sourceId === 'a' && edge.targetId === 'b2')!;
    expect(deep.escape029).toEqual({ source: true });
    expect(deep.points[0]).toEqual(expect.objectContaining(at({ x: 0.5, y: 0.5 })));
    expect(deep.points[1]!.x).toBeCloseTo(at(expected.deep).x, 6);
    expect(deep.points[1]!.y).toBeCloseTo(deep.points[0]!.y, 9);
    expect(deep.points[1]!.x).toBeGreaterThan(deep.points[0]!.x);
    for (const edge of prepared.resolved.edges.filter((item) => item !== deep)) expect(edge.escape029).toBeUndefined();
    expect(finalSceneRouteIssues028(prepared.resolved, flatNodes(laidOut.nodes), { layoutDirection: 'RIGHT' }))
      .toEqual([]);
  });

  it('keeps pinned contacts frame-relative when the node moves', async () => {
    // Unconnected ports keep their idle contacts, which are the frame points themselves.
    const { laidOut, options, prepared } = await render(source(kind, ['a service [symbol: "local.probe"]', 'b service']));
    const before = prepared.resolved.nodes.find((item) => item.id === 'a')!;
    const moved = { ...laidOut, nodes: laidOut.nodes.map((item) => item.id === 'a'
      ? { ...item, position: { x: item.position!.x + 37, y: item.position!.y + 11 } } : item) };
    const { edgeRoutes: _routes, ...idle } = options;
    void _routes;
    const after = prepareSpatialScene028(moved, idle);
    const node = after.resolved.nodes.find((item) => item.id === 'a')!;
    for (const port of ['pin', 'deep', 'south', 'corner']) {
      expect(after.portContacts.a![port]!.x - after.viewport.shiftX - node.x)
        .toBeCloseTo(prepared.portContacts.a![port]!.x - prepared.viewport.shiftX - before.x, 6);
      expect(after.portContacts.a![port]!.y - after.viewport.shiftY - node.y)
        .toBeCloseTo(prepared.portContacts.a![port]!.y - prepared.viewport.shiftY - before.y, 6);
    }
  });
});

describe('interior escapes at a target and on a self-loop', () => {
  it('appends the escape for a target endpoint and draws both escapes of a one-port self-loop', async () => {
    const text = source('ellipse', ['a service [symbol: "local.probe"]', 'c service [symbol: "local.probe"]',
      'a:pin -> c:deep', 'c:deep -> c:deep']).replace(
      '  deep port [direction: out, anchor: core]', '  deep port [direction: inout, anchor: core]');
    const { prepared, laidOut } = await render(text);
    const c = prepared.resolved.nodes.find((item) => item.id === 'c')!;
    const interior = { x: c.x + 30, y: c.y + 20 };
    const inbound = prepared.resolved.edges.find((edge) => edge.sourceId === 'a')!;
    expect(inbound.escape029).toEqual({ target: true });
    expect(inbound.points.at(-1)).toEqual(expect.objectContaining(interior));
    const loop = prepared.resolved.edges.find((edge) => edge.sourceId === 'c' && edge.targetId === 'c')!;
    expect(loop.escape029).toEqual({ source: true, target: true });
    expect(loop.points[0]).toEqual(expect.objectContaining(interior));
    expect(loop.points.at(-1)).toEqual(expect.objectContaining(interior));
    expect(finalSceneRouteIssues028(prepared.resolved, flatNodes(laidOut.nodes), { layoutDirection: 'RIGHT' }))
      .toEqual([]);
  });
});

describe('an authored node port on a definition interior anchor', () => {
  const text = source('ellipse', ['u service [symbol: "local.probe"] {', '  extra port [direction: out, anchor: core]', '}',
    'b service', 'u:extra -> b']);

  it('draws the escape segment from the parse interpretations, with or without the successor source', async () => {
    const { prepared, laidOut, options } = await render(text);
    const { successorSource: _source, ...carried } = options;
    void _source;
    for (const scene of [prepared, prepareSpatialScene028(laidOut, carried)]) {
      const node = scene.resolved.nodes.find((item) => item.id === 'u')!;
      const edge = scene.resolved.edges.find((item) => item.sourceId === 'u')!;
      expect(edge.escape029).toEqual({ source: true });
      expect(edge.points[0]).toEqual(expect.objectContaining({ x: node.x + 30, y: node.y + 20 }));
    }
  });
});
