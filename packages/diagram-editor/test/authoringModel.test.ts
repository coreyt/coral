import { describe, expect, it, vi } from 'vitest';
import { resolveNotationNode028 } from '@coral-viz/render';
import type { GraphIR } from '../src/printer';
import {
  preserveAuthoredNodePositions,
  createAuthoringEdge,
  createAuthoringNode,
  deleteAuthoringSelection,
  getAuthoringNodeOptions,
  getAuthoringParentOptions,
  getAuthoringPortOptions,
  isAuthoringNodePortless,
} from '../src/authoringModel';

const graph = (overrides: Partial<GraphIR> = {}): GraphIR => ({
  version: '1.0.0',
  id: 'authoring-test',
  nodes: [],
  edges: [],
  ...overrides,
});

describe('pointer-free authoring model', () => {
  it('creates canonical UML classifiers and assigns the notation profile', () => {
    expect(getAuthoringNodeOptions('uml-class')).toEqual(expect.arrayContaining([
      { id: 'uml-class', label: 'Class' },
      { id: 'uml-interface', label: 'Interface' },
      { id: 'uml-enum', label: 'Enumeration' },
    ]));

    const result = createAuthoringNode(graph(), 'uml-class', {
      symbolId: 'uml-enum', label: 'Order Status',
    });

    expect(result).toMatchObject({
      ok: true,
      graph: {
        profile: { id: 'uml', kind: 'class', version: '1.0.0' },
        metadata: { notation: 'uml-class' },
        nodes: [{
          id: 'order-status', type: 'enum', symbol: 'uml-enum', label: 'Order Status',
          classifier: {
            kind: 'enum', name: 'Order Status',
            compartments: [
              { id: 'name', kind: 'name' },
              { id: 'literals', kind: 'literals', items: [] },
            ],
          },
        }],
      },
    });
  });

  it('derives notation symbols and live container parents from registries', () => {
    expect(getAuthoringNodeOptions('flowchart')).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'flowchart-process', label: 'Process' }),
      expect.objectContaining({ id: 'flowchart-decision', label: 'Decision' }),
    ]));

    const current = graph({
      nodes: [
        { id: 'container', type: 'group', symbol: 'arch-container', label: 'VPC' },
        { id: 'service', type: 'service', symbol: 'arch-service', label: 'API' },
      ],
    });
    expect(getAuthoringParentOptions(current, 'architecture')).toEqual([
      { id: 'container', label: 'VPC' },
    ]);
  });

  it('creates unique immutable nodes and preserves container nesting', () => {
    const current = graph({
      metadata: { owner: 'team' },
      nodes: [{
        id: 'service', type: 'group', symbol: 'arch-container', label: 'Cluster',
        position: { x: 10, y: 20 },
        children: [{ id: 'api', type: 'service', symbol: 'arch-service', label: 'Existing' }],
      }],
      edges: [{ id: 'keep', source: 'service', target: 'api', properties: { exact: true } }],
    });
    const before = structuredClone(current);

    const result = createAuthoringNode(current, 'architecture', {
      symbolId: 'arch-service',
      label: 'API',
      parentId: 'service',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.id).toBe('api-2');
    expect(result.graph.nodes[0].children?.[1]).toMatchObject({
      id: 'api-2', type: 'service', symbol: 'arch-service', label: 'API',
      parent: 'service', position: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    });
    expect(result.graph.metadata).toEqual({ owner: 'team' });
    expect(result.graph.edges[0]).toEqual(current.edges[0]);
    expect(current).toEqual(before);
  });

  it('rejects empty labels, stale symbols, and stale or non-container parents', () => {
    const current = graph({
      nodes: [{ id: 'service', type: 'service', symbol: 'arch-service', label: 'Service' }],
    });
    expect(createAuthoringNode(current, 'architecture', {
      symbolId: 'arch-service', label: '   ',
    })).toMatchObject({ ok: false, error: expect.stringMatching(/label/i) });
    expect(createAuthoringNode(current, 'architecture', {
      symbolId: 'removed-symbol', label: 'Node',
    })).toMatchObject({ ok: false, error: expect.stringMatching(/available/i) });
    expect(createAuthoringNode(current, 'architecture', {
      symbolId: 'arch-service', label: 'Node', parentId: 'removed',
    })).toMatchObject({ ok: false, error: expect.stringMatching(/parent.*no longer/i) });
    expect(createAuthoringNode(current, 'architecture', {
      symbolId: 'arch-service', label: 'Node', parentId: 'service',
    })).toMatchObject({ ok: false, error: expect.stringMatching(/container/i) });
  });

  it('offers an authored port list in place of symbol ports (S93-WI-07)', () => {
    const current = graph({ nodes: [{
      id: 'database', type: 'database', symbol: 'arch-database', label: 'Database',
      ports: [
        { id: 'replicate', side: 'EAST', label: 'Replicate', properties: { direction: 'out' } },
        { id: 'sync', side: 'WEST' },
        { id: 'odd', side: 'SOUTH', properties: { direction: 'sideways' } },
      ],
    }] });
    expect(getAuthoringPortOptions(current, 'architecture', 'database', 'source')).toEqual([
      { id: 'replicate', label: 'Replicate', direction: 'out' },
      { id: 'sync', label: 'sync', direction: 'inout' },
    ]);
    expect(getAuthoringPortOptions(current, 'architecture', 'database', 'target')).toEqual([
      { id: 'sync', label: 'sync', direction: 'inout' },
    ]);
  });

  it('derives canonical directional ports, including inout ports', () => {
    const current = graph({ nodes: [
      { id: 'storage', type: 'storage', symbol: 'arch-storage', label: 'Storage' },
      { id: 'database', type: 'database', symbol: 'arch-database', label: 'Database' },
    ] });
    expect(getAuthoringPortOptions(current, 'architecture', 'storage', 'source')).toEqual([
      { id: 'access', label: 'access', direction: 'inout' },
    ]);
    expect(getAuthoringPortOptions(current, 'architecture', 'storage', 'target')).toEqual([
      { id: 'access', label: 'access', direction: 'inout' },
    ]);
    expect(getAuthoringPortOptions(current, 'architecture', 'database', 'source')).toEqual([]);
    expect(getAuthoringPortOptions(current, 'architecture', 'database', 'target')).toEqual([
      { id: 'query', label: 'query', direction: 'in' },
    ]);
  });

  it('offers the shared interpreted catalog ports, including profile-inferred symbols', () => {
    const current = graph({ nodes: [
      { id: 'service', type: 'service' },
      { id: 'storage', type: 'storage', symbol: 'arch-storage' },
    ] });
    for (const node of current.nodes) {
      const interpreted = resolveNotationNode028(node, 'architecture');
      for (const endpoint of ['source', 'target'] as const) {
        const expected = interpreted.semanticPorts
          .filter((port) => endpoint === 'source'
            ? port.direction === 'out' || port.direction === 'inout'
            : port.direction === 'in' || port.direction === 'inout')
          .map((port) => ({ id: port.id, label: port.label ?? port.id, direction: port.direction }));
        expect(getAuthoringPortOptions(current, 'architecture', node.id, endpoint)).toEqual(expected);
      }
    }
  });

  it('uses one validator decision after canonicalizing pointer handle suffixes', () => {
    const current = graph({ nodes: [
      { id: 'storage', type: 'storage', symbol: 'arch-storage', label: 'Storage' },
      { id: 'database', type: 'database', symbol: 'arch-database', label: 'Database' },
    ] });
    const validate = vi.fn(() => ({ valid: true, hasWarning: false }));
    const result = createAuthoringEdge(current, 'architecture', {
      sourceId: 'storage', sourcePortId: 'access-out',
      targetId: 'database', targetPortId: 'query', label: 'Reads orders',
    }, validate);

    expect(validate).toHaveBeenCalledWith('storage', 'database', 'access', 'query');
    expect(result).toMatchObject({ ok: true, id: 'storage_to_database' });
    if (result.ok) {
      expect(result.graph.edges[0]).toMatchObject({
        source: 'storage', target: 'database', sourcePort: 'access', targetPort: 'query', label: 'Reads orders',
      });
    }
  });

  // A portless node (a container, pool, lane, namespace, or catalog) takes a
  // port-less end; a node with ports still needs one for that direction.
  it('connects a portless node without a port, but still requires ports where they exist', () => {
    const current = graph({ nodes: [
      { id: 'user', type: 'actor', symbol: 'arch-actor', label: 'User' },
      { id: 'tier', type: 'group', symbol: 'arch-container', label: 'Tier' },
      { id: 'database', type: 'database', symbol: 'arch-database', label: 'Database' },
    ] });
    const accept = vi.fn(() => ({ valid: true, hasWarning: false }));
    const into = createAuthoringEdge(current, 'architecture', { sourceId: 'user', sourcePortId: 'interact', targetId: 'tier' }, accept);
    expect(into).toMatchObject({ ok: true });
    if (into.ok) expect(into.graph.edges[0]).toEqual({ id: 'user_to_tier', source: 'user', target: 'tier', sourcePort: 'interact' });
    expect(accept).toHaveBeenCalledWith('user', 'tier', 'interact', undefined);
    expect(createAuthoringEdge(current, 'architecture', { sourceId: 'tier', targetId: 'database', targetPortId: 'query' }, accept))
      .toMatchObject({ ok: true });
    // The database has ports but none that can be a source.
    expect(createAuthoringEdge(current, 'architecture', { sourceId: 'database', targetId: 'tier' }, accept))
      .toMatchObject({ ok: false, error: expect.stringMatching(/source port/i) });
    // A portless end cannot carry a port id.
    expect(createAuthoringEdge(current, 'architecture', { sourceId: 'user', sourcePortId: 'interact', targetId: 'tier', targetPortId: 'in' }, accept))
      .toMatchObject({ ok: false, error: expect.stringMatching(/target port/i) });
  });

  it('keeps generic flowchart nodes connectable without inventing semantic ports', () => {
    const current = graph({ nodes: [
      { id: 'first', type: 'service', label: 'First' },
      { id: 'last', type: 'module', label: 'Last' },
    ] });
    const accept = vi.fn(() => ({ valid: true, hasWarning: false }));

    expect(isAuthoringNodePortless(current.nodes[0], 'flowchart')).toBe(true);
    expect(getAuthoringPortOptions(current, 'flowchart', 'first', 'source')).toEqual([]);
    const result = createAuthoringEdge(current, 'flowchart', {
      sourceId: 'first', targetId: 'last',
    }, accept);
    expect(result).toMatchObject({ ok: true });
    expect(accept).toHaveBeenCalledWith('first', 'last', undefined, undefined);
    if (result.ok) expect(result.graph.edges[0]).toEqual({
      id: 'first_to_last', source: 'first', target: 'last',
    });
  });

  it('rejects stale, self, duplicate, wrong-direction, incompatible, and capacity edges', () => {
    const current = graph({
      nodes: [
        { id: 'process', type: 'process', symbol: 'flowchart-process', label: 'Process' },
        { id: 'decision', type: 'decision', symbol: 'flowchart-decision', label: 'Decision' },
      ],
      edges: [{ id: 'existing', source: 'process', target: 'decision' }],
    });
    const accept = vi.fn(() => ({ valid: true, hasWarning: false }));

    expect(createAuthoringEdge(current, 'flowchart', {
      sourceId: 'missing', sourcePortId: 'out', targetId: 'decision', targetPortId: 'in',
    }, accept)).toMatchObject({ ok: false, error: expect.stringMatching(/source.*no longer/i) });
    expect(createAuthoringEdge(current, 'flowchart', {
      sourceId: 'process', sourcePortId: 'out', targetId: 'missing', targetPortId: 'in',
    }, accept)).toMatchObject({ ok: false, error: expect.stringMatching(/target.*no longer/i) });
    expect(createAuthoringEdge(current, 'flowchart', {
      sourceId: 'process', sourcePortId: 'out', targetId: 'process', targetPortId: 'in',
    }, accept)).toMatchObject({ ok: false, error: expect.stringMatching(/itself/i) });
    expect(createAuthoringEdge(current, 'flowchart', {
      sourceId: 'process', sourcePortId: 'out', targetId: 'decision', targetPortId: 'in',
    }, accept)).toMatchObject({ ok: false, error: expect.stringMatching(/already exists/i) });
    expect(createAuthoringEdge(graph({ nodes: current.nodes }), 'flowchart', {
      sourceId: 'process', sourcePortId: 'in', targetId: 'decision', targetPortId: 'in',
    }, accept)).toMatchObject({ ok: false, error: expect.stringMatching(/source port/i) });
    expect(createAuthoringEdge(graph({ nodes: current.nodes }), 'flowchart', {
      sourceId: 'process', sourcePortId: 'out', targetId: 'decision', targetPortId: 'yes',
    }, accept)).toMatchObject({ ok: false, error: expect.stringMatching(/target port/i) });
    expect(createAuthoringEdge(graph({ nodes: current.nodes }), 'flowchart', {
      sourceId: 'process', targetId: 'decision', targetPortId: 'in',
    }, accept)).toMatchObject({ ok: false, error: expect.stringMatching(/source port/i) });
    expect(createAuthoringEdge(graph({ nodes: [
      { id: 'unknown', type: 'opaque', symbol: 'removed-symbol' }, current.nodes[1],
    ] }), 'flowchart', {
      sourceId: 'unknown', sourcePortId: 'out', targetId: 'decision', targetPortId: 'in',
    }, accept)).toMatchObject({ ok: false, error: expect.stringMatching(/source port/i) });

    const reject = vi.fn(() => ({
      valid: false, hasWarning: false, reason: 'symbol-not-allowed' as const,
      message: 'Process cannot connect to Decision',
    }));
    expect(createAuthoringEdge(graph({ nodes: current.nodes }), 'flowchart', {
      sourceId: 'process', sourcePortId: 'out', targetId: 'decision', targetPortId: 'in',
    }, reject)).toMatchObject({ ok: false, error: 'Process cannot connect to Decision' });

    const capacity = vi.fn(() => ({
      valid: true, hasWarning: true, reason: 'max-connections-exceeded' as const,
      message: 'Process has reached maximum outgoing connections (1)',
    }));
    expect(createAuthoringEdge(graph({ nodes: current.nodes }), 'flowchart', {
      sourceId: 'process', sourcePortId: 'out', targetId: 'decision', targetPortId: 'in',
    }, capacity)).toMatchObject({ ok: false, error: expect.stringMatching(/maximum/i) });
  });

  it('deletes descendants and incident edges while retaining exact unrelated waypoints', () => {
    const current = graph({
      nodes: [
        {
          id: 'group', type: 'group', symbol: 'arch-container',
          children: [{ id: 'child', type: 'service', symbol: 'arch-service' }],
        },
        { id: 'keep', type: 'storage', symbol: 'arch-storage', properties: { opaque: ['x'] } },
      ],
      edges: [
        { id: 'incident', source: 'child', target: 'keep', sourcePort: 'out' },
        { id: 'selected-edge', source: 'keep', target: 'group' },
        { id: 'keep-edge', source: 'keep', target: 'keep', properties: { exact: true } },
      ],
    });
    const waypoints = new Map([
      ['incident', [{ id: 'opaque-incident', x: 1, y: 2, type: 'corner' as const }]],
      ['selected-edge', [{ id: 'opaque-selected', x: 3, y: 4, type: 'corner' as const }]],
      ['keep-edge', [{ id: 'opaque-smooth', x: 5, y: 6, type: 'smooth' as const }]],
    ]);

    const result = deleteAuthoringSelection(current, waypoints, ['group'], ['selected-edge']);

    expect(result.changed).toBe(true);
    expect(result.graph.nodes).toEqual([current.nodes[1]]);
    expect(result.graph.edges).toEqual([current.edges[2]]);
    expect(result.waypoints).toEqual(new Map([
      ['keep-edge', [{ id: 'opaque-smooth', x: 5, y: 6, type: 'smooth' }]],
    ]));
    expect(result.waypoints.get('keep-edge')).not.toBe(waypoints.get('keep-edge'));
    expect(current.nodes).toHaveLength(2);
    expect(waypoints.size).toBe(3);
  });

  it('returns the original graph and a cloned waypoint map for empty deletion', () => {
    const current = graph({ nodes: [{ id: 'keep', type: 'service' }] });
    const waypoints = new Map([['keep', [{ id: 'opaque', x: 1, y: 2, type: 'smooth' as const }]]]);
    const result = deleteAuthoringSelection(current, waypoints, [], []);
    expect(result.changed).toBe(false);
    expect(result.graph).toBe(current);
    expect(result.waypoints).toEqual(waypoints);
    expect(result.waypoints).not.toBe(waypoints);
  });
});

describe('authored-position capture', () => {
  it('visits a 500-node authored graph only once per capture', () => {
    let visits = 0;
    const authored = graph({ nodes: Array.from({ length: 500 }, (_, index) => ({
      id: `n${index}`, type: 'process', position: { x: index, y: index },
      get children() { visits += 1; return undefined; },
    })) });
    const display = authored.nodes.map((node) => ({ id: node.id, type: node.type, position: { x: 999, y: 999 } }));
    const captured = preserveAuthoredNodePositions(display, authored, new Set());
    expect(captured.map((node) => node.position)).toEqual(authored.nodes.map((node) => node.position));
    expect(visits).toBeLessThanOrEqual(500);
  });

  it('preserves nested authored and pending Exact positions without mutating or leaking computed geometry', () => {
    const authored = graph({ nodes: [{ id: 'parent', type: 'group', children: [
      { id: 'child', type: 'process', position: { x: 10, y: 20 } },
      { id: 'pending', type: 'process', position: { x: 1, y: 2 } },
      { id: 'computed', type: 'process' },
    ] }] });
    const display = ['child', 'pending', 'computed', 'new'].map((id) => ({
      id, type: 'process', label: id, parent: 'parent', position: { x: 900, y: 800 },
    }));
    const before = structuredClone({ authored, display });
    const captured = preserveAuthoredNodePositions(display, authored, new Set(['pending']));
    expect(captured[0]).toEqual({ ...display[0], position: { x: 10, y: 20 } });
    expect(captured[1]).toEqual(display[1]);
    expect(captured[2]).not.toHaveProperty('position');
    expect(captured[3]).not.toHaveProperty('position');
    expect(captured[2]).toMatchObject({ id: 'computed', parent: 'parent', label: 'computed' });
    expect({ authored, display }).toEqual(before);
    expect(captured[0].position).not.toBe(authored.nodes[0].children![0].position);
    authored.nodes[0].children![0].position = { x: 30, y: 40 };
    expect(preserveAuthoredNodePositions(display, authored, new Set())[0].position).toEqual({ x: 30, y: 40 });
  });
});
