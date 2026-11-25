import { describe, expect, it } from 'vitest';
import { computeElkLayout, type LayoutRequest, type LayoutResult } from '@coral-viz/render/layout';
import { layoutGraph } from '@coral-viz/viz';
import { runEditorLayout, type LayoutWorkerLike } from '../src/layoutWorkerClient';
import { convertEdges, layoutNodes } from '../src/hooks/diagramUtils';
import type { GraphEdge, GraphNode } from '../src/parsers';

function countedSymbolReads(edgeCount: number, run: (nodes: GraphNode[], edges: GraphEdge[]) => unknown): number {
  let reads = 0;
  const nodes = [['web', 'arch-service'], ['db', 'arch-database']].map(([id, symbol]) => {
    const node = { id, type: 'service', label: id } as GraphNode;
    Object.defineProperty(node, 'symbol', { get: () => { reads += 1; return symbol; }, enumerable: true });
    return node;
  });
  run(nodes, Array.from({ length: edgeCount }, (_, i) => ({ id: `e${i}`, source: 'web', target: 'db' })) as GraphEdge[]);
  return reads;
}

class ComputingWorker extends EventTarget implements LayoutWorkerLike {
  terminated = false;

  postMessage(value: unknown): void {
    void computeElkLayout(value as LayoutRequest).then((result) => {
      if (!this.terminated) this.dispatchEvent(new MessageEvent('message', { data: { ok: true, result } }));
    });
  }

  terminate(): void { this.terminated = true; }
}

const fixtures: LayoutRequest[] = [
  {
    id: 'parallel',
    defaults: { algorithm: 'layered', direction: 'RIGHT', spacing: { nodeNode: 40, edgeNode: 15, layerSpacing: 60 } },
    nodes: [
      { id: 'a', width: 80, height: 40, pinned: true, position: { x: 10, y: 20 } },
      { id: 'b', width: 80, height: 40 },
    ],
    edges: [
      { id: 'one', source: 'a', target: 'b' },
      { id: 'two', source: 'a', target: 'b' },
    ],
  },
  {
    id: 'nested',
    defaults: { algorithm: 'layered', direction: 'DOWN', spacing: { nodeNode: 35, edgeNode: 12, layerSpacing: 55 } },
    nodes: [{ id: 'group', width: 200, height: 160, children: [
      { id: 'child-a', width: 70, height: 35 },
      { id: 'child-b', width: 70, height: 35 },
    ] }],
    edges: [{ id: 'inside', source: 'child-a', target: 'child-b' }],
  },
  {
    id: 'ports-and-diagnostics',
    defaults: { algorithm: 'layered', direction: 'RIGHT' },
    options: { direction: 'SIDEWAYS' },
    nodes: [
      { id: 'source', width: 80, height: 40, ports: [{ id: 'out', side: 'EAST' }] },
      { id: 'target', width: 80, height: 40, ports: [{ id: 'in', side: 'WEST' }] },
    ],
    edges: [{ id: 'edge', source: 'source', target: 'target', sourcePort: 'out', targetPort: 'missing' }],
  },
];

function stable(result: LayoutResult) {
  return { nodes: result.nodes, edges: result.edges, diagnostics: result.diagnostics };
}

describe('Slice 47 direct/headless/worker layout conformance', () => {
  for (const fixture of fixtures) {
    it(`produces the same canonical result for ${fixture.id}`, async () => {
      const direct = await computeElkLayout(fixture);
      const worker = await runEditorLayout(fixture, { workerFactory: () => new ComputingWorker() });
      expect(stable(worker)).toEqual(stable(direct));
    });
  }

  it('keeps the public headless adapter aligned for shared node geometry while retaining its own policy', async () => {
    const graph = {
      version: '1.0.0', id: 'headless',
      layoutOptions: { algorithm: 'layered' as const, direction: 'RIGHT' as const,
        spacing: { nodeNode: 40, edgeNode: 15, layerSpacing: 60 } },
      nodes: [
        { id: 'a', type: 'service', dimensions: { width: 80, height: 40 } },
        { id: 'b', type: 'service', dimensions: { width: 80, height: 40 } },
      ],
      edges: [{ id: 'ab', source: 'a', target: 'b' }],
    };
    const direct = await computeElkLayout({
      id: graph.id,
      defaults: { algorithm: 'layered', direction: 'DOWN' },
      options: graph.layoutOptions,
      nodes: graph.nodes.map((node) => ({ id: node.id, ...node.dimensions })),
      edges: graph.edges,
    });
    const headless = await layoutGraph(graph);
    const directById = new Map(direct.nodes.map((node) => [node.id, node.absolutePosition]));
    expect(headless.nodes.map((node) => [node.id, node.position]))
      .toEqual(graph.nodes.map((node) => [node.id, directById.get(node.id)]));
  });

  it('exercises the editor projection adapter for hierarchy, ports, and routed sections', async () => {
    const result = await layoutNodes([
      { id: 'group', type: 'group', label: 'Group' },
      { id: 'source', type: 'process', label: 'Source', parent: 'group' },
      { id: 'target', type: 'process', label: 'Target', parent: 'group' },
    ], [{ id: 'edge', source: 'source', target: 'target', sourcePort: 'out', targetPort: 'in' }], 'flowchart');
    expect(result.nodes.find((node) => node.id === 'source')?.parentId).toBe('group');
    expect(result.nodes.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'layout.port.missing')).toBe(false);

    const flatEdges = [{ id: 'flat-edge', source: 'left', target: 'right' }];
    const flat = await layoutNodes([
      { id: 'left', type: 'service', label: 'Left' },
      { id: 'right', type: 'service', label: 'Right' },
    ], flatEdges, 'flowchart');
    expect(flat.edgeRouting.get('flat-edge')).toMatchObject({
      id: 'flat-edge', startPoint: expect.any(Object), endPoint: expect.any(Object), bendPoints: expect.any(Array),
    });
    expect(convertEdges(flatEdges, flat.edgeRouting)[0].data?.routedPath).toBeDefined();
    expect(convertEdges(flatEdges, new Map())[0]).toMatchObject({ type: 'compatibility' });
  });

  it('projects shared notation edge styles and generalized endpoint markers', () => {
    const graphNodes = [
      { id: 'service', type: 'service', symbol: 'arch-service', label: 'Service' },
      { id: 'db', type: 'database', symbol: 'arch-database', label: 'DB' },
    ] as GraphNode[];
    const [edge] = convertEdges([{
      id: 'data', source: 'service', target: 'db', type: 'data',
      sourceEnd: { navigability: 'non-navigable', marker: { kind: 'diamond', fill: 'open' } },
      targetEnd: { role: 'store', navigability: 'navigable', marker: { kind: 'triangle', fill: 'filled' } },
    } as GraphEdge], undefined, undefined, { notation: 'architecture', nodes: graphNodes });
    expect(edge.type).toBe('compatibility');
    expect(edge.style).toMatchObject({ stroke: '#4caf50', strokeWidth: 2 });
    expect(edge.markerStart).toMatch(/^url\(#coral-marker-/);
    expect(edge.markerEnd).toMatch(/^url\(#coral-marker-/);
    expect(edge.data).toMatchObject({
      sourceEndpoint: { navigability: 'non-navigable' },
      targetEndpoint: { role: 'store', navigability: 'navigable' },
    });
  });

  it('uses the profile-resolved symbols for a type-only architecture connection', () => {
    const nodes = [
      { id: 'service', type: 'service', label: 'Service' },
      { id: 'db', type: 'database', label: 'Database' },
    ] as GraphNode[];
    const [edge] = convertEdges([
      { id: 'writes', source: 'service', target: 'db' } as GraphEdge,
    ], undefined, undefined, { notation: 'architecture', nodes });
    expect(edge.style).toMatchObject({ stroke: '#4caf50', strokeWidth: 2 });
    expect(edge.data?.targetEndpoint).toMatchObject({ marker: { kind: 'arrow' } });
  });

  it('retains the editor compatibility lineStyle field over catalog defaults', () => {
    const [edge] = convertEdges([{
      id: 'legacy-dash', source: 'left', target: 'right', lineStyle: 'dashed',
    }], undefined, undefined, { notation: 'architecture', nodes: [] });
    expect(edge.style).toMatchObject({ strokeDasharray: '6,4' });
  });

  it('cancels the editor worker seam and retires the worker without accepting a late result', async () => {
    class DelayedWorker extends EventTarget implements LayoutWorkerLike {
      terminated = false;
      postMessage(): void {}
      terminate(): void { this.terminated = true; }
    }
    const worker = new DelayedWorker();
    const controller = new AbortController();
    const pending = runEditorLayout(fixtures[0], { signal: controller.signal, workerFactory: () => worker });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminated).toBe(true);
  });
});

describe('convertEdges symbol index', () => {
  it('builds the endpoint symbol index once per call, not per edge', () => {
    const run = (nodes: GraphNode[], edges: GraphEdge[]) =>
      convertEdges(edges, undefined, undefined, { notation: 'architecture', nodes });
    expect(countedSymbolReads(20, run)).toBe(countedSymbolReads(1, run));
  });
});
