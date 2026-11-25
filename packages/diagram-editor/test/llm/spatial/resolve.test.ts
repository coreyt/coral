// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@coral-viz/language';
import { recognizeSpatialRequest } from '../../../src/llm/spatial/intent';
import { resolveSpatialPlan } from '../../../src/llm/spatial/resolve';
import { geometry, graph } from './fixtures';

describe('resolveSpatialPlan', () => {
  it('resolves exact IDs, normalized unique labels, canonical origins, and ancestor dependencies', () => {
    const recognition = recognizeSpatialRequest('move "Shared   Cache" above api');
    const result = resolveSpatialPlan(graph, geometry, recognition);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.plan.operation).toEqual({ kind: 'relative', subjectIds: ['cache'], relation: 'above', targetId: 'api' });
    expect(result.plan.snapshot.find((node) => node.id === 'db')).toMatchObject({
      canonicalPosition: { x: 360, y: 220 }, bounds: { x: 360, y: 220, width: 100, height: 80 },
    });
    expect(result.plan.snapshot.find((node) => node.id === 'cache')?.bounds).toEqual({ x: 540, y: 150, width: 80, height: 40 });
    expect(result.plan.positionDependencies).toEqual(['api', 'platform', 'cache']);
    expect(result.plan.pinPolicy).toBe('direct-move-preserves-pin-arrangement-pins-anchor');
    expect(result.plan.baselineEdges).toEqual([{ id: 'api-db', source: 'api', target: 'db' }]);
  });

  it('uses exact case-sensitive ID before an ambiguous normalized label', () => {
    const ambiguous: GraphIR = {
      ...graph,
      nodes: [...graph.nodes, { id: 'Database', type: 'service', label: 'Other' }, { id: 'other-db', type: 'database', label: 'database' }],
    };
    const extra = [
      ...geometry,
      { id: 'Database', position: { x: 0, y: 0 }, width: 10, height: 10 },
      { id: 'other-db', position: { x: 20, y: 0 }, width: 10, height: 10 },
    ];
    const result = resolveSpatialPlan(ambiguous, extra, recognizeSpatialRequest('move Database above api'));
    expect(result.success && result.plan.operation).toMatchObject({ subjectIds: ['Database'] });
  });

  it('returns stable missing, ambiguous, scope, geometry, and ancestry diagnostics', () => {
    const duplicateLabel: GraphIR = {
      ...graph,
      nodes: [...graph.nodes, { id: 'api-copy', type: 'service', label: 'API Gateway' }],
    };
    const extraGeometry = [...geometry, { id: 'api-copy', position: { x: 0, y: 0 }, width: 10, height: 10 }];
    expect(resolveSpatialPlan(duplicateLabel, extraGeometry, recognizeSpatialRequest('move db above "API Gateway"')))
      .toMatchObject({ success: false, diagnostics: [{ code: 'spatial.reference.ambiguous' }] });
    expect(resolveSpatialPlan(graph, geometry, recognizeSpatialRequest('move missing above api')))
      .toMatchObject({ success: false, diagnostics: [{ code: 'spatial.reference.missing' }] });
    expect(resolveSpatialPlan(graph, geometry, recognizeSpatialRequest('move db within api')))
      .toMatchObject({ success: false, diagnostics: [{ code: 'spatial.unsupported' }] });
    expect(resolveSpatialPlan(graph, geometry.map((item) => item.id === 'api' ? { ...item, width: -1 } : item), recognizeSpatialRequest('move db above api')))
      .toMatchObject({ success: false, diagnostics: [{ code: 'spatial.geometry.invalid' }] });
    expect(resolveSpatialPlan(graph, geometry, recognizeSpatialRequest('arrange platform and cache in a row')))
      .toMatchObject({ success: false, diagnostics: [{ code: 'spatial.contradiction' }] });
  });

  it('freezes direct group children in graph order and validates options', () => {
    const result = resolveSpatialPlan(graph, geometry, recognizeSpatialRequest('arrange members of platform in a row'), { gap: 12, tolerance: 0.25 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.plan.operation).toMatchObject({ subjectIds: ['cache', 'worker'], direction: 'left-to-right' });
    expect(result.plan.positionDependencies).toEqual(['platform', 'cache', 'worker']);
    expect(result.plan).toMatchObject({ gap: 12, tolerance: 0.25 });
    expect(resolveSpatialPlan(graph, geometry, recognizeSpatialRequest('move db above api'), { gap: -1 }))
      .toMatchObject({ success: false, diagnostics: [{ code: 'spatial.geometry.invalid' }] });
    expect(resolveSpatialPlan(graph, geometry, recognizeSpatialRequest('put cache at the left within platform'), { gap: 250 }))
      .toMatchObject({ success: false, diagnostics: [{ code: 'spatial.geometry.invalid', entityIds: ['cache', 'platform'] }] });
  });

  it('validates recognized scopes, complete geometry, and hierarchy agreement', () => {
    expect(resolveSpatialPlan(graph, geometry, recognizeSpatialRequest('move db at the top within api')))
      .toMatchObject({ success: false, diagnostics: [{ code: 'spatial.scope.invalid', entityIds: ['api'] }] });
    expect(resolveSpatialPlan(graph, geometry, recognizeSpatialRequest('move api at the top within platform')))
      .toMatchObject({ success: false, diagnostics: [{ code: 'spatial.scope.invalid', entityIds: ['api', 'platform'] }] });
    expect(resolveSpatialPlan(graph, geometry.slice(0, -1), recognizeSpatialRequest('move db above api')))
      .toMatchObject({ success: false, diagnostics: [{ code: 'spatial.geometry.invalid', entityIds: ['worker'] }] });
    expect(resolveSpatialPlan(graph, [...geometry, { id: 'ghost', position: { x: 0, y: 0 }, width: 1, height: 1 }], recognizeSpatialRequest('move db above api')))
      .toMatchObject({ success: false, diagnostics: [{ code: 'spatial.geometry.invalid' }] });
    expect(resolveSpatialPlan(graph, geometry.map((item) => item.id === 'worker' ? { ...item, parentId: undefined } : item), recognizeSpatialRequest('move db above api')))
      .toMatchObject({ success: false, diagnostics: [{ code: 'spatial.geometry.invalid', entityIds: ['worker'] }] });

    const inconsistent: GraphIR = { ...graph, nodes: [...graph.nodes, { id: 'flat-child', type: 'service', parent: 'platform' }] };
    const inconsistentGeometry = [...geometry, { id: 'flat-child', parentId: 'platform', position: { x: 0, y: 0 }, width: 10, height: 10 }];
    expect(resolveSpatialPlan(inconsistent, inconsistentGeometry, recognizeSpatialRequest('move db above api')))
      .toMatchObject({ success: false, diagnostics: [{ code: 'spatial.geometry.invalid' }] });
  });

  // The large member set is a functional fixture here; its wall-clock budget is
  // measured only by the strict serial benchmark in resolve-performance.test.ts.
  it('does not alias caller geometry and resolves large member sets', () => {
    const mutableOrigin: [number, number] = [0.5, 0.5];
    const mutableGeometry = geometry.map((item) => item.id === 'db' ? { ...item, origin: mutableOrigin } : item);
    const resolved = resolveSpatialPlan(graph, mutableGeometry, recognizeSpatialRequest('move db above api'));
    expect(resolved.success).toBe(true);
    if (!resolved.success) return;
    mutableOrigin[0] = 0;
    expect(resolved.plan.snapshot.find((node) => node.id === 'db')?.origin).toEqual([0.5, 0.5]);
    expect(Object.isFrozen(resolved.plan)).toBe(true);
    expect(Object.isFrozen(resolved.plan.snapshot[0].bounds)).toBe(true);

    const count = 400;
    const many: GraphIR = {
      version: '3.0.0', id: 'many',
      nodes: Array.from({ length: count }, (_, index) => ({ id: `n${index}`, type: 'service', label: `Node ${index}` })),
      edges: [],
    };
    const manyGeometry = many.nodes.map((node, index) => ({ id: node.id, position: { x: index * 20, y: 0 }, width: 10, height: 10 }));
    const prompt = `arrange ${many.nodes.map((node) => node.id).join(', ')} in a row`;
    const result = resolveSpatialPlan(many, manyGeometry, recognizeSpatialRequest(prompt));
    expect(result.success).toBe(true);
  });

  it('closes deep ancestor dependencies and orders ancestry diagnostics by command members', () => {
    const chain = (prefix: string, depth: number): GraphIR['nodes'][number] => {
      let node: GraphIR['nodes'][number] = { id: `${prefix}${depth}`, type: 'service' };
      for (let index = depth - 1; index >= 0; index--) {
        node = { id: `${prefix}${index}`, type: 'group', children: [node] };
      }
      return node;
    };
    const deepGraph: GraphIR = {
      version: '3.0.0', id: 'deep',
      nodes: [chain('a', 120), chain('b', 2), { id: 'outside', type: 'service' }], edges: [],
    };
    const deepGeometry: Array<{ id: string; parentId?: string; position: { x: number; y: number }; width: number; height: number }> = [];
    for (const prefix of ['a', 'b']) {
      const depth = prefix === 'a' ? 120 : 2;
      for (let index = 0; index <= depth; index++) {
        deepGeometry.push({
          id: `${prefix}${index}`,
          ...(index ? { parentId: `${prefix}${index - 1}` } : {}),
          position: { x: 1, y: 1 }, width: 1000 - index, height: 1000 - index,
        });
      }
    }
    deepGeometry.push({ id: 'outside', position: { x: 2000, y: 0 }, width: 10, height: 10 });
    const resolved = resolveSpatialPlan(deepGraph, deepGeometry, recognizeSpatialRequest('move a120 above outside'));
    expect(resolved.success).toBe(true);
    if (resolved.success) {
      expect(resolved.plan.positionDependencies).toHaveLength(122);
      expect(resolved.plan.positionDependencies.slice(0, 2)).toEqual(['a0', 'a1']);
      expect(resolved.plan.positionDependencies.slice(-2)).toEqual(['a120', 'outside']);
    }

    const conflict = resolveSpatialPlan(
      deepGraph,
      deepGeometry,
      recognizeSpatialRequest('arrange b2, a0, a120, and b0 in a row'),
    );
    expect(conflict).toMatchObject({
      success: false,
      diagnostics: [{ code: 'spatial.contradiction', entityIds: ['b2', 'b0'] }],
    });
  });
});
