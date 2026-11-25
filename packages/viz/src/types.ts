/**
 * Types for Coral Visual Editor
 */

import type { Node, Edge } from '@xyflow/react';
import type { CatalogSnapshot028, ConnectionValidation, ResolvedFont, SemanticPortInput, SymbolPort } from '@coral-viz/render';

// Definition types live in @coral-viz/render, which has no React dependency, and
// are re-exported here so @coral-viz/viz's public surface is unchanged.
export type {
  PortAnchor, SizingMode, ShapeDefinition, ShapeParameter, SymbolPort,
  SymbolVariant, SymbolDefinition, SymbolLibrary, ConnectionConstraints,
  ConnectionRule, NotationDefinition, NotationValidation, ValidationRule,
  IncompatibilityReason, HandleDragState, ShapeRegistry, SymbolRegistry,
  NotationRegistry, ConnectionValidation,
} from '@coral-viz/render';

/** Collision-safe derived node metadata used by font-aware editor views. */
export const CORAL_NODE_VIEW_METADATA: unique symbol = Symbol.for(
  '@coral-viz/viz/node-view-metadata',
);

/** Collision-safe derived edge metadata used by font-aware editor views. */
export const CORAL_EDGE_VIEW_METADATA: unique symbol = Symbol.for(
  '@coral-viz/viz/edge-view-metadata',
);

export type DimensionSource = 'graph' | 'editor-font';

export interface CoralNodeViewMetadata {
  dimensionSource?: DimensionSource;
  font?: ResolvedFont;
  lines?: string[];
  lineHeightPx?: number;
}

export interface CoralEdgeViewMetadata {
  font?: ResolvedFont;
}
import type {
  GraphIR,
  GraphNode,
  GraphEdge,
  Position,
  Dimensions,
  EdgeStyle,
  LayoutOptions,
} from '@graph-ir/core';

export type {
  GraphIR,
  GraphNode,
  GraphEdge,
  Position,
  Dimensions,
  EdgeStyle,
  LayoutOptions,
} from '@graph-ir/core';

/**
 * Graph-IR types (subset needed for visualization)
 */
/*
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
*/

/**
 * Coral node data passed to React Flow nodes
 * Includes index signature for React Flow v12 compatibility
 */
export interface CoralNodeData {
  label: string;
  nodeType: string;
  /** Diagram profile projected with this node; required for staged semantic-port views. */
  notationId?: string;
  description?: string;
  properties?: Record<string, unknown>;
  /** Whether automatic layout and dragging must preserve this node's position. */
  pinned?: boolean;
  isGroup?: boolean;
  childCount?: number;
  /** Canonical fields carried through the React Flow projection unchanged. */
  canonical?: Omit<GraphNode, 'children' | 'id' | 'type' | 'label' | 'description' | 'properties' | 'position' | 'pinned'>;
  /** Typed U1 view projection, pending GraphIR successor persistence. Additive to catalog ports. */
  authoredSemanticPorts?: readonly SemanticPortInput[];
  [key: string]: unknown;
}

export type FontAwareCoralNodeData = CoralNodeData & {
  [CORAL_NODE_VIEW_METADATA]?: CoralNodeViewMetadata;
};

/**
 * React Flow node with Coral data
 */
export type CoralNode = Node<CoralNodeData>;

/**
 * Coral edge data passed to React Flow edges
 * Includes index signature for React Flow v12 compatibility
 */
export interface CoralEdgeData {
  label?: string;
  edgeType?: string;
  properties?: Record<string, unknown>;
  lineStyle?: EdgeStyle['lineStyle'];
  routingPoints?: Position[];
  /** Canonical fields carried through the React Flow projection unchanged. */
  canonical?: Omit<GraphEdge, 'id' | 'source' | 'target' | 'sourcePort' | 'targetPort' | 'type' | 'label' | 'properties'>;
  /** ELK-compatible routed path (bend points from edge router) */
  routedPath?: {
    startPoint: Position;
    endPoint: Position;
    bendPoints: Position[];
  };
  [key: string]: unknown;
}

export type FontAwareCoralEdgeData = CoralEdgeData & {
  [CORAL_EDGE_VIEW_METADATA]?: CoralEdgeViewMetadata;
};

/**
 * React Flow edge with Coral data
 */
export type CoralEdge = Edge<CoralEdgeData>;

/**
 * Props for custom Coral node components
 * React Flow v12 passes these props to custom node components
 */
export interface CoralNodeProps {
  id: string;
  data: CoralNodeData;
  selected?: boolean;
  type?: string;
  xPos?: number;
  yPos?: number;
  zIndex?: number;
  isConnectable?: boolean;
  positionAbsoluteX?: number;
  positionAbsoluteY?: number;
  dragging?: boolean;
  sourcePosition?: string;
  targetPosition?: string;
}

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
  /** Called when a node label is edited inline */
  onLabelEdit?: (nodeId: string, newLabel: string) => void;
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

// ============================================================================
// Shape/Symbol/Notation Types (Three-Layer Architecture)
// ============================================================================



// ============================================================================
// Shape Sizing Types (CORAL-REQ-011)
// ============================================================================












/**
 * Edge style definition
 */
export interface NotationEdgeStyle {
  name: string;
  targetArrow: 'arrow' | 'triangle' | 'diamond' | 'circle' | 'none';
  sourceArrow?: 'arrow' | 'triangle' | 'diamond' | 'circle' | 'none';
  lineStyle: 'solid' | 'dashed' | 'dotted';
  stroke: string;
  strokeWidth: number;
}




/**
 * Entry/exit point definition
 */
export interface FlowPoint {
  symbol: string;
  variant?: string;
  min?: number;
  max?: number;
}



// ============================================================================
// Registry Types
// ============================================================================





// ============================================================================
// Position Stability Types (CORAL-REQ-013)
// ============================================================================

/**
 * Position source tracking - where did this position come from?
 */
export type PositionSource =
  | 'elk-computed'      // From ELK layout
  | 'user-dragged'      // User manually positioned
  | 'loaded'            // From saved document
  | 'incremental';      // From incremental layout

/**
 * Node with position metadata for tracking position origin
 */
export interface PositionedNode {
  id: string;
  position: Position;
  positionSource: PositionSource;
  /** When position was last updated */
  positionTimestamp: number;
}

/**
 * Graph diff result - identifies changes between two graph states
 */
export interface GraphDiff {
  /** Node IDs that exist in new graph but not in old */
  added: string[];
  /** Node IDs that exist in old graph but not in new */
  removed: string[];
  /** Node IDs where label or type changed */
  modified: string[];
  /** Node IDs with no changes */
  unchanged: string[];
}

/**
 * Position resolution result - maps node IDs to positions
 */
export interface PositionResolution {
  /** Resolved positions for nodes */
  positions: Map<string, Position>;
  /** Node IDs that need ELK positioning (new nodes without positions) */
  needsLayout: string[];
}

/**
 * Simplified graph node for diffing (minimal fields needed for comparison)
 */
export interface DiffableNode {
  id: string;
  type: string;
  label?: string;
  parentId?: string;
}

/**
 * Simplified graph for diffing
 */
export interface DiffableGraph {
  nodes: DiffableNode[];
  edges: Array<{ id: string; source: string; target: string }>;
}

// ============================================================================
// Port Compatibility Types (CORAL-REQ-010)
// ============================================================================


/**
 * Information about a connection being validated
 */
export interface ConnectionInfo {
  /** Source node ID */
  sourceNodeId: string;
  /** Target node ID */
  targetNodeId: string;
  /** Source port ID (optional) */
  sourcePortId?: string;
  /** Target port ID (optional) */
  targetPortId?: string;
}

/**
 * Node info needed for connection validation
 */
export interface NodeConnectionInfo {
  id: string;
  symbolId: string;
  variant?: string;
  /** An authored GraphIR port list; when present it replaces symbol ports. */
  ports?: NonNullable<GraphNode['ports']>;
  /** Catalog-aware U1 interpretation; empty means no semantic ports. */
  semanticPorts?: readonly Pick<SymbolPort, 'id' | 'direction' | 'label' | 'maxConnections'>[];
  /** Edition 0.2.9 document catalog that resolves a `local.` symbol. */
  documentCatalog029?: CatalogSnapshot028;
  /** A failed U1 lookup must not be treated as a valid rule-compatible symbol. */
  resolutionIssue?: { code: string; message: string };
}

/**
 * Edge compatibility status for rendering
 */
export type EdgeCompatibilityStatus = 'compatible' | 'warning' | 'incompatible';

/**
 * Edge with compatibility information for rendering
 */
export interface EdgeCompatibility {
  edgeId: string;
  status: EdgeCompatibilityStatus;
  validation: ConnectionValidation;
}


/**
 * Props for connection validation context
 */
export interface ConnectionValidationContext {
  /** Current notation ID */
  notationId: string;
  /** Map of node ID to node info for validation */
  nodeInfo: Map<string, NodeConnectionInfo>;
  /** Existing edges for constraint checking */
  existingEdges: Array<{ id?: string; source: string; target: string; sourcePort?: string; targetPort?: string }>;
  /** Edition 0.2.9 documents refuse a connection beyond a resolved port limit,
   * counting only endpoints that name the port; omitted keeps the 0.2.8 warning. */
  portLimits029?: 'refuse';
  /** Effective conformance level; `none` applies no notation-profile connection
   * rule, keeping port direction and limits. Omitted, it is `none` when any node
   * in `nodeInfo` selects a `local.` user symbol (author decision 2026-10-30). */
  conformanceLevel029?: 'none';
}
