/**
 * Tests for DiagramRenderer component
 *
 * Note: These tests focus on synchronous states (loading, error, empty).
 * Testing the async layout behavior requires more complex mocking of React Flow
 * and is better suited for integration tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DiagramRenderer, type DiagramRendererProps } from '../src/components/DiagramRenderer/DiagramRenderer';
import type { GraphIR, DiagramType, NotationType } from '../src/types';

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
        label: n.label,
        nodeType: n.type || 'unknown',
        file: n.properties?.file || '',
        startLine: n.properties?.startLine,
        endLine: n.properties?.endLine,
      },
    })),
    edges: graphIR.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
  })),
  layoutFlowNodes: vi.fn().mockImplementation(async (nodes) =>
    nodes.map((n: any, i: number) => ({
      ...n,
      position: { x: i * 200, y: i * 100 },
    }))
  ),
  SymbolNode: vi.fn().mockImplementation(() => null),
  codeSymbols: {},
  getNotation: vi.fn().mockReturnValue({ id: 'code', name: 'Code' }),
  notationRegistry: {
    get: vi.fn().mockReturnValue({ id: 'code', name: 'Code' }),
    getAll: vi.fn().mockReturnValue([]),
    has: vi.fn().mockReturnValue(true),
    validate: vi.fn().mockReturnValue([]),
  },
}));

// Track ReactFlow props for testing callbacks
let reactFlowProps: any = {};

// Storage for simulated state
let mockNodes: any[] = [];
let mockEdges: any[] = [];

// Mock ReactFlow to capture and test callbacks
vi.mock('reactflow', () => ({
  default: vi.fn().mockImplementation((props) => {
    reactFlowProps = props;
    return (
      <div data-testid="react-flow">
        {/* Render clickable nodes for testing */}
        {props.nodes?.map((node: any) => (
          <div
            key={node.id}
            data-testid={`node-${node.id}`}
            onDoubleClick={() => props.onNodeDoubleClick?.(null, node)}
          >
            {node.data?.label}
          </div>
        ))}
      </div>
    );
  }),
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  useNodesState: vi.fn().mockImplementation(() => {
    const setNodes = vi.fn().mockImplementation((newNodes) => {
      mockNodes = typeof newNodes === 'function' ? newNodes(mockNodes) : newNodes;
    });
    return [mockNodes, setNodes, vi.fn()];
  }),
  useEdgesState: vi.fn().mockImplementation(() => {
    const setEdges = vi.fn().mockImplementation((newEdges) => {
      mockEdges = typeof newEdges === 'function' ? newEdges(mockEdges) : newEdges;
    });
    return [mockEdges, setEdges, vi.fn()];
  }),
}));

const mockGraphIR: GraphIR = {
  version: '1.0.0',
  id: 'test-graph',
  nodes: [
    {
      id: 'node1',
      type: 'module',
      label: 'Module A',
      properties: { file: 'src/moduleA.ts', startLine: 1, endLine: 50 }
    },
    {
      id: 'node2',
      type: 'module',
      label: 'Module B',
      properties: { file: 'src/moduleB.ts', startLine: 1, endLine: 30 }
    },
    {
      id: 'node3',
      type: 'service',
      label: 'Service C',
      properties: { file: 'src/serviceC.ts', startLine: 10, endLine: 100 }
    },
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
    reactFlowProps = {};
    // Reset mock state - pre-populate with nodes so component doesn't show empty state
    mockNodes = [
      { id: 'node1', type: 'symbol', position: { x: 0, y: 0 }, data: { label: 'Module A', nodeType: 'module' } },
      { id: 'node2', type: 'symbol', position: { x: 200, y: 100 }, data: { label: 'Module B', nodeType: 'module' } },
    ];
    mockEdges = [
      { id: 'edge1', source: 'node1', target: 'node2' },
    ];
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
      mockNodes = []; // Reset for empty state test
      renderDiagramRenderer({ graphIR: null, isLoading: false, error: null });
      expect(screen.getByText(/no diagram/i)).toBeInTheDocument();
    });

    it('should show helpful message in empty state', () => {
      mockNodes = []; // Reset for empty state test
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

  // ============================================================================
  // Issue #8: New tests for double-click navigation
  // ============================================================================

  describe('node double-click navigation', () => {
    it('should call onNodeDoubleClick with node data when double-clicked', async () => {
      const onNodeDoubleClick = vi.fn();

      renderDiagramRenderer({
        graphIR: mockGraphIR,
        isLoading: false,
        onNodeDoubleClick,
      });

      // Wait for layout to complete
      await vi.waitFor(() => {
        expect(reactFlowProps.onNodeDoubleClick).toBeDefined();
      });

      // Simulate double-click on a node
      const mockNode = {
        id: 'node1',
        data: {
          symbolId: 'node1',
          name: 'Module A',
          label: 'Module A',
          nodeType: 'module',
          file: 'src/moduleA.ts',
          startLine: 1,
          endLine: 50,
        },
      };

      reactFlowProps.onNodeDoubleClick(null, mockNode);

      expect(onNodeDoubleClick).toHaveBeenCalledWith({
        symbolId: 'node1',
        name: 'Module A',
        type: 'module',
        file: 'src/moduleA.ts',
        startLine: 1,
        endLine: 50,
      });
    });

    it('should not error when onNodeDoubleClick is not provided', async () => {
      renderDiagramRenderer({
        graphIR: mockGraphIR,
        isLoading: false,
        // No onNodeDoubleClick provided
      });

      await vi.waitFor(() => {
        expect(reactFlowProps.onNodeDoubleClick).toBeDefined();
      });

      // Should not throw
      expect(() => {
        reactFlowProps.onNodeDoubleClick?.(null, { id: 'node1', data: {} });
      }).not.toThrow();
    });
  });

  // ============================================================================
  // Issue #8: New tests for diagram type support
  // ============================================================================

  describe('diagram type support', () => {
    it('should accept diagramType prop', () => {
      expect(() => {
        renderDiagramRenderer({
          graphIR: mockGraphIR,
          isLoading: false,
          diagramType: 'call-graph',
        });
      }).not.toThrow();
    });

    it('should apply RIGHT direction layout for call-graph type', async () => {
      const { layoutFlowNodes } = await import('@coral/viz');

      renderDiagramRenderer({
        graphIR: mockGraphIR,
        isLoading: false,
        diagramType: 'call-graph',
      });

      await vi.waitFor(() => {
        expect(layoutFlowNodes).toHaveBeenCalled();
      });

      // Check that layout was called with direction option
      const callArgs = (layoutFlowNodes as any).mock.calls[0];
      expect(callArgs[2]?.direction).toBe('RIGHT');
    });

    it('should apply DOWN direction layout for inheritance-tree type', async () => {
      const { layoutFlowNodes } = await import('@coral/viz');

      renderDiagramRenderer({
        graphIR: mockGraphIR,
        isLoading: false,
        diagramType: 'inheritance-tree',
      });

      await vi.waitFor(() => {
        expect(layoutFlowNodes).toHaveBeenCalled();
      });

      const callArgs = (layoutFlowNodes as any).mock.calls[0];
      expect(callArgs[2]?.direction).toBe('DOWN');
    });

    it('should default to DOWN direction for module-graph', async () => {
      const { layoutFlowNodes } = await import('@coral/viz');

      renderDiagramRenderer({
        graphIR: mockGraphIR,
        isLoading: false,
        diagramType: 'module-graph',
      });

      await vi.waitFor(() => {
        expect(layoutFlowNodes).toHaveBeenCalled();
      });

      const callArgs = (layoutFlowNodes as any).mock.calls[0];
      expect(callArgs[2]?.direction).toBe('DOWN');
    });
  });

  // ============================================================================
  // Issue #8: New tests for notation switching
  // ============================================================================

  describe('notation switching', () => {
    it('should accept notation prop', () => {
      expect(() => {
        renderDiagramRenderer({
          graphIR: mockGraphIR,
          isLoading: false,
          notation: 'code',
        });
      }).not.toThrow();
    });

    it('should use code notation for call-graph diagram type', async () => {
      const { getNotation } = await import('@coral/viz');

      renderDiagramRenderer({
        graphIR: mockGraphIR,
        isLoading: false,
        diagramType: 'call-graph',
      });

      await vi.waitFor(() => {
        expect(getNotation).toHaveBeenCalledWith('code');
      });
    });

    it('should use architecture notation for codebase-overview', async () => {
      const { getNotation } = await import('@coral/viz');

      renderDiagramRenderer({
        graphIR: mockGraphIR,
        isLoading: false,
        diagramType: 'codebase-overview',
      });

      await vi.waitFor(() => {
        expect(getNotation).toHaveBeenCalledWith('architecture');
      });
    });

    it('should allow explicit notation override', async () => {
      const { getNotation } = await import('@coral/viz');

      renderDiagramRenderer({
        graphIR: mockGraphIR,
        isLoading: false,
        diagramType: 'call-graph', // Would normally use 'code'
        notation: 'flowchart', // Explicit override
      });

      await vi.waitFor(() => {
        expect(getNotation).toHaveBeenCalledWith('flowchart');
      });
    });

    it('should call onNotationChange when notation is determined', async () => {
      const onNotationChange = vi.fn();

      renderDiagramRenderer({
        graphIR: mockGraphIR,
        isLoading: false,
        diagramType: 'call-graph',
        onNotationChange,
      });

      await vi.waitFor(() => {
        expect(onNotationChange).toHaveBeenCalledWith('code');
      });
    });
  });

  // ============================================================================
  // Issue #15: Programmatic node selection
  // ============================================================================

  describe('programmatic selection', () => {
    it('should accept selectedSymbolId prop', () => {
      expect(() => {
        renderDiagramRenderer({
          graphIR: mockGraphIR,
          isLoading: false,
          selectedSymbolId: 'node1',
        });
      }).not.toThrow();
    });

    it('should trigger selection effect when selectedSymbolId is provided', async () => {
      const onNodeSelect = vi.fn();

      renderDiagramRenderer({
        graphIR: mockGraphIR,
        isLoading: false,
        selectedSymbolId: 'node1',
        onNodeSelect,
      });

      // The selection effect should call onNodeSelect with the matching node
      await vi.waitFor(() => {
        expect(onNodeSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            symbolId: 'node1',
          })
        );
      });
    });

    it('should call onNodeSelect when selectedSymbolId is set', async () => {
      const onNodeSelect = vi.fn();

      renderDiagramRenderer({
        graphIR: mockGraphIR,
        isLoading: false,
        selectedSymbolId: 'node1',
        onNodeSelect,
      });

      await vi.waitFor(() => {
        expect(onNodeSelect).toHaveBeenCalled();
      });

      // Should be called with node data
      expect(onNodeSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          symbolId: 'node1',
        })
      );
    });

    it('should update selection when selectedSymbolId changes', async () => {
      // This test verifies that changing selectedSymbolId triggers setNodes
      // The mock doesn't fully simulate React state, so we verify the effect runs

      const onNodeSelect = vi.fn();
      const { rerender } = render(
        <DiagramRenderer
          graphIR={mockGraphIR}
          isLoading={false}
          error={null}
          selectedSymbolId="node1"
          onNodeSelect={onNodeSelect}
        />
      );

      await vi.waitFor(() => {
        expect(onNodeSelect).toHaveBeenCalled();
      });

      onNodeSelect.mockClear();

      // Rerender with different selection
      rerender(
        <DiagramRenderer
          graphIR={mockGraphIR}
          isLoading={false}
          error={null}
          selectedSymbolId="node2"
          onNodeSelect={onNodeSelect}
        />
      );

      // onNodeSelect should be called for the new selection
      await vi.waitFor(() => {
        expect(onNodeSelect).toHaveBeenCalled();
      });
    });

    it('should clear selection when selectedSymbolId is null', async () => {
      const onNodeSelect = vi.fn();

      const { rerender } = render(
        <DiagramRenderer
          graphIR={mockGraphIR}
          isLoading={false}
          error={null}
          selectedSymbolId="node1"
          onNodeSelect={onNodeSelect}
        />
      );

      await vi.waitFor(() => {
        expect(onNodeSelect).toHaveBeenCalled();
      });

      onNodeSelect.mockClear();

      // Rerender with null selection
      rerender(
        <DiagramRenderer
          graphIR={mockGraphIR}
          isLoading={false}
          error={null}
          selectedSymbolId={null}
          onNodeSelect={onNodeSelect}
        />
      );

      // onNodeSelect should be called with null for clearing
      await vi.waitFor(() => {
        expect(onNodeSelect).toHaveBeenCalledWith(null);
      });
    });
  });
});
