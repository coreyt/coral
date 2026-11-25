import { describe, it, expect } from 'vitest';
import {
  convertNode,
  convertEdge,
  convertGraphToFlow,
  flattenNodes,
  convertFlowToGraphNodes,
  convertFlowToGraphEdges,
} from '../src/editor/converter.js';
import type { GraphIR, GraphNode, GraphEdge, CoralNode, CoralEdge } from '../src/types.js';

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

describe('Graph-IR to React Flow Converter', () => {
  describe('convertNode', () => {
    it('converts a simple service node', () => {
      const node: GraphNode = {
        id: 'api',
        type: 'service',
        label: 'API Gateway',
      };

      const result = convertNode(node, 0);

      expect(result.id).toBe('api');
      expect(result.type).toBe('coralService');
      expect(result.data.label).toBe('API Gateway');
      expect(result.data.nodeType).toBe('service');
    });

    it('preserves an explicitly blank label while defaulting an absent label to the ID', () => {
      expect(convertNode({ id: 'hidden', type: 'service', label: '' }, 0).data.label).toBe('');
      expect(convertNode({ id: 'visible', type: 'service' }, 1).data.label).toBe('visible');
    });

    it('converts different node types', () => {
      const types = ['service', 'database', 'external_api', 'actor', 'module', 'group'];
      const expectedTypes = [
        'coralService',
        'coralDatabase',
        'coralExternalApi',
        'coralActor',
        'coralModule',
        'coralGroup',
      ];

      types.forEach((type, index) => {
        const node: GraphNode = { id: `node-${type}`, type, label: type };
        const result = convertNode(node, index);
        expect(result.type).toBe(expectedTypes[index]);
      });
    });

    it('preserves node position', () => {
      const node: GraphNode = {
        id: 'test',
        type: 'service',
        label: 'Test',
        position: { x: 100, y: 200 },
      };

      const result = convertNode(node, 0);

      expect(result.position).toEqual({ x: 100, y: 200 });
    });

    it('sets parentId for child nodes', () => {
      const node: GraphNode = {
        id: 'child',
        type: 'module',
        label: 'Child',
        parent: 'parent',
      };

      const result = convertNode(node, 0, 'parent');

      expect(result.parentId).toBe('parent');
      expect(result.extent).toBe('parent');
    });

    it('includes description and properties', () => {
      const node: GraphNode = {
        id: 'api',
        type: 'service',
        label: 'API',
        description: 'Main API',
        properties: { technology: 'Node.js' },
      };

      const result = convertNode(node, 0);

      expect(result.data.description).toBe('Main API');
      expect(result.data.properties).toEqual({ technology: 'Node.js' });
    });

    it('exposes canonical symbol and variant to the canvas node', () => {
      const result = convertNode({
        id: 'start', type: 'service', label: 'Start',
        symbol: 'flowchart-terminal', variant: 'start',
      }, 0);

      expect(result.data).toMatchObject({
        symbolId: 'flowchart-terminal', variant: 'start',
      });
    });

    it('marks group nodes with isGroup', () => {
      const node: GraphNode = {
        id: 'group',
        type: 'group',
        label: 'Group',
        children: [{ id: 'child', type: 'service', label: 'Child' }],
      };

      const result = convertNode(node, 0);

      expect(result.data.isGroup).toBe(true);
      expect(result.data.childCount).toBe(1);
    });
  });

  describe('flattenNodes', () => {
    it('flattens nested nodes', () => {
      const nodes: GraphNode[] = [{
        id: 'parent',
        type: 'group',
        label: 'Parent',
        children: [
          { id: 'child1', type: 'service', label: 'Child 1', parent: 'parent' },
          { id: 'child2', type: 'service', label: 'Child 2', parent: 'parent' },
        ],
      }];

      const result = flattenNodes(nodes);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('parent');
      expect(result[1].id).toBe('child1');
      expect(result[1].parentId).toBe('parent');
      expect(result[2].id).toBe('child2');
      expect(result[2].parentId).toBe('parent');
    });

    it('handles deeply nested nodes', () => {
      const nodes: GraphNode[] = [{
        id: 'root',
        type: 'group',
        label: 'Root',
        children: [{
          id: 'level1',
          type: 'group',
          label: 'Level 1',
          parent: 'root',
          children: [{
            id: 'level2',
            type: 'service',
            label: 'Level 2',
            parent: 'level1',
          }],
        }],
      }];

      const result = flattenNodes(nodes);

      expect(result).toHaveLength(3);
      expect(result[2].parentId).toBe('level1');
    });
  });

  describe('convertEdge', () => {
    it('converts a simple edge', () => {
      const edge: GraphEdge = {
        id: 'e1',
        source: 'a',
        target: 'b',
      };

      const result = convertEdge(edge);

      expect(result.id).toBe('e1');
      expect(result.source).toBe('a');
      expect(result.target).toBe('b');
      expect(result.type).toBe('compatibility');
      expect(result.markerEnd).toMatch(/^url\(#coral-marker-/);
      expect(result.data?.targetEndpoint).toEqual({ marker: { kind: 'arrow', fill: 'unspecified' } });
    });

    it('includes edge label', () => {
      const edge: GraphEdge = {
        id: 'e1',
        source: 'a',
        target: 'b',
        label: 'HTTP Request',
      };

      const result = convertEdge(edge);

      expect(result.label).toBe('HTTP Request');
      expect(result.data?.label).toBe('HTTP Request');
    });

    it('applies dashed style', () => {
      const edge: GraphEdge = {
        id: 'e1',
        source: 'a',
        target: 'b',
        style: { lineStyle: 'dashed' },
      };

      const result = convertEdge(edge);

      expect(result.style?.strokeDasharray).toBe('6,4');
    });

    it('applies dotted style', () => {
      const edge: GraphEdge = {
        id: 'e1',
        source: 'a',
        target: 'b',
        style: { lineStyle: 'dotted' },
      };

      const result = convertEdge(edge);

      expect(result.style?.strokeDasharray).toBe('2,4');
    });

    it('resolves shared endpoint semantics and authored markers', () => {
      const result = convertEdge({
        id: 'e1', source: 'a', target: 'b',
        sourceEnd: { role: 'owner', navigability: 'non-navigable', marker: { kind: 'diamond', fill: 'filled' } },
        targetEnd: { marker: { kind: 'none', fill: 'unspecified' } },
      });
      expect(result.markerStart).toMatch(/^url\(#coral-marker-/);
      expect(result.markerEnd).toBeUndefined();
      expect(result.data?.sourceEndpoint).toEqual({
        role: 'owner', navigability: 'non-navigable', marker: { kind: 'diamond', fill: 'filled' },
      });
    });

    it('handles port references', () => {
      const edge: GraphEdge = {
        id: 'e1',
        source: 'a',
        target: 'b',
        sourcePort: 'out1',
        targetPort: 'in1',
      };

      const result = convertEdge(edge);

      expect(result.sourceHandle).toBe('out1');
      expect(result.targetHandle).toBe('in1');
    });
  });

  describe('convertGraphToFlow', () => {
    it('keeps an explicitly blank node label through the canvas round trip', () => {
      const graph: GraphIR = { version: '3.0.0', id: 'labels',
        nodes: [{ id: 'hidden', type: 'service', label: '' },
          { id: 'visible', type: 'service' },
          { id: 'same', type: 'service', label: 'same' },
          { id: 'edited', type: 'service' }], edges: [] };
      const flow = convertGraphToFlow(graph);
      expect(flow.nodes.map((node) => node.data.label)).toEqual(['', 'visible', 'same', 'edited']);
      flow.nodes[3]!.data.label = 'Changed';
      expect(convertFlowToGraphNodes(flow.nodes, graph.nodes).map((node) => node.label))
        .toEqual(['', undefined, 'same', 'Changed']);
    });

    it('converts complete graph', () => {
      const graph: GraphIR = {
        version: '1.0.0',
        id: 'test-graph',
        nodes: [
          { id: 'a', type: 'service', label: 'Service A' },
          { id: 'b', type: 'database', label: 'Database B' },
        ],
        edges: [
          { id: 'e1', source: 'a', target: 'b' },
        ],
      };

      const result = convertGraphToFlow(graph);

      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
      expect(result.nodes[0].type).toBe('coralService');
      expect(result.nodes[1].type).toBe('coralDatabase');
    });

    it('resolves catalog edge styles from the graph notation and nodes', () => {
      const graph = {
        version: '1.0.0', id: 'arch', metadata: { notation: 'architecture' },
        nodes: [
          { id: 'web', type: 'service', symbol: 'arch-service', variant: 'web' },
          { id: 'db', type: 'database', symbol: 'arch-database' },
        ],
        edges: [{ id: 'e1', source: 'web', target: 'db' }, { id: 'e2', source: 'db', target: 'web' }],
      } as GraphIR;
      const [matched, defaulted] = convertGraphToFlow(graph).edges;
      expect(matched.style).toMatchObject({ stroke: '#4caf50', strokeWidth: 2 });
      expect(defaulted.style).toMatchObject({ stroke: '#424242', strokeWidth: 1.5 });
      expect(convertFlowToGraphEdges([matched], graph.edges)).toEqual([graph.edges[0]]);
    });

    it('resolves implicit profile-scoped node symbols before choosing canvas edge style', () => {
      const graph = {
        version: '3.0.0', id: 'implicit-arch', metadata: { notation: 'architecture' },
        nodes: [{ id: 'web', type: 'service' }, { id: 'db', type: 'database' }],
        edges: [{ id: 'read', source: 'web', target: 'db' }],
      } as GraphIR;
      expect(convertGraphToFlow(graph).edges[0]?.style).toMatchObject({
        stroke: '#4caf50', strokeWidth: 2,
      });
    });

    it('uses a portable UML sequence profile for canvas edge appearance without metadata', () => {
      const graph = {
        version: '3.0.0', id: 'profile-only',
        profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
        nodes: [{ id: 'client', type: 'participant' }, { id: 'server', type: 'participant' }],
        edges: [{ id: 'request', source: 'client', target: 'server' }],
      } as GraphIR;
      const edge = convertGraphToFlow(graph).edges[0];
      expect(edge?.style).toMatchObject({ stroke: '#475569', strokeWidth: 1.5 });
      expect(edge?.data?.targetEndpoint?.marker).toMatchObject({ kind: 'triangle', fill: 'filled' });
    });

    it('refuses canvas styling through metadata that contradicts the portable UML profile', () => {
      const graph = {
        version: '3.0.0', id: 'mismatch', metadata: { notation: 'uml-sequence' },
        profile: { id: 'uml', kind: 'class', version: '1.0.0' },
        nodes: [{ id: 'Order', type: 'class' }], edges: [],
      } as GraphIR;
      expect(() => convertGraphToFlow(graph)).toThrow(/render\.capability\.profile-contradiction/);
    });
  });

  describe('convertFlowToGraphNodes', () => {
    it('converts flow nodes back to graph nodes', () => {
      const flowNodes: CoralNode[] = [
        {
          id: 'a',
          type: 'coralService',
          position: { x: 100, y: 100 },
          data: { label: 'Service A', nodeType: 'service' },
        },
        {
          id: 'b',
          type: 'coralDatabase',
          position: { x: 200, y: 200 },
          data: { label: 'Database B', nodeType: 'database' },
        },
      ];

      const originalNodes: GraphNode[] = [
        { id: 'a', type: 'service', label: 'Service A' },
        { id: 'b', type: 'database', label: 'Database B' },
      ];

      const result = convertFlowToGraphNodes(flowNodes, originalNodes);

      expect(result).toHaveLength(2);
      expect(result[0].position).toEqual({ x: 100, y: 100 });
      expect(result[1].position).toEqual({ x: 200, y: 200 });
    });

    it('reconstructs hierarchy from parentId', () => {
      const flowNodes: CoralNode[] = [
        {
          id: 'parent',
          type: 'coralGroup',
          position: { x: 0, y: 0 },
          data: { label: 'Parent', nodeType: 'group', isGroup: true },
        },
        {
          id: 'child',
          type: 'coralService',
          position: { x: 10, y: 10 },
          parentId: 'parent',
          data: { label: 'Child', nodeType: 'service' },
        },
      ];

      const originalNodes: GraphNode[] = [
        {
          id: 'parent',
          type: 'group',
          label: 'Parent',
          children: [{ id: 'child', type: 'service', label: 'Child', parent: 'parent' }],
        },
      ];

      const result = convertFlowToGraphNodes(flowNodes, originalNodes);

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children![0].id).toBe('child');
    });

    it('treats current hierarchy as authoritative when detaching or deleting children', () => {
      const originals: GraphNode[] = [{
        id: 'parent', type: 'group', label: 'Parent',
        children: [
          { id: 'detached', type: 'service', label: 'Detached', parent: 'parent' },
          { id: 'deleted', type: 'service', label: 'Deleted', parent: 'parent' },
        ],
      }];
      const current: CoralNode[] = [{
        id: 'parent', type: 'coralGroup', position: { x: 0, y: 0 },
        data: { label: 'Parent', nodeType: 'group' },
      }, {
        id: 'detached', type: 'coralService', position: { x: 20, y: 30 },
        data: { label: 'Detached', nodeType: 'service' },
      }];

      const result = convertFlowToGraphNodes(current, originals);

      expect(result.map((node) => node.id)).toEqual(['parent', 'detached']);
      expect(result[0]).not.toHaveProperty('children');
      expect(result[1]).not.toHaveProperty('parent');
    });
  });

  describe('convertFlowToGraphEdges', () => {
    it('converts flow edges back to graph edges', () => {
      const flowEdges: CoralEdge[] = [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          data: { label: 'Request', edgeType: 'http' },
        },
      ];

      const result = convertFlowToGraphEdges(flowEdges);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'e1',
        source: 'a',
        target: 'b',
        label: 'Request',
        type: 'http',
      });
    });

    it('clears original ports when current handles are absent', () => {
      const result = convertFlowToGraphEdges([{
        id: 'e1', source: 'a', target: 'b',
        data: { label: 'Detached ports' },
      }], [{
        id: 'e1', source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in',
      }]);

      expect(result[0]).not.toHaveProperty('sourcePort');
      expect(result[0]).not.toHaveProperty('targetPort');
    });

    it('clears visual line style while retaining other canonical style members', () => {
      const result = convertFlowToGraphEdges([{
        id: 'e1', source: 'a', target: 'b',
        style: { stroke: '#123' },
        data: {
          label: 'No line style',
          canonical: {
            style: { lineStyle: 'dashed' },
            sourceEnd: { marker: { kind: 'circle', fill: 'unspecified' } },
            targetEnd: { marker: { kind: 'diamond', fill: 'unspecified' } },
          },
        },
      }], [{
        id: 'e1', source: 'a', target: 'b',
        style: { lineStyle: 'dashed' },
        sourceEnd: { marker: { kind: 'circle', fill: 'unspecified' } },
        targetEnd: { marker: { kind: 'diamond', fill: 'unspecified' } },
      }]);

      expect(result[0].style).toBeUndefined();
      expect(result[0].sourceEnd).toEqual({ marker: { kind: 'circle', fill: 'unspecified' } });
      expect(result[0].targetEnd).toEqual({ marker: { kind: 'diamond', fill: 'unspecified' } });
    });

    it('preserves the complete canonical payload through the view projection', () => {
      const sourceInfo = {
        range: { start: 1, end: 5 },
        originalText: 'node',
      };
      const graph: GraphIR = {
        version: '3.0.0',
        id: 'full',
        nodes: [{
          id: 'a', type: 'service', label: 'A', description: 'desc', symbol: 'arch-service',
          variant: 'api', properties: { p: 1 }, ports: [{ id: 'http', side: 'EAST' }],
          dimensions: { width: 222, height: 88 }, position: { x: 12, y: 34 }, pinned: true,
          layoutOptions: { portConstraints: 'FIXED_SIDE' }, sourceInfo,
        }],
        edges: [{
          id: 'e', source: 'a', target: 'a', sourcePort: 'http', targetPort: 'http',
          type: 'loop', label: 'again', properties: { q: 2 }, routingPoints: [{ x: 9, y: 8 }],
          style: { lineStyle: 'dotted', routing: 'spline' },
          sourceEnd: { marker: { kind: 'circle', fill: 'unspecified' } },
          targetEnd: { marker: { kind: 'diamond', fill: 'unspecified' } },
          sourceInfo,
        }],
      };

      const flow = convertGraphToFlow(graph);
      const nodes = convertFlowToGraphNodes(flow.nodes, graph.nodes);
      const edges = convertFlowToGraphEdges(flow.edges);

      expect(nodes[0]).toEqual(graph.nodes[0]);
      expect(edges[0]).toEqual(graph.edges[0]);
    });
  });
});

describe('convertGraphToFlow symbol index', () => {
  it('builds the endpoint symbol index once per graph, not per edge', () => {
    const run = (nodes: GraphNode[], edges: GraphEdge[]) =>
      convertGraphToFlow({ version: '1.0', nodes, edges, metadata: { notation: 'architecture' } } as GraphIR);
    expect(countedSymbolReads(20, run)).toBe(countedSymbolReads(1, run));
  });
});
