import { describe, it, expect } from 'vitest';
import {
  diffGraphs,
  resolvePositions,
  incrementalLayout,
} from '../src/layout/positionStability.js';
import type { DiffableGraph, Position } from '../src/types.js';

describe('Position Stability (CORAL-REQ-013)', () => {
  describe('diffGraphs', () => {
    it('identifies added nodes', () => {
      const oldGraph: DiffableGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'Service A' }],
        edges: [],
      };

      const newGraph: DiffableGraph = {
        nodes: [
          { id: 'a', type: 'service', label: 'Service A' },
          { id: 'b', type: 'service', label: 'Service B' },
        ],
        edges: [],
      };

      const diff = diffGraphs(oldGraph, newGraph);

      expect(diff.added).toEqual(['b']);
      expect(diff.removed).toEqual([]);
      expect(diff.unchanged).toEqual(['a']);
      expect(diff.modified).toEqual([]);
    });

    it('identifies removed nodes', () => {
      const oldGraph: DiffableGraph = {
        nodes: [
          { id: 'a', type: 'service', label: 'Service A' },
          { id: 'b', type: 'service', label: 'Service B' },
        ],
        edges: [],
      };

      const newGraph: DiffableGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'Service A' }],
        edges: [],
      };

      const diff = diffGraphs(oldGraph, newGraph);

      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual(['b']);
      expect(diff.unchanged).toEqual(['a']);
      expect(diff.modified).toEqual([]);
    });

    it('identifies modified nodes (label change)', () => {
      const oldGraph: DiffableGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'Old Label' }],
        edges: [],
      };

      const newGraph: DiffableGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'New Label' }],
        edges: [],
      };

      const diff = diffGraphs(oldGraph, newGraph);

      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual([]);
      expect(diff.unchanged).toEqual([]);
      expect(diff.modified).toEqual(['a']);
    });

    it('identifies modified nodes (type change)', () => {
      const oldGraph: DiffableGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'A' }],
        edges: [],
      };

      const newGraph: DiffableGraph = {
        nodes: [{ id: 'a', type: 'database', label: 'A' }],
        edges: [],
      };

      const diff = diffGraphs(oldGraph, newGraph);

      expect(diff.modified).toEqual(['a']);
      expect(diff.unchanged).toEqual([]);
    });

    it('identifies unchanged nodes', () => {
      const graph: DiffableGraph = {
        nodes: [
          { id: 'a', type: 'service', label: 'Service A' },
          { id: 'b', type: 'database', label: 'DB' },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
      };

      const diff = diffGraphs(graph, graph);

      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual([]);
      expect(diff.modified).toEqual([]);
      expect(diff.unchanged).toContain('a');
      expect(diff.unchanged).toContain('b');
    });

    it('handles complex scenario with add, remove, modify, unchanged', () => {
      const oldGraph: DiffableGraph = {
        nodes: [
          { id: 'keep', type: 'service', label: 'Keep' },
          { id: 'modify', type: 'service', label: 'Old' },
          { id: 'remove', type: 'database', label: 'Remove' },
        ],
        edges: [],
      };

      const newGraph: DiffableGraph = {
        nodes: [
          { id: 'keep', type: 'service', label: 'Keep' },
          { id: 'modify', type: 'service', label: 'New' },
          { id: 'add', type: 'external_api', label: 'Add' },
        ],
        edges: [],
      };

      const diff = diffGraphs(oldGraph, newGraph);

      expect(diff.added).toEqual(['add']);
      expect(diff.removed).toEqual(['remove']);
      expect(diff.modified).toEqual(['modify']);
      expect(diff.unchanged).toEqual(['keep']);
    });

    it('handles empty graphs', () => {
      const emptyGraph: DiffableGraph = { nodes: [], edges: [] };

      const diff = diffGraphs(emptyGraph, emptyGraph);

      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual([]);
      expect(diff.modified).toEqual([]);
      expect(diff.unchanged).toEqual([]);
    });

    it('handles old graph empty (all nodes added)', () => {
      const oldGraph: DiffableGraph = { nodes: [], edges: [] };
      const newGraph: DiffableGraph = {
        nodes: [
          { id: 'a', type: 'service', label: 'A' },
          { id: 'b', type: 'service', label: 'B' },
        ],
        edges: [],
      };

      const diff = diffGraphs(oldGraph, newGraph);

      expect(diff.added).toEqual(['a', 'b']);
      expect(diff.removed).toEqual([]);
    });

    it('handles new graph empty (all nodes removed)', () => {
      const oldGraph: DiffableGraph = {
        nodes: [
          { id: 'a', type: 'service', label: 'A' },
          { id: 'b', type: 'service', label: 'B' },
        ],
        edges: [],
      };
      const newGraph: DiffableGraph = { nodes: [], edges: [] };

      const diff = diffGraphs(oldGraph, newGraph);

      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual(['a', 'b']);
    });
  });

  describe('resolvePositions', () => {
    it('keeps positions for unchanged nodes', () => {
      const oldGraph: DiffableGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'A' }],
        edges: [],
      };
      const newGraph: DiffableGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'A' }],
        edges: [],
      };
      const currentPositions = new Map<string, Position>([
        ['a', { x: 100, y: 200 }],
      ]);

      const result = resolvePositions(oldGraph, newGraph, currentPositions);

      expect(result.positions.get('a')).toEqual({ x: 100, y: 200 });
      expect(result.needsLayout).toEqual([]);
    });

    it('keeps positions for modified nodes (label change)', () => {
      const oldGraph: DiffableGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'Old' }],
        edges: [],
      };
      const newGraph: DiffableGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'New' }],
        edges: [],
      };
      const currentPositions = new Map<string, Position>([
        ['a', { x: 50, y: 75 }],
      ]);

      const result = resolvePositions(oldGraph, newGraph, currentPositions);

      expect(result.positions.get('a')).toEqual({ x: 50, y: 75 });
      expect(result.needsLayout).toEqual([]);
    });

    it('marks new nodes as needing layout', () => {
      const oldGraph: DiffableGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'A' }],
        edges: [],
      };
      const newGraph: DiffableGraph = {
        nodes: [
          { id: 'a', type: 'service', label: 'A' },
          { id: 'b', type: 'service', label: 'B' },
        ],
        edges: [],
      };
      const currentPositions = new Map<string, Position>([
        ['a', { x: 100, y: 200 }],
      ]);

      const result = resolvePositions(oldGraph, newGraph, currentPositions);

      expect(result.positions.get('a')).toEqual({ x: 100, y: 200 });
      expect(result.positions.get('b')).toEqual({ x: 0, y: 0 }); // Placeholder
      expect(result.needsLayout).toEqual(['b']);
    });

    it('does not include removed nodes in result', () => {
      const oldGraph: DiffableGraph = {
        nodes: [
          { id: 'a', type: 'service', label: 'A' },
          { id: 'b', type: 'service', label: 'B' },
        ],
        edges: [],
      };
      const newGraph: DiffableGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'A' }],
        edges: [],
      };
      const currentPositions = new Map<string, Position>([
        ['a', { x: 100, y: 200 }],
        ['b', { x: 300, y: 400 }],
      ]);

      const result = resolvePositions(oldGraph, newGraph, currentPositions);

      expect(result.positions.has('a')).toBe(true);
      expect(result.positions.has('b')).toBe(false);
      expect(result.needsLayout).toEqual([]);
    });

    it('handles nodes without current positions', () => {
      const oldGraph: DiffableGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'A' }],
        edges: [],
      };
      const newGraph: DiffableGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'A' }],
        edges: [],
      };
      const currentPositions = new Map<string, Position>(); // Empty

      const result = resolvePositions(oldGraph, newGraph, currentPositions);

      // Node exists in both graphs but has no position - needs layout
      expect(result.needsLayout).toContain('a');
    });

    it('handles empty old graph (first parse)', () => {
      const oldGraph: DiffableGraph = { nodes: [], edges: [] };
      const newGraph: DiffableGraph = {
        nodes: [
          { id: 'a', type: 'service', label: 'A' },
          { id: 'b', type: 'service', label: 'B' },
        ],
        edges: [],
      };
      const currentPositions = new Map<string, Position>();

      const result = resolvePositions(oldGraph, newGraph, currentPositions);

      expect(result.needsLayout).toEqual(['a', 'b']);
    });
  });

  describe('incrementalLayout', () => {
    it('pins existing nodes and layouts new nodes', async () => {
      const nodes = [
        { id: 'existing', type: 'service', label: 'Existing', width: 100, height: 50 },
        { id: 'new', type: 'service', label: 'New', width: 100, height: 50 },
      ];
      const edges = [{ id: 'e1', source: 'existing', target: 'new' }];
      const pinnedPositions = new Map<string, Position>([
        ['existing', { x: 100, y: 100 }],
      ]);
      const needsLayout = ['new'];

      const result = await incrementalLayout(nodes, edges, pinnedPositions, needsLayout);

      // Existing node should keep its position
      expect(result.get('existing')).toEqual({ x: 100, y: 100 });

      // New node should get a computed position (not 0,0)
      const newPos = result.get('new');
      expect(newPos).toBeDefined();
      // ELK should place it somewhere relative to the existing node
      expect(newPos!.x !== 0 || newPos!.y !== 0).toBe(true);
    });

    it('handles all nodes needing layout (no pins)', async () => {
      const nodes = [
        { id: 'a', type: 'service', label: 'A', width: 100, height: 50 },
        { id: 'b', type: 'service', label: 'B', width: 100, height: 50 },
      ];
      const edges = [{ id: 'e1', source: 'a', target: 'b' }];
      const pinnedPositions = new Map<string, Position>();
      const needsLayout = ['a', 'b'];

      const result = await incrementalLayout(nodes, edges, pinnedPositions, needsLayout);

      // Both nodes should get positions
      expect(result.has('a')).toBe(true);
      expect(result.has('b')).toBe(true);
    });

    it('handles no nodes needing layout (all pinned)', async () => {
      const nodes = [
        { id: 'a', type: 'service', label: 'A', width: 100, height: 50 },
        { id: 'b', type: 'service', label: 'B', width: 100, height: 50 },
      ];
      const edges = [{ id: 'e1', source: 'a', target: 'b' }];
      const pinnedPositions = new Map<string, Position>([
        ['a', { x: 50, y: 50 }],
        ['b', { x: 200, y: 150 }],
      ]);
      const needsLayout: string[] = [];

      const result = await incrementalLayout(nodes, edges, pinnedPositions, needsLayout);

      // Positions should be preserved exactly
      expect(result.get('a')).toEqual({ x: 50, y: 50 });
      expect(result.get('b')).toEqual({ x: 200, y: 150 });
    });

    it('positions new nodes near connected existing nodes', async () => {
      const nodes = [
        { id: 'existing1', type: 'service', label: 'Existing 1', width: 100, height: 50 },
        { id: 'existing2', type: 'service', label: 'Existing 2', width: 100, height: 50 },
        { id: 'newNode', type: 'service', label: 'New', width: 100, height: 50 },
      ];
      // New node connects to existing1
      const edges = [
        { id: 'e1', source: 'existing1', target: 'existing2' },
        { id: 'e2', source: 'existing1', target: 'newNode' },
      ];
      const pinnedPositions = new Map<string, Position>([
        ['existing1', { x: 0, y: 0 }],
        ['existing2', { x: 0, y: 150 }],
      ]);
      const needsLayout = ['newNode'];

      const result = await incrementalLayout(nodes, edges, pinnedPositions, needsLayout);

      const newPos = result.get('newNode');
      expect(newPos).toBeDefined();
      // New node should be positioned by ELK considering the connection to existing1
    });

    it('handles empty nodes array', async () => {
      const result = await incrementalLayout([], [], new Map(), []);
      expect(result.size).toBe(0);
    });
  });
});
