/**
 * CoralEditor - Main visual editor component
 *
 * Renders Graph-IR as an interactive diagram using React Flow.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type OnNodesChange,
  type OnEdgesChange,
  type OnSelectionChangeFunc,
  type NodeMouseHandler,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { nodeTypes } from '../components/nodes.js';
import { convertGraphToFlow, convertFlowToGraphNodes, convertFlowToGraphEdges } from './converter.js';
import type {
  GraphIR,
  GraphNode,
  GraphEdge,
  CoralNode,
  CoralEdge,
  EditorConfig,
  EditorCallbacks,
} from '../types.js';

export interface CoralEditorProps {
  /** Graph-IR data to render */
  graph: GraphIR;
  /** Editor configuration */
  config?: EditorConfig;
  /** Callbacks for editor events */
  callbacks?: EditorCallbacks;
  /** CSS class name for the container */
  className?: string;
  /** Inline styles for the container */
  style?: React.CSSProperties;
}

const defaultConfig: EditorConfig = {
  draggable: true,
  connectable: false,
  selectable: true,
  zoomable: true,
  pannable: true,
  showMinimap: true,
  showControls: true,
  fitViewOnLoad: true,
};

/**
 * Main Coral Editor component
 */
export const CoralEditor: React.FC<CoralEditorProps> = ({
  graph,
  config: userConfig,
  callbacks,
  className,
  style,
}) => {
  const config = useMemo(() => ({ ...defaultConfig, ...userConfig }), [userConfig]);

  // Convert Graph-IR to React Flow format
  const initialData = useMemo(() => convertGraphToFlow(graph), [graph]);

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(initialData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData.edges);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);

  // Handle node changes and notify parent
  const handleNodesChange: OnNodesChange<CoralNode> = useCallback(
    (changes) => {
      onNodesChange(changes);

      // Notify parent of changes
      if (callbacks?.onNodesChange) {
        // Get updated nodes after change
        setNodes((currentNodes) => {
          callbacks.onNodesChange?.(currentNodes);
          return currentNodes;
        });
      }
    },
    [onNodesChange, callbacks, setNodes]
  );

  // Handle edge changes and notify parent
  const handleEdgesChange: OnEdgesChange<CoralEdge> = useCallback(
    (changes) => {
      onEdgesChange(changes);

      if (callbacks?.onEdgesChange) {
        setEdges((currentEdges) => {
          callbacks.onEdgesChange?.(currentEdges);
          return currentEdges;
        });
      }
    },
    [onEdgesChange, callbacks, setEdges]
  );

  // Handle selection changes
  const handleSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodeList, edges: selectedEdgeList }) => {
      const nodeIds = selectedNodeList.map((n) => n.id);
      const edgeIds = selectedEdgeList.map((e) => e.id);

      setSelectedNodes(nodeIds);
      setSelectedEdges(edgeIds);

      callbacks?.onNodeSelect?.(nodeIds);
      callbacks?.onEdgeSelect?.(edgeIds);
    },
    [callbacks]
  );

  // Handle node double click
  const handleNodeDoubleClick: NodeMouseHandler<CoralNode> = useCallback(
    (_event, node) => {
      callbacks?.onNodeDoubleClick?.(node.id);
    },
    [callbacks]
  );

  // Minimap node color based on type
  const getMinimapNodeColor = useCallback((node: CoralNode) => {
    switch (node.data.nodeType) {
      case 'service':
        return '#90caf9';
      case 'database':
        return '#ffb74d';
      case 'external_api':
        return '#f48fb1';
      case 'actor':
        return '#81c784';
      case 'module':
        return '#ce93d8';
      case 'group':
        return '#bdbdbd';
      default:
        return '#90caf9';
    }
  }, []);

  return (
    <div
      className={`coral-editor ${className || ''}`}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '400px',
        ...style,
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onSelectionChange={handleSelectionChange}
        onNodeDoubleClick={handleNodeDoubleClick}
        nodeTypes={nodeTypes}
        nodesDraggable={config.draggable}
        nodesConnectable={config.connectable}
        elementsSelectable={config.selectable}
        zoomOnScroll={config.zoomable}
        panOnScroll={config.pannable}
        fitView={config.fitViewOnLoad}
        fitViewOptions={{ padding: 0.2 }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />

        {config.showControls && <Controls />}

        {config.showMinimap && (
          <MiniMap
            nodeColor={getMinimapNodeColor}
            nodeStrokeWidth={3}
            zoomable
            pannable
          />
        )}
      </ReactFlow>
    </div>
  );
};

/**
 * Hook to get Graph-IR from current editor state
 */
export function useGraphIR(
  nodes: CoralNode[],
  edges: CoralEdge[],
  originalGraph: GraphIR
): GraphIR {
  return useMemo(() => {
    const graphNodes = convertFlowToGraphNodes(nodes, originalGraph.nodes);
    const graphEdges = convertFlowToGraphEdges(edges);

    return {
      ...originalGraph,
      nodes: graphNodes,
      edges: graphEdges,
    };
  }, [nodes, edges, originalGraph]);
}

export default CoralEditor;
