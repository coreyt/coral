/**
 * Types for Coral Visual Editor
 */

import type { Node, Edge, NodeProps } from '@xyflow/react';

/**
 * Graph-IR types (subset needed for visualization)
 */
export interface GraphIR {
  version: string;
  id: string;
  name?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  layoutOptions?: LayoutOptions;
}

export interface GraphNode {
  id: string;
  type: string;
  label?: string;
  description?: string;
  properties?: Record<string, unknown>;
  children?: GraphNode[];
  parent?: string;
  position?: Position;
  dimensions?: Dimensions;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  type?: string;
  label?: string;
  properties?: Record<string, unknown>;
  style?: EdgeStyle;
}

export interface Position {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface EdgeStyle {
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  targetArrow?: 'arrow' | 'diamond' | 'circle' | 'none';
  sourceArrow?: 'arrow' | 'diamond' | 'circle' | 'none';
}

export interface LayoutOptions {
  algorithm?: 'layered' | 'force' | 'radial' | 'tree' | 'fixed';
  direction?: 'DOWN' | 'UP' | 'LEFT' | 'RIGHT';
  spacing?: {
    nodeNode?: number;
    nodeEdge?: number;
    edgeEdge?: number;
    layerSpacing?: number;
  };
}

/**
 * Coral node data passed to React Flow nodes
 */
export interface CoralNodeData {
  label: string;
  nodeType: string;
  description?: string;
  properties?: Record<string, unknown>;
  isGroup?: boolean;
  childCount?: number;
}

/**
 * React Flow node with Coral data
 */
export type CoralNode = Node<CoralNodeData>;

/**
 * Coral edge data passed to React Flow edges
 */
export interface CoralEdgeData {
  label?: string;
  edgeType?: string;
  properties?: Record<string, unknown>;
}

/**
 * React Flow edge with Coral data
 */
export type CoralEdge = Edge<CoralEdgeData>;

/**
 * Props for custom Coral node components
 */
export type CoralNodeProps = NodeProps<CoralNodeData>;

/**
 * Editor state
 */
export interface EditorState {
  nodes: CoralNode[];
  edges: CoralEdge[];
  selectedNodes: string[];
  selectedEdges: string[];
}

/**
 * Editor callbacks
 */
export interface EditorCallbacks {
  onNodesChange?: (nodes: CoralNode[]) => void;
  onEdgesChange?: (edges: CoralEdge[]) => void;
  onNodeSelect?: (nodeIds: string[]) => void;
  onEdgeSelect?: (edgeIds: string[]) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
}

/**
 * Editor configuration
 */
export interface EditorConfig {
  /** Enable node dragging */
  draggable?: boolean;
  /** Enable edge connections */
  connectable?: boolean;
  /** Enable selection */
  selectable?: boolean;
  /** Enable zooming */
  zoomable?: boolean;
  /** Enable panning */
  pannable?: boolean;
  /** Show minimap */
  showMinimap?: boolean;
  /** Show controls */
  showControls?: boolean;
  /** Fit view on load */
  fitViewOnLoad?: boolean;
}
