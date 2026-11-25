import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { successorSourceDisplay028 } from '../src/successorSourceDisplay028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { resolveSpatialLayout } from '../src/layout/spatial.js';
import { layoutSequence } from '../src/sequence.js';
import { withProximity028 } from '../src/proximityLayout028.js';
import { validateIR } from '@graph-ir/core';
import { renderSvg } from '../src/svg/serialize.js';

function chain() {
  return projectInstalledSourceToSuccessor028('@diagram flowchart\na process\nb process\nc process\n' +
    'near = a -> b\nfar = b ------> c\n').graph!;
}

describe('authored successor proximity execution', () => {
  it('applies increasing source shaft tiers without changing portable identity', async () => {
    const source = '@diagram flowchart\na process\nb process\nc process\n' +
      'near = a -> b\nfar = b ------> c\n';
    const typed = projectInstalledSourceToSuccessor028(source).graph!;
    const original = JSON.stringify(typed);
    const display = successorSourceDisplay028(typed);
    const laid = await layoutGraphForSvg(display, { direction: 'RIGHT' });
    const [a, b, c] = ['a', 'b', 'c'].map((id) => laid.nodes.find((node) => node.id === id)!);
    const near = b.position!.x - a.position!.x - a.dimensions!.width;
    const far = c.position!.x - b.position!.x - b.dimensions!.width;
    expect(far).toBeGreaterThan(near + 100);
    expect(JSON.stringify(typed)).toBe(original);
    expect(display.edges.map(({ id, source, target }) => ({ id, source, target }))).toEqual([
      { id: 'near', source: 'a', target: 'b' }, { id: 'far', source: 'b', target: 'c' },
    ]);
    expect(await layoutGraphForSvg(display, { direction: 'RIGHT' })).toEqual(laid);
  });

  it.each(['RIGHT', 'LEFT', 'DOWN', 'UP'] as const)('executes all six tiers monotonically in %s', async (direction) => {
    const gaps = [];
    for (let tier = 1; tier <= 6; tier++) {
      const typed = chain();
      typed.nodes = typed.nodes.slice(0, 2);
      typed.edges = [{ ...typed.edges[0], proximityHint: tier as 1 | 2 | 3 | 4 | 5 | 6 }];
      const graph = successorSourceDisplay028(typed);
      expect(validateIR(graph).valid).toBe(true);
      expect(JSON.stringify(graph)).not.toContain('proximity');
      const laid = await layoutGraphForSvg(graph, { direction });
      const [a, b] = ['a', 'b'].map((id) => laid.nodes.find((node) => node.id === id)!);
      const axis = direction === 'RIGHT' || direction === 'LEFT' ? 'x' : 'y';
      const size = axis === 'x' ? 'width' : 'height';
      gaps.push(Math.abs(a.position![axis] - b.position![axis]) - a.dimensions![size]);
      expect(laid.nodes.every((node) => node.position![axis] >= 0)).toBe(true);
    }
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
  });

  it.each(['load', 'incremental', 'reflow'] as const)('keeps pins and exact route intent during %s', async (operation) => {
    const graph = successorSourceDisplay028(chain());
    graph.nodes = graph.nodes.slice(0, 2).map((node, i) => ({ ...node, pinned: true,
      position: { x: i * 140, y: 0 }, dimensions: { width: 60, height: 40 } }));
    graph.edges = [withProximity028({ ...graph.edges[0],
      routeIntent: { waypoints: [{ id: 'via', placement: { kind: 'absolute', position: { x: 100, y: 120 } } }] },
    }, 6)];
    const before = JSON.stringify(graph);
    const result = await resolveSpatialLayout({ revision: operation, graph, operation,
      defaults: { algorithm: 'layered', direction: 'RIGHT' } });
    expect(result.nodes.map(({ position }) => position)).toEqual([{ x: 0, y: 0 }, { x: 140, y: 0 }]);
    expect(result.edges[0].waypointIds).toEqual(['via']);
    expect(result.edges[0].sections.some((section) => [...section.bendPoints, section.startPoint, section.endPoint]
      .some((point) => point.x === 100 && point.y === 120))).toBe(true);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'layout.proximity.rejected', subject: { kind: 'edge', id: 'near' }, severity: 'warning',
    }));
    expect(JSON.stringify(graph)).toBe(before);
  });

  it.each(['required', 'preferred'] as const)('never displaces accepted %s intent', async (strength) => {
    const graph = successorSourceDisplay028(chain());
    graph.nodes = graph.nodes.map((node, i) => ({ ...node, dimensions: { width: 60, height: 40 },
      ...(i !== 1 ? { pinned: true, position: { x: i * 150, y: 0 } } : {}) }));
    graph.edges = [withProximity028(graph.edges[0], 6)];
    graph.constraints = [{ id: 'inside', kind: 'arrangement', axis: 'row', gap: 20, strength,
      subjects: ['a', 'b', 'c'].map((nodeId) => ({ kind: 'node', nodeId })) }];
    const result = await resolveSpatialLayout({ revision: strength, graph, operation: 'load',
      defaults: { algorithm: 'layered', direction: 'RIGHT' } });
    expect(result.acceptedConstraintIds).toEqual(['inside']);
    expect(result.rejectedConstraintIds).toEqual([]);
    expect(result.nodes.find((node) => node.id === 'c')!.position).toEqual({ x: 300, y: 0 });
    expect(result.diagnostics.filter((item) => item.code === 'layout.proximity.rejected')).toHaveLength(1);
  });

  it('retains unpinned exact positions on load and reproduces typed Reflow without mutating input', async () => {
    const graph = successorSourceDisplay028(chain());
    graph.nodes = graph.nodes.slice(0, 2).map((node, i) => ({ ...node,
      position: { x: i * 140, y: 0 }, dimensions: { width: 60, height: 40 } }));
    graph.edges = [withProximity028(graph.edges[0], 6)];
    const before = JSON.stringify(graph);
    const request = { revision: 'reflow', graph, operation: 'reflow' as const,
      defaults: { algorithm: 'layered', direction: 'RIGHT' } };
    const loaded = await resolveSpatialLayout({ ...request, operation: 'load' });
    expect(loaded.nodes.map((node) => node.position)).toEqual([{ x: 0, y: 0 }, { x: 140, y: 0 }]);
    const a = await resolveSpatialLayout(request), b = await resolveSpatialLayout(request);
    expect(a).toEqual(b);
    expect(a.nodes[1].absolutePosition.x - a.nodes[0].absolutePosition.x - 60).toBeGreaterThan(140);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it('retains deterministic cycle and parallel-edge identity', async () => {
    const typed = chain();
    typed.edges.push({ ...typed.edges[1], id: 'return', first: { node: 'c' }, second: { node: 'a' }, proximityHint: 4 },
      { ...typed.edges[1], id: 'parallel', proximityHint: 2 });
    const graph = successorSourceDisplay028(typed);
    const input = JSON.stringify(typed);
    const a = await layoutGraphForSvg(graph, { direction: 'RIGHT' });
    const b = await layoutGraphForSvg(graph, { direction: 'RIGHT' });
    expect(a).toEqual(b);
    expect([...a.edgeRoutes.keys()]).toEqual(typed.edges.map((edge) => edge.id));
    expect(JSON.stringify(typed)).toBe(input);
  });

  it.each(['RIGHT', 'LEFT', 'DOWN', 'UP'] as const)('rolls soft geometry back when hinted or unhinted routes hit an obstacle in %s', async (direction) => {
    for (const blockedHint of [true, false]) {
      const point = ({ x, y }: { x: number; y: number }) => direction === 'RIGHT' ? { x, y }
        : direction === 'LEFT' ? { x: 500 - x, y }
          : direction === 'DOWN' ? { x: y, y: x } : { x: y, y: 500 - x };
      const graph = { version: '3.0.0' as const, id: 'route-clearance',
        nodes: [{ id: 'A', type: 'process', dimensions: { width: 60, height: 40 } },
          { id: 'B', type: 'process', dimensions: { width: 60, height: 40 } },
          { id: 'C', type: 'process', dimensions: { width: 40, height: 40 } }],
        edges: [withProximity028({ id: 'ab', source: 'A', target: 'B' }, 6),
          ...(!blockedHint ? [{ id: 'plain', source: 'A', target: 'B' }] : [])] };
      const originalRects = [{ x: 0, y: 0 }, { x: 200, y: 100 }, { x: 140, y: 50 }];
      const candidateNodes = graph.nodes.map((node, i) => {
        const a = point(originalRects[i]), b = point({ x: originalRects[i].x + node.dimensions.width,
          y: originalRects[i].y + node.dimensions.height });
        const position = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
        node.dimensions = { width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
        return { id: node.id, ...node.dimensions, position, absolutePosition: position };
      });
      const blocked = [{ x: 60, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 120 }, { x: 200, y: 120 }];
      const clear = [{ x: 60, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }];
      const candidateLayout = { nodes: candidateNodes, edges: graph.edges.map((edge) => {
        const points = (edge.id === 'plain' || blockedHint ? blocked : clear).map(point);
        return { id: edge.id, sections: [{ startPoint: points[0], bendPoints: points.slice(1, -1), endPoint: points.at(-1)! }] };
      }), width: 500, height: 500, effectiveOptions: {}, diagnostics: [] };
      const result = await resolveSpatialLayout({ graph, candidateLayout,
        revision: 'clearance', operation: 'load', defaults: { algorithm: 'layered', direction,
          spacing: { layerSpacing: 80 } } });
      expect(result.nodes.find((node) => node.id === 'B')!.position).toEqual(candidateNodes[1].position);
      expect(result.edges.find((edge) => edge.id === (blockedHint ? 'ab' : 'plain'))!.sections[0].bendPoints)
        .toEqual(blocked.slice(1, -1).map(point));
      expect(result.diagnostics).toContainEqual(expect.objectContaining({
        code: 'layout.proximity.rejected', subject: { kind: 'edge', id: 'ab' },
      }));
    }
  });

  it('expands sequence lanes and retains dashed return meaning and written endpoints', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\nc participant\n' +
      'near = a -> b\nfar = b -.----> c\n';
    const projection = projectInstalledSourceToSuccessor028(source);
    expect(projection.diagnostics).toEqual([]);
    const typed = projection.graph!;
    const far = typed.edges[1];
    typed.edges[1] = { ...far, first: far.second, second: far.first,
      firstEnd: far.secondEnd, secondEnd: far.firstEnd, direction: 'second-to-first' };
    const original = JSON.stringify(typed);
    const display = successorSourceDisplay028(typed);
    const scene = layoutSequence(display);
    const centers = scene.participants.map((participant) => participant.lifeline.x);
    expect(centers[2] - centers[1]).toBeGreaterThan(centers[1] - centers[0] + 50);
    expect(scene.messages.find((message) => message.id === 'far')).toMatchObject({ kind: 'return', sourceId: 'b', targetId: 'c', dashed: true });
    expect(typed.edges[1]).toMatchObject({ first: { node: 'c' }, second: { node: 'b' }, direction: 'second-to-first', proximityHint: 6 });
    expect(JSON.stringify(typed)).toBe(original);
  });

  it.each(['lowfi', 'hifi'] as const)('keeps a valid authored %s label placement stronger than proximity', async (style) => {
    const graph = { version: '3.0.0' as const, id: 'placed-label',
      nodes: [{ id: 'A', type: 'process', dimensions: { width: 60, height: 40 } },
        { id: 'B', type: 'process', dimensions: { width: 60, height: 40 } },
        { id: 'C', type: 'process', dimensions: { width: 40, height: 40 } }],
      edges: [withProximity028({ id: 'ab', source: 'A', target: 'B', label: 'Transfer',
        labelPlacement: { side: 'below' as const, at: .5, offset: 40 } }, 6)] };
    const positions = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 210, y: 60 }];
    const result = await resolveSpatialLayout({ graph, revision: 'placed', operation: 'load',
      defaults: { algorithm: 'layered', direction: 'RIGHT', spacing: { layerSpacing: 80 } },
      proximitySceneOptions: { style },
      candidateLayout: { nodes: graph.nodes.map((node, i) => ({ id: node.id, ...node.dimensions,
        position: positions[i], absolutePosition: positions[i] })),
        edges: [{ id: 'ab', sections: [{ startPoint: { x: 60, y: 20 }, bendPoints: [], endPoint: { x: 200, y: 20 } }] }],
        width: 260, height: 100, effectiveOptions: {}, diagnostics: [] },
    });
    expect(result.nodes.find((node) => node.id === 'B')!.position).toEqual({ x: 200, y: 0 });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'layout.proximity.rejected' }));
    const nodes = graph.nodes.map((node) => ({ ...node, position: result.nodes.find((item) => item.id === node.id)!.position }));
    expect(() => renderSvg({ ...graph, nodes }, { style,
      edgeRoutes: new Map(result.edges.map((edge) => [edge.id, edge.sections])) })).not.toThrow();
    expect(graph.edges[0].labelPlacement).toEqual({ side: 'below', at: .5, offset: 40 });
  });
});
