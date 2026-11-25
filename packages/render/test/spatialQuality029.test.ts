import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@graph-ir/core';
import { computeElkLayout, resolveSpatialLayout, canPublishResolvedLayout, type LayoutResult } from '../src/layout/index.js';
import { resolveRenderScene } from '../src/scene.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { printSuccessorSource028 } from '../src/successorSourceWriter028.js';
import { successorSourceDisplay028 } from '../src/successorSourceDisplay028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { prepareSpatialScene028, renderSvg } from '../src/svg/serialize.js';
import { completeSpatialSource029 } from './helpers/spatialQuality029.js';
const graph: GraphIR = { version: '3.0.0', id: 'quality', nodes: [
  { id: 'a', type: 'service', dimensions: { width: 100, height: 60 } },
  { id: 'b', type: 'service', dimensions: { width: 100, height: 60 } },
], edges: [{ id: 'ab', source: 'a', target: 'b' }] };
const defaults = { algorithm: 'layered', direction: 'DOWN' } as const;
async function candidate(): Promise<LayoutResult> {
  return computeElkLayout({ id: graph.id, defaults,
    nodes: graph.nodes.map((n) => ({ id: n.id, width: 100, height: 60 })), edges: graph.edges });
}
describe('final spatial geometry', () => {
  it.each(['missing-node', 'duplicate-node', 'nonfinite', 'discontinuous'] as const)(
    'rejects a malformed %s candidate with useful diagnostics', async (fault) => {
      const supplied = await candidate();
      if (fault === 'missing-node') supplied.nodes.pop();
      if (fault === 'duplicate-node') supplied.nodes.push(supplied.nodes[0]!);
      if (fault === 'nonfinite') supplied.nodes[0]!.absolutePosition.x = NaN;
      if (fault === 'discontinuous') supplied.edges[0]!.sections.push({
        startPoint: { x: 999, y: 999 }, bendPoints: [], endPoint: { x: 300, y: 300 },
      });
      await expect(resolveSpatialLayout({ revision: fault, graph, operation: 'load', candidateLayout: supplied }))
        .rejects.toMatchObject({ name: 'SpatialLayoutError', diagnostics: expect.arrayContaining([
          expect.objectContaining({ severity: 'error', message: expect.any(String) }),
        ]) });
    });
  it('checks cancellation even when a candidate bypasses the engine', async () => {
    const supplied = await candidate(); const abort = new AbortController(); abort.abort();
    await expect(resolveSpatialLayout({ revision: 'cancelled', graph, operation: 'load',
      candidateLayout: supplied, execution: { signal: abort.signal } })).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('refuses a discontinuous route before a scene flattens away the broken join', () => {
    const placed = { ...graph, nodes: graph.nodes.map((node, index) => ({ ...node, position: { x: index * 300, y: 0 } })) };
    expect(() => resolveRenderScene(placed, { edgeRoutes: new Map([['ab', [
      { startPoint: { x: 100, y: 30 }, bendPoints: [], endPoint: { x: 160, y: 30 } },
      { startPoint: { x: 190, y: 80 }, bendPoints: [], endPoint: { x: 300, y: 30 } },
    ]]]) })).toThrow(/continu|route/i);
  });
  it('keeps worker candidates and internally computed routes equal for equal explicit inputs', async () => {
    const supplied = await candidate();
    const direct = await resolveSpatialLayout({ revision: 'equal', graph, defaults, operation: 'load' });
    const worker = await resolveSpatialLayout({ revision: 'equal', graph, defaults, operation: 'load', candidateLayout: supplied });
    expect(worker).toEqual(direct);
    expect(canPublishResolvedLayout(worker, 'equal')).toBe(true);
    expect(canPublishResolvedLayout(worker, 'newer')).toBe(false);
  });
});

it('rejects an externally supplied route that crosses an unrelated node after contour fitting', () => {
  const placed = { ...graph, nodes: [
    { ...graph.nodes[0]!, position: { x: 0, y: 0 } },
    { ...graph.nodes[1]!, position: { x: 400, y: 0 } },
    { id: 'wall', type: 'service', position: { x: 180, y: 0 }, dimensions: { width: 80, height: 60 } },
  ] };
  expect(() => resolveRenderScene(placed, { edgeRoutes: new Map([['ab', [
    { startPoint: { x: 100, y: 30 }, bendPoints: [], endPoint: { x: 400, y: 30 } },
  ]]]) })).toThrow(/passes through node "wall"/);
});

it('rejects exact authored vertices inside an endpoint instead of exporting a successful-looking route', async () => {
  const authored: GraphIR = { ...graph, nodes: graph.nodes.map((node, index) => ({ ...node,
    position: { x: index * 300, y: 0 }, pinned: true })), edges: [{ ...graph.edges[0]!,
    sourcePort: 'out', routeIntent: { waypoints: [{ id: 'bad', placement: { kind: 'absolute', position: { x: 40, y: 30 } } }] },
  }] };
  authored.nodes[0]!.ports = [{ id: 'out', side: 'EAST', position: .5 }];
  const before = structuredClone(authored);
  await expect(resolveSpatialLayout({ graph: authored, revision: 'authored-conflict', operation: 'load' }))
    .rejects.toMatchObject({ diagnostics: expect.arrayContaining([expect.objectContaining({ severity: 'error',
      subject: { kind: 'edge', id: 'ab' } })]) });
  expect(authored).toEqual(before);
});

it('repairs generated diagonal interiors when orthogonal routing is explicitly requested', async () => {
  const input = { ...graph, nodes: graph.nodes.map((node, i) => ({ ...node,
    pinned: true, position: { x: i * 300, y: i * 200 } })) };
  const result = await resolveSpatialLayout({ graph: input, revision: 'orthogonal', operation: 'load',
    options: { edgeRouting: 'ORTHOGONAL' } });
  const points = result.edges[0]!.sections.flatMap((section) => [section.startPoint, ...section.bendPoints, section.endPoint]);
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!, b = points[index]!;
    expect(Math.min(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeLessThan(1e-6);
  }
});

it('checks compound filled stencils using SVG nonzero winding, including overlapping subpaths', async () => {
  const { finalSceneRouteIssues028 } = await import('../src/sceneRouteValidation028.js');
  const scene = resolveRenderScene({ nodes: [{ id: 'dashboard', type: 'dashboard', symbol: 'data-dashboard',
    position: { x: 0, y: 0 }, dimensions: { width: 100, height: 110 } }], edges: [] });
  const edge = resolveRenderScene(graph).edges[0]!;
  expect(finalSceneRouteIssues028({ ...scene, edges: [{ ...edge,
    points: [{ x: 12, y: 40 }, { x: 23, y: 50 }] }] }, []))
    .toContainEqual({ edgeId: 'ab', message: 'Connector "ab" (a → b) passes through node "dashboard"' });
});

it('refuses a supplied route that moves an exact authored port along the same contour', async () => {
  const { projectInstalledSourceToSuccessor028 } = await import('../src/successorSourceProjection028.js');
  const { successorSourceDisplayWithSemanticPorts028 } = await import('../src/successorSourceDisplay028.js');
  const { layoutGraphForSvg } = await import('../src/svg/layout.js');
  const { prepareSpatialScene028 } = await import('../src/svg/serialize.js');
  const source = projectInstalledSourceToSuccessor028('@diagram block\na block @ (0, 0) pinned {\n out port [direction: out, anchor: E]\n}\nb block @ (500, 0) pinned {\n receive port [direction: in, anchor: W]\n}\ne = a:out -> b:receive\n').graph!;
  const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(source);
  const laid = await layoutGraphForSvg(display, { semanticInterpretations });
  const sections = structuredClone(laid.edgeRoutes.get('e')!);
  sections[0]!.startPoint.y += 8;
  expect(() => prepareSpatialScene028(laid, { successorSource: source, semanticGraph: display,
    edgeRoutes: new Map([['e', sections]]) })).toThrow(/exact authored contact/);
});

it('accepts typed label constraints only after applying the caller orthogonal routing policy', async () => {
  const { projectInstalledSourceToSuccessor028 } = await import('../src/successorSourceProjection028.js');
  const { successorSourceDisplayWithSemanticPorts028 } = await import('../src/successorSourceDisplay028.js');
  const { verifySpatialConstraints028 } = await import('../src/layout/typedSpatial028.js');
  const source = projectInstalledSourceToSuccessor028('@diagram architecture\na service as "A" @ (0, 0) pinned\nb service as "B" @ (400, 200) pinned\ne = a -> b\nconstraint caption: label node a below edge e [gap: 20]\n').graph!;
  const { display } = successorSourceDisplayWithSemanticPorts028(source);
  const result = await resolveSpatialLayout({ graph: display, revision: 'typed-style', operation: 'load',
    options: { edgeRouting: 'ORTHOGONAL' } });
  const boxes = new Map(result.nodes.map((node) => [node.id,
    { ...node.absolutePosition, width: node.width, height: node.height }]));
  for (const [key, box] of Object.entries(result.labelBounds028!)) boxes.set(key, box);
  for (const edge of result.edges) {
    const points = edge.sections.flatMap((section) => [section.startPoint, ...section.bendPoints, section.endPoint]);
    const x = Math.min(...points.map((p) => p.x)), y = Math.min(...points.map((p) => p.y));
    boxes.set(`edge:${edge.id}`, { x, y, width: Math.max(...points.map((p) => p.x)) - x, height: Math.max(...points.map((p) => p.y)) - y });
    for (let i = 1; i < points.length; i++) expect(Math.min(Math.abs(points[i]!.x - points[i - 1]!.x), Math.abs(points[i]!.y - points[i - 1]!.y))).toBeLessThan(1e-6);
  }
  expect(result.acceptedConstraintIds).toContain('caption');
  expect(verifySpatialConstraints028(display, boxes)).toEqual([]);
});


it('faces an automatic free port toward its adjacent exact authored vertex', async () => {
  const graph = { version: '3.0.0', id: 'authored-auto-port', metadata: { notation: 'architecture' },
    nodes: [
      { id: 'alpha', type: 'service', symbol: 'arch-service', position: { x: 100, y: 200 }, dimensions: { width: 102, height: 62 },
        ports: [{ id: 'auto', side: 'SOUTH', attachment: 'free' }] },
      { id: 'beta', type: 'database', symbol: 'arch-database', position: { x: 500, y: 400 }, dimensions: { width: 81, height: 89 } },
    ], edges: [{ id: 'e', source: 'alpha', sourcePort: 'auto', target: 'beta', routeIntent: { waypoints: [{ id: 'exact',
      placement: { kind: 'absolute', position: { x: 345.68679245283016, y: 238.45849056603774 } } }] } }],
  } as unknown as GraphIR;
  const before = structuredClone(graph);
  const result = await resolveSpatialLayout({ revision: 'free-port-authored', graph, operation: 'incremental',
    defaults: { algorithm: 'layered', direction: 'DOWN' } });
  expect(result.edges[0].sections[0].startPoint.x).toBeCloseTo(202);
  expect(result.edges[0].sections[0].endPoint).toEqual({ x: 345.68679245283016, y: 238.45849056603774 });
  expect(graph).toEqual(before);
});


it('does not independently move a shared automatic port for conflicting authored routes', async () => {
  const graph = { version: '3.0.0', id: 'shared-auto-port', metadata: { notation: 'architecture' },
    nodes: [
      { id: 'alpha', type: 'service', symbol: 'arch-service', position: { x: 100, y: 200 }, dimensions: { width: 102, height: 62 },
        ports: [{ id: 'shared', side: 'EAST', attachment: 'free' }] },
      { id: 'beta', type: 'service', position: { x: 500, y: 400 }, dimensions: { width: 102, height: 62 } },
    ], edges: [345, 0].map((x, index) => ({ id: `e${index}`, source: 'alpha', sourcePort: 'shared', target: 'beta',
      routeIntent: { waypoints: [{ id: 'exact', placement: { kind: 'absolute', position: { x, y: 238 } } }] } })),
  } as unknown as GraphIR;
  const before = structuredClone(graph);
  await expect(resolveSpatialLayout({ revision: 'shared-port-authored', graph, operation: 'incremental',
    defaults: { algorithm: 'layered', direction: 'DOWN' } })).rejects.toThrow(/passes through/);
  expect(graph).toEqual(before);
});

it.each(['DOWN', 'RIGHT'] as const)('uses a straight clear shaft for preserved positions across the %s rank axis', async (direction) => {
  const horizontal = direction === 'DOWN';
  const placed: GraphIR = { ...graph, nodes: graph.nodes.map((node, i) => ({ ...node,
    position: { x: horizontal ? i * 300 : 0, y: horizontal ? 0 : i * 200 },
    ports: [{ id: i ? 'in' : 'out', side: i ? 'NORTH' : 'SOUTH', position: .5, attachment: 'free' }],
  })), edges: [{ ...graph.edges[0]!, sourcePort: 'out', targetPort: 'in' }] };
  const before = structuredClone(placed);
  const result = await resolveSpatialLayout({ graph: placed, revision: 'sideways', operation: 'load',
    defaults: { algorithm: 'layered', direction }, options: { edgeRouting: 'ORTHOGONAL' } });
  const route = result.edges[0]!.sections;
  expect(route).toHaveLength(1);
  expect(route[0]!.bendPoints).toEqual([]);
  expect(route[0]!.startPoint).toEqual(horizontal ? { x: 100, y: 30 } : { x: 50, y: 60 });
  expect(route[0]!.endPoint).toEqual(horizontal ? { x: 300, y: 30 } : { x: 50, y: 200 });
  for (const style of ['lowfi', 'hifi'] as const) expect(() => resolveRenderScene({ ...placed,
    nodes: placed.nodes.map(node => ({ ...node, position: result.nodes.find(n => n.id === node.id)!.absolutePosition })),
  }, { style, edgeRoutes: new Map([['ab', route]]) })).not.toThrow();
  expect(placed).toEqual(before);
});

it('retains a detour when a body blocks aligned preserved positions', async () => {
  const placed: GraphIR = { ...graph, nodes: [
    { ...graph.nodes[0]!, position: { x: 0, y: 0 } },
    { ...graph.nodes[1]!, position: { x: 400, y: 0 } },
    { id: 'wall', type: 'service', position: { x: 180, y: 0 }, dimensions: { width: 80, height: 60 } },
  ] };
  const result = await resolveSpatialLayout({ graph: placed, revision: 'blocked-sideways', operation: 'load',
    defaults, options: { edgeRouting: 'ORTHOGONAL' } });
  expect(result.edges[0]!.sections.flatMap(s => s.bendPoints).length).toBeGreaterThan(0);
  expect(() => resolveRenderScene(placed, { edgeRoutes: new Map(result.edges.map(e => [e.id, e.sections])) })).not.toThrow();
});

it('keeps one accepted contact for generated routes sharing a named free port', async () => {
  const placed: GraphIR = { ...graph, nodes: [
    { ...graph.nodes[0]!, position: { x: 300, y: 0 }, ports: [
      { id: 'shared', side: 'SOUTH', position: .5, attachment: 'free' },
    ] },
    { ...graph.nodes[1]!, position: { x: 0, y: 0 } },
    { ...graph.nodes[1]!, id: 'c', position: { x: 600, y: 0 } },
  ], edges: [{ id: 'ab', source: 'a', target: 'b', sourcePort: 'shared' },
    { id: 'ac', source: 'a', target: 'c', sourcePort: 'shared' }] };
  const before = structuredClone(placed);
  const result = await resolveSpatialLayout({ graph: placed, revision: 'shared-sideways', operation: 'load',
    defaults, options: { edgeRouting: 'ORTHOGONAL' } });
  expect(result.edges[0]!.sections[0]!.startPoint).toEqual(result.edges[1]!.sections[0]!.startPoint);
  expect(() => resolveRenderScene(placed, { edgeRoutes: new Map(result.edges.map(e => [e.id, e.sections])) })).not.toThrow();
  expect(placed).toEqual(before);
});

// RR-1 (coralsmol findings): AIML captions no longer balloon the page.
it.each([['RIGHT', 1600, 600], ['DOWN', 760, 1400]] as const)(
  'keeps the coralsmol AIML pipeline compact (%s)', async (direction, maxWidth, maxHeight) => {
    const source = ['@diagram aiml',
      'corpus dataset [symbol: "aiml-dataset"] as "Coral source corpus (examples, docs, tests)"',
      'synth dataset [symbol: "aiml-dataset"] as "Synthetic prompt/answer pairs"',
      'tok embedding [symbol: "aiml-embedding"] as "Tokenizer and packing"',
      'base model [symbol: "aiml-model"] as "SmolLM2-135M base checkpoint"',
      'sft training [symbol: "aiml-training"] as "Supervised fine-tuning"',
      'tuned model [symbol: "aiml-model"] as "coralsmol fine-tuned model"',
      'evalr evaluator [symbol: "aiml-evaluator"] as "Parser and validator pass rate"',
      'serve inference [symbol: "aiml-inference"] as "Local inference"',
      'a = corpus -> tok [embedding]', 'b = synth -> tok [embedding]', 'c = tok -> sft [training]',
      'd = base -> sft [training]', 'e = sft -> tuned [training]', 'f = tuned -> evalr [inference]',
      'g = tuned -> serve [inference]', ''].join('\n');
    const { scene } = await completeSpatialSource029(source, 'lowfi', direction);
    // 0.2.9: 1629×676 (RIGHT) and 816×1638 (DOWN).
    expect(scene.viewport.width).toBeLessThanOrEqual(maxWidth);
    expect(scene.viewport.height).toBeLessThanOrEqual(maxHeight);
  });

// RR-3 / D4: the last-resort pass draws a shared corridor and names it when
// forced (verified by the enclosed-wall test below); coralsmol-parallel-corridor
// now routes cleanly in UP without even needing to degrade.
it('routes coralsmol-parallel-corridor cleanly in UP or degrades only to a named warning', async () => {
  const { routeRegressions0210 } = await import('./fixtures/routeCorpus0210.js');
  const fixture = routeRegressions0210.find((item) => item.id === 'coralsmol-parallel-corridor')!;
  const { laid, scene } = await completeSpatialSource029(fixture.source, 'lowfi', 'UP');
  expect(scene.status).toBe('complete');
  const degraded = (laid.layoutDiagnostics028 ?? []).filter((item) => item.code === 'layout.route.degraded');
  expect(degraded.every((item) => item.severity === 'warning'
    && /(shares a corridor with|meets its node too close to) a parallel connector$/.test(item.message))).toBe(true);
});

// R-039 AC-8: a generated connector never degrades onto an authored route's
// shaft. Walls leave the pair one 20px lane; with both generated, it degrades.
it.each([true, false])('refuses to degrade beside an authored route (authored: %s)', async (authored) => {
  const box = (id: string, x: number, y: number, width: number, height: number) =>
    ({ id, type: 'service', position: { x, y }, dimensions: { width, height } });
  const enclosed: GraphIR = { version: '3.0.0', id: 'enclosed', nodes: [
    box('a', 0, 0, 100, 20), box('b', 400, 0, 100, 20), box('top', -60, -81, 620, 80), box('bottom', -60, 21, 620, 80),
    box('left', -61, 0, 60, 20), box('right', 501, 0, 60, 20),
  ], edges: [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'a',
    ...(authored ? { routeIntent: { waypoints: [{ id: 'via', placement: { kind: 'absolute', position: { x: 300, y: 10 } } }] } } : {}) }] };
  const request = { graph: enclosed, revision: 'enclosed', operation: 'load', defaults: { ...defaults, direction: 'RIGHT' },
    options: { edgeRouting: 'ORTHOGONAL' } } as const;
  if (authored) {
    await expect(resolveSpatialLayout(request)).rejects.toThrow('Connector "e1" (a → b) has no clear corridor beside its parallel connector');
  } else {
    const degraded = (await resolveSpatialLayout(request)).diagnostics.filter((item) => item.code === 'layout.route.degraded');
    expect(degraded.map((item) => 'subject' in item ? item.subject?.id : undefined).sort()).toEqual(['e1', 'e2']);
  }
});

// Phase 5 (REQ-B1 / REQ-E3 / ISC-1, ISC-4, ISC-7, ISC-8): independent glyph/caption
// sizing survives save/reopen/reflow and GraphIR round-trip with scale === 1.
it.each(['RIGHT', 'DOWN'] as const)(
  'keeps AI/ML model glyphs unscaled across descriptive captions, save/reopen and GraphIR round-trip (%s)',
  async (direction) => {
    const source = [
      '@diagram aiml',
      'corpus dataset [symbol: "aiml-dataset"] as "Coral source corpus (examples, docs, tests)"',
      'synth dataset [symbol: "aiml-dataset"] as "Synthetic prompt/answer pairs"',
      'tok embedding [symbol: "aiml-embedding"] as "Tokenizer and packing"',
      'base model [symbol: "aiml-model"] as "SmolLM2-135M base checkpoint fine-tuned on the Coral source corpus"',
      'sft training [symbol: "aiml-training"] as "Supervised fine-tuning"',
      'tuned model [symbol: "aiml-model"] as "coralsmol fine-tuned model"',
      'evalr evaluator [symbol: "aiml-evaluator"] as "Parser and validator pass rate"',
      'serve inference [symbol: "aiml-inference"] as "Local inference"',
      'a = corpus -> tok [embedding]',
      'b = synth -> tok [embedding]',
      'c = tok -> sft [training]',
      'd = base -> sft [training]',
      'e = sft -> tuned [training]',
      'f = tuned -> evalr [inference]',
      'g = tuned -> serve [inference]',
      '',
    ].join('\n');

    const { scene } = await completeSpatialSource029(source, 'hifi', direction);
    expect(scene.status).toBe('complete');

    // All 7 iconic AI/ML nodes normalize to the uniform canonical 72x56 glyph box (REQ-B1 / DRQ-10 Option 2),
    // independent of caption length (67-char base === 26-char tuned!).
    const expectedScales: Record<string, number> = {
      corpus: 56 / 80, synth: 56 / 80, tok: 56 / 80, base: 56 / 90, tuned: 56 / 90, evalr: 56 / 100, serve: 56 / 86,
    };
    const glyphCenterOf = (id: string) => {
      const outline = scene.parts.find((part) => part.id === `${id}:outline`)!;
      expect(outline.geometry.kind).toBe('stencil-path');
      if (outline.geometry.kind !== 'stencil-path') throw new Error('expected stencil-path');
      const { x, y, scale } = outline.geometry.transform;
      const shapeId = scene.resolved.nodes.find((n) => n.id === id)!.shapeId;
      const [, , vw, vh] = (shapeId === 'brain' ? [0, 0, 100, 90]
        : shapeId === 'diamond' ? [0, 0, 100, 100]
          : shapeId === 'hexagon' ? [0, 0, 100, 86]
            : shapeId === 'rectangle' ? [0, 0, 100, 60]
              : [0, 0, 100, 80]);
      if (shapeId === 'rectangle') {
        return { x: outline.bounds.x + outline.bounds.width / 2, y: outline.bounds.y + outline.bounds.height / 2 };
      }
      return { x: x + (vw * scale) / 2, y: y + (vh * scale) / 2 };
    };
    for (const [id, expectedScale] of Object.entries(expectedScales)) {
      const outline = scene.parts.find((part) => part.id === `${id}:outline`);
      expect(outline?.geometry.kind).toBe('stencil-path');
      if (outline?.geometry.kind === 'stencil-path') {
        expect(outline.geometry.transform.scale, `${direction}:${id}`).toBeCloseTo(expectedScale, 6);
      }
      const labels = scene.parts.filter((part) => part.owner.kind === 'node' && part.owner.id === id && part.geometry.kind === 'text');
      expect(labels.length).toBeGreaterThan(0);
    }

    // DRQ-02 / DRQ-03 / DRQ-04: exact visual glyph-center alignment and parent/child bisection (<= 1 px).
    const vc = (id: string) => glyphCenterOf(id);
    if (direction === 'RIGHT') {
      expect(Math.abs(vc('synth').y - vc('base').y)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(vc('corpus').y - vc('tok').y)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(vc('base').x - vc('tok').x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(vc('sft').y - (vc('base').y + vc('tok').y) / 2)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(vc('sft').y - vc('tuned').y)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(vc('tuned').y - (vc('evalr').y + vc('serve').y) / 2)).toBeLessThanOrEqual(0.5);
    } else {
      expect(Math.abs(vc('synth').x - vc('base').x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(vc('corpus').x - vc('tok').x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(vc('base').y - vc('tok').y)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(vc('sft').x - (vc('base').x + vc('tok').x) / 2)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(vc('sft').x - vc('tuned').x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(vc('tuned').x - (vc('evalr').x + vc('serve').x) / 2)).toBeLessThanOrEqual(0.5);
    }

    // REQ-B5 (DRQ-12 strict orthogonality + DRQ-13 anti-micro-jog + DRQ-16 no chin-bar):
    // Every connector segment in the AI/ML pipeline stays strictly horizontal or vertical
    // with zero < 12 px opposite-turn sawtooth jogs and zero bottom chin-bar exits on DOWN icons.
    const nodeMap = new Map(scene.nodes.map((item) => [item.node.id, item]));
    for (const edge of scene.resolved.edges) {
      const pts = edge.points;
      expect(pts.length, `${direction}:${edge.id}`).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < pts.length; i++) {
        const dx = Math.abs(pts[i]!.x - pts[i - 1]!.x);
        const dy = Math.abs(pts[i]!.y - pts[i - 1]!.y);
        expect(Math.min(dx, dy), `${direction}:${edge.id}:seg${i}`).toBeLessThanOrEqual(0.1);
      }
      let shortOppositeTurns = 0;
      for (let i = 1; i < pts.length - 2; i++) {
        const v1 = { x: pts[i]!.x - pts[i - 1]!.x, y: pts[i]!.y - pts[i - 1]!.y };
        const v2 = { x: pts[i + 1]!.x - pts[i]!.x, y: pts[i + 1]!.y - pts[i]!.y };
        const v3 = { x: pts[i + 2]!.x - pts[i + 1]!.x, y: pts[i + 2]!.y - pts[i + 1]!.y };
        const horiz = Math.abs(v1.y) <= 0.1 && Math.abs(v3.y) <= 0.1 && v1.x * v3.x > 0;
        const vert = Math.abs(v1.x) <= 0.1 && Math.abs(v3.x) <= 0.1 && v1.y * v3.y > 0;
        if (horiz || vert) {
          const jogLen = Math.hypot(v2.x, v2.y);
          const endpointCrossDelta = horiz
            ? Math.abs(pts.at(-1)!.y - pts[0]!.y)
            : Math.abs(pts.at(-1)!.x - pts[0]!.x);
          // DRQ-13: exempt only a single unavoidable 4-point Z-step whose length equals the constrained endpoint offset.
          const unavoidableSingleZ = pts.length === 4 && Math.abs(jogLen - endpointCrossDelta) <= 0.5;
          if (!unavoidableSingleZ) {
            expect(jogLen, `${direction}:${edge.id}:jog${i}`).toBeGreaterThanOrEqual(12);
          }
          if (jogLen < 12) shortOppositeTurns += 1;
        }
      }
      expect(shortOppositeTurns, `${direction}:${edge.id}:no-sawtooth`).toBeLessThanOrEqual(1);
      if (direction === 'DOWN' && ['tok', 'base', 'tuned'].includes(edge.sourceId)) {
        const src = nodeMap.get(edge.sourceId)!;
        // With right-side captions in DOWN, outgoing edges leave cleanly downward from SOUTH
        // (never rightward through the right-side caption band).
        expect(Math.abs(pts[1]!.x - pts[0]!.x), `${edge.id}:clean-south-exit`).toBeLessThanOrEqual(0.1);
        expect(pts[1]!.y, `${edge.id}:goes-down`).toBeGreaterThan(pts[0]!.y);
        expect(pts[0]!.x, `${edge.id}:glyph-band`).toBeLessThan(src.x + 76);
      }
    }

    // Save/reopen/reflow round-trip preserves authored meaning and exact rederived geometry.
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const saved = printSuccessorSource028(projected.graph!);
    const reopened = await completeSpatialSource029(saved.text, 'hifi', direction);
    expect(reopened.scene.viewport).toEqual(scene.viewport);
    for (const id of ['base', 'tuned'] as const) {
      const a = scene.nodes.find((item) => item.node.id === id)!;
      const b = reopened.scene.nodes.find((item) => item.node.id === id)!;
      expect({ width: b.width, height: b.height }).toEqual({ width: a.width, height: a.height });
    }

    // GraphIR JSON round-trip preserves symbol, caption, and derived glyph/caption geometry.
    const display = successorSourceDisplay028(projected.graph!);
    const directLaid = await layoutGraphForSvg(display, { direction, svgOptions: { style: 'hifi' } });
    const roundTripped = JSON.parse(JSON.stringify(display)) as GraphIR;
    const relaid = await layoutGraphForSvg(roundTripped, { direction, svgOptions: { style: 'hifi' } });
    const directScene = prepareSpatialScene028(directLaid, { style: 'hifi', layoutDirection: direction, edgeRoutes: directLaid.edgeRoutes });
    const reScene = prepareSpatialScene028(relaid, { style: 'hifi', layoutDirection: direction, edgeRoutes: relaid.edgeRoutes });
    expect(reScene.viewport).toEqual(directScene.viewport);
    for (const id of ['base', 'tuned'] as const) {
      const outline = reScene.parts.find((part) => part.id === `${id}:outline`);
      expect(outline?.geometry.kind).toBe('stencil-path');
      if (outline?.geometry.kind === 'stencil-path') expect(outline.geometry.transform.scale).toBeCloseTo(56 / 90, 6);
    }
    expect(renderSvg(relaid, { style: 'hifi', layoutDirection: direction, edgeRoutes: relaid.edgeRoutes }))
      .toBe(renderSvg(directLaid, { style: 'hifi', layoutDirection: direction, edgeRoutes: directLaid.edgeRoutes }));
  },
);

it('DRQ-18: 3-way fan-in in DOWN keeps adjacent sibling drops and horizontal buses clearly separated', async () => {
  const source = [
    '@diagram aiml',
    'code dataset [symbol: "aiml-dataset"] as "Repository source corpus"',
    'tickets dataset [symbol: "aiml-dataset"] as "Support ticket archive"',
    'docs dataset [symbol: "aiml-dataset"] as "Enterprise docs & wikis"',
    'embed embedding [symbol: "aiml-embedding"] as "Dense text embedder"',
    'e1 = docs -> embed [embedding]',
    'e2 = tickets -> embed [embedding]',
    'e3 = code -> embed [embedding]',
    '',
  ].join('\n');
  const { scene } = await completeSpatialSource029(source, 'hifi', 'DOWN');
  expect(scene.status).toBe('complete');
  expect(scene.resolved.edges).toHaveLength(3);
  const bySource = new Map(scene.resolved.edges.map((e) => [e.sourceId, e.points]));
  const codePts = bySource.get('code')!;
  const ticketsPts = bySource.get('tickets')!;
  const docsPts = bySource.get('docs')!;
  // With right-side captions in DOWN, outer branches drop straight out of SOUTH in 4 points
  // (or straight 2-point vertical spine for the center branch) with zero crossings.
  expect(codePts.length).toBeGreaterThanOrEqual(4);
  expect(docsPts.length).toBeGreaterThanOrEqual(4);
  expect(ticketsPts.length).toBeGreaterThanOrEqual(2);
  expect(Math.abs(ticketsPts[0]!.x - codePts[0]!.x)).toBeGreaterThanOrEqual(12);
  expect(Math.abs(docsPts[0]!.x - ticketsPts[0]!.x)).toBeGreaterThanOrEqual(12);
  // Symmetric outer rails: left and right outer horizontal buses match at the same Y tier.
  expect(Math.abs(codePts[1]!.y - docsPts[1]!.y)).toBeLessThanOrEqual(0.5);
});
