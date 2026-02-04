/**
 * Tests for DiagramRenderer component
 *
 * Note: These tests focus on synchronous states (loading, error, empty).
 * Testing the async layout behavior requires more complex mocking of React Flow
 * and is better suited for integration tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiagramRenderer, type DiagramRendererProps } from '../src/components/DiagramRenderer/DiagramRenderer';
import type { GraphIR } from '../src/types';

// Mock @coral/viz imports to avoid actual layout
vi.mock('@coral/viz', () => ({
  convertGraphToFlow: vi.fn().mockImplementation((graphIR: GraphIR) => ({
    nodes: graphIR.nodes.map(n => ({
      id: n.id,
      type: 'symbol',
      position: { x: 0, y: 0 },
      data: {
        symbolId: n.id,
        name: n.label,
        type: n.type || 'unknown',
      },
    })),
    edges: graphIR.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
  })),
  layoutFlowNodes: vi.fn().mockImplementation(async (nodes, edges) => ({
    nodes: nodes.map((n: any, i: number) => ({
      ...n,
      position: { x: i * 200, y: i * 100 },
    })),
    edges,
  })),
  SymbolNode: vi.fn().mockImplementation(() => null),
  codeSymbols: {},
}));

// Mock ReactFlow to avoid DOM complexity
vi.mock('reactflow', () => ({
  default: vi.fn().mockImplementation(() => <div data-testid="react-flow" />),
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  useNodesState: vi.fn().mockReturnValue([[], vi.fn(), vi.fn()]),
  useEdgesState: vi.fn().mockReturnValue([[], vi.fn(), vi.fn()]),
}));

const mockGraphIR: GraphIR = {
  nodes: [
    { id: 'node1', label: 'Module A', type: 'module' },
    { id: 'node2', label: 'Module B', type: 'module' },
    { id: 'node3', label: 'Service C', type: 'service' },
  ],
  edges: [
    { id: 'edge1', source: 'node1', target: 'node2', label: 'imports' },
    { id: 'edge2', source: 'node2', target: 'node3', label: 'calls' },
  ],
};

function renderDiagramRenderer(props: Partial<DiagramRendererProps> = {}) {
  const defaultProps: DiagramRendererProps = {
    graphIR: mockGraphIR,
    isLoading: false,
    error: null,
    onNodeSelect: vi.fn(),
  };

  return render(<DiagramRenderer {...defaultProps} {...props} />);
}

describe('DiagramRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('should show loading indicator when isLoading is true', () => {
      renderDiagramRenderer({ isLoading: true });
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should show error message when error prop is provided', () => {
      renderDiagramRenderer({
        graphIR: null,
        isLoading: false,
        error: 'Failed to load diagram'
      });
      expect(screen.getByText(/failed to load diagram/i)).toBeInTheDocument();
    });

    it('should show warning icon with error', () => {
      renderDiagramRenderer({
        graphIR: null,
        isLoading: false,
        error: 'Connection failed'
      });
      expect(screen.getByText('⚠')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show empty state when graphIR is null and not loading', () => {
      renderDiagramRenderer({ graphIR: null, isLoading: false, error: null });
      expect(screen.getByText(/no diagram/i)).toBeInTheDocument();
    });

    it('should show helpful message in empty state', () => {
      renderDiagramRenderer({ graphIR: null, isLoading: false, error: null });
      expect(screen.getByText(/connect to armada/i)).toBeInTheDocument();
    });
  });

  describe('priority of states', () => {
    it('should prioritize loading over error', () => {
      renderDiagramRenderer({ isLoading: true, error: 'Some error' });
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
      expect(screen.queryByText(/some error/i)).not.toBeInTheDocument();
    });

    it('should prioritize error over empty when not loading', () => {
      renderDiagramRenderer({
        graphIR: null,
        isLoading: false,
        error: 'Network error'
      });
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
      expect(screen.queryByText(/no diagram/i)).not.toBeInTheDocument();
    });
  });

  describe('convertGraphToFlow integration', () => {
    it('should call convertGraphToFlow with graphIR', async () => {
      const { convertGraphToFlow } = await import('@coral/viz');

      renderDiagramRenderer({ graphIR: mockGraphIR, isLoading: false });

      // The function is called as part of the useEffect
      expect(convertGraphToFlow).toHaveBeenCalled();
    });
  });
});
