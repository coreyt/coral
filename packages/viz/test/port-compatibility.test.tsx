/**
 * Port Compatibility Tests (CORAL-REQ-010)
 *
 * Tests for connection validation and port compatibility feedback.
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  validateConnection,
  checkPortDirection,
  checkMaxConnections,
  getEdgeCompatibility,
} from '../src/compatibility/validateConnection';
import { useEdgeCompatibility } from '../src/compatibility/useEdgeCompatibility';
import type {
  ConnectionInfo,
  NodeConnectionInfo,
  ConnectionValidationContext,
  EdgeCompatibility,
  CoralNode,
  CoralEdge,
} from '../src/types';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a test context with flowchart notation
 */
function createFlowchartContext(
  nodes: NodeConnectionInfo[],
  existingEdges: ConnectionValidationContext['existingEdges'] = []
): ConnectionValidationContext {
  const nodeInfo = new Map<string, NodeConnectionInfo>();
  nodes.forEach((n) => nodeInfo.set(n.id, n));
  return {
    notationId: 'flowchart',
    nodeInfo,
    existingEdges,
  };
}

// ============================================================================
// validateConnection Tests
// ============================================================================

describe('validateConnection', () => {
  describe('symbol-to-symbol rules', () => {
    it('allows process to connect to process', () => {
      const context = createFlowchartContext([
        { id: 'node1', symbolId: 'flowchart-process' },
        { id: 'node2', symbolId: 'flowchart-process' },
      ]);
      const connection: ConnectionInfo = {
        sourceNodeId: 'node1',
        targetNodeId: 'node2',
      };

      const result = validateConnection(connection, context);

      expect(result.valid).toBe(true);
      expect(result.hasWarning).toBe(false);
    });

    it('allows process to connect to decision', () => {
      const context = createFlowchartContext([
        { id: 'node1', symbolId: 'flowchart-process' },
        { id: 'node2', symbolId: 'flowchart-decision' },
      ]);
      const connection: ConnectionInfo = {
        sourceNodeId: 'node1',
        targetNodeId: 'node2',
      };

      const result = validateConnection(connection, context);

      expect(result.valid).toBe(true);
    });

    it('allows start terminal to connect to process', () => {
      const context = createFlowchartContext([
        { id: 'start', symbolId: 'flowchart-terminal', variant: 'start' },
        { id: 'process', symbolId: 'flowchart-process' },
      ]);
      const connection: ConnectionInfo = {
        sourceNodeId: 'start',
        targetNodeId: 'process',
      };

      const result = validateConnection(connection, context);

      expect(result.valid).toBe(true);
    });

    it('rejects end terminal as source (no outgoing allowed)', () => {
      const context = createFlowchartContext([
        { id: 'end', symbolId: 'flowchart-terminal', variant: 'end' },
        { id: 'process', symbolId: 'flowchart-process' },
      ]);
      const connection: ConnectionInfo = {
        sourceNodeId: 'end',
        targetNodeId: 'process',
      };

      const result = validateConnection(connection, context);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('symbol-not-allowed');
      expect(result.message).toContain('cannot have outgoing');
    });

    it('rejects start terminal as target (no incoming allowed)', () => {
      const context = createFlowchartContext([
        { id: 'process', symbolId: 'flowchart-process' },
        { id: 'start', symbolId: 'flowchart-terminal', variant: 'start' },
      ]);
      const connection: ConnectionInfo = {
        sourceNodeId: 'process',
        targetNodeId: 'start',
      };

      const result = validateConnection(connection, context);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('symbol-not-allowed');
    });
  });

  describe('self-connection', () => {
    it('rejects self-connections', () => {
      const context = createFlowchartContext([
        { id: 'node1', symbolId: 'flowchart-process' },
      ]);
      const connection: ConnectionInfo = {
        sourceNodeId: 'node1',
        targetNodeId: 'node1',
      };

      const result = validateConnection(connection, context);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('self-connection');
      expect(result.message).toContain('connect to itself');
    });
  });

  describe('unknown nodes', () => {
    it('returns warning for unknown source node', () => {
      const context = createFlowchartContext([
        { id: 'node2', symbolId: 'flowchart-process' },
      ]);
      const connection: ConnectionInfo = {
        sourceNodeId: 'unknown',
        targetNodeId: 'node2',
      };

      const result = validateConnection(connection, context);

      // Should still allow (non-blocking) but with warning
      expect(result.valid).toBe(true);
      expect(result.hasWarning).toBe(true);
      expect(result.message).toContain('Unknown source node');
    });

    it('returns warning for unknown target node', () => {
      const context = createFlowchartContext([
        { id: 'node1', symbolId: 'flowchart-process' },
      ]);
      const connection: ConnectionInfo = {
        sourceNodeId: 'node1',
        targetNodeId: 'unknown',
      };

      const result = validateConnection(connection, context);

      expect(result.valid).toBe(true);
      expect(result.hasWarning).toBe(true);
      expect(result.message).toContain('Unknown target node');
    });
  });

  describe('unknown notation', () => {
    it('returns valid with warning for unknown notation', () => {
      const context: ConnectionValidationContext = {
        notationId: 'unknown-notation',
        nodeInfo: new Map([['node1', { id: 'node1', symbolId: 'process' }]]),
        existingEdges: [],
      };
      const connection: ConnectionInfo = {
        sourceNodeId: 'node1',
        targetNodeId: 'node2',
      };

      const result = validateConnection(connection, context);

      // Unknown notation = no rules = allow but warn
      expect(result.valid).toBe(true);
      expect(result.hasWarning).toBe(true);
    });
  });
});

// ============================================================================
// checkPortDirection Tests
// ============================================================================

describe('checkPortDirection', () => {
  it('allows out port to connect to in port', () => {
    const result = checkPortDirection('out', 'in');

    expect(result.valid).toBe(true);
  });

  it('allows out port to connect to inout port', () => {
    const result = checkPortDirection('out', 'inout');

    expect(result.valid).toBe(true);
  });

  it('allows inout port to connect to in port', () => {
    const result = checkPortDirection('inout', 'in');

    expect(result.valid).toBe(true);
  });

  it('allows inout port to connect to inout port', () => {
    const result = checkPortDirection('inout', 'inout');

    expect(result.valid).toBe(true);
  });

  it('rejects in port as source', () => {
    const result = checkPortDirection('in', 'in');

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('port-direction-mismatch');
    expect(result.message).toContain('cannot be used as source');
  });

  it('rejects out port as target', () => {
    const result = checkPortDirection('out', 'out');

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('port-direction-mismatch');
    expect(result.message).toContain('cannot be used as target');
  });
});

// ============================================================================
// checkMaxConnections Tests
// ============================================================================

describe('checkMaxConnections', () => {
  it('allows connection when under max', () => {
    const existingEdges = [
      { source: 'node1', target: 'node2' },
    ];
    const result = checkMaxConnections(
      'node1',
      'out',
      2, // max 2 outgoing
      existingEdges,
      'source'
    );

    expect(result.valid).toBe(true);
  });

  it('rejects connection when at max', () => {
    const existingEdges = [
      { source: 'node1', target: 'node2' },
      { source: 'node1', target: 'node3' },
    ];
    const result = checkMaxConnections(
      'node1',
      'out',
      2, // max 2 outgoing
      existingEdges,
      'source'
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('max-connections-exceeded');
    expect(result.message).toContain('maximum');
  });

  it('allows unlimited when maxConnections is undefined', () => {
    const existingEdges = Array(100).fill(0).map((_, i) => ({
      source: 'node1',
      target: `node${i + 2}`,
    }));
    const result = checkMaxConnections(
      'node1',
      'out',
      undefined, // unlimited
      existingEdges,
      'source'
    );

    expect(result.valid).toBe(true);
  });

  it('checks incoming connections correctly', () => {
    const existingEdges = [
      { source: 'node2', target: 'node1' },
      { source: 'node3', target: 'node1' },
    ];
    const result = checkMaxConnections(
      'node1',
      'in',
      2, // max 2 incoming
      existingEdges,
      'target'
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('max-connections-exceeded');
  });
});

// ============================================================================
// getEdgeCompatibility Tests
// ============================================================================

describe('getEdgeCompatibility', () => {
  it('returns compatible status for valid edges', () => {
    const context = createFlowchartContext([
      { id: 'node1', symbolId: 'flowchart-process' },
      { id: 'node2', symbolId: 'flowchart-process' },
    ]);
    const edges = [
      { id: 'edge1', source: 'node1', target: 'node2' },
    ];

    const result = getEdgeCompatibility(edges, context);

    expect(result).toHaveLength(1);
    expect(result[0].edgeId).toBe('edge1');
    expect(result[0].status).toBe('compatible');
    expect(result[0].validation.valid).toBe(true);
  });

  it('returns incompatible status for invalid edges', () => {
    const context = createFlowchartContext([
      { id: 'end', symbolId: 'flowchart-terminal', variant: 'end' },
      { id: 'process', symbolId: 'flowchart-process' },
    ]);
    const edges = [
      { id: 'edge1', source: 'end', target: 'process' },
    ];

    const result = getEdgeCompatibility(edges, context);

    expect(result).toHaveLength(1);
    expect(result[0].edgeId).toBe('edge1');
    expect(result[0].status).toBe('incompatible');
    expect(result[0].validation.valid).toBe(false);
  });

  it('returns warning status for edges with warnings', () => {
    const context = createFlowchartContext([
      { id: 'node1', symbolId: 'flowchart-process' },
    ]);
    const edges = [
      { id: 'edge1', source: 'node1', target: 'unknown-node' },
    ];

    const result = getEdgeCompatibility(edges, context);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('warning');
  });

  it('handles multiple edges', () => {
    const context = createFlowchartContext([
      { id: 'start', symbolId: 'flowchart-terminal', variant: 'start' },
      { id: 'process', symbolId: 'flowchart-process' },
      { id: 'end', symbolId: 'flowchart-terminal', variant: 'end' },
    ]);
    const edges = [
      { id: 'edge1', source: 'start', target: 'process' },
      { id: 'edge2', source: 'process', target: 'end' },
    ];

    const result = getEdgeCompatibility(edges, context);

    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('compatible');
    expect(result[1].status).toBe('compatible');
  });
});

// ============================================================================
// Integration Tests with Flowchart Notation
// ============================================================================

describe('flowchart notation validation', () => {
  it('enforces decision branching rules', () => {
    const context = createFlowchartContext([
      { id: 'decision', symbolId: 'flowchart-decision' },
      { id: 'process1', symbolId: 'flowchart-process' },
      { id: 'process2', symbolId: 'flowchart-process' },
      { id: 'process3', symbolId: 'flowchart-process' },
      { id: 'process4', symbolId: 'flowchart-process' },
    ], [
      { source: 'decision', target: 'process1' },
      { source: 'decision', target: 'process2' },
      { source: 'decision', target: 'process3' },
    ]);

    // Decision already has 3 edges, max is 3, should reject 4th
    const connection: ConnectionInfo = {
      sourceNodeId: 'decision',
      targetNodeId: 'process4',
    };

    const result = validateConnection(connection, context);

    // maxOutgoing: 3 for decision, so this should be rejected
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('max-connections-exceeded');
  });

  it('allows decision to connect to terminal', () => {
    const context = createFlowchartContext([
      { id: 'decision', symbolId: 'flowchart-decision' },
      { id: 'end', symbolId: 'flowchart-terminal', variant: 'end' },
    ]);
    const connection: ConnectionInfo = {
      sourceNodeId: 'decision',
      targetNodeId: 'end',
    };

    const result = validateConnection(connection, context);

    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// BPMN Notation Tests
// ============================================================================

describe('bpmn notation validation', () => {
  function createBpmnContext(
    nodes: NodeConnectionInfo[],
    existingEdges: ConnectionValidationContext['existingEdges'] = []
  ): ConnectionValidationContext {
    const nodeInfo = new Map<string, NodeConnectionInfo>();
    nodes.forEach((n) => nodeInfo.set(n.id, n));
    return {
      notationId: 'bpmn',
      nodeInfo,
      existingEdges,
    };
  }

  it('allows task to connect to exclusive gateway', () => {
    const context = createBpmnContext([
      { id: 'task', symbolId: 'bpmn-task' },
      { id: 'gateway', symbolId: 'bpmn-gateway-exclusive' },
    ]);
    const connection: ConnectionInfo = {
      sourceNodeId: 'task',
      targetNodeId: 'gateway',
    };

    const result = validateConnection(connection, context);

    expect(result.valid).toBe(true);
  });

  it('allows start event to connect to task', () => {
    const context = createBpmnContext([
      { id: 'start', symbolId: 'bpmn-start-event' },
      { id: 'task', symbolId: 'bpmn-task' },
    ]);
    const connection: ConnectionInfo = {
      sourceNodeId: 'start',
      targetNodeId: 'task',
    };

    const result = validateConnection(connection, context);

    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// ERD Notation Tests
// ============================================================================

describe('erd notation validation', () => {
  function createErdContext(
    nodes: NodeConnectionInfo[],
    existingEdges: ConnectionValidationContext['existingEdges'] = []
  ): ConnectionValidationContext {
    const nodeInfo = new Map<string, NodeConnectionInfo>();
    nodes.forEach((n) => nodeInfo.set(n.id, n));
    return {
      notationId: 'erd',
      nodeInfo,
      existingEdges,
    };
  }

  it('allows entity to connect to relationship', () => {
    const context = createErdContext([
      { id: 'customer', symbolId: 'erd-entity' },
      { id: 'places', symbolId: 'erd-relationship' },
    ]);
    const connection: ConnectionInfo = {
      sourceNodeId: 'customer',
      targetNodeId: 'places',
    };

    const result = validateConnection(connection, context);

    expect(result.valid).toBe(true);
  });

  it('allows relationship to connect to entity', () => {
    const context = createErdContext([
      { id: 'places', symbolId: 'erd-relationship' },
      { id: 'order', symbolId: 'erd-entity' },
    ]);
    const connection: ConnectionInfo = {
      sourceNodeId: 'places',
      targetNodeId: 'order',
    };

    const result = validateConnection(connection, context);

    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// Architecture Notation Tests
// ============================================================================

describe('architecture notation validation', () => {
  function createArchContext(
    nodes: NodeConnectionInfo[],
    existingEdges: ConnectionValidationContext['existingEdges'] = []
  ): ConnectionValidationContext {
    const nodeInfo = new Map<string, NodeConnectionInfo>();
    nodes.forEach((n) => nodeInfo.set(n.id, n));
    return {
      notationId: 'architecture',
      nodeInfo,
      existingEdges,
    };
  }

  it('allows service to connect to service', () => {
    const context = createArchContext([
      { id: 'api', symbolId: 'arch-service' },
      { id: 'auth', symbolId: 'arch-service' },
    ]);
    const connection: ConnectionInfo = {
      sourceNodeId: 'api',
      targetNodeId: 'auth',
    };

    const result = validateConnection(connection, context);

    expect(result.valid).toBe(true);
  });

  it('allows service to connect to database', () => {
    const context = createArchContext([
      { id: 'api', symbolId: 'arch-service' },
      { id: 'db', symbolId: 'arch-database' },
    ]);
    const connection: ConnectionInfo = {
      sourceNodeId: 'api',
      targetNodeId: 'db',
    };

    const result = validateConnection(connection, context);

    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// useEdgeCompatibility Hook Tests
// ============================================================================

describe('useEdgeCompatibility', () => {
  // Helper to create CoralNodes for testing
  function createTestNodes(): CoralNode[] {
    return [
      {
        id: 'start',
        type: 'symbolNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Start',
          nodeType: 'flowchart-terminal',
          symbolId: 'flowchart-terminal',
          properties: { variant: 'start' },
        },
      },
      {
        id: 'process1',
        type: 'symbolNode',
        position: { x: 100, y: 100 },
        data: {
          label: 'Process 1',
          nodeType: 'flowchart-process',
          symbolId: 'flowchart-process',
        },
      },
      {
        id: 'end',
        type: 'symbolNode',
        position: { x: 200, y: 200 },
        data: {
          label: 'End',
          nodeType: 'flowchart-terminal',
          symbolId: 'flowchart-terminal',
          properties: { variant: 'end' },
        },
      },
    ];
  }

  function createTestEdges(): CoralEdge[] {
    return [
      { id: 'edge1', source: 'start', target: 'process1' },
      { id: 'edge2', source: 'process1', target: 'end' },
    ];
  }

  it('returns compatibility info for all edges', () => {
    const nodes = createTestNodes();
    const edges = createTestEdges();

    const { result } = renderHook(() =>
      useEdgeCompatibility({ nodes, edges, notationId: 'flowchart' })
    );

    expect(result.current.edgeCompatibility).toHaveLength(2);
    expect(result.current.edgeCompatibility[0].status).toBe('compatible');
    expect(result.current.edgeCompatibility[1].status).toBe('compatible');
  });

  it('detects incompatible edges', () => {
    const nodes = createTestNodes();
    // Invalid edge: end terminal as source
    const edges: CoralEdge[] = [
      { id: 'invalid', source: 'end', target: 'process1' },
    ];

    const { result } = renderHook(() =>
      useEdgeCompatibility({ nodes, edges, notationId: 'flowchart' })
    );

    expect(result.current.edgeCompatibility).toHaveLength(1);
    expect(result.current.edgeCompatibility[0].status).toBe('incompatible');
  });

  it('provides checkConnection function for drag validation', () => {
    const nodes = createTestNodes();
    const edges = createTestEdges();

    const { result } = renderHook(() =>
      useEdgeCompatibility({ nodes, edges, notationId: 'flowchart' })
    );

    // Valid connection
    const validResult = result.current.checkConnection('start', 'process1');
    expect(validResult.valid).toBe(true);

    // Invalid connection (end terminal as source)
    const invalidResult = result.current.checkConnection('end', 'process1');
    expect(invalidResult.valid).toBe(false);
  });

  it('provides getIncompatibleEdgeIds helper', () => {
    const nodes = createTestNodes();
    const edges: CoralEdge[] = [
      { id: 'valid', source: 'start', target: 'process1' },
      { id: 'invalid', source: 'end', target: 'process1' },
    ];

    const { result } = renderHook(() =>
      useEdgeCompatibility({ nodes, edges, notationId: 'flowchart' })
    );

    const incompatibleIds = result.current.getIncompatibleEdgeIds();
    expect(incompatibleIds).toEqual(['invalid']);
  });

  it('provides getEdgeStatus helper', () => {
    const nodes = createTestNodes();
    const edges = createTestEdges();

    const { result } = renderHook(() =>
      useEdgeCompatibility({ nodes, edges, notationId: 'flowchart' })
    );

    expect(result.current.getEdgeStatus('edge1')).toBe('compatible');
    expect(result.current.getEdgeStatus('edge2')).toBe('compatible');
    expect(result.current.getEdgeStatus('nonexistent')).toBeUndefined();
  });

  it('updates when nodes change', () => {
    const nodes = createTestNodes();
    const edges = createTestEdges();

    const { result, rerender } = renderHook(
      ({ nodes, edges }) => useEdgeCompatibility({ nodes, edges, notationId: 'flowchart' }),
      { initialProps: { nodes, edges } }
    );

    expect(result.current.edgeCompatibility).toHaveLength(2);

    // Add a new node
    const newNodes = [
      ...nodes,
      {
        id: 'process2',
        type: 'symbolNode',
        position: { x: 300, y: 300 },
        data: { label: 'Process 2', nodeType: 'flowchart-process', symbolId: 'flowchart-process' },
      },
    ];
    const newEdges: CoralEdge[] = [
      ...edges,
      { id: 'edge3', source: 'process1', target: 'process2' },
    ];

    rerender({ nodes: newNodes, edges: newEdges });

    expect(result.current.edgeCompatibility).toHaveLength(3);
  });

  it('handles empty edges gracefully', () => {
    const nodes = createTestNodes();

    const { result } = renderHook(() =>
      useEdgeCompatibility({ nodes, edges: [], notationId: 'flowchart' })
    );

    expect(result.current.edgeCompatibility).toEqual([]);
    expect(result.current.getIncompatibleEdgeIds()).toEqual([]);
  });

  it('handles empty nodes gracefully', () => {
    const edges = createTestEdges();

    const { result } = renderHook(() =>
      useEdgeCompatibility({ nodes: [], edges, notationId: 'flowchart' })
    );

    // Edges should have warnings since nodes are unknown
    expect(result.current.edgeCompatibility).toHaveLength(2);
    expect(result.current.edgeCompatibility[0].status).toBe('warning');
  });
});

// ============================================================================
// getEdgeStyleForStatus Tests
// ============================================================================

import { getEdgeStyleForStatus } from '../src/compatibility/CompatibilityEdge';

describe('getEdgeStyleForStatus', () => {
  it('returns red style for incompatible status', () => {
    const style = getEdgeStyleForStatus('incompatible');

    expect(style.stroke).toBe('#ef4444');
    expect(style.strokeWidth).toBeGreaterThan(1.5);
  });

  it('returns amber style with dashes for warning status', () => {
    const style = getEdgeStyleForStatus('warning');

    expect(style.stroke).toBe('#f59e0b');
    expect(style.strokeDasharray).toBe('5,3');
  });

  it('preserves base style for compatible status', () => {
    const baseStyle = { stroke: '#333', strokeWidth: 2 };
    const style = getEdgeStyleForStatus('compatible', baseStyle);

    expect(style.stroke).toBe('#333');
    expect(style.strokeWidth).toBe(2);
  });

  it('uses default stroke for compatible without base style', () => {
    const style = getEdgeStyleForStatus('compatible');

    expect(style.stroke).toBeDefined();
    expect(style.strokeWidth).toBe(1.5);
  });

  it('handles undefined status as compatible', () => {
    const style = getEdgeStyleForStatus(undefined);

    expect(style.strokeWidth).toBe(1.5);
  });
});

// ============================================================================
// IncompatibilityTooltip Tests
// ============================================================================

import { render, screen, fireEvent } from '@testing-library/react';
import { IncompatibilityTooltip } from '../src/compatibility/IncompatibilityTooltip';

describe('IncompatibilityTooltip', () => {
  it('renders children', () => {
    render(
      <IncompatibilityTooltip status="compatible">
        <span data-testid="child">Test Child</span>
      </IncompatibilityTooltip>
    );

    expect(screen.getByTestId('child')).toBeDefined();
    expect(screen.getByTestId('child').textContent).toBe('Test Child');
  });

  it('shows tooltip on hover for incompatible status', () => {
    render(
      <IncompatibilityTooltip
        status="incompatible"
        validation={{ valid: false, hasWarning: false, message: 'Test message' }}
      >
        <span data-testid="child">Hover me</span>
      </IncompatibilityTooltip>
    );

    // Hover over the child
    fireEvent.mouseEnter(screen.getByTestId('child').parentElement!);

    // Tooltip should be visible
    expect(screen.getByRole('tooltip')).toBeDefined();
    expect(screen.getByText('Test message')).toBeDefined();
  });

  it('does not show tooltip on hover for compatible status', () => {
    render(
      <IncompatibilityTooltip
        status="compatible"
        validation={{ valid: true, hasWarning: false }}
      >
        <span data-testid="child">Hover me</span>
      </IncompatibilityTooltip>
    );

    // Hover over the child
    fireEvent.mouseEnter(screen.getByTestId('child').parentElement!);

    // Tooltip should not be visible
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hides tooltip on mouse leave', () => {
    render(
      <IncompatibilityTooltip
        status="warning"
        validation={{ valid: true, hasWarning: true, message: 'Warning message' }}
      >
        <span data-testid="child">Hover me</span>
      </IncompatibilityTooltip>
    );

    const container = screen.getByTestId('child').parentElement!;

    // Show tooltip
    fireEvent.mouseEnter(container);
    expect(screen.getByRole('tooltip')).toBeDefined();

    // Hide tooltip
    fireEvent.mouseLeave(container);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('supports controlled visibility via show prop', () => {
    const { rerender } = render(
      <IncompatibilityTooltip
        status="incompatible"
        validation={{ valid: false, hasWarning: false, message: 'Controlled' }}
        show={false}
      >
        <span>Child</span>
      </IncompatibilityTooltip>
    );

    expect(screen.queryByRole('tooltip')).toBeNull();

    rerender(
      <IncompatibilityTooltip
        status="incompatible"
        validation={{ valid: false, hasWarning: false, message: 'Controlled' }}
        show={true}
      >
        <span>Child</span>
      </IncompatibilityTooltip>
    );

    expect(screen.getByRole('tooltip')).toBeDefined();
  });
});
