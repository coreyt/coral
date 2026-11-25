import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@graph-ir/core';
import { parseInstalledDocument028, projectInstalledSourceToSuccessor028, successorSourceDisplay028 } from '../src/index.js';
import { resolveSpatialLayout } from '../src/layout/spatial.js';
import type { ResolvedLayout } from '../src/layout/types.js';
import { verifySpatialConstraints028, type SpatialSidecar028 } from '../src/layout/typedSpatial028.js';
import { prepareSpatialScene028 } from '../src/svg/serialize.js';
import { sourceSpatialFailureDiagnostics028 } from '../src/sourceSpatialFailureDiagnostics028.js';

function display(source: string) {
  const projected = projectInstalledSourceToSuccessor028(source);
  expect(projected.diagnostics).toEqual([]);
  expect(projected.graph).toBeDefined();
  return successorSourceDisplay028(projected.graph!);
}
function scene(graph: GraphIR, result: ResolvedLayout) {
  const nodes = (values: GraphIR['nodes']): GraphIR['nodes'] => values.map((node) => {
    const rect = result.nodes.find(({ id }) => id === node.id)!;
    return { ...node, position: rect.position, dimensions: { width: rect.width, height: rect.height },
      ...(node.children ? { children: nodes(node.children) } : {}) };
  });
  return prepareSpatialScene028({ ...graph, nodes: nodes(graph.nodes), labelBounds028: result.labelBounds028 } as GraphIR, { style: 'hifi',
    edgeRoutes: new Map(result.edges.map(({ id, sections }) => [id, sections])), semanticGraph: graph });
}
describe('Slice 30 Astra FIX-1 cross-feature acceptance', () => {
  it.each(['row', 'column'] as const)('honors authored BPMN %s order over generated spine policies', async (axis) => {
    const graph = display('@diagram bpmn\na task\nb task\nc task\na -> b\nb -> c\n' +
      `order = arrange ${axis}: a, b, c [gap: 20]\n`);
    const result = await resolveSpatialLayout({ graph, revision: axis, operation: 'load' });
    expect(result.acceptedConstraintIds).toEqual(['order']);
    expect(result.rejectedConstraintIds).toEqual([]);
    const rectangles = new Map(result.nodes.map((node) => [node.id, { ...node.absolutePosition, width: node.width, height: node.height }]));
    expect(verifySpatialConstraints028(graph, rectangles)).toEqual([]);
    expect(() => scene(graph, result)).not.toThrow();
  });

  it.each(['above', 'left-of'] as const)('admits legacy preferred %s only after typed required intent', async (relation) => {
    const graph = display('@diagram architecture\na service\nb service\norder = arrange row: a, b [gap: 20]\n');
    graph.constraints = [{ id: 'soft', kind: 'relative', strength: 'preferred',
      subject: { kind: 'node', nodeId: 'a' }, target: { kind: 'node', nodeId: 'b' }, relation }];
    const before = JSON.stringify(graph);
    const result = await resolveSpatialLayout({ graph, revision: 'mixed', operation: 'load' });
    expect(result.acceptedConstraintIds).toEqual(relation === 'above' ? ['order'] : ['soft', 'order']);
    expect(result.rejectedConstraintIds).toEqual(relation === 'above' ? ['soft'] : []);
    if (relation === 'above') expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'layout.constraint.preferred-rejected', path: 'constraints.soft' }));
    expect(JSON.stringify(graph)).toBe(before);
    expect(() => scene(graph, result)).not.toThrow();
  });

  it('refuses contradictory required intent atomically before considering preferences or proximity', async () => {
    const graph = display('@diagram architecture\na service\nb service\ne = a ------> b\n' +
      'order = arrange row: a, b\nconstraint bad: node b left of node a\n');
    const before = JSON.stringify(graph);
    await expect(resolveSpatialLayout({ graph, revision: 'impossible', operation: 'load' })).rejects.toThrow(/constraint/i);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it.each(['load', 'incremental', 'reflow'] as const)('preserves feasible proximity after typed order during %s', async (operation) => {
    const results: number[] = [];
    for (const operator of ['->', '------>', '<------', '-.---->']) {
      const source = `@diagram architecture\na service\nb service\ne = a ${operator} b\norder = arrange row: a, b\n`;
      const graph = display(source);
      const before = JSON.stringify(graph);
      const result = await resolveSpatialLayout({ graph, revision: operator, operation });
      const a = result.nodes.find(({ id }) => id === 'a')!, b = result.nodes.find(({ id }) => id === 'b')!;
      results.push(b.absolutePosition.x - a.absolutePosition.x - a.width);
      expect(result.acceptedConstraintIds).toContain('order');
      expect(result.diagnostics.filter(({ code }) => code === 'layout.proximity.rejected')).toEqual([]);
      expect(JSON.stringify(graph)).toBe(before);
      expect(result.edges.map(({ id }) => id)).toEqual(['e']);
      expect(() => scene(graph, result)).not.toThrow();
    }
    for (const clearance of results.slice(1)) expect(clearance).toBeGreaterThan(results[0]! + 100);
  });

  it('locates a proximity rejection without displacing pinned authored geometry or required order', async () => {
    const source = '@diagram architecture\na service @ (0, 0) pinned\nb service @ (200, 0) pinned\n' +
      'e = a ------> b\norder = arrange row: a, b\n';
    const graph = display(source);
    const result = await resolveSpatialLayout({ graph, revision: 'pinned', operation: 'load' });
    expect(result.nodes.map(({ absolutePosition }) => absolutePosition)).toEqual([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
    const rejection = result.diagnostics.find(({ code }) => code === 'layout.proximity.rejected');
    expect(rejection).toBeDefined();
    const [finding] = sourceSpatialFailureDiagnostics028({ diagnostics: [rejection] }, source);
    expect(finding!.range?.start.line).toBe(4);
    expect(source.slice(finding!.range!.start.offset, finding!.range!.end.offset)).toBe('e');
    expect(() => scene(graph, result)).not.toThrow();
  });

  it('preserves exact label equations and authored waypoints when admitting proximity after typed order', async () => {
    const source = '@diagram architecture\nlayout [direction: RIGHT]\na service as "A" label above offset 20 @ (0, 0) pinned\n' +
      'b service as "B" label above offset 20\ne = a ------> b as "Transfer" label below at 0.5 offset 90\n' +
      'route edge e {\np = waypoint at (300, 200)\n}\norder = arrange row: a, b [gap: 20]\n';
    const graph = display(source);
    const result = await resolveSpatialLayout({ graph, revision: 'labels-routes', operation: 'load', proximitySceneOptions: { style: 'hifi' } });
    expect(result.acceptedConstraintIds).toContain('order');
    expect(result.diagnostics.filter(({ code }) => code === 'layout.proximity.rejected')).toEqual([]);
    expect(result.nodes.find(({ id }) => id === 'a')?.absolutePosition).toEqual({ x: 0, y: 0 });
    const route = result.edges[0]!;
    expect(route.waypointIds).toEqual(['p']);
    expect(route.sections.flatMap((section) => [section.startPoint, ...section.bendPoints, section.endPoint])).toContainEqual({ x: 300, y: 200 });
    expect(() => scene(graph, result)).not.toThrow();
  });

  it.each(['left', 'right', 'top', 'bottom'] as const)('solves full diagram containment for an independent label at the %s boundary', async (side) => {
    const graph: GraphIR & SpatialSidecar028 = { version: '3.0.0', id: 'diagram-boundary', nodes: [
      { id: 'a', type: 'node', label: 'Alpha', position: { x: 250, y: 190 }, dimensions: { width: 100, height: 60 }, pinned: true },
      { id: 'b', type: 'node', position: { x: 0, y: 0 }, dimensions: { width: 100, height: 60 }, pinned: true },
    ], edges: [], spatialConstraints028: [{ id: 'dock', kind: 'boundary',
      subject: { kind: 'node-label', nodeId: 'a' }, scope: { kind: 'graph' }, side, inset: 30 }] };
    const candidateLayout = { nodes: graph.nodes.map((node) => ({ id: node.id, position: node.position!, absolutePosition: node.position!,
      width: node.dimensions!.width, height: node.dimensions!.height })), edges: [], width: 350, height: 250, diagnostics: [], effectiveOptions: {} };
    const before = JSON.stringify(graph);
    const result = await resolveSpatialLayout({ graph, revision: side, operation: 'load', candidateLayout, proximitySceneOptions: { style: 'hifi' } });
    const rectangles = new Map(result.nodes.map((node) => [node.id, { ...node.absolutePosition, width: node.width, height: node.height }]));
    for (const [key, box] of Object.entries(result.labelBounds028!)) rectangles.set(key, box);
    expect(verifySpatialConstraints028(graph, rectangles)).toEqual([]);
    expect(result.nodes.map(({ absolutePosition }) => absolutePosition)).toEqual([{ x: 250, y: 190 }, { x: 0, y: 0 }]);
    expect(JSON.stringify(graph)).toBe(before);
    expect(() => scene(graph, result)).not.toThrow();
    const boundary = graph.spatialConstraints028![0]!;
    if (boundary.kind === 'boundary') boundary.inset = 150;
    await expect(resolveSpatialLayout({ graph, revision: 'impossible', operation: 'load', candidateLayout })).rejects.toThrow(/constraint/i);
  });

  it('grows an automatic diagram frame when a docked independent caption requires more width', async () => {
    const graph: GraphIR & SpatialSidecar028 = { version: '3.0.0', id: 'growing-frame', nodes: [
      { id: 'g', type: 'group', label: 'A long independently docked caption', position: { x: 0, y: 0 }, pinned: true, children: [
        { id: 'g.a', type: 'node', dimensions: { width: 100, height: 60 } },
      ] },
      { id: 'b', type: 'node', position: { x: 30, y: 300 }, dimensions: { width: 100, height: 60 }, pinned: true },
    ], edges: [], spatialConstraints028: [{ id: 'dock', kind: 'boundary',
      subject: { kind: 'node-label', nodeId: 'g' }, scope: { kind: 'graph' }, side: 'left', inset: 30 },
    { id: 'clear', kind: 'relative', subject: { kind: 'node-label', nodeId: 'g' },
      target: { kind: 'node', nodeId: 'g.a' }, relation: 'below', gap: 30, alignment: 'start' },
    { id: 'clear-b', kind: 'relative', subject: { kind: 'node-label', nodeId: 'g' },
      target: { kind: 'node', nodeId: 'b' }, relation: 'above', gap: 60, alignment: 'start' }] };
    const result = await resolveSpatialLayout({ graph, revision: 'growing', operation: 'load', proximitySceneOptions: { style: 'hifi' } });
    const label = result.labelBounds028!['node-label:g']!;
    expect(result.nodes.find(({ id }) => id === 'g')!.width).toBeGreaterThanOrEqual(label.width + 60 - 1e-6);
    expect(label.x).toBeCloseTo(30);
    expect(() => scene(graph, result)).not.toThrow();
  });

  it.each(['e', 'g.e', 'g.routeIntent.e'])('locates real inconsistent waypoint cycles on qualified route %s', async (edgeId) => {
    const nested = edgeId.includes('.');
    const deep = edgeId === 'g.routeIntent.e';
    const source = '@diagram architecture\n' + (nested ? 'g group {\n' : '') +
      (deep ? 'routeIntent group {\n' : '') +
      'a service\nb service\ne = a -> b\nroute edge e {\n' +
      'p = waypoint relative to waypoint q offset (20, 0)\nq = waypoint relative to waypoint p offset (-19, 0)\n}\n' + (deep ? '}\n' : '') + (nested ? '}\n' : '');
    const document = parseInstalledDocument028(source);
    expect(document.graph).toBeUndefined();
    let failure: unknown;
    try { await resolveSpatialLayout({ graph: display(source), revision: edgeId, operation: 'load' }); } catch (error) { failure = error; }
    expect(failure).toBeDefined();
    const findings = sourceSpatialFailureDiagnostics028(failure, document);
    expect(findings).toContainEqual(expect.objectContaining({ path: `edges.${edgeId}.routeIntent.p`, severity: 'error', range: expect.any(Object) }));
    const finding = findings.find(({ range }) => range)!;
    expect(source.slice(finding.range!.start.offset, finding.range!.end.offset)).toBe('q');
  });
});
