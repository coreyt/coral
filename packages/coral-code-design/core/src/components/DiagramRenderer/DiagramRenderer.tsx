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
  codeSymbols,
  type SymbolNodeData,
} from '@coral/viz';
import type { GraphIR, InspectorNodeData } from '../../types';

// Node types for React Flow
const nodeTypes = {
  symbol: SymbolNode,
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
  showMiniMap = true,
  showControls = true,
  showBackground = true,
}: DiagramRendererProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isLayouting, setIsLayouting] = useState(false);

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

        // Apply ELK layout - returns array of nodes directly
        const laidOutNodes = await layoutFlowNodes(typedNodes, flowEdges);

        setNodes(laidOutNodes as Node[]);
        setEdges(flowEdges as Edge[]);
      } catch (err) {
        console.error('Failed to layout graph:', err);
      } finally {
        setIsLayouting(false);
      }
    };

    layoutGraph();
  }, [graphIR, setNodes, setEdges]);

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
