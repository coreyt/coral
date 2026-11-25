import { describe, expect, it } from 'vitest';
import type { GraphNode } from '@graph-ir/core';
import { computeElkLayout } from '../src/layout/engine.js';
import * as layout from '../src/layout/index.js';
import type { LayoutEdge, LayoutEngine, LayoutNode } from '../src/layout/types.js';
import { documentCatalog029 } from '../src/documentCatalog029.js';
import { withProximity028 } from '../src/proximityLayout028.js';
import { successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { prepareSpatialScene028 } from '../src/svg/serialize.js';

// C4 revision 5 (c4-design.md "Reservation in layout"; author decision Q-C4-6
// option B): each user symbol's definition label side is reserved in ELK's
// input as an outside node label, so ELK keeps neighbours and connectors clear
// while the node box and its ports stay as they are.

type Side = 'above' | 'below' | 'left' | 'right' | 'center';
type Direction = 'RIGHT' | 'DOWN';
const ARTWORK = ['  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>', '"""'];
const doc = (side: Side, body: string[], definition: string[] = []) => ['@diagram architecture', '@coralVersion "0.2.9"',
  '@symbol probe {', '  name "Probe"', '  size 60 x 40', `  label ${side}`, '  outline ellipse', ...definition,
  ...ARTWORK, '}', ...body, ''].join('\n');
const SKIP = ['p service', 'a service [symbol: "local.probe"] as "Auth gateway"', 'q service', 'p -> a', 'a -> q', 'p -> q'];
const FAN = ['x service', 'a service [symbol: "local.probe"] as "Auth gateway"', 'y service', 'z service', 'x -> y',
  'x -> a', 'x -> z', 'a -> y', 'y -> z', 'z -> x'];

type Box = { x: number; y: number; width: number; height: number };
async function rendered(text: string, direction: Direction, nodeId = 'a') {
  const graph = projectInstalledSourceToSuccessor028(text).graph!;
  const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(graph);
  const laidOut = await layoutGraphForSvg(display, { direction, semanticInterpretations });
  const prepared = prepareSpatialScene028(laidOut, { edgeRoutes: laidOut.edgeRoutes, layoutDirection: direction,
    semanticGraph: display, successorSource: graph });
  const frameOf = (id: string): Box => {
    const node = prepared.resolved.nodes.find((item) => item.id === id)!;
    return { x: node.x + prepared.viewport.shiftX, y: node.y + prepared.viewport.shiftY, width: node.width, height: node.height };
  };
  const label = prepared.parts.find((part) => part.owner.kind === 'node' && part.owner.id === nodeId &&
    part.geometry.kind === 'text')!;
  return { frame: frameOf(nodeId), frameOf, label, prepared, display, laidOut };
}

const sideOf = (bounds: Box, frame: Box): Side | 'inside' =>
  bounds.y >= frame.y + frame.height - 1e-6 ? 'below' : bounds.y + bounds.height <= frame.y + 1e-6 ? 'above'
    : bounds.x >= frame.x + frame.width - 1e-6 ? 'right' : bounds.x + bounds.width <= frame.x + 1e-6 ? 'left' : 'inside';

function expectRoutesClear(prepared: Awaited<ReturnType<typeof rendered>>['prepared'], bounds: Box) {
  for (const part of prepared.parts) if (part.geometry.kind === 'route') {
    const points = part.geometry.points;
    for (let index = 1; index < points.length; index++) for (let step = 0; step <= 32; step++) {
      const [p, q] = [points[index - 1]!, points[index]!];
      const x = p.x + (q.x - p.x) * step / 32; const y = p.y + (q.y - p.y) * step / 32;
      expect(x > bounds.x && x < bounds.x + bounds.width && y > bounds.y && y < bounds.y + bounds.height,
        `${part.id} crosses the label`).toBe(false);
    }
  }
}

function captureEngine(): { engine: LayoutEngine; graphs: unknown[] } {
  const graphs: unknown[] = [];
  return { graphs, engine: { layout: async (graph: never) => { graphs.push(structuredClone(graph));
    return import('../src/layout/engine.js').then((module) => module.getElkLayoutEngine().layout(graph)); } } as never };
}

describe('the ELK input reserves an outside label (rule 2)', () => {
  const nodes = (label?: LayoutNode['outsideLabel029']): LayoutNode[] => [{ id: 'p', width: 100, height: 60 },
    { id: 'a', width: 60, height: 40, ...(label ? { outsideLabel029: label } : {}) }, { id: 'q', width: 100, height: 60 }];
  const edges: LayoutEdge[] = [{ id: 'e1', source: 'p', target: 'a' }, { id: 'e2', source: 'a', target: 'q' },
    { id: 'e3', source: 'p', target: 'q' }];
  const request = (label?: LayoutNode['outsideLabel029']) => ({ id: 'g', nodes: nodes(label), edges,
    defaults: { algorithm: 'layered', direction: 'RIGHT', hierarchyHandling: 'INCLUDE_CHILDREN' } });

  it('writes one placed label with text and keeps the body size', async () => {
    const { engine, graphs } = captureEngine();
    const result = await computeElkLayout(request({ side: 'above', width: 142, height: 37 }), { engine });
    const a = (graphs[0] as { children: Array<Record<string, any>> }).children.find((child) => child.id === 'a')!;
    expect(a.labels).toEqual([{ id: 'a:__coral_label', text: 'label', width: 142, height: 37 }]);
    expect(a.layoutOptions['elk.nodeLabels.placement']).toBe('OUTSIDE V_TOP H_CENTER');
    const laid = result.nodes.find((node) => node.id === 'a')!;
    expect([laid.width, laid.height]).toEqual([60, 40]);
  });

  it.each([['below', 'OUTSIDE V_BOTTOM H_CENTER'], ['left', 'OUTSIDE H_LEFT V_CENTER'],
    ['right', 'OUTSIDE H_RIGHT V_CENTER']] as const)('maps %s to %s', async (side, placement) => {
    const { engine, graphs } = captureEngine();
    await computeElkLayout(request({ side, width: 142, height: 37 }), { engine });
    const a = (graphs[0] as { children: Array<Record<string, any>> }).children.find((child) => child.id === 'a')!;
    expect(a.layoutOptions['elk.nodeLabels.placement']).toBe(placement);
  });

  it('moves the node clear of a bypassing connector', async () => {
    const result = await computeElkLayout(request({ side: 'above', width: 142, height: 37 }));
    const a = result.nodes.find((node) => node.id === 'a')!;
    const label = { x: a.absolutePosition.x + 30 - 71, y: a.absolutePosition.y - 37, width: 142, height: 37 };
    const e3 = result.edges.find((edge) => edge.id === 'e3')!.sections[0]!;
    for (const point of [e3.startPoint, ...e3.bendPoints, e3.endPoint])
      expect(point.y < label.y || point.y > label.y + label.height || point.x < label.x || point.x > label.x + label.width).toBe(true);
    const plain = await computeElkLayout(request());
    expect(a.absolutePosition.y).toBeGreaterThan(plain.nodes.find((node) => node.id === 'a')!.absolutePosition.y);
  });
});

describe('which sides are reserved (rules 1 and 4)', () => {
  const reserve = (side: Side, body: string[], definition: string[] = [], direction: Direction = 'RIGHT') => {
    const graph = projectInstalledSourceToSuccessor028(doc(side, body, definition)).graph!;
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(graph);
    const catalog = documentCatalog029('architecture', graph.userSymbols029!);
    const nodes = display.nodes.map((node: GraphNode) => ({ id: node.id, width: 60, height: 40,
      ...(node.ports ? { ports: node.ports.map((port) => ({ id: port.id, side: port.side ?? 'EAST',
        ...(port.attachment ? { attachment: port.attachment } : {}) })) } : {}) })) as LayoutNode[];
    const edges = display.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target,
      ...(edge.sourcePort ? { sourcePort: edge.sourcePort } : {}), ...(edge.targetPort ? { targetPort: edge.targetPort } : {}) }));
    void semanticInterpretations;
    const result = layout.userSymbolOutsideLabels029({ nodes, edges, sourceNodes: display.nodes, notationId: 'architecture',
      catalog, direction, layered: true });
    return { nodes, result, label: result.find((node) => node.id === 'a')?.outsideLabel029 };
  };

  it('reserves a free side with the label measurement', () => {
    const { label } = reserve('above', SKIP);
    expect(label?.side).toBe('above');
    expect(label!.width).toBeGreaterThan(60);
    expect(label!.height).toBeGreaterThan(0);
  });

  it('returns the input unchanged without a reservable node', () => {
    for (const side of ['center'] as const) {
      const { nodes, result } = reserve(side, SKIP);
      expect(result).toBe(nodes);
    }
    expect(layout.userSymbolOutsideLabels029({ nodes: [], edges: [], sourceNodes: [], direction: 'RIGHT', layered: true }))
      .toEqual([]);
  });

  it('skips the forward side of an unported outgoing connector and the backward side of an incoming one', () => {
    expect(reserve('right', SKIP).label).toBeUndefined();
    expect(reserve('left', SKIP).label).toBeUndefined();
    expect(reserve('below', SKIP, [], 'DOWN').label).toBeUndefined();
    expect(reserve('above', SKIP, [], 'DOWN').label).toBeUndefined();
    expect(reserve('right', SKIP, [], 'DOWN').label?.side).toBe('right');
  });

  it('skips a side that a used fixed port or a used interior exit attaches to', () => {
    const graph = projectInstalledSourceToSuccessor028(doc('above', SKIP)).graph!;
    const { display } = successorSourceDisplayWithSemanticPorts028(graph);
    const catalog = documentCatalog029('architecture', graph.userSymbols029!);
    const withPorts = (side: 'NORTH' | 'SOUTH', attachment: 'fixed' | 'free') => [{ id: 'p', width: 100, height: 60 },
      { id: 'a', width: 60, height: 40, ports: [{ id: 'port', side, attachment }] }, { id: 'q', width: 100, height: 60 }];
    const label = (side: 'NORTH' | 'SOUTH', attachment: 'fixed' | 'free', used = true) => layout.userSymbolOutsideLabels029({
      nodes: withPorts(side, attachment), sourceNodes: display.nodes, notationId: 'architecture', catalog, direction: 'RIGHT',
      layered: true,
      edges: [{ id: 'e1', source: 'p', target: 'a' }, { id: 'e2', source: 'a', target: 'q', ...(used ? { sourcePort: 'port' } : {}) }],
    }).find((node) => node.id === 'a')?.outsideLabel029;
    expect(label('NORTH', 'fixed')).toBeUndefined();
    // A free port may land on its preferred side.
    expect(label('NORTH', 'free')).toBeUndefined();
    // An unused port, or a used port on another side, leaves the side free.
    expect(label('NORTH', 'fixed', false)?.side).toBe('above');
    expect(label('SOUTH', 'fixed')?.side).toBe('above');
  });

  it.each([['a boundary port', ['  top port [direction: out, anchor: N]'], 'a:top -> b'],
    ['an interior exit', ['  anchor core [x: 0.5, y: 0.5, exit: N]', '  deep port [direction: out, anchor: core]'], 'a:deep -> b']] as const)(
    'lays out unchanged when %s uses the side', async (_name, definition, edge) => {
      const body = ['a service [symbol: "local.probe"] as "Auth gateway"', 'b service', edge];
      const skipped = await rendered(doc('above', body, [...definition]), 'RIGHT');
      const plain = await rendered(doc('center', body, [...definition]), 'RIGHT');
      expect(skipped.laidOut.nodes.map((node) => [node.id, node.position]))
        .toEqual(plain.laidOut.nodes.map((node) => [node.id, node.position]));
      expect(sideOf(skipped.label.bounds, skipped.frame)).not.toBe('above');
    });

  it('reserves nothing for an algorithm other than layered', () => {
    const graph = projectInstalledSourceToSuccessor028(doc('above', SKIP)).graph!;
    const { display } = successorSourceDisplayWithSemanticPorts028(graph);
    const nodes = display.nodes.map((node) => ({ id: node.id, width: 60, height: 40 }));
    expect(layout.userSymbolOutsideLabels029({ nodes, edges: [], sourceNodes: display.nodes, notationId: 'architecture',
      catalog: documentCatalog029('architecture', graph.userSymbols029!), direction: 'RIGHT', layered: false })).toBe(nodes);
  });

  it('skips a self-loop', () => {
    expect(reserve('above', ['a service [symbol: "local.probe"] as "Auth gateway"', 'a -> a']).label).toBeUndefined();
  });
});

describe('a reserved label holds its side through the pipeline (rules 5, 9, 10)', () => {
  it.each(['above', 'below'] as const)('RIGHT %s: on its side, clear of every route, neighbours moved', async (side) => {
    const reserved = await rendered(doc(side, SKIP), 'RIGHT');
    expect(sideOf(reserved.label.bounds, reserved.frame)).toBe(side);
    expect([reserved.frame.width, reserved.frame.height]).toEqual([60, 40]);
    expectRoutesClear(reserved.prepared, reserved.label.bounds);
    const plain = await rendered(doc('center', SKIP), 'RIGHT');
    expect(reserved.frame.x - reserved.frameOf('p').x).toBeGreaterThan(plain.frame.x - plain.frameOf('p').x);
  });

  it('keeps ELK\'s route instead of a shortcut through the label', async () => {
    const { prepared, label } = await rendered(doc('above', SKIP), 'RIGHT');
    const bypass = prepared.parts.find((part) => part.id === 'edge-3:shaft')!;
    if (bypass.geometry.kind !== 'route') throw new Error('route');
    expect(bypass.geometry.points.length).toBeGreaterThan(2);
    expectRoutesClear(prepared, label.bounds);
  });

  it('holds below in a denser RIGHT layout', async () => {
    const { frame, label, prepared } = await rendered(doc('below', FAN), 'RIGHT');
    expect(sideOf(label.bounds, frame)).toBe('below');
    expectRoutesClear(prepared, label.bounds);
  });

  it('holds left and right in a DOWN layout', async () => {
    for (const side of ['left', 'right'] as const) {
      const { frame, label } = await rendered(doc(side, SKIP), 'DOWN');
      expect(sideOf(label.bounds, frame)).toBe(side);
    }
  });

  it('keeps ports on the body', async () => {
    const { frame, prepared } = await rendered(doc('below', ['p service', 'a service [symbol: "local.probe"] as "Auth gateway"',
      'q service', 'p -> a:in', 'a:out -> q'], ['  in port [direction: in, anchor: W]', '  out port [direction: out, anchor: E]']), 'RIGHT');
    const incoming = prepared.resolved.edges.find((edge) => edge.targetId === 'a')!;
    const outgoing = prepared.resolved.edges.find((edge) => edge.sourceId === 'a')!;
    const shift = prepared.viewport;
    expect(incoming.points.at(-1)!.x + shift.shiftX).toBeCloseTo(frame.x, 6);
    expect(outgoing.points[0]!.x + shift.shiftX).toBeCloseTo(frame.x + frame.width, 6);
    for (const point of [incoming.points.at(-1)!, outgoing.points[0]!])
      expect(point.y + shift.shiftY).toBeCloseTo(frame.y + frame.height / 2, 6);
  });
});

describe('fallback without refusal (rules 4 and 6)', () => {
  it('places a skipped side\'s label on the first clear side', async () => {
    const { frame, label } = await rendered(doc('right', SKIP), 'RIGHT');
    expect(sideOf(label.bounds, frame)).toBe('below');
  });

  // A request built as layoutGraphForSvg builds it, with an engine that can refuse labelled graphs.
  async function direct(side: Side, refuse: (graph: string) => boolean) {
    const graph = projectInstalledSourceToSuccessor028(doc(side, SKIP)).graph!;
    const { display } = successorSourceDisplayWithSemanticPorts028(graph);
    let calls = 0;
    const real = (await import('../src/layout/engine.js')).getElkLayoutEngine();
    const engine = { layout: async (input: never) => { calls += 1;
      if (refuse(JSON.stringify(input))) throw new Error('refused'); return real.layout(input); } } as never;
    const request = { revision: 't', operation: 'load' as const, documentCatalog029: documentCatalog029('architecture', graph.userSymbols029!),
      defaults: { algorithm: 'layered', direction: 'RIGHT' },
      graph: { ...display, nodes: display.nodes.map((node) => ({ ...node,
        dimensions: node.id === 'a' ? { width: 60, height: 40 } : { width: 100, height: 60 } })) } };
    return { request, engine, calls: () => calls };
  }

  it('lays a failing reserved layout out again without reservations', async () => {
    const { request, engine, calls } = await direct('above', (graph) => graph.includes('__coral_label'));
    const result = await layout.resolveSpatialLayout({ ...request, execution: { engine } });
    expect(calls()).toBe(2);
    // Nothing is reserved for a centre label, so its layout is today's.
    const plain = await layout.resolveSpatialLayout((await direct('center', () => false)).request);
    expect(result.nodes).toEqual(plain.nodes);
    expect(result.edges).toEqual(plain.edges);
  });

  it('keeps the proximity rollback of the unreserved retry unreserved', async () => {
    // proximityLayout028.test.ts "keeps a valid authored label placement stronger than
    // proximity": C blocks the moved label, so proximity rolls back. A free user symbol
    // u makes the first layout reserve; the engine refuses that labelled graph.
    const text = doc('above', ['u service [symbol: "local.probe"] as "Auth gateway"', 'A service', 'B service', 'C service',
      'ab = A -> B']);
    const source = projectInstalledSourceToSuccessor028(text).graph!;
    const { display } = successorSourceDisplayWithSemanticPorts028(source);
    const size = (id: string) => id === 'C' ? { width: 40, height: 40 } : { width: 60, height: 40 };
    const graph = { ...display, nodes: display.nodes.map((node) => ({ ...node, dimensions: size(node.id) })),
      edges: display.edges.map((edge) => withProximity028({ ...edge, label: 'Transfer',
        labelPlacement: { side: 'below' as const, at: .5, offset: 40 } }, 6)) };
    const at: Record<string, { x: number; y: number }> = { A: { x: 0, y: 0 }, B: { x: 200, y: 0 }, C: { x: 210, y: 60 },
      u: { x: 0, y: 300 } };
    let calls = 0;
    const engine = { layout: async (input: { children: Array<{ id: string }>; edges: Array<{ id: string }> }) => {
      calls += 1;
      if (JSON.stringify(input).includes('__coral_label')) throw new Error('refused');
      return { ...input, width: 300, height: 400,
        children: input.children.map((child) => ({ ...child, ...at[child.id] })),
        edges: input.edges.map((edge) => ({ ...edge, sections: [{ id: `${edge.id}_s0`, startPoint: { x: 60, y: 20 },
          bendPoints: [], endPoint: { x: 200, y: 20 } }] })) };
    } } as never;
    const result = await layout.resolveSpatialLayout({ graph, revision: 'placed', operation: 'load',
      documentCatalog029: documentCatalog029('architecture', source.userSymbols029!), proximitySceneOptions: { style: 'lowfi' },
      defaults: { algorithm: 'layered', direction: 'RIGHT', spacing: { layerSpacing: 80 } }, execution: { engine } });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'layout.proximity.rejected' }));
    // The refused reserved layout, the unreserved layout and its proximity-free baseline.
    expect(calls).toBe(3);
  });

  it('runs ELK once when nothing is reserved, failing as today', async () => {
    const { request, engine, calls } = await direct('center', () => true);
    await expect(layout.resolveSpatialLayout({ ...request, execution: { engine } })).rejects.toThrow();
    expect(calls()).toBe(1);
  });

  it('reserves inside a container', async () => {
    const text = doc('above', ['cluster group as "Cluster" {', '  a service [symbol: "local.probe"] as "Auth gateway"',
      '  b service as "B"', '}', 'p service', 'p -> cluster.a', 'cluster.a -> cluster.b', 'p -> cluster.b']);
    const { frame, label, frameOf, prepared } = await rendered(text, 'RIGHT', 'cluster.a');
    expect(sideOf(label.bounds, frame)).toBe('above');
    const cluster = frameOf('cluster');
    expect(label.bounds.y).toBeGreaterThanOrEqual(cluster.y);
    // Clear of the container title and every other text.
    for (const part of prepared.parts) if (part.id !== label.id && part.geometry.kind === 'text' && part.bounds.width > 0) {
      const b = part.bounds, l = label.bounds;
      expect(b.x < l.x + l.width && b.x + b.width > l.x && b.y < l.y + l.height && b.y + b.height > l.y, part.id).toBe(false);
    }
    expectRoutesClear(prepared, label.bounds);
  });

  // 0.2.10 Option 2 (DRQ-10): vault database cylinder uses canonical 100x80 glyph
  // with below-glyph caption, shifting its west port up so gate's fallback label
  // takes the first clear unobstructed side, left, keeping every route clear.
  it('pins the approved example: its audit exit uses the bottom, so the label takes the first clear side', async () => {
    const example = ['@diagram architecture', '@coralVersion "0.2.9"', '', '@symbol shield {', '  name "Shield"',
      '  description "Security boundary or policy enforcement point"', '  tags "security" "auth"', '  size 48 x 56',
      '  label below', '  outline rounded', '  source "Drawn in-house"', '  license "CC0-1.0"',
      '  anchor crest [side: N, at: 0.5]', '  anchor keyhole [x: 0.5, y: 0.55, exit: S]',
      '  login port [direction: in, anchor: W, label: "Sign-in", maxConnections: 1]',
      '  token port [direction: out, anchor: E, label: "Token"]', '  audit port [direction: out, anchor: keyhole]',
      '  artwork svg """', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28">',
      '  <path d="M12 0 L24 4 L24 14 C24 21 18 26 12 28 C6 26 0 21 0 14 L0 4 Z" fill="#2f6f4f"/>', '</svg>', '"""', '}', '',
      'gate service [symbol: "local.shield"] as "Auth gateway"', 'vault database as "Secrets" {',
      '  ingest port [direction: in, anchor: W, label: "Writes"]', '}', 'gate:token -> vault [reads]',
      'gate:audit -> vault:ingest [type: writes, secondEnd: arrow]', ''].join('\n');
    const { frame, label, prepared } = await rendered(example, 'RIGHT', 'gate');
    // Under 0.2.11 BRANDES_KOEPF, the preferred unobstructed fallback side is above.
    expect(sideOf(label.bounds, frame)).toBe('above');
    expectRoutesClear(prepared, label.bounds);
  });
});

describe('what does not see the reservation (rule 7)', () => {
  it('leaves the display graph and the label part without a placement', async () => {
    const { display, label } = await rendered(doc('above', SKIP), 'RIGHT');
    expect(display.nodes.find((node) => node.id === 'a')).not.toHaveProperty('labelPlacement');
    expect(label.geometry).not.toHaveProperty('labelPlacement');
  });
});
