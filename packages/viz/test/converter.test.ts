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
      expect(result.type).toBe('smoothstep');
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

      expect(result.style?.strokeDasharray).toBe('5,5');
    });

    it('applies dotted style', () => {
      const edge: GraphEdge = {
        id: 'e1',
        source: 'a',
        target: 'b',
        style: { lineStyle: 'dotted' },
      };

      const result = convertEdge(edge);

      expect(result.style?.strokeDasharray).toBe('2,2');
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
  });
});
