import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser/index.js';
import { print, printWithDiagnostics } from '../src/printer/index.js';
import type { GraphIR } from '../src/types.js';

/**
 * Geometry in the DSL - R-017, R-018.
 */

function graph(nodes: unknown[], edges: unknown[] = []): GraphIR {
  return { version: '3.0.0', id: 'g', nodes, edges } as unknown as GraphIR;
}

describe('R-017: node positions and pinning', () => {
  it('AC-1: round-trips a position', () => {
    const g = graph([{ id: 'a', type: 'service', label: 'A', position: { x: 120, y: 240 } }]);
    const back = parse(print(g)).graph!;

    expect(back.nodes[0].position).toEqual({ x: 120, y: 240 });
  });

  it('AC-1: round-trips pinned', () => {
    const g = graph([
      { id: 'a', type: 'service', label: 'A', position: { x: 1, y: 2 }, pinned: true },
      { id: 'b', type: 'service', label: 'B', position: { x: 3, y: 4 } },
    ]);
    const back = parse(print(g)).graph!;

    expect(back.nodes[0].pinned).toBe(true);
    expect(back.nodes[1].pinned).toBeUndefined();
  });

  it('AC-1: round-trips negative and fractional coordinates', () => {
    const g = graph([{ id: 'a', type: 'service', label: 'A', position: { x: -80.5, y: -24 } }]);
    const back = parse(print(g)).graph!;

    expect(back.nodes[0].position).toEqual({ x: -80.5, y: -24 });
  });

  it('AC-2: preserves exact finite precision and reaches a fixpoint', () => {
    const g = graph([{ id: 'a', type: 'service', label: 'A', position: { x: 120.3333333, y: 5 } }]);

    const first = print(g);
    const second = print(parse(first).graph!);

    expect(second).toBe(first);
    expect(parse(first).graph!.nodes[0].position!.x).toBe(120.3333333);
  });

  it('AC-3: geometry does not leak into properties', () => {
    const g = graph([
      { id: 'a', type: 'service', label: 'A', position: { x: 10, y: 20 }, pinned: true },
    ]);
    const back = parse(print(g)).graph!;

    expect(back.nodes[0].properties ?? {}).toEqual({});
  });

  it('AC-4: accepts an id clause, a position and a body together', () => {
    const result = parse('group "Platform" as plat @ (0, 0) pinned {\n  region: "us-east-1"\n  service "Auth" @ (40, 60)\n}');

    expect(result.success).toBe(true);
    const parent = result.graph!.nodes[0];
    expect(parent.id).toBe('plat');
    expect(parent.position).toEqual({ x: 0, y: 0 });
    expect(parent.pinned).toBe(true);
    expect(parent.properties).toMatchObject({ region: 'us-east-1' });
    expect(parent.children![0].position).toEqual({ x: 40, y: 60 });
  });

  it('leaves a node with no geometry untouched', () => {
    const printed = print(graph([{ id: 'a', type: 'service', label: 'A' }]));

    expect(printed).toBe('@graph {"id":"g"}\n\nservice "A"');
  });
});

describe('R-018: edge waypoints', () => {
  it.each(['source', 'target'] as const)(
    'quotes the contextual %s keyword when it is a node anchor id',
    (nodeId) => {
      const g = graph([
        { id: 'a', type: 'service' },
        { id: 'b', type: 'service' },
        { id: nodeId, type: 'service' },
      ], [{
        id: 'e', source: 'a', target: 'b', routeIntent: { waypoints: [{
          id: 'keyword-node',
          placement: {
            kind: 'relative', anchor: { kind: 'node', nodeId }, offset: { x: 1, y: 2 },
          },
        }, {
          id: 'endpoint',
          placement: {
            kind: 'relative', anchor: { kind: nodeId }, offset: { x: 3, y: 4 },
          },
        }] },
      }]);

      const output = print(g);
      const replay = parse(output);

      expect(output).toContain(`relative to "${nodeId}" offset`);
      expect(output).toContain(`relative to ${nodeId} offset`);
      expect(replay.success).toBe(true);
      expect(replay.graph!.edges[0].routeIntent).toEqual(g.edges[0].routeIntent);
    },
  );

  it('round-trips dotted node and port ids in a quoted port anchor', () => {
    const g = graph([
      { id: 'source', type: 'service', label: 'Source' },
      {
        id: 'node.with.dot',
        type: 'service',
        label: 'Target',
        ports: [{ id: 'input.v1', side: 'WEST' }],
      },
    ], [
      {
        id: 'e',
        source: 'source',
        target: 'node.with.dot',
        routeIntent: { waypoints: [{
          id: 'entry',
          placement: {
            kind: 'relative',
            anchor: { kind: 'port', nodeId: 'node.with.dot', portId: 'input.v1' },
            offset: { x: -4, y: 0 },
          },
        }] },
      },
    ]);

    const output = print(g);
    const replay = parse(output);

    expect(output).toContain('port "node.with.dot"."input.v1"');
    expect(replay.success).toBe(true);
    expect(replay.graph!.edges[0].routeIntent).toEqual(g.edges[0].routeIntent);
  });

  it('AC-1: round-trips route intent in order', () => {
    const g = graph([{ id: 'a', type: 'service' }, { id: 'b', type: 'service' }], [
      { id: 'e', source: 'a', target: 'b', routeIntent: { waypoints: [
        { id: 'w1', placement: { kind: 'absolute', position: { x: 200, y: 300 } } },
        { id: 'w2', placement: { kind: 'absolute', position: { x: 200, y: 460 } } },
      ] } },
    ]);
    const back = parse(print(g)).graph!;

    expect(back.edges[0].routeIntent).toEqual(g.edges[0].routeIntent);
  });

  it('AC-2: places waypoints after the attributes', () => {
    const printed = print(graph([], [
      { id: 'e', source: 'a', target: 'b', type: 'http', label: 'query', routeIntent: { waypoints: [
        { id: 'coral.waypoint.e.1', placement: { kind: 'absolute', position: { x: 1, y: 2 } } },
      ] } },
    ]));

    expect(printed).toBe('@graph {"id":"g"}\n\na -> b as e [http, label: "query"] via (1, 2)');
  });

  it('AC-2: omits the bracket when there are no attributes', () => {
    const printed = print(graph([], [
      { id: 'e', source: 'a', target: 'b', routeIntent: { waypoints: [
        { id: 'coral.waypoint.e.1', placement: { kind: 'absolute', position: { x: 1, y: 2 } } },
      ] } },
    ]));

    expect(printed).toBe('@graph {"id":"g"}\n\na -> b as e via (1, 2)');
  });

  it('AC-3: no longer reports geometry as loss', () => {
    const { diagnostics } = printWithDiagnostics(graph(
      [{ id: 'a', type: 'service', label: 'A', position: { x: 1, y: 2 }, pinned: true }],
      [{ id: 'e', source: 'a', target: 'a', routeIntent: { waypoints: [
        { id: 'coral.waypoint.e.1', placement: { kind: 'absolute', position: { x: 3, y: 4 } } },
      ] } }]
    ));

    const codes = diagnostics.map((d) => d.code);
    expect(codes).not.toContain('coral.node.position.dropped');
    expect(codes).not.toContain('coral.node.pinned.dropped');
    expect(codes).not.toContain('coral.edge.routing-points.dropped');
  });
});

it('R-017 AC-2 canonicalizes negative zero and exponent coordinates to a fixpoint', () => {
  const parsed = parse('service "A" as a @ (-0, 1E-7)\nservice "B" as b @ (1e21, -2.5e25)');
  expect(parsed.success).toBe(true);
  expect(Object.is(parsed.graph!.nodes[0].position!.x, -0)).toBe(true);
  const canonical = print(parsed.graph!);
  expect(canonical).toContain('@ (0, 1e-7)');
  expect(canonical).toContain('@ (1e+21, -2.5e+25)');
  const replay = parse(canonical);
  expect(replay.success).toBe(true);
  expect(Object.is(replay.graph!.nodes[0].position!.x, -0)).toBe(false);
  expect(replay.graph!.nodes.map(node => node.position)).toEqual([
    { x: 0, y: 1e-7 }, { x: 1e21, y: -2.5e25 },
  ]);
  expect(print(replay.graph!)).toBe(canonical);
});
