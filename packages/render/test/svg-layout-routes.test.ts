import { describe, expect, it, vi } from 'vitest';
import type { GraphIR } from '@graph-ir/core';

const { resolveSpatialLayout } = vi.hoisted(() => ({ resolveSpatialLayout: vi.fn() }));
vi.mock('../src/layout/spatial.js', () => ({ resolveSpatialLayout }));

import { layoutGraphForSvg } from '../src/svg/layout.js';
import { renderSvg } from '../src/svg/serialize.js';
import { notationCatalogIdentity028 } from '../src/notations/index.js';
import { resolveSuccessorGraphNodes028 } from '../src/successorInterpretation028.js';

/** Moved from the MCP adapter suite when the projection moved here (Slice 80). */
describe('layoutGraphForSvg routes', () => {
  it('does not invent a semantic port reference for a source-owned plain connector', async () => {
    resolveSpatialLayout.mockResolvedValue({ nodes: [], edges: [], diagnostics: [] });
    const graph: GraphIR = { version: '3.0.0', id: 'plain', metadata: { notation: 'architecture' },
      nodes: [{ id: 'api', type: 'service' }, { id: 'db', type: 'database' }],
      edges: [{ id: 'plain-edge', source: 'api', target: 'db' }] };
    const semanticInterpretations = resolveSuccessorGraphNodes028({ version: '4.0.0',
      profile: { id: 'architecture', version: '1.0.0' }, catalog: notationCatalogIdentity028('architecture')!,
      nodes: [{ id: 'api', type: 'service' }, { id: 'db', type: 'database' }],
    });
    await layoutGraphForSvg(graph, { semanticInterpretations });
    const request = resolveSpatialLayout.mock.calls.at(-1)?.[0].graph as GraphIR;
    expect(request.nodes.every((node) => node.ports === undefined)).toBe(true);
    expect(request.edges[0]?.sourcePort).toBeUndefined();
    expect(request.edges[0]?.targetPort).toBeUndefined();
  });

  it('keeps only referenced source-owned semantic ports in the temporary layout', async () => {
    resolveSpatialLayout.mockResolvedValue({ nodes: [], edges: [], diagnostics: [] });
    const graph: GraphIR = { version: '3.0.0', id: 'named', metadata: { notation: 'architecture' },
      nodes: [{ id: 'api', type: 'service' }, { id: 'db', type: 'database' }],
      edges: [{ id: 'query', source: 'api', target: 'db', sourcePort: 'audit', targetPort: 'receive' }] };
    const semanticInterpretations = resolveSuccessorGraphNodes028({ version: '4.0.0',
      profile: { id: 'architecture', version: '1.0.0' }, catalog: notationCatalogIdentity028('architecture')!,
      nodes: [{ id: 'api', type: 'service', semanticPorts: [
        { id: 'audit', direction: 'out', anchor: { kind: 'side' } },
        { id: 'telemetry', direction: 'out', anchor: { kind: 'exact', position: 'N' } },
      ] }, { id: 'db', type: 'database', semanticPorts: [
        { id: 'receive', direction: 'in', anchor: { kind: 'auto' } },
      ] }],
    });
    await layoutGraphForSvg(graph, { semanticInterpretations });
    const request = resolveSpatialLayout.mock.calls.at(-1)?.[0].graph as GraphIR;
    expect(request.nodes[0]?.ports?.map((port) => port.id)).toEqual(['audit', 'telemetry']);
    expect(request.nodes[1]?.ports?.map((port) => port.id)).toEqual(['receive']);
    expect(graph.nodes.every((node) => node.ports === undefined)).toBe(true);
  });

  it('projects catalog semantic ports by layout direction without persisting geometric choices', async () => {
    resolveSpatialLayout.mockResolvedValue({ nodes: [], edges: [], diagnostics: [] });
    const graph: GraphIR = {
      version: '3.0.0', id: 'semantic-ports', metadata: { notation: 'architecture' },
      nodes: [{ id: 'api', type: 'service' }, { id: 'db', type: 'database' }],
      edges: [{ id: 'query', source: 'api', target: 'db' }],
    };
    await layoutGraphForSvg(graph, { direction: 'RIGHT' });
    const right = resolveSpatialLayout.mock.calls.at(-1)?.[0].graph as GraphIR;
    expect(right.nodes[0]?.ports).toContainEqual(expect.objectContaining({ id: 'out', side: 'EAST' }));
    expect(right.nodes[1]?.ports).toContainEqual(expect.objectContaining({ id: 'query', side: 'WEST' }));
    expect(right.edges[0]).toMatchObject({ sourcePort: 'out', targetPort: 'query' });

    await layoutGraphForSvg(graph, { direction: 'DOWN' });
    const down = resolveSpatialLayout.mock.calls.at(-1)?.[0].graph as GraphIR;
    expect(down.nodes[0]?.ports).toContainEqual(expect.objectContaining({ id: 'out', side: 'SOUTH' }));
    expect(down.nodes[1]?.ports).toContainEqual(expect.objectContaining({ id: 'query', side: 'NORTH' }));
    expect(graph.nodes.every((node) => node.ports === undefined)).toBe(true);
    expect(graph.edges[0]?.sourcePort).toBeUndefined();
  });

  it('keeps authored GraphIR 3 geometric ports as hard pins in SVG layout', async () => {
    resolveSpatialLayout.mockResolvedValue({ nodes: [], edges: [], diagnostics: [] });
    const authored = [{ id: 'out', side: 'NORTH' as const, properties: { direction: 'out' } }];
    const graph: GraphIR = {
      version: '3.0.0', id: 'pinned-ports', metadata: { notation: 'architecture' },
      nodes: [{ id: 'api', type: 'service', ports: authored }, { id: 'db', type: 'database' }],
      edges: [{ id: 'query', source: 'api', target: 'db', sourcePort: 'out' }],
    };
    await layoutGraphForSvg(graph, { direction: 'RIGHT' });
    const request = resolveSpatialLayout.mock.calls.at(-1)?.[0].graph as GraphIR;
    expect(request.nodes[0]?.ports).toEqual(authored);
    expect(request.edges[0]).toMatchObject({ sourcePort: 'out', targetPort: 'query' });
    expect(graph.nodes[0]?.ports).toEqual(authored);
  });

  it('uses an explicit render notation for layout ports without changing saved metadata', async () => {
    resolveSpatialLayout.mockResolvedValue({ nodes: [], edges: [], diagnostics: [] });
    const graph: GraphIR = { version: '3.0.0', id: 'render-override',
      nodes: [{ id: 'api', type: 'service' }, { id: 'db', type: 'database' }],
      edges: [{ id: 'query', source: 'api', target: 'db' }] };
    await layoutGraphForSvg(graph, { direction: 'RIGHT', svgOptions: { notation: 'architecture' } });
    const request = resolveSpatialLayout.mock.calls.at(-1)?.[0].graph as GraphIR;
    expect(request.nodes[0]?.ports).toContainEqual(expect.objectContaining({ id: 'out', side: 'EAST' }));
    expect(request.edges[0]).toMatchObject({ sourcePort: 'out', targetPort: 'query' });
    expect(graph.metadata).toBeUndefined();
  });

  it('renders verified computed routes when supplied positions cross the shared resolver', async () => {
    resolveSpatialLayout.mockResolvedValue({
      nodes: [
        { id: 'fixed', position: { x: 700, y: 300 }, absolutePosition: { x: 700, y: 300 }, width: 150, height: 60 },
        { id: 'auto1', position: { x: 900, y: 300 }, absolutePosition: { x: 900, y: 300 }, width: 150, height: 60 },
        { id: 'auto2', position: { x: 1100, y: 300 }, absolutePosition: { x: 1100, y: 300 }, width: 150, height: 60 },
      ],
      edges: [
        { id: 'e1', sections: [{ startPoint: { x: 850, y: 330 }, bendPoints: [{ x: 875, y: 400 }], endPoint: { x: 900, y: 330 } }] },
        { id: 'e2', sections: [{ startPoint: { x: 1050, y: 330 }, bendPoints: [{ x: 1075, y: 400 }], endPoint: { x: 1100, y: 330 } }] },
      ],
      width: 1250,
      height: 430,
      effectiveOptions: {},
      diagnostics: [],
    });

    const laid = await layoutGraphForSvg({
        version: '3.0.0', id: 'g',
        nodes: [
          { id: 'fixed', type: 'service', position: { x: 700, y: 300 } },
          { id: 'auto1', type: 'service' },
          { id: 'auto2', type: 'service' },
        ],
        edges: [
          { id: 'e1', source: 'fixed', target: 'auto1' },
          { id: 'e2', source: 'auto1', target: 'auto2' },
        ],
    } as GraphIR);
    const svg = renderSvg(laid, { edgeRoutes: laid.edgeRoutes });
    const routes = [...svg.matchAll(/data-coral-part-id="e[12]:shaft" d="([^"]+)"/g)]
      .map((match) => match[1]);
    expect(routes).toHaveLength(2);
    expect(routes[0]).toContain('899 424');
    expect(routes[1]).toContain('1099 424');
  });
});
