/**
 * DiagramRenderer Component
 *
 * Renders GraphIR data using React Flow and @coral/viz components.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnSelectionChangeParams,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  convertGraphToFlow,
  layoutFlowNodes,
  SymbolNode,
  getNotation,
  type SymbolNodeData,
} from '@coral/viz';
import type { GraphIR, InspectorNodeData, DiagramType, NotationType } from '../../types';

// Node types for React Flow
const nodeTypes = {
  symbol: SymbolNode,
};

/**
 * Map diagram types to their default notations
 */
const DIAGRAM_TYPE_TO_NOTATION: Record<DiagramType, NotationType> = {
  'codebase-overview': 'architecture',
  'module-graph': 'architecture',
  'component-detail': 'code',
  'call-graph': 'code',
  'dependency-graph': 'code',
  'inheritance-tree': 'code',
  'data-flow': 'flowchart',
  'impact-analysis': 'code',
  'custom': 'code',
};

/**
 * Map diagram types to their preferred layout directions
 */
const DIAGRAM_TYPE_TO_DIRECTION: Record<DiagramType, 'DOWN' | 'UP' | 'LEFT' | 'RIGHT'> = {
  'codebase-overview': 'DOWN',
  'module-graph': 'DOWN',
  'component-detail': 'DOWN',
  'call-graph': 'RIGHT',
  'dependency-graph': 'DOWN',
  'inheritance-tree': 'DOWN',
  'data-flow': 'RIGHT',
  'impact-analysis': 'RIGHT',
  'custom': 'DOWN',
};

export interface DiagramRendererProps {
  /** GraphIR data to render */
  graphIR: GraphIR | null;

  /** Whether data is currently loading */
  isLoading: boolean;

  /** Error message if any */
  error: string | null;

  /** Called when a node is selected */
  onNodeSelect?: (nodeData: InspectorNodeData | null) => void;

  /** Called when a node is double-clicked (for navigation) */
  onNodeDoubleClick?: (nodeData: InspectorNodeData) => void;

  /** The type of diagram being rendered */
  diagramType?: DiagramType;

  /** Notation to use for rendering (overrides diagram type default) */
  notation?: NotationType;

  /** Called when the effective notation changes */
  onNotationChange?: (notation: NotationType) => void;

  /** Show mini-map */
  showMiniMap?: boolean;

  /** Show controls */
  showControls?: boolean;

  /** Show background grid */
  showBackground?: boolean;
}

/**
 * Transform GraphIR node to InspectorNodeData
 */
function toInspectorNodeData(node: Node<SymbolNodeData>): InspectorNodeData {
  const data = node.data;
  return {
    symbolId: (data.symbolId as string) || node.id,
    name: (data.name as string) || data.label || 'Unknown',
    type: data.nodeType || (data.type as string) || 'unknown',
    file: (data.file as string) || '',
    startLine: data.startLine as number | undefined,
    endLine: data.endLine as number | undefined,
    signature: data.signature as string | undefined,
    docstring: data.docstring as string | undefined,
  };
}

export function DiagramRenderer({
  graphIR,
  isLoading,
  error,
  onNodeSelect,
  onNodeDoubleClick,
  diagramType = 'module-graph',
  notation: notationProp,
  onNotationChange,
  showMiniMap = true,
  showControls = true,
  showBackground = true,
}: DiagramRendererProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isLayouting, setIsLayouting] = useState(false);

  // Determine effective notation
  const effectiveNotation = useMemo(() => {
    return notationProp || DIAGRAM_TYPE_TO_NOTATION[diagramType] || 'code';
  }, [notationProp, diagramType]);

  // Get layout direction based on diagram type
  const layoutDirection = useMemo(() => {
    return DIAGRAM_TYPE_TO_DIRECTION[diagramType] || 'DOWN';
  }, [diagramType]);

  // Notify parent of notation changes and load notation definition
  useEffect(() => {
    // Load notation to validate it exists
    getNotation(effectiveNotation);
    onNotationChange?.(effectiveNotation);
  }, [effectiveNotation, onNotationChange]);

  // Convert GraphIR to React Flow nodes/edges and apply layout
  useEffect(() => {
    if (!graphIR) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const layoutGraph = async () => {
      setIsLayouting(true);
      try {
        // Convert GraphIR to React Flow format
        const { nodes: flowNodes, edges: flowEdges } = convertGraphToFlow(graphIR);

        // Mark all nodes as symbol type for proper rendering
        const typedNodes = flowNodes.map(node => ({
          ...node,
          type: 'symbol',
        }));

        // Apply ELK layout with diagram-type-specific options
        const laidOutNodes = await layoutFlowNodes(typedNodes, flowEdges, {
          direction: layoutDirection,
        });

        setNodes(laidOutNodes as Node[]);
        setEdges(flowEdges as Edge[]);
      } catch (err) {
        console.error('Failed to layout graph:', err);
      } finally {
        setIsLayouting(false);
      }
    };

    layoutGraph();
  }, [graphIR, layoutDirection, setNodes, setEdges]);

  // Handle selection changes
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      if (selectedNodes.length > 0) {
        const node = selectedNodes[0] as Node<SymbolNodeData>;
        onNodeSelect?.(toInspectorNodeData(node));
      } else {
        onNodeSelect?.(null);
      }
    },
    [onNodeSelect]
  );

  // Handle node double-click for navigation
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent | null, node: Node<SymbolNodeData>) => {
      if (onNodeDoubleClick) {
        onNodeDoubleClick(toInspectorNodeData(node));
      }
    },
    [onNodeDoubleClick]
  );

  // Loading state
  if (isLoading || isLayouting) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-muted, #666)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⟳</div>
          <div>Loading diagram...</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--error-text, #dc2626)',
          backgroundColor: 'var(--error-bg, #fee2e2)',
        }}
      >
        <div style={{ textAlign: 'center', padding: '16px' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!graphIR || nodes.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-muted, #666)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <div>No diagram to display</div>
          <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>
            Connect to Armada and open a diagram
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={handleSelectionChange}
        onNodeDoubleClick={handleNodeDoubleClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
        }}
      >
        {showBackground && <Background />}
        {showControls && <Controls />}
        {showMiniMap && (
          <MiniMap
            nodeStrokeWidth={3}
            zoomable
            pannable
            style={{
              backgroundColor: 'var(--bg-color, #fff)',
            }}
          />
        )}
      </ReactFlow>
    </div>
  );
}
