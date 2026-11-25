import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@graph-ir/core';
import { resolveSpatialLayout } from '../src/layout/spatial.js';
import { sourceSpatialFailureDiagnostics028 } from '../src/sourceSpatialFailureDiagnostics028.js';
import { prepareSpatialScene028 } from '../src/svg/serialize.js';
const node = (id: string, label?: string) => ({ id, ...(label === undefined ? {} : { label }), dimensions: { width: 100, height: 60 } });
function input(constraints: unknown[], nodes = [node('a', 'Alpha'), node('b', 'Beta')]): GraphIR {
  return { version: '3.0.0', id: 'typed', nodes, edges: [], spatialConstraints028: constraints } as GraphIR;
}
const ref = (nodeId: string) => ({ kind: 'node-label', nodeId });
const relation = (id: string, subject: unknown, target: unknown, relation = 'above', gap = 12) => ({ id, kind: 'relative', subject, target, relation, gap });
const candidateLayout = { nodes: ['a', 'b'].map((id, index) => ({ id, position: { x: index * 250, y: 100 },
  absolutePosition: { x: index * 250, y: 100 }, width: 100, height: 60 })), edges: [], width: 500, height: 300,
  diagnostics: [], effectiveOptions: {} };
describe('Slice 30 typed spatial runtime', () => {
  it.each(['lowfi', 'hifi'] as const)('resolves independent label rectangles and consumes their exact geometry in the %s scene', async (style) => {
    const graph = input([relation('caption', ref('a'), { kind: 'node', nodeId: 'b' })]);
    const result = await resolveSpatialLayout({ graph, revision: 'labels', operation: 'load', candidateLayout, proximitySceneOptions: { style } });
    expect(result.acceptedConstraintIds).toContain('caption');
    const bounds = result.labelBounds028?.['node-label:a'];
    expect(bounds).toBeDefined();
    const scene = prepareSpatialScene028({ ...graph, nodes: graph.nodes.map((n) => ({ ...n,
      position: result.nodes.find(({ id }) => id === n.id)!.absolutePosition })), labelBounds028: result.labelBounds028 } as GraphIR, { style });
    const part = scene.parts.find((part) => part.owner.id === 'a' && part.role === 'node-label')!;
    expect(part.bounds.x - scene.viewport.shiftX).toBeCloseTo(bounds!.x);
    expect(part.bounds.y - scene.viewport.shiftY).toBeCloseTo(bounds!.y);
  });
  it('jointly resolves feasible affine label cycles and rejects contradictions', async () => {
    const constraints = [relation('one', ref('a'), ref('b'), 'left-of', 0), relation('two', ref('b'), ref('a'), 'right-of', 0)];
    const result = await resolveSpatialLayout({ graph: input(constraints), revision: 'cycle', operation: 'load', candidateLayout });
    expect(result.acceptedConstraintIds).toEqual(['one', 'two']);
    await expect(resolveSpatialLayout({ graph: input([...constraints, relation('bad', ref('a'), ref('b'), 'right-of', 1)]),
      revision: 'bad', operation: 'load', candidateLayout })).rejects.toThrow(/constraint/i);
  });
  it('rejects a preferred contradiction atomically and refuses omitted labels', async () => {
    const graph = input([relation('required', ref('a'), ref('b'), 'above'),
      { ...relation('soft', ref('a'), ref('b'), 'below'), strength: 'preferred' }]);
    const result = await resolveSpatialLayout({ graph, revision: 'soft', operation: 'load', candidateLayout });
    expect(result.acceptedConstraintIds).toEqual(['required']);
    expect(result.rejectedConstraintIds).toEqual(['soft']);
    await expect(resolveSpatialLayout({ graph: input([relation('missing', ref('a'), ref('b'))], [node('a'), node('b', 'Beta')]),
      revision: 'missing', operation: 'load', candidateLayout })).rejects.toThrow(/label|constraint/i);
  });
  it('solves route-local waypoint equations including feasible offset cycles', async () => {
    const graph = { ...input([]), edges: [{ id: 'e', source: 'a', target: 'b' }], routeIntents028: { e: { waypoints: [
      { id: 'p', placement: { kind: 'relative', anchor: { kind: 'waypoint', waypointId: 'q' }, offset: { x: -20, y: 0 } } },
      { id: 'q', placement: { kind: 'relative', anchor: { kind: 'waypoint', waypointId: 'p' }, offset: { x: 20, y: 0 } } },
    ] } } } as GraphIR;
    const result = await resolveSpatialLayout({ graph, revision: 'waypoints', operation: 'load', candidateLayout });
    const route = result.edges[0]!;
    expect(route.waypointIds).toEqual(['p', 'q']);
    expect(route.sections[0]!.endPoint.x - route.sections[1]!.endPoint.x).toBeCloseTo(-20);
  });
  it('moves generated edge bends while preserving endpoint attachments', async () => {
    const graph = { ...input([]), nodes: [
      { ...node('a'), position: { x: 0, y: 120 }, ports: [{ id: 'out', side: 'EAST' }] },
      { ...node('b'), position: { x: 250, y: 120 }, ports: [{ id: 'in', side: 'WEST' }] },
      { ...node('c'), position: { x: 125, y: 200 } },
    ], edges: [{ id: 'e', source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in' }],
      spatialConstraints028: [relation('edge-above', { kind: 'edge', edgeId: 'e' }, { kind: 'node', nodeId: 'c' }, 'above', 10)] } as GraphIR;
    const result = await resolveSpatialLayout({ graph, revision: 'edge-bends', operation: 'load', candidateLayout: {
      ...candidateLayout, nodes: graph.nodes.map((n) => ({ id: n.id, position: n.position!, absolutePosition: n.position!, width: 100, height: 60 })),
      edges: [{ id: 'e', sections: [{ startPoint: { x: 100, y: 150 }, endPoint: { x: 250, y: 150 },
        bendPoints: [{ x: 100, y: 80 }, { x: 250, y: 220 }] }] }],
    } });
    expect(result.acceptedConstraintIds).toContain('edge-above');
    expect(result.edges[0]!.sections[0]!.startPoint).toEqual({ x: 100, y: 150 });
    expect(result.edges[0]!.sections[0]!.endPoint).toEqual({ x: 250, y: 150 });
    expect(Math.max(...result.edges[0]!.sections[0]!.bendPoints.map((p) => p.y))).toBeLessThanOrEqual(190);
  });
  it.each(['node', 'node-label', 'edge', 'edge-label'] as const)('accepts %s as a typed target', async (kind) => {
    const graph = { ...input([]), nodes: [{ ...node('a', 'Alpha'), position: { x: 0, y: 100 } },
      { ...node('b', 'Beta'), position: { x: 250, y: 100 } }, node('c', 'Caption')],
      edges: [{ id: 'e', source: 'a', target: 'b', label: 'Request' }], spatialConstraints028: [relation('role',
        { kind: 'node-label', nodeId: 'c' }, kind === 'node' || kind === 'node-label' ? { kind, nodeId: 'a' } : { kind, edgeId: 'e' }, 'above', 25)] } as GraphIR;
    const result = await resolveSpatialLayout({ graph, revision: kind, operation: 'load', candidateLayout: {
      ...candidateLayout, nodes: [...candidateLayout.nodes, { id: 'c', position: { x: 400, y: 0 }, absolutePosition: { x: 400, y: 0 }, width: 100, height: 60 }],
    } });
    expect(result.acceptedConstraintIds).toContain('role');
  });
  it('keeps group content padding and full boundary containment authoritative', async () => {
    const graph = { ...input([]), nodes: [{ id: 'g', type: 'group', position: { x: 20, y: 30 }, dimensions: { width: 300, height: 250 },
      layoutOptions: { padding: { top: 15, right: 20, bottom: 25, left: 30 } }, children: [node('a', 'Alpha')] }],
      spatialConstraints028: [{ id: 'inside', kind: 'boundary', subject: { kind: 'node-label', nodeId: 'a' },
        scope: { kind: 'node', nodeId: 'g' }, side: 'right', inset: 10 }] } as GraphIR;
    const result = await resolveSpatialLayout({ graph, revision: 'boundary', operation: 'load', candidateLayout: {
      ...candidateLayout, nodes: [{ id: 'g', position: { x: 20, y: 30 }, absolutePosition: { x: 20, y: 30 }, width: 300, height: 250 },
        { id: 'a', parentId: 'g', position: { x: 50, y: 50 }, absolutePosition: { x: 70, y: 80 }, width: 100, height: 60 }],
    } });
    const label = result.labelBounds028!['node-label:a']!;
    expect(label.x + label.width).toBeCloseTo(290);
    expect(label.y).toBeGreaterThanOrEqual(55);
    expect(label.y + label.height).toBeLessThanOrEqual(245);
  });
  it('rejects inconsistent waypoint cycle offsets', async () => {
    const graph = { ...input([]), edges: [{ id: 'e', source: 'a', target: 'b' }], routeIntents028: { e: { waypoints: [
      { id: 'p', placement: { kind: 'relative', anchor: { kind: 'waypoint', waypointId: 'q' }, offset: { x: 20, y: 0 } } },
      { id: 'q', placement: { kind: 'relative', anchor: { kind: 'waypoint', waypointId: 'p' }, offset: { x: -19, y: 0 } } },
    ] } } } as GraphIR;
    await expect(resolveSpatialLayout({ graph, revision: 'inconsistent', operation: 'load', candidateLayout })).rejects.toThrow(/inconsistent offsets/);
  });

  it('reports unsupported nonlinear arc-label dependency cycles explicitly', async () => {
    const graph = { ...input([]), edges: [{ id: 'e', source: 'a', target: 'b', label: 'Arc', labelPlacement: { side: 'above', offset: 20 } }],
      spatialConstraints028: [relation('feedback', { kind: 'node', nodeId: 'a' }, { kind: 'edge-label', edgeId: 'e' }, 'above', 20)] } as GraphIR;
    await expect(resolveSpatialLayout({ graph, revision: 'arc-cycle', operation: 'load', candidateLayout: {
      ...candidateLayout, edges: [{ id: 'e', sections: [{ startPoint: { x: 100, y: 130 }, endPoint: { x: 250, y: 130 },
        bendPoints: [{ x: 175, y: 200 }] }] }],
    } })).rejects.toMatchObject({ diagnostics: [{ code: 'layout.constraint.dependency-unsupported',
      message: expect.stringMatching(/Unsupported nonlinear dependency cycle/) }] });
  });

  it.each((['node', 'node-label', 'edge', 'edge-label'] as const).flatMap((subject) =>
    (['node', 'node-label', 'edge', 'edge-label'] as const).map((target) => [subject, target] as const)))('resolves %s subject / %s target without losing typed identity', async (subjectKind, targetKind) => {
    const makeRef = (kind: typeof subjectKind, role: 's' | 't') => kind === 'node' || kind === 'node-label'
      ? { kind, nodeId: role } : { kind, edgeId: `e${role}` };
    const positions = { sa: { x: 0, y: -30 }, sb: { x: 250, y: -30 }, ta: { x: 0, y: 370 }, tb: { x: 250, y: 370 },
      s: { x: 125, y: -200 }, t: { x: 125, y: 500 } };
    const graph = { ...input([]), nodes: Object.entries(positions).map(([id, position]) => ({ ...node(id, id === 's' || id === 't' ? 'Owner' : undefined), position })),
      edges: [{ id: 'es', source: 'sa', target: 'sb', label: 'Link' }, { id: 'et', source: 'ta', target: 'tb', label: 'Link' }],
      spatialConstraints028: [relation('typed-pair', makeRef(subjectKind, 's'), makeRef(targetKind, 't'), 'above', 20)] } as GraphIR;
    const result = await resolveSpatialLayout({ graph, revision: `${subjectKind}/${targetKind}`, operation: 'load', candidateLayout: {
      ...candidateLayout, nodes: graph.nodes.map((n) => ({ id: n.id, position: n.position!, absolutePosition: n.position!, width: 100, height: 60 })),
    } });
    expect(result.acceptedConstraintIds).toEqual(['typed-pair']);
    expect(result.nodes.map(({ id }) => id).sort()).toEqual(Object.keys(positions).sort());
  });
  it('locates constraint and placement failures in exact authored source', () => {
    const source = '@diagram architecture\na service as "Alpha" label above offset 20\nb service as "Beta"\nconstraint caption: label node a above node b [gap: 8]\n';
    const [constraint] = sourceSpatialFailureDiagnostics028({ diagnostics: [{ code: 'layout.constraint.required-unsatisfied', severity: 'error',
      message: 'Required constraint "caption" cannot be satisfied', path: 'constraints.caption' }] }, source);
    expect(constraint!.range?.start.line).toBe(4);
    expect(source.slice(constraint!.range!.start.offset, constraint!.range!.end.offset)).toBe('caption');
    expect(constraint!.related).toHaveLength(2);
    const [placement] = sourceSpatialFailureDiagnostics028({ diagnostics: [{ code: 'render.capability.scene-layout', severity: 'error',
      message: 'Node a authored label placement overlaps a connector', subject: { kind: 'node', id: 'a' } }] }, source);
    expect(placement!.range?.start.line).toBe(2);
    expect(source.slice(placement!.range!.start.offset, placement!.range!.end.offset)).toBe('above offset 20');
  });

  it('solves an affine edge-label dependency jointly after its owner moves', async () => {
    const graph = { ...input([]), nodes: [{ ...node('a'), ports: [{ id: 'out', side: 'EAST' }] },
      { ...node('b'), position: { x: 250, y: 100 }, ports: [{ id: 'in', side: 'WEST' }] },
      { ...node('c'), position: { x: 500, y: 100 } }], edges: [{ id: 'e', source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in',
        label: 'Edge', labelPlacement: { side: 'right', at: 0, offset: 20 } }], spatialConstraints028: [
      relation('move-owner', { kind: 'node', nodeId: 'a' }, { kind: 'node', nodeId: 'c' }, 'right-of', 10),
      relation('affine-cycle', { kind: 'node', nodeId: 'a' }, { kind: 'edge-label', edgeId: 'e' }, 'left-of', 20),
    ] } as GraphIR;
    const result = await resolveSpatialLayout({ graph, revision: 'affine-route-label', operation: 'load', candidateLayout: {
      ...candidateLayout, nodes: [...candidateLayout.nodes, { id: 'c', position: { x: 500, y: 100 }, absolutePosition: { x: 500, y: 100 }, width: 100, height: 60 }],
    } });
    const a = result.nodes.find(({ id }) => id === 'a')!;
    const label = result.labelBounds028!['edge-label:e']!;
    expect(a.absolutePosition.x).toBeGreaterThanOrEqual(610);
    expect(label.x).toBeCloseTo(a.absolutePosition.x + 120);
    expect(result.acceptedConstraintIds).toEqual(['move-owner', 'affine-cycle']);
  });
  it.each(['layered', 'mrtree', 'stress', 'force', 'radial', 'box', 'fixed'])('executes exact authored %s options over caller defaults', async (algorithm) => {
    let effective: Record<string, string> | undefined;
    const graph = { ...input([]), layoutOptions028: { algorithm, direction: 'RIGHT', edgeRouting: 'POLYLINE',
      spacing: { nodeNode: 90, nodeEdge: 17, edgeEdge: 19, layerSpacing: 110 } } } as GraphIR;
    await resolveSpatialLayout({ graph, revision: algorithm, operation: 'load', options: { algorithm: 'layered', direction: 'DOWN', spacing: { edgeNode: 15 }, elkOptions: {
        'elk.algorithm': 'layered', 'elk.direction': 'DOWN', 'elk.edgeRouting': 'ORTHOGONAL',
        'elk.spacing.nodeNode': 1, 'elk.spacing.edgeNode': 2, 'elk.spacing.edgeEdge': 3, 'elk.layered.spacing.nodeNodeBetweenLayers': 4 } },
      execution: { engine: { async layout(input) { effective = input.layoutOptions;
        return { ...input, width: 500, height: 300, children: input.children?.map((n, i) => ({ ...n, x: i * 200, y: 0 })) }; } } } });
    expect(effective).toMatchObject({ 'elk.algorithm': algorithm, 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'POLYLINE',
      'elk.spacing.nodeNode': '90', 'elk.spacing.edgeNode': '17', 'elk.spacing.edgeEdge': '19', 'elk.layered.spacing.nodeNodeBetweenLayers': '110' });
  });

  it('grows auto containers for a feasible typed child arrangement', async () => {
    const graph = { ...input([]), nodes: [{ id: 'g', type: 'group', children: [node('a'), node('b')] }],
      spatialConstraints028: [{ id: 'wide-row', kind: 'arrangement', axis: 'row', subjects: [{ kind: 'node', nodeId: 'a' }, { kind: 'node', nodeId: 'b' }], gap: 500 }] } as GraphIR;
    const result = await resolveSpatialLayout({ graph, revision: 'auto-row', operation: 'load', candidateLayout: {
      ...candidateLayout, nodes: [{ id: 'g', position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 }, width: 220, height: 100 },
        ...candidateLayout.nodes.map((n, i) => ({ ...n, parentId: 'g', position: { x: i * 110, y: 0 }, absolutePosition: { x: i * 110, y: 0 } }))],
    } });
    expect(result.nodes.find(({ id }) => id === 'g')!.width).toBeGreaterThanOrEqual(700);
    expect(result.acceptedConstraintIds).toEqual(['wide-row']);
  });
  it('repairs avoidable body overlap after applying typed constraints', async () => {
    const graph = { ...input([relation('above', { kind: 'node', nodeId: 'a' }, { kind: 'node', nodeId: 'b' }, 'above', 0)]),
      nodes: [node('a'), { ...node('b'), position: { x: 250, y: 200 } }, { ...node('c'), position: { x: 250, y: 0 } }] } as GraphIR;
    const result = await resolveSpatialLayout({ graph, revision: 'overlap', operation: 'load', candidateLayout: {
      ...candidateLayout, nodes: graph.nodes.map((n) => ({ id: n.id, position: n.position ?? { x: 0, y: 0 },
        absolutePosition: n.position ?? { x: 0, y: 0 }, width: 100, height: 60 })),
    } });
    const a = result.nodes.find(({ id }) => id === 'a')!; const c = result.nodes.find(({ id }) => id === 'c')!;
    expect(a.absolutePosition.x !== c.absolutePosition.x || a.absolutePosition.y >= c.absolutePosition.y + c.height ||
      a.absolutePosition.y + a.height <= c.absolutePosition.y).toBe(true);
  });

  it('independently adjusts generated bends to a feasible edge boundary while preserving contacts', async () => {
    const graph = { ...input([]), nodes: [
      { ...node('a'), position: { x: 0, y: 100 }, ports: [{ id: 'out', side: 'EAST' }] },
      { ...node('b'), position: { x: 400, y: 100 }, ports: [{ id: 'in', side: 'WEST' }] },
    ], edges: [{ id: 'e', source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in' }],
      spatialConstraints028: [{ id: 'edge-top', kind: 'boundary', subject: { kind: 'edge', edgeId: 'e' }, scope: { kind: 'graph' }, side: 'top' }] } as GraphIR;
    const result = await resolveSpatialLayout({ graph, revision: 'bend-extents', operation: 'load', candidateLayout: {
      ...candidateLayout, nodes: graph.nodes.map((n) => ({ id: n.id, position: n.position!, absolutePosition: n.position!, width: 100, height: 60 })),
      edges: [{ id: 'e', sections: [{ startPoint: { x: 100, y: 130 }, endPoint: { x: 400, y: 130 },
        bendPoints: [{ x: 150, y: -100 }, { x: 350, y: 300 }] }] }],
    } });
    const section = result.edges[0]!.sections[0]!;
    expect(section.startPoint).toEqual({ x: 100, y: 130 });
    expect(section.endPoint).toEqual({ x: 400, y: 130 });
    expect(Math.min(...section.bendPoints.map(({ y }) => y))).toBe(100);
    expect(Math.max(...section.bendPoints.map(({ y }) => y))).toBeLessThanOrEqual(160);
    expect(result.acceptedConstraintIds).toEqual(['edge-top']);
  });

  it.each(['constructor', '__proto__'])('keeps exact authored edge ID %s independent of route map prototypes', async (id) => {
    const graph = { ...input([]), edges: [{ id, source: 'a', target: 'b' }, { id: 'routed', source: 'a', target: 'b' }],
      routeIntents028: { routed: { waypoints: [{ id: 'p', placement: { kind: 'absolute', position: { x: 170, y: 30 } } }] } } } as GraphIR;
    const result = await resolveSpatialLayout({ graph, revision: id, operation: 'load', candidateLayout });
    expect(result.edges.find((edge) => edge.id === id)!.waypointIds).toEqual([]);
    expect(result.edges.find((edge) => edge.id === 'routed')!.waypointIds).toEqual(['p']);
  });

  it.each(['layered', 'mrtree', 'stress', 'force', 'radial', 'box', 'fixed'].flatMap((algorithm) =>
    (['load', 'reflow'] as const).map((operation) => [algorithm, operation] as const)))('repeats actual %s %s geometry and findings deterministically', async (algorithm, operation) => {
    const graph = { ...input([]), nodes: ['a', 'b', 'c'].map((id, i) => ({ ...node(id, `Owner ${id}`),
      ...(algorithm === 'fixed' ? { position: { x: i * 250, y: 100 }, pinned: true } : {}) })),
      edges: [{ id: 'ab', source: 'a', target: 'b', label: 'First' }, { id: 'bc', source: 'b', target: 'c', label: 'Second' }],
      layoutOptions028: { algorithm, direction: 'RIGHT', spacing: { nodeNode: 70, layerSpacing: 90 }, edgeRouting: 'POLYLINE' },
      spatialConstraints028: [relation('caption', { kind: 'node-label', nodeId: 'a' }, { kind: 'node', nodeId: 'b' }, 'above', 1000)],
    } as GraphIR;
    const before = JSON.stringify(graph);
    const request = { graph, revision: `${algorithm}:${operation}`, operation, proximitySceneOptions: { style: 'hifi' as const } };
    const first = await resolveSpatialLayout(request); const second = await resolveSpatialLayout(request);
    expect(second).toEqual(first);
    expect(JSON.stringify(graph)).toBe(before);
    if (algorithm === 'fixed') expect(first.nodes.map((n) => n.absolutePosition)).toEqual([{ x: 0, y: 100 }, { x: 250, y: 100 }, { x: 500, y: 100 }]);
  });

  it('preserves an exact-label scene failure when the typed set has only preferences', async () => {
    const graph = { ...input([]), nodes: [{ ...node('a', 'A'), position: { x: 0, y: 0 }, labelPlacement: { side: 'right', offset: 0 } },
      { ...node('b'), position: { x: 100, y: 0 } }], spatialConstraints028: [
      { ...relation('soft-only', { kind: 'node', nodeId: 'a' }, { kind: 'node', nodeId: 'b' }), strength: 'preferred' },
    ] } as GraphIR;
    const request = { graph, revision: 'preferred-only-collision', operation: 'load' as const, candidateLayout: {
      ...candidateLayout, nodes: graph.nodes.map((n) => ({ id: n.id, position: n.position!, absolutePosition: n.position!, width: 100, height: 60 })),
    } };
    await expect(resolveSpatialLayout(request)).rejects.toMatchObject({ diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: 'render.capability.scene-layout', subject: { kind: 'node', id: 'a' }, message: expect.stringMatching(/overlaps/) }),
    ]) });
  });
  it('returns a visible fallback when a failure contains an empty diagnostic list and blank message', () => {
    const cause = Object.assign(new Error('   '), { diagnostics: [] });
    const diagnostics = sourceSpatialFailureDiagnostics028(cause, '@diagram architecture\na service\n');
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'render.capability.scene-layout', severity: 'error',
      message: 'Spatial geometry could not be verified' })]);
  });

});
