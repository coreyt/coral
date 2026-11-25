import type { ElkNode } from 'elkjs';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { prepareSpatialScene028 } from '../src/svg/serialize.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';
import { spatialQualityFixtures029 } from './fixtures/spatialQuality029.js';
import { describe, expect, it, vi } from 'vitest';
import {
  LayoutExecutionError,
  computeElkLayout,
  normalizeLayoutOptions,
  type LayoutEngine,
  type LayoutRequest,
} from '../src/layout/index.js';

const defaults = { algorithm: 'layered' as const, direction: 'DOWN' as const };

describe('shared layout boundary', () => {
  it.each(['DOWN', 'RIGHT'] as const)(
    'treats an empty port catalog like omitted ports for %s layout', async (direction) => {
      const request: LayoutRequest = {
        id: 'empty-port-tree', defaults: { ...defaults, direction },
        nodes: [
          { id: 'module', width: 138, height: 83 },
          { id: 'renderer', width: 117, height: 71 },
          { id: 'render', width: 102, height: 62 },
          { id: 'version', width: 135, height: 81 },
        ],
        edges: [
          { id: 'moduleClass', source: 'module', target: 'renderer' },
          { id: 'classRender', source: 'renderer', target: 'render' },
          { id: 'classVersion', source: 'renderer', target: 'version' },
        ],
      };
      const omitted = await computeElkLayout(request);
      const empty = await computeElkLayout({ ...request,
        nodes: request.nodes.map((node) => ({ ...node, ports: [] })),
      });
      expect(empty).toEqual(omitted);
    },
  );

  it('inherits normalized compound spacing while retaining local padding, overrides and positions', async () => {
    let input!: ElkNode;
    const request: LayoutRequest = { id: 'compound-spacing', defaults,
      options: { spacing: { nodeNode: 50, nodeEdge: 15, edgeEdge: 12, layerSpacing: 80 } },
      nodes: [{ id: 'outer', width: 300, height: 200, position: { x: 7, y: 9 }, pinned: true,
        layoutOptions: Object.assign({ padding: { top: 40, left: 20, right: 20, bottom: 20 } },
          { spacing: { layerSpacing: 140 }, elkOptions: { 'elk.spacing.edgeEdge': 19 } }),
        children: [{ id: 'inner', width: 200, height: 120, children: [{ id: 'leaf', width: 60, height: 40 }] }],
      }], edges: [] };
    const before = structuredClone(request);
    await computeElkLayout(request, { engine: { async layout(graph) { input = graph; return graph; } } });
    const outer = input.children![0]!, inner = outer.children![0]!;
    for (const node of [outer, inner]) expect(node.layoutOptions).toMatchObject({
      'elk.spacing.nodeNode': '50', 'elk.spacing.edgeNode': '15',
      'elk.spacing.edgeEdge': '19', 'elk.layered.spacing.nodeNodeBetweenLayers': '140',
    });
    expect(outer.layoutOptions?.['elk.padding']).toBe('[top=40,left=20,bottom=20,right=20]');
    expect(outer).toMatchObject({ x: 7, y: 9 });
    expect(inner.children![0]!.layoutOptions).toBeUndefined();
    expect(request).toEqual(before);
  });

  it.each((['lowfi', 'hifi'] as const).flatMap(style => [80, 160].map(spacing => ({ style, spacing }))))(
    'gives nested production connectors $spacing px between children in $style', async ({ style, spacing }) => {
      const source = spatialQualityFixtures029.find(fixture => fixture.id === 'nested')!.source;
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
      const before = structuredClone(display);
      const laid = await layoutGraphForSvg(display, { direction: 'DOWN', layerSpacing: spacing,
        svgOptions: { style }, semanticInterpretations });
      const scene = prepareSpatialScene028(laid, { style, layoutDirection: 'DOWN',
        edgeRoutes: laid.edgeRoutes, semanticGraph: display, successorSource: projected.graph });
      const api = scene.resolved.nodes.find(node => node.id === 'cluster.api')!;
      const worker = scene.resolved.nodes.find(node => node.id === 'cluster.worker')!;
      expect(worker.y - api.y - api.height).toBeGreaterThanOrEqual(spacing - 1e-6);
      const call = scene.resolved.edges.find(edge => edge.id === 'call')!;
      expect(call.points.at(-1)!.y - call.points[0].y).toBeGreaterThanOrEqual(spacing - 1e-6);
      expect(display).toEqual(before);
    });

  it('requires valid caller defaults', () => {
    expect(() => normalizeLayoutOptions({}, undefined as never)).toThrow(LayoutExecutionError);
  });

  it('uses BRANDES_KOEPF by default while preserving explicit node placement overrides', () => {
    expect(normalizeLayoutOptions({}, defaults).effectiveOptions)
      .toHaveProperty('elk.layered.nodePlacement.strategy', 'BRANDES_KOEPF');
    expect(normalizeLayoutOptions({ elkOptions: {
      'elk.layered.nodePlacement.strategy': 'SIMPLE',
    } }, defaults).effectiveOptions)
      .toHaveProperty('elk.layered.nodePlacement.strategy', 'SIMPLE');
    expect(normalizeLayoutOptions({ algorithm: 'force' }, defaults).effectiveOptions)
      .not.toHaveProperty('elk.layered.nodePlacement.strategy');
  });

  it('keeps a branched process spine from drifting sideways when SIMPLE centering is requested', async () => {
    const sizes: Record<string, [number, number]> = {
      received: [207, 113], validate: [135, 98], complete: [220, 104],
      requestInfo: [141, 98], assess: [177, 76], eligible: [197, 104],
      review: [179, 76], approved: [223, 104], issue: [158, 76],
      decline: [145, 102], finished: [130, 113],
    };
    const connections = [
      ['received', 'validate'], ['validate', 'complete'],
      ['complete', 'requestInfo'], ['requestInfo', 'validate'],
      ['complete', 'assess'], ['assess', 'eligible'],
      ['eligible', 'review'], ['eligible', 'decline'],
      ['review', 'approved'], ['approved', 'issue'],
      ['approved', 'decline'], ['issue', 'finished'],
      ['decline', 'finished'],
    ];
    const result = await computeElkLayout({
      id: 'branched-process', defaults,
      options: { elkOptions: { 'elk.layered.nodePlacement.strategy': 'SIMPLE' } },
      nodes: Object.entries(sizes).map(([id, [width, height]]) => ({ id, width, height })),
      edges: connections.map(([source, target], index) => ({
        id: `edge-${index}`, source: source!, target: target!,
      })),
    });
    const centerX = (id: string) => {
      const node = result.nodes.find((candidate) => candidate.id === id)!;
      return node.absolutePosition.x + node.width / 2;
    };
    expect(Math.abs(centerX('finished') - centerX('received'))).toBeLessThanOrEqual(20);
  });

  it('maps graph spacing, aliases, advanced options, node options, and ports without loss', async () => {
    let input: Record<string, unknown> | undefined;
    const engine: LayoutEngine = {
      layout: vi.fn(async (graph) => {
        input = graph as unknown as Record<string, unknown>;
        return { ...graph, width: 300, height: 200 };
      }),
    };
    const request: LayoutRequest = {
      id: 'g',
      defaults,
      options: {
        algorithm: 'tree',
        direction: 'RIGHT',
        spacing: { nodeNode: 10, nodeEdge: 11, edgeEdge: 12, layerSpacing: 13 },
        edgeRouting: 'orthogonal',
        hierarchyHandling: 'INCLUDE_CHILDREN',
        elkOptions: { 'elk.layered.mergeEdges': true },
      },
      nodes: [{
        id: 'a', width: 120, height: 60,
        ports: [{ id: 'opaque_in_value', side: 'WEST', position: 0.25 }],
        layoutOptions: {
          portConstraints: 'FIXED_SIDE', portAlignment: 'BEGIN',
          sizeConstraints: ['MINIMUM_SIZE', 'PORTS'],
          minimumSize: { width: 100, height: 40 },
          padding: { top: 1, right: 2, bottom: 3, left: 4 },
        },
      }],
      edges: [],
    };

    const result = await computeElkLayout(request, { engine });
    expect(result.effectiveOptions).toMatchObject({
      'elk.algorithm': 'mrtree',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '10',
      'elk.spacing.edgeNode': '11',
      'elk.spacing.edgeEdge': '12',
      'elk.layered.spacing.nodeNodeBetweenLayers': '13',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.layered.mergeEdges': 'true',
    });
    const child = (input?.children as Array<Record<string, unknown>>)[0];
    expect(child.layoutOptions).toMatchObject({
      'elk.portConstraints': 'FIXED_SIDE',
      'elk.portAlignment.default': 'BEGIN',
      'elk.nodeSize.constraints': '[MINIMUM_SIZE, PORTS]',
      'elk.nodeSize.minimum': '(100,40)',
      'elk.padding': '[top=1,left=4,bottom=3,right=2]',
    });
    const port = (child.ports as Array<Record<string, unknown>>)[0];
    expect(port.id).not.toContain('opaque_in_value');
    expect(port).toMatchObject({ x: 0, y: 15 });
  });

  it('lets ELK place free semantic ports without persisting their preferred side as a pin', async () => {
    let input: Record<string, unknown> | undefined;
    const engine: LayoutEngine = { layout: vi.fn(async (graph) => {
      input = graph as unknown as Record<string, unknown>;
      return graph;
    }) };
    await computeElkLayout({ id: 'g', defaults,
      nodes: [{ id: 'a', width: 100, height: 50,
        ports: [{ id: 'out', side: 'EAST', attachment: 'free' }] }], edges: [],
    }, { engine });
    const node = (input?.children as Array<Record<string, unknown>>)[0];
    const port = (node.ports as Array<Record<string, unknown>>)[0];
    expect(node.layoutOptions).toMatchObject({ 'elk.portConstraints': 'FREE' });
    expect(port).not.toHaveProperty('x');
    expect(port).not.toHaveProperty('y');
    expect(port).not.toHaveProperty('layoutOptions');
  });

  it.each(['RIGHT', 'DOWN'] as const)('lets ELK attach free semantic ports for %s flow', async (direction) => {
    const result = await computeElkLayout({ id: 'g', defaults: { algorithm: 'layered', direction },
      nodes: [{ id: 'a', width: 100, height: 50,
        ports: [{ id: 'out', side: 'SOUTH', attachment: 'free' }] },
      { id: 'b', width: 100, height: 50,
        ports: [{ id: 'in', side: 'NORTH', attachment: 'free' }] }],
      edges: [{ id: 'e', source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in' }],
    });
    const a = result.nodes.find((node) => node.id === 'a')!;
    const b = result.nodes.find((node) => node.id === 'b')!;
    const section = result.edges.find((edge) => edge.id === 'e')!.sections[0]!;
    if (direction === 'RIGHT') {
      expect(section.startPoint.x).toBeCloseTo(a.absolutePosition.x + a.width);
      expect(section.endPoint.x).toBeCloseTo(b.absolutePosition.x);
    } else {
      expect(section.startPoint.y).toBeCloseTo(a.absolutePosition.y + a.height);
      expect(section.endPoint.y).toBeCloseTo(b.absolutePosition.y);
    }
  });

  it('keeps an exact authored semantic anchor pinned when flow faces another side', async () => {
    const result = await computeElkLayout({ id: 'g', defaults: { algorithm: 'layered', direction: 'RIGHT' },
      nodes: [{ id: 'a', width: 100, height: 50,
        ports: [{ id: 'out', side: 'NORTH', attachment: 'fixed' }] },
      { id: 'b', width: 100, height: 50,
        ports: [{ id: 'in', side: 'WEST', attachment: 'free' }] }],
      edges: [{ id: 'e', source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in' }],
    });
    const a = result.nodes.find((node) => node.id === 'a')!;
    const section = result.edges.find((edge) => edge.id === 'e')!.sections[0]!;
    expect(section.startPoint.x).toBeCloseTo(a.absolutePosition.x + a.width / 2);
    expect(section.startPoint.y).toBeCloseTo(a.absolutePosition.y);
  });

  it('passes provisional positions for mixed ports to the final spatial resolver', async () => {
    let input: Record<string, unknown> | undefined;
    const engine: LayoutEngine = { layout: vi.fn(async (graph) => {
      input = graph as unknown as Record<string, unknown>;
      return graph;
    }) };
    await computeElkLayout({ id: 'g', defaults,
      nodes: [{ id: 'mixed', width: 100, height: 50, ports: [
        { id: 'fixed', side: 'NORTH', attachment: 'fixed' },
        { id: 'free', side: 'EAST', attachment: 'free' },
      ] }], edges: [],
    }, { engine });
    const node = (input?.children as Array<Record<string, unknown>>)[0];
    expect(node.layoutOptions).toMatchObject({ 'elk.portConstraints': 'FIXED_POS' });
    expect((node.ports as Array<Record<string, unknown>>)).toEqual([
      expect.objectContaining({ x: 50, y: 0 }),
      expect.objectContaining({ x: 100, y: 25 }),
    ]);
  });

  it('validates reserved advanced options against caller defaults', () => {
    const normalized = normalizeLayoutOptions({
      algorithm: 'force',
      elkOptions: {
        'elk.algorithm': 'imaginary',
        'elk.direction': 'SIDEWAYS',
        'elk.spacing.nodeNode': -1,
      },
    }, defaults);
    expect(normalized.effectiveOptions).toMatchObject({
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
    });
    expect(normalized.effectiveOptions).not.toHaveProperty('elk.spacing.nodeNode');
    expect(normalized.diagnostics.map((item) => item.path)).toEqual([
      'elkOptions.elk.algorithm',
      'elkOptions.elk.direction',
      'elkOptions.elk.spacing.nodeNode',
    ]);
  });

  it('decodes nested local/absolute geometry and every stored edge section', async () => {
    const engine: LayoutEngine = {
      layout: vi.fn(async () => ({
        id: 'g', width: 400, height: 300,
        children: [{ id: 'parent', x: 10, y: 20, width: 200, height: 150,
          children: [{ id: 'child', x: 5, y: 7, width: 80, height: 40 }],
          edges: [{ id: 'nested', sources: ['parent'], targets: ['child'], sections: [
            { startPoint: { x: 1, y: 2 }, bendPoints: [{ x: 3, y: 4 }], endPoint: { x: 5, y: 6 } },
            { startPoint: { x: 7, y: 8 }, endPoint: { x: 9, y: 10 } },
          ] }],
        }],
      })),
    };
    const result = await computeElkLayout({
      id: 'g', defaults,
      nodes: [{ id: 'parent', width: 200, height: 150,
        children: [{ id: 'child', width: 80, height: 40 }] }],
      edges: [{ id: 'nested', source: 'parent', target: 'child' }],
    }, { engine });

    expect(result.nodes).toContainEqual(expect.objectContaining({
      id: 'child', parentId: 'parent', position: { x: 5, y: 7 },
      absolutePosition: { x: 15, y: 27 },
    }));
    expect(result.edges[0]?.sections).toHaveLength(2);
    expect(result.edges[0]?.sections[0]?.startPoint).toEqual({ x: 11, y: 22 });
  });

  it('uses an ELK edge container when a nested edge is stored at the root', async () => {
    const engine: LayoutEngine = { layout: vi.fn(async () => ({
      id: 'g', children: [{ id: 'parent', x: 40, y: 50, width: 100, height: 100,
        children: [{ id: 'a', x: 1, y: 2, width: 10, height: 10 }, { id: 'b', x: 20, y: 2, width: 10, height: 10 }],
      }],
      edges: [{ id: 'e', container: 'parent', sources: ['a'], targets: ['b'], sections: [{
        startPoint: { x: 11, y: 12 }, endPoint: { x: 20, y: 12 },
      }] }],
    })) };
    const result = await computeElkLayout({
      id: 'g', defaults,
      nodes: [{ id: 'parent', width: 100, height: 100, children: [
        { id: 'a', width: 10, height: 10 }, { id: 'b', width: 10, height: 10 },
      ] }], edges: [{ id: 'e', source: 'a', target: 'b' }],
    }, { engine });
    expect(result.edges[0]?.sections[0]?.startPoint).toEqual({ x: 51, y: 62 });
  });

  it('diagnoses an absent authoritative port and falls back to the node boundary', async () => {
    let input: Record<string, unknown> | undefined;
    const engine: LayoutEngine = { layout: vi.fn(async (graph) => {
      input = graph as unknown as Record<string, unknown>;
      return graph;
    }) };
    const result = await computeElkLayout({
      id: 'g', defaults,
      nodes: [{ id: 'a', width: 10, height: 10, ports: [] }, { id: 'b', width: 10, height: 10 }],
      edges: [{ id: 'e', source: 'a', target: 'b', sourcePort: 'missing' }],
    }, { engine });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'layout.port.missing' }));
    expect((input?.edges as Array<Record<string, unknown>>)[0]).toMatchObject({ sources: ['a'] });
  });

  it('rejects an aborted result without exposing an engine error', async () => {
    const controller = new AbortController();
    const engine: LayoutEngine = { layout: vi.fn(async (graph) => {
      controller.abort();
      return graph;
    }) };
    await expect(computeElkLayout({ id: 'g', defaults, nodes: [], edges: [] }, {
      engine, signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('sanitizes an engine-thrown AbortError when the caller signal was not aborted', async () => {
    const upstream = new Error('private upstream detail');
    upstream.name = 'AbortError';
    const engine: LayoutEngine = { layout: vi.fn(async () => { throw upstream; }) };
    await expect(computeElkLayout({ id: 'g', defaults, nodes: [], edges: [] }, { engine }))
      .rejects.toMatchObject({
        name: 'LayoutExecutionError', message: 'ELK layout execution failed',
        diagnostics: [expect.objectContaining({ code: 'layout.engine.failed' })],
      });
  });
});
