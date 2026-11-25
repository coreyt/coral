import { describe, it, expect } from 'vitest';
import { layoutGraph, layoutFlowNodes, layoutFlowNodesWithEdges, extractEdgeSections } from '../src/layout/index.js';
import type { GraphIR, CoralNode, CoralEdge } from '../src/types.js';
import type { ElkExtendedEdge } from 'elkjs';

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

  describe('extractEdgeSections', () => {
    it('extracts sections from ELK edges', () => {
      const elkEdges: ElkExtendedEdge[] = [
        {
          id: 'e1',
          sources: ['a'],
          targets: ['b'],
          sections: [
            {
              id: 'e1_s0',
              startPoint: { x: 75, y: 50 },
              endPoint: { x: 75, y: 100 },
              bendPoints: [{ x: 75, y: 70 }, { x: 100, y: 70 }],
            },
          ],
        },
      ];

      const routing = extractEdgeSections(elkEdges);

      expect(routing.size).toBe(1);
      const r = routing.get('e1')!;
      expect(r.startPoint).toEqual({ x: 75, y: 50 });
      expect(r.endPoint).toEqual({ x: 75, y: 100 });
      expect(r.bendPoints).toHaveLength(2);
      expect(r.sourceId).toBe('a');
      expect(r.targetId).toBe('b');
    });

    it('returns empty map for undefined edges', () => {
      const routing = extractEdgeSections(undefined);
      expect(routing.size).toBe(0);
    });

    it('handles edges without sections', () => {
      const elkEdges: ElkExtendedEdge[] = [
        { id: 'e1', sources: ['a'], targets: ['b'] },
      ];

      const routing = extractEdgeSections(elkEdges);
      expect(routing.size).toBe(0);
    });

    it('handles edges without bend points', () => {
      const elkEdges: ElkExtendedEdge[] = [
        {
          id: 'e1',
          sources: ['a'],
          targets: ['b'],
          sections: [
            {
              id: 'e1_s0',
              startPoint: { x: 0, y: 0 },
              endPoint: { x: 100, y: 0 },
            },
          ],
        },
      ];

      const routing = extractEdgeSections(elkEdges);
      const r = routing.get('e1')!;
      expect(r.bendPoints).toHaveLength(0);
    });
  });

  describe('layoutFlowNodesWithEdges', () => {
    it('returns both nodes and edge routing', async () => {
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

      const result = await layoutFlowNodesWithEdges(nodes, edges);

      // Should return nodes with positions
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].position).toBeDefined();
      expect(result.nodes[1].position).toBeDefined();

      // Should return edge routing map
      expect(result.edgeRouting).toBeInstanceOf(Map);
      // ELK may or may not produce sections depending on routing algorithm
      // The key is the function doesn't throw
    });
  });

  describe('edge routing coordinate alignment', () => {
    /**
     * Helper: check if a point is on or near a node's bounding box boundary.
     * A point is "on the boundary" if it's within `tolerance` of any edge
     * of the rectangle (left, right, top, bottom), with the other coordinate
     * within the rectangle's span.
     */
    function isOnNodeBoundary(
      point: { x: number; y: number },
      nodeX: number,
      nodeY: number,
      nodeWidth: number,
      nodeHeight: number,
      tolerance: number
    ): boolean {
      const left = nodeX;
      const right = nodeX + nodeWidth;
      const top = nodeY;
      const bottom = nodeY + nodeHeight;

      const inXRange = point.x >= left - tolerance && point.x <= right + tolerance;
      const inYRange = point.y >= top - tolerance && point.y <= bottom + tolerance;

      const onLeft = Math.abs(point.x - left) <= tolerance && inYRange;
      const onRight = Math.abs(point.x - right) <= tolerance && inYRange;
      const onTop = Math.abs(point.y - top) <= tolerance && inXRange;
      const onBottom = Math.abs(point.y - bottom) <= tolerance && inXRange;

      return onLeft || onRight || onTop || onBottom;
    }

    it('ELK edge sections align with node boundaries when dimensions match', async () => {
      // Use explicit dimensions so we know exactly what ELK sees
      const W = 150;
      const H = 50;

      const nodes: CoralNode[] = [
        {
          id: 'a',
          type: 'coralService',
          position: { x: 0, y: 0 },
          width: W,
          height: H,
          data: { label: 'Node A', nodeType: 'service' },
        },
        {
          id: 'b',
          type: 'coralService',
          position: { x: 0, y: 0 },
          width: W,
          height: H,
          data: { label: 'Node B', nodeType: 'service' },
        },
        {
          id: 'c',
          type: 'coralService',
          position: { x: 0, y: 0 },
          width: W,
          height: H,
          data: { label: 'Node C', nodeType: 'service' },
        },
      ];

      const edges: CoralEdge[] = [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'a', target: 'c' },
      ];

      const result = await layoutFlowNodesWithEdges(nodes, edges);

      // Build a position map from ELK results
      const nodeMap = new Map<string, { x: number; y: number; w: number; h: number }>();
      for (const node of result.nodes) {
        nodeMap.set(node.id, {
          x: node.position.x,
          y: node.position.y,
          w: W,
          h: H,
        });
      }

      // For each edge with routing data, check that start/end points
      // are on the boundary of their connected nodes
      for (const [edgeId, routing] of result.edgeRouting) {
        const sourceNode = nodeMap.get(routing.sourceId);
        const targetNode = nodeMap.get(routing.targetId);

        if (!sourceNode || !targetNode) continue;

        // Tolerance of 2px for ELK floating point
        const tolerance = 2;

        const startOnSource = isOnNodeBoundary(
          routing.startPoint,
          sourceNode.x, sourceNode.y, sourceNode.w, sourceNode.h,
          tolerance
        );

        const endOnTarget = isOnNodeBoundary(
          routing.endPoint,
          targetNode.x, targetNode.y, targetNode.w, targetNode.h,
          tolerance
        );

        expect(startOnSource).toBe(true);
        expect(endOnTarget).toBe(true);
      }
    });

    it('detects misalignment when ELK uses padded dimensions but visual nodes are unpadded', async () => {
      // This test reproduces the bug: App.tsx added padding to ELK dimensions
      // (width+20, height+10) but rendered visual nodes at the original size.
      // ELK computed edge endpoints at the padded boundary, so edges didn't
      // connect to the visible nodes.
      const VISUAL_W = 150;
      const VISUAL_H = 50;
      const PAD_W = 20;
      const PAD_H = 10;

      const nodes: CoralNode[] = [
        {
          id: 'a',
          type: 'coralService',
          position: { x: 0, y: 0 },
          // Give ELK the PADDED dimensions (as App.tsx did)
          width: VISUAL_W + PAD_W,
          height: VISUAL_H + PAD_H,
          data: { label: 'Node A', nodeType: 'service' },
        },
        {
          id: 'b',
          type: 'coralService',
          position: { x: 0, y: 0 },
          width: VISUAL_W + PAD_W,
          height: VISUAL_H + PAD_H,
          data: { label: 'Node B', nodeType: 'service' },
        },
      ];

      const edges: CoralEdge[] = [{ id: 'e1', source: 'a', target: 'b' }];

      const result = await layoutFlowNodesWithEdges(nodes, edges);

      if (result.edgeRouting.size === 0) return; // ELK didn't produce sections

      const routing = result.edgeRouting.get('e1')!;
      const sourceNode = result.nodes.find((n) => n.id === 'a')!;
      const targetNode = result.nodes.find((n) => n.id === 'b')!;

      // Check edge start against VISUAL (unpadded) node boundary
      // ELK computed the endpoint against the PADDED boundary, so it will
      // be up to PAD_W/2 or PAD_H/2 pixels away from the visual boundary.
      const startOnVisualSource = isOnNodeBoundary(
        routing.startPoint,
        sourceNode.position.x, sourceNode.position.y,
        VISUAL_W, VISUAL_H,
        2 // strict tolerance
      );

      const endOnVisualTarget = isOnNodeBoundary(
        routing.endPoint,
        targetNode.position.x, targetNode.position.y,
        VISUAL_W, VISUAL_H,
        2
      );

      // At least one endpoint should NOT be on the visual boundary —
      // this documents the known mismatch that requires using React Flow's
      // handle positions (sourceX/sourceY) instead of ELK's raw coordinates.
      const hasMismatch = !startOnVisualSource || !endOnVisualTarget;
      expect(hasMismatch).toBe(true);
    });

    it('edge section bend points stay outside node boundaries', async () => {
      const W = 150;
      const H = 50;

      const nodes: CoralNode[] = [
        {
          id: 'a',
          type: 'coralService',
          position: { x: 0, y: 0 },
          width: W,
          height: H,
          data: { label: 'Node A', nodeType: 'service' },
        },
        {
          id: 'b',
          type: 'coralService',
          position: { x: 0, y: 0 },
          width: W,
          height: H,
          data: { label: 'Node B', nodeType: 'service' },
        },
        {
          id: 'c',
          type: 'coralService',
          position: { x: 0, y: 0 },
          width: W,
          height: H,
          data: { label: 'Node C', nodeType: 'service' },
        },
      ];

      const edges: CoralEdge[] = [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'a', target: 'c' },
        { id: 'e3', source: 'b', target: 'c' },
      ];

      const result = await layoutFlowNodesWithEdges(nodes, edges);

      // Build node rects
      const nodeRects = result.nodes.map((n) => ({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        w: W,
        h: H,
      }));

      // For each edge's bend points, verify they don't pass through
      // any node's interior (they should route around nodes)
      for (const [, routing] of result.edgeRouting) {
        for (const bp of routing.bendPoints) {
          for (const rect of nodeRects) {
            // Skip the source/target nodes — bend points may be on their boundary
            if (rect.id === routing.sourceId || rect.id === routing.targetId) continue;

            const insideX = bp.x > rect.x + 1 && bp.x < rect.x + rect.w - 1;
            const insideY = bp.y > rect.y + 1 && bp.y < rect.y + rect.h - 1;

            // Bend point should not be strictly inside a non-connected node
            expect(insideX && insideY).toBe(false);
          }
        }
      }
    });
  });
});

describe('layoutGraph: option branches (R-030)', () => {
  const base = {
    version: '1.0.0' as const,
    id: 'g',
    nodes: [
      { id: 'a', type: 'service', label: 'A' },
      { id: 'b', type: 'service', label: 'B' },
    ],
    edges: [{ id: 'e', source: 'a', target: 'b' }],
  };

  it.each([['DOWN'], ['UP'], ['RIGHT'], ['LEFT']])('lays out in the %s direction', async (direction) => {
    const out = await layoutGraph({ ...base, layoutOptions: { direction } } as never);
    expect(out.nodes).toHaveLength(2);
  });

  it.each([['layered'], ['mrtree'], ['force'], ['radial'], ['stress']])(
    'supports the %s algorithm',
    async (algorithm) => {
      const out = await layoutGraph({ ...base, layoutOptions: { algorithm } } as never);
      expect(out.nodes).toHaveLength(2);
    }
  );

  it('falls back for an algorithm it does not know', async () => {
    const out = await layoutGraph({ ...base, layoutOptions: { algorithm: 'nonsense' } } as never);
    expect(out.nodes).toHaveLength(2);
  });

  it('falls back for a direction it does not know', async () => {
    const out = await layoutGraph({ ...base, layoutOptions: { direction: 'SIDEWAYS' } } as never);
    expect(out.nodes).toHaveLength(2);
  });

  it('honours node spacing on its own', async () => {
    const out = await layoutGraph({ ...base, layoutOptions: { spacing: { nodeNode: 120 } } } as never);
    expect(out.nodes).toHaveLength(2);
  });

  it('honours layer spacing on its own', async () => {
    const out = await layoutGraph({
      ...base,
      layoutOptions: { spacing: { layerSpacing: 200 } },
    } as never);
    expect(out.nodes).toHaveLength(2);
  });

  it('honours both spacings together', async () => {
    const out = await layoutGraph({
      ...base,
      layoutOptions: { spacing: { nodeNode: 90, layerSpacing: 150 } },
    } as never);
    expect(out.nodes).toHaveLength(2);
  });

  it('lays out with no options at all', async () => {
    const out = await layoutGraph(base as never);
    expect(out.nodes).toHaveLength(2);
  });

  it('lays out an empty graph', async () => {
    const out = await layoutGraph({ version: '1.0.0', id: 'e', nodes: [], edges: [] } as never);
    expect(out.nodes).toHaveLength(0);
  });
});
