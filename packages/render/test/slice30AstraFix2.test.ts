import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@graph-ir/core';
import { projectInstalledSourceToSuccessor028, successorSourceDisplay028 } from '../src/index.js';
import { resolveSpatialLayout } from '../src/layout/spatial.js';
import type { ResolvedLayout } from '../src/layout/types.js';
import { verifySpatialConstraints028, type SpatialSidecar028 } from '../src/layout/typedSpatial028.js';
import { withProximity028 } from '../src/proximityLayout028.js';
import { prepareSpatialScene028 } from '../src/svg/serialize.js';

function checkScene(graph: GraphIR & SpatialSidecar028, result: ResolvedLayout) {
  const boxes = new Map(result.nodes.map((node) => [node.id, { ...node.absolutePosition, width: node.width, height: node.height }]));
  for (const [id, box] of Object.entries(result.labelBounds028 ?? {})) boxes.set(id, box);
  expect(verifySpatialConstraints028(graph, boxes)).toEqual([]);
  for (const [i, a] of result.nodes.entries()) for (const b of result.nodes.slice(i + 1)) {
    const overlapX = Math.min(a.absolutePosition.x + a.width, b.absolutePosition.x + b.width) - Math.max(a.absolutePosition.x, b.absolutePosition.x);
    const overlapY = Math.min(a.absolutePosition.y + a.height, b.absolutePosition.y + b.height) - Math.max(a.absolutePosition.y, b.absolutePosition.y);
    expect(overlapX <= 1e-6 || overlapY <= 1e-6).toBe(true);
  }
  expect(() => prepareSpatialScene028({ ...graph, nodes: graph.nodes.map((node) => {
    const rect = result.nodes.find(({ id }) => id === node.id)!;
    return { ...node, position: rect.absolutePosition, dimensions: { width: rect.width, height: rect.height } };
  }), labelBounds028: result.labelBounds028 } as GraphIR, { style: 'hifi', semanticGraph: graph,
    edgeRoutes: new Map(result.edges.map(({ id, sections }) => [id, sections])) })).not.toThrow();
}
// Independent segment/rectangle clipping checks the published path, rather
// than assuming a particular generated route or node displacement.
function crosses(rect: { x: number; y: number; width: number; height: number }, route: ResolvedLayout['edges'][number]) {
  return route.sections.some((section) => {
    const points = [section.startPoint, ...section.bendPoints, section.endPoint];
    return points.slice(1).some((end, i) => {
      const start = points[i]!;
      let low = 0, high = 1;
      for (const axis of ['x', 'y'] as const) {
        const size = axis === 'x' ? rect.width : rect.height;
        const delta = end[axis] - start[axis];
        if (Math.abs(delta) < 1e-9) { if (start[axis] <= rect[axis] || start[axis] >= rect[axis] + size) return false; }
        else {
          const a = (rect[axis] - start[axis]) / delta, b = (rect[axis] + size - start[axis]) / delta;
          low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b));
        }
      }
      return low < high - 1e-9;
    });
  });
}
const boundaryCases = (['left', 'right', 'top', 'bottom'] as const).flatMap((side) =>
  (['load', 'reflow'] as const).flatMap((operation) => [2, 3].map((count) => ({ side, operation, count }))));

describe('Slice 30 Astra FIX-2 boundary witnesses and route clearance', () => {
  it.each(boundaryCases)('realizes a nonoverlapping source node boundary: $side / $operation / $count peers', async ({ side, operation, count }) => {
    const source = '@diagram architecture\na service\nb service\n' + (count === 3 ? 'c service\n' : '') +
      `constraint dock: node a at the ${side} of diagram\n`;
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const graph = successorSourceDisplay028(projected.graph!);
    const before = JSON.stringify(graph);
    const request = { graph, revision: 'node-boundary', operation };
    const result = await resolveSpatialLayout(request);
    expect(result.acceptedConstraintIds).toEqual(['dock']);
    checkScene(graph, result);
    expect(await resolveSpatialLayout(request)).toEqual(result);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it.each(['left', 'right', 'top', 'bottom'] as const)('keeps unequal movable peer rectangles clear at the %s boundary', async (side) => {
    const graph: GraphIR & SpatialSidecar028 = { version: '3.0.0', id: 'unequal', nodes: [
      { id: 'a', type: 'node', dimensions: { width: 100, height: 60 } },
      { id: 'b', type: 'node', dimensions: { width: 220, height: 90 } },
      { id: 'c', type: 'node', dimensions: { width: 50, height: 30 } },
    ], edges: [], spatialConstraints028: [{ id: 'dock', kind: 'boundary', subject: { kind: 'node', nodeId: 'a' },
      scope: { kind: 'graph' }, side }] };
    const result = await resolveSpatialLayout({ graph, revision: 'unequal', operation: 'load' });
    checkScene(graph, result);
  });

  it.each(['left', 'right', 'top', 'bottom'] as const)('still refuses a genuinely impossible pinned %s boundary atomically', async (side) => {
    const peer = side === 'left' || side === 'top' ? 0 : 300;
    const source = '@diagram architecture\na service @ (100, 100) pinned\n' +
      `b service @ (${peer}, ${peer}) pinned\nconstraint dock: node a at the ${side} of diagram\n`;
    const graph = successorSourceDisplay028(projectInstalledSourceToSuccessor028(source).graph!);
    const before = JSON.stringify(graph);
    await expect(resolveSpatialLayout({ graph, revision: 'impossible', operation: 'load' })).rejects.toThrow(/constraint/i);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it.each(['load', 'reflow'] as const)('can repair a required leading corner around a pinned origin on %s', async (operation) => {
    const source = '@diagram architecture\na service\nb service @ (0, 0) pinned\n' +
      'constraint left: node a at the left of diagram\nconstraint top: node a at the top of diagram\n';
    const graph = successorSourceDisplay028(projectInstalledSourceToSuccessor028(source).graph!);
    const before = JSON.stringify(graph);
    const result = await resolveSpatialLayout({ graph, revision: 'leading-corner', operation });
    checkScene(graph, result);
    expect(result.nodes.find(({ id }) => id === 'b')!.absolutePosition).toEqual({ x: 0, y: 0 });
    expect(result.nodes.some(({ absolutePosition }) => absolutePosition.x < 0 || absolutePosition.y < 0)).toBe(true);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it.each((['load', 'incremental', 'reflow'] as const).flatMap((operation) =>
    ['movable', 'pinned', 'clear-unhinted-control', 'blocked-unhinted'].map((mode) => ({ operation, mode }))))(
    'preserves all generated routes or rejects proximity atomically: $operation / $mode', async ({ operation, mode }) => {
      const unhintedCase = mode.includes('unhinted');
      const positions = [{ x: 0, y: 0 }, { x: 200, y: 100 }, unhintedCase ? { x: 225, y: 50 } : { x: 280, y: 110 }];
      const graph: GraphIR & SpatialSidecar028 = { version: '3.0.0', id: mode, nodes: [
        { id: 'A', type: 'node', label: 'A', dimensions: { width: 60, height: 40 } },
        { id: 'B', type: 'node', dimensions: { width: 60, height: 40 } },
        { id: 'C', type: 'node', dimensions: { width: 40, height: 40 },
          ...(mode !== 'movable' ? { position: positions[2], pinned: true } : {}) },
      ], edges: [withProximity028({ id: 'ab', source: 'A', target: 'B' }, 6),
        ...(mode === 'blocked-unhinted' ? [{ id: 'plain', source: 'A', target: 'B' }] : [])],
      spatialConstraints028: [{ id: 'caption', kind: 'relative', subject: { kind: 'node-label', nodeId: 'A' },
        target: { kind: 'node', nodeId: 'C' }, relation: 'above', gap: 1000 }] };
      const blocked = [{ x: 100, y: 20 }, { x: 100, y: 120 }];
      const clear = [{ x: 60, y: -50 }, { x: 200, y: -50 }];
      const plain = [{ x: 200, y: 20 }, { x: 200, y: 70 }];
      const candidateLayout = { nodes: graph.nodes.map((node, i) => ({ id: node.id, ...node.dimensions!,
        position: positions[i]!, absolutePosition: positions[i]! })), edges: graph.edges.map((edge) => ({ id: edge.id,
        sections: [{ startPoint: { x: 60, y: 20 }, bendPoints: edge.id === 'plain' ? plain : unhintedCase ? clear : blocked,
          endPoint: { x: 200, y: 120 } }] })), width: 400, height: 200, diagnostics: [], effectiveOptions: {} };
      const request = { graph, operation, revision: mode, candidateLayout,
        defaults: { algorithm: 'layered', direction: 'RIGHT', spacing: { layerSpacing: 80 } },
        proximitySceneOptions: { style: 'hifi' as const } };
      const baselineGraph = { ...graph, edges: graph.edges.map(({ id, source, target }) => ({ id, source, target })) };
      const baseline = await resolveSpatialLayout({ ...request, graph: baselineGraph });
      const before = JSON.stringify(graph);
      const result = await resolveSpatialLayout(request);
      const c = result.nodes.find(({ id }) => id === 'C')!;
      for (const route of result.edges) expect(crosses({ ...c.absolutePosition, width: c.width, height: c.height }, route)).toBe(false);
      // Separate parallel lanes can make the formerly blocked unhinted path
      // feasible. Either accept a fully verified hint or retain the complete
      // baseline; the pinned single-route control must still reject it.
      const rejected = result.diagnostics.some(({ code, subject }) =>
        code === 'layout.proximity.rejected' && subject?.id === 'ab');
      if (mode === 'pinned') expect(rejected).toBe(true);
      else if (mode !== 'blocked-unhinted') expect(rejected).toBe(false);
      if (rejected) {
        expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'layout.proximity.rejected', severity: 'warning', subject: { kind: 'edge', id: 'ab' } }));
        expect(result.nodes).toEqual(baseline.nodes);
        expect(result.edges).toEqual(baseline.edges);
        expect(result.labelBounds028).toEqual(baseline.labelBounds028);
      } else {
        expect(result.diagnostics.filter(({ code }) => code === 'layout.proximity.rejected')).toEqual([]);
        expect(result.nodes.find(({ id }) => id === 'B')!.absolutePosition.x).toBeGreaterThan(300);
      }
      checkScene(graph, result);
      expect(JSON.stringify(graph)).toBe(before);
    });
});
