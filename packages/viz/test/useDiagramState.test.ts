/**
 * Tests for useDiagramState hook (CORAL-REQ-013)
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDiagramState, type ParsedGraph } from '../src/layout/useDiagramState.js';

describe('useDiagramState', () => {
  describe('initial state', () => {
    it('starts with empty graph', () => {
      const { result } = renderHook(() => useDiagramState());

      expect(result.current.nodes).toEqual([]);
      expect(result.current.edges).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('setGraph', () => {
    it('updates graph with new nodes and edges', async () => {
      const { result } = renderHook(() => useDiagramState());

      const graph: ParsedGraph = {
        nodes: [
          { id: 'a', type: 'service', label: 'Service A' },
          { id: 'b', type: 'service', label: 'Service B' },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
      };

      await act(async () => {
        await result.current.setGraph(graph);
      });

      expect(result.current.nodes).toHaveLength(2);
      expect(result.current.edges).toHaveLength(1);
    });

    it('preserves positions for unchanged nodes', async () => {
      const { result } = renderHook(() => useDiagramState());

      // Set initial graph
      const graph1: ParsedGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'Service A' }],
        edges: [],
      };

      await act(async () => {
        await result.current.setGraph(graph1);
      });

      // Simulate user dragging the node
      const originalPosition = { ...result.current.nodes[0].position };
      const newPosition = { x: 500, y: 300 };

      act(() => {
        result.current.onNodeDrag('a', newPosition);
      });

      expect(result.current.nodes[0].position).toEqual(newPosition);

      // Update graph with same node but different label
      const graph2: ParsedGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'Service A Updated' }],
        edges: [],
      };

      await act(async () => {
        await result.current.setGraph(graph2);
      });

      // Position should be preserved
      expect(result.current.nodes[0].position).toEqual(newPosition);
      expect(result.current.nodes[0].data.label).toBe('Service A Updated');
    });

    it('layouts new nodes using incremental layout', async () => {
      const { result } = renderHook(() => useDiagramState());

      // Set initial graph with one node
      const graph1: ParsedGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'Service A' }],
        edges: [],
      };

      await act(async () => {
        await result.current.setGraph(graph1);
      });

      const firstNodePosition = result.current.nodes[0].position;

      // Add a second node
      const graph2: ParsedGraph = {
        nodes: [
          { id: 'a', type: 'service', label: 'Service A' },
          { id: 'b', type: 'service', label: 'Service B' },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
      };

      await act(async () => {
        await result.current.setGraph(graph2);
      });

      // First node position should be preserved
      expect(result.current.nodes.find(n => n.id === 'a')?.position).toEqual(firstNodePosition);

      // Second node should have a position (not 0,0)
      const secondNode = result.current.nodes.find(n => n.id === 'b');
      expect(secondNode).toBeDefined();
      expect(secondNode?.position).toBeDefined();
    });

    it('removes nodes that are no longer in the graph', async () => {
      const { result } = renderHook(() => useDiagramState());

      const graph1: ParsedGraph = {
        nodes: [
          { id: 'a', type: 'service', label: 'A' },
          { id: 'b', type: 'service', label: 'B' },
        ],
        edges: [],
      };

      await act(async () => {
        await result.current.setGraph(graph1);
      });

      expect(result.current.nodes).toHaveLength(2);

      // Remove node 'b'
      const graph2: ParsedGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'A' }],
        edges: [],
      };

      await act(async () => {
        await result.current.setGraph(graph2);
      });

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0].id).toBe('a');
    });
  });

  describe('onNodeDrag', () => {
    it('updates node position', async () => {
      const { result } = renderHook(() => useDiagramState());

      const graph: ParsedGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'A' }],
        edges: [],
      };

      await act(async () => {
        await result.current.setGraph(graph);
      });

      act(() => {
        result.current.onNodeDrag('a', { x: 100, y: 200 });
      });

      expect(result.current.nodes[0].position).toEqual({ x: 100, y: 200 });
    });

    it('tracks position source as user-dragged', async () => {
      const { result } = renderHook(() => useDiagramState());

      const graph: ParsedGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'A' }],
        edges: [],
      };

      await act(async () => {
        await result.current.setGraph(graph);
      });

      act(() => {
        result.current.onNodeDrag('a', { x: 100, y: 200 });
      });

      expect(result.current.getPositionSource('a')).toBe('user-dragged');
    });
  });

  describe('reflow', () => {
    it('runs full ELK layout on all nodes', async () => {
      const { result } = renderHook(() => useDiagramState());

      const graph: ParsedGraph = {
        nodes: [
          { id: 'a', type: 'service', label: 'A' },
          { id: 'b', type: 'service', label: 'B' },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
      };

      await act(async () => {
        await result.current.setGraph(graph);
      });

      // Manually move a node
      act(() => {
        result.current.onNodeDrag('a', { x: 1000, y: 1000 });
      });

      const positionBeforeReflow = { ...result.current.nodes[0].position };

      await act(async () => {
        await result.current.reflow();
      });

      // Position should change after reflow
      expect(result.current.nodes[0].position).not.toEqual(positionBeforeReflow);
    });

    it('sets position source to elk-computed after reflow', async () => {
      const { result } = renderHook(() => useDiagramState());

      const graph: ParsedGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'A' }],
        edges: [],
      };

      await act(async () => {
        await result.current.setGraph(graph);
      });

      act(() => {
        result.current.onNodeDrag('a', { x: 100, y: 200 });
      });

      expect(result.current.getPositionSource('a')).toBe('user-dragged');

      await act(async () => {
        await result.current.reflow();
      });

      expect(result.current.getPositionSource('a')).toBe('elk-computed');
    });
  });

  describe('undo/redo', () => {
    it('can undo a drag operation', async () => {
      const { result } = renderHook(() => useDiagramState());

      const graph: ParsedGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'A' }],
        edges: [],
      };

      await act(async () => {
        await result.current.setGraph(graph);
      });

      const originalPosition = { ...result.current.nodes[0].position };

      act(() => {
        result.current.onNodeDrag('a', { x: 500, y: 500 });
        result.current.onDragEnd(); // Mark end of drag to save snapshot
      });

      expect(result.current.nodes[0].position).toEqual({ x: 500, y: 500 });
      expect(result.current.canUndo).toBe(true);

      act(() => {
        result.current.undo();
      });

      expect(result.current.nodes[0].position).toEqual(originalPosition);
    });

    it('can redo an undone operation', async () => {
      const { result } = renderHook(() => useDiagramState());

      const graph: ParsedGraph = {
        nodes: [{ id: 'a', type: 'service', label: 'A' }],
        edges: [],
      };

      await act(async () => {
        await result.current.setGraph(graph);
      });

      act(() => {
        result.current.onNodeDrag('a', { x: 500, y: 500 });
        result.current.onDragEnd();
      });

      act(() => {
        result.current.undo();
      });

      expect(result.current.canRedo).toBe(true);

      act(() => {
        result.current.redo();
      });

      expect(result.current.nodes[0].position).toEqual({ x: 500, y: 500 });
    });

    it('does not trigger reflow during undo', async () => {
      const { result } = renderHook(() => useDiagramState());

      const graph: ParsedGraph = {
        nodes: [
          { id: 'a', type: 'service', label: 'A' },
          { id: 'b', type: 'service', label: 'B' },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
      };

      await act(async () => {
        await result.current.setGraph(graph);
      });

      // Drag node A to a specific position
      act(() => {
        result.current.onNodeDrag('a', { x: 500, y: 500 });
        result.current.onDragEnd();
      });

      // Record B's position
      const nodeB = result.current.nodes.find(n => n.id === 'b');
      const bPositionBeforeUndo = nodeB ? { ...nodeB.position } : { x: 0, y: 0 };

      // Undo
      act(() => {
        result.current.undo();
      });

      // B's position should not have changed (no reflow occurred)
      const nodeBAfter = result.current.nodes.find(n => n.id === 'b');
      expect(nodeBAfter?.position).toEqual(bPositionBeforeUndo);
    });
  });

  describe('setNodePositions', () => {
    it('sets positions from loaded document', async () => {
      const { result } = renderHook(() => useDiagramState());

      const graph: ParsedGraph = {
        nodes: [
          { id: 'a', type: 'service', label: 'A' },
          { id: 'b', type: 'service', label: 'B' },
        ],
        edges: [],
      };

      await act(async () => {
        await result.current.setGraph(graph);
      });

      const loadedPositions = new Map([
        ['a', { x: 100, y: 100 }],
        ['b', { x: 200, y: 200 }],
      ]);

      act(() => {
        result.current.setNodePositions(loadedPositions, 'loaded');
      });

      expect(result.current.nodes.find(n => n.id === 'a')?.position).toEqual({ x: 100, y: 100 });
      expect(result.current.nodes.find(n => n.id === 'b')?.position).toEqual({ x: 200, y: 200 });
      expect(result.current.getPositionSource('a')).toBe('loaded');
      expect(result.current.getPositionSource('b')).toBe('loaded');
    });
  });
});
