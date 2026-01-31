import { describe, it, expect } from 'vitest';
import { layoutGraph, layoutFlowNodes } from '../src/layout/index.js';
import type { GraphIR, CoralNode, CoralEdge } from '../src/types.js';

describe('ELK Layout', () => {
  describe('layoutGraph', () => {
    it('computes positions for simple graph', async () => {
      const graph: GraphIR = {
        version: '1.0.0',
        id: 'test',
        nodes: [
          { id: 'a', type: 'service', label: 'Service A' },
          { id: 'b', type: 'service', label: 'Service B' },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
      };

      const result = await layoutGraph(graph);

      expect(result.nodes[0].position).toBeDefined();
      expect(result.nodes[1].position).toBeDefined();
      expect(result.nodes[0].position!.x).toBeTypeOf('number');
      expect(result.nodes[0].position!.y).toBeTypeOf('number');
    });

    it('positions nodes differently', async () => {
      const graph: GraphIR = {
        version: '1.0.0',
        id: 'test',
        nodes: [
          { id: 'a', type: 'service', label: 'Service A' },
          { id: 'b', type: 'service', label: 'Service B' },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
      };

      const result = await layoutGraph(graph);

      // Nodes should have different positions
      const posA = result.nodes[0].position!;
      const posB = result.nodes[1].position!;
      expect(posA.x !== posB.x || posA.y !== posB.y).toBe(true);
    });

    it('respects direction option', async () => {
      const graphDown: GraphIR = {
        version: '1.0.0',
        id: 'test',
        nodes: [
          { id: 'a', type: 'service', label: 'A' },
          { id: 'b', type: 'service', label: 'B' },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
        layoutOptions: { direction: 'DOWN' },
      };

      const graphRight: GraphIR = {
        ...graphDown,
        layoutOptions: { direction: 'RIGHT' },
      };

      const resultDown = await layoutGraph(graphDown);
      const resultRight = await layoutGraph(graphRight);

      // With DOWN direction, nodes should be vertically arranged
      const downDeltaY = Math.abs(
        resultDown.nodes[0].position!.y - resultDown.nodes[1].position!.y
      );
      const downDeltaX = Math.abs(
        resultDown.nodes[0].position!.x - resultDown.nodes[1].position!.x
      );

      // With RIGHT direction, nodes should be horizontally arranged
      const rightDeltaY = Math.abs(
        resultRight.nodes[0].position!.y - resultRight.nodes[1].position!.y
      );
      const rightDeltaX = Math.abs(
        resultRight.nodes[0].position!.x - resultRight.nodes[1].position!.x
      );

      // DOWN: vertical delta should be greater
      expect(downDeltaY).toBeGreaterThan(downDeltaX);
      // RIGHT: horizontal delta should be greater
      expect(rightDeltaX).toBeGreaterThan(rightDeltaY);
    });

    it('handles graph with no edges', async () => {
      const graph: GraphIR = {
        version: '1.0.0',
        id: 'test',
        nodes: [
          { id: 'a', type: 'service', label: 'Service A' },
          { id: 'b', type: 'service', label: 'Service B' },
        ],
        edges: [],
      };

      const result = await layoutGraph(graph);

      expect(result.nodes[0].position).toBeDefined();
      expect(result.nodes[1].position).toBeDefined();
    });

    it('preserves node properties', async () => {
      const graph: GraphIR = {
        version: '1.0.0',
        id: 'test',
        nodes: [
          {
            id: 'a',
            type: 'service',
            label: 'Service A',
            description: 'Main service',
            properties: { technology: 'Node.js' },
          },
        ],
        edges: [],
      };

      const result = await layoutGraph(graph);

      expect(result.nodes[0].label).toBe('Service A');
      expect(result.nodes[0].description).toBe('Main service');
      expect(result.nodes[0].properties).toEqual({ technology: 'Node.js' });
    });

    it('handles nested nodes (groups)', async () => {
      const graph: GraphIR = {
        version: '1.0.0',
        id: 'test',
        nodes: [
          {
            id: 'group',
            type: 'group',
            label: 'Backend',
            children: [
              { id: 'api', type: 'service', label: 'API', parent: 'group' },
              { id: 'db', type: 'database', label: 'DB', parent: 'group' },
            ],
          },
        ],
        edges: [{ id: 'e1', source: 'api', target: 'db' }],
      };

      const result = await layoutGraph(graph);

      expect(result.nodes[0].position).toBeDefined();
      expect(result.nodes[0].children).toHaveLength(2);
      expect(result.nodes[0].children![0].position).toBeDefined();
      expect(result.nodes[0].children![1].position).toBeDefined();
    });

    it('uses custom node dimensions', async () => {
      const graph: GraphIR = {
        version: '1.0.0',
        id: 'test',
        nodes: [
          {
            id: 'wide',
            type: 'service',
            label: 'Wide Node',
            dimensions: { width: 300, height: 100 },
          },
          { id: 'small', type: 'service', label: 'Small Node' },
        ],
        edges: [{ id: 'e1', source: 'wide', target: 'small' }],
      };

      const result = await layoutGraph(graph);

      // Layout should account for different node sizes
      expect(result.nodes[0].position).toBeDefined();
      expect(result.nodes[1].position).toBeDefined();
    });
  });

  describe('layoutFlowNodes', () => {
    it('layouts React Flow nodes', async () => {
      const nodes: CoralNode[] = [
        {
          id: 'a',
          type: 'coralService',
          position: { x: 0, y: 0 },
          data: { label: 'Service A', nodeType: 'service' },
        },
        {
          id: 'b',
          type: 'coralService',
          position: { x: 0, y: 0 },
          data: { label: 'Service B', nodeType: 'service' },
        },
      ];

      const edges: CoralEdge[] = [{ id: 'e1', source: 'a', target: 'b' }];

      const result = await layoutFlowNodes(nodes, edges);

      expect(result[0].position).toBeDefined();
      expect(result[1].position).toBeDefined();
      // Positions should be different after layout
      expect(
        result[0].position.x !== result[1].position.x ||
          result[0].position.y !== result[1].position.y
      ).toBe(true);
    });

    it('handles nodes with parentId', async () => {
      const nodes: CoralNode[] = [
        {
          id: 'parent',
          type: 'coralGroup',
          position: { x: 0, y: 0 },
          data: { label: 'Group', nodeType: 'group', isGroup: true },
        },
        {
          id: 'child',
          type: 'coralService',
          position: { x: 0, y: 0 },
          parentId: 'parent',
          data: { label: 'Child', nodeType: 'service' },
        },
      ];

      const result = await layoutFlowNodes(nodes, []);

      expect(result[0].position).toBeDefined();
      expect(result[1].position).toBeDefined();
    });

    it('respects layout options', async () => {
      const nodes: CoralNode[] = [
        {
          id: 'a',
          type: 'coralService',
          position: { x: 0, y: 0 },
          data: { label: 'A', nodeType: 'service' },
        },
        {
          id: 'b',
          type: 'coralService',
          position: { x: 0, y: 0 },
          data: { label: 'B', nodeType: 'service' },
        },
      ];

      const edges: CoralEdge[] = [{ id: 'e1', source: 'a', target: 'b' }];

      const resultRight = await layoutFlowNodes(nodes, edges, { direction: 'RIGHT' });

      // With RIGHT direction, horizontal delta should be greater
      const deltaX = Math.abs(resultRight[0].position.x - resultRight[1].position.x);
      const deltaY = Math.abs(resultRight[0].position.y - resultRight[1].position.y);

      expect(deltaX).toBeGreaterThan(deltaY);
    });
  });
});
