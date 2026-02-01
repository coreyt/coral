/**
 * Types for Coral Visual Editor
 */

import type { Node, Edge } from '@xyflow/react';

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
 * Includes index signature for React Flow v12 compatibility
 */
export interface CoralNodeData {
  label: string;
  nodeType: string;
  description?: string;
  properties?: Record<string, unknown>;
  isGroup?: boolean;
  childCount?: number;
  [key: string]: unknown;
}

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
  [key: string]: unknown;
}

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

/**
 * Port anchor position on a shape (geometric)
 */
export interface PortAnchor {
  side: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'NORTH_EAST' | 'NORTH_WEST';
  position: number; // 0-1 along the side
}

/**
 * Shape parameter definition
 */
export interface ShapeParameter {
  type: 'number' | 'enum' | 'boolean';
  default: number | string | boolean;
  min?: number;
  max?: number;
  options?: string[];
  description?: string;
}

// ============================================================================
// Shape Sizing Types (CORAL-REQ-011)
// ============================================================================

/**
 * Sizing mode for diagram nodes
 */
export type SizingMode = 'adaptive' | 'uniform' | 'hybrid';

/**
 * Shape sizing metadata - defines how text fits within a shape
 */
export interface ShapeSizing {
  /** Ratio of shape bounds to text bounds (text needs shape_width = text_width * ratio.x) */
  textBoundsRatio: { x: number; y: number };
  /** Minimum size constraints */
  minSize: { width: number; height: number };
  /** Padding around text within the shape */
  padding: { x: number; y: number };
}

/**
 * Options for measuring text dimensions
 */
export interface TextMeasureOptions {
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight?: string | number;
  maxWidth?: number;
  lineHeight?: number;
}

/**
 * Result of text measurement
 */
export interface TextDimensions {
  width: number;
  height: number;
  lines: string[];
}

/**
 * Options for computing node size
 */
export interface NodeSizingOptions {
  text: string;
  shapeId: string;
  sizingMode: SizingMode;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  minWidth?: number;
  minHeight?: number;
  uniformSizes?: Map<string, { width: number; height: number }>;
}

/**
 * Result of node size computation
 */
export interface NodeDimensions {
  width: number;
  height: number;
  textBox: { x: number; y: number; width: number; height: number };
}

/**
 * Shape definition - pure geometry layer
 */
export interface ShapeDefinition {
  id: string;
  name: string;
  type: 'polygon' | 'ellipse' | 'path' | 'compound';
  viewBox: string;
  path: string;
  defaultSize: Dimensions;
  parameters?: Record<string, ShapeParameter>;
  portAnchors: PortAnchor[];
  strokeOnly?: boolean;
  /** Sizing metadata for adaptive node sizing (CORAL-REQ-011) */
  sizing?: ShapeSizing;
}

/**
 * Symbol port definition (semantic)
 */
export interface SymbolPort {
  id: string;
  anchor: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
  direction: 'in' | 'out' | 'inout';
  label?: string;
  maxConnections?: number;
  position?: number;
}

/**
 * Symbol variant definition
 */
export interface SymbolVariant {
  name: string;
  description?: string;
  icon?: string;
  defaults?: Record<string, unknown>;
  ports?: SymbolPort[];
}

/**
 * Symbol definition - shape + semantics layer
 */
export interface SymbolDefinition {
  id: string;
  name: string;
  description?: string;
  shape: string; // reference to ShapeDefinition.id
  tags: string[];
  variants?: Record<string, SymbolVariant>;
  defaults?: Record<string, unknown>;
  ports?: SymbolPort[];
  marker?: string;
  isContainer?: boolean;
}

/**
 * Symbol library (collection of symbols for a notation)
 */
export interface SymbolLibrary {
  id: string;
  name: string;
  version: string;
  description?: string;
  symbols: SymbolDefinition[];
}

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
 * Connection rule constraints
 */
export interface ConnectionConstraints {
  maxOutgoing?: number;
  maxIncoming?: number;
  minOutgoing?: number;
  minConnections?: number;
  requiresLabel?: boolean;
  cardinalityLabel?: boolean;
  singleInheritance?: boolean;
  fromPorts?: string[];
}

/**
 * Connection rule definition
 */
export interface ConnectionRule {
  from: string; // symbol id
  fromVariant?: string;
  to: string[]; // allowed target symbol ids
  edgeStyle?: string;
  constraints?: ConnectionConstraints;
  isContainment?: boolean;
}

/**
 * Validation rule definition
 */
export interface ValidationRule {
  id: string;
  description: string;
  symbol?: string;
  symbols?: string[];
  variant?: string;
  mustBeConnected?: boolean;
  minOutgoing?: number;
  requireUniqueEdgeLabels?: boolean;
  acyclic?: boolean;
  requiresAttribute?: { variant: string; min: number };
  requiresRelationship?: { variant: string };
  mustConnectTo?: string[];
  notDirectlyConnectedTo?: string[];
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

/**
 * Notation validation rules
 */
export interface NotationValidation {
  entryPoints?: FlowPoint[];
  exitPoints?: FlowPoint[];
  rules?: ValidationRule[];
}

/**
 * Notation definition - grammar layer
 */
export interface NotationDefinition {
  id: string;
  name: string;
  description?: string;
  version: string;
  symbols: string[]; // references to symbol ids
  edgeStyles?: Record<string, NotationEdgeStyle>;
  defaultEdgeStyle: string | NotationEdgeStyle;
  connectionRules: ConnectionRule[];
  validation?: NotationValidation;
  graphModes?: Record<string, {
    name: string;
    description?: string;
    primarySymbols: string[];
    primaryEdge: string;
    connectionRules?: ConnectionRule[];
  }>;
}

// ============================================================================
// Registry Types
// ============================================================================

/**
 * Shape registry for looking up shape definitions
 */
export interface ShapeRegistry {
  get(id: string): ShapeDefinition | undefined;
  getAll(): ShapeDefinition[];
  has(id: string): boolean;
}

/**
 * Symbol registry for looking up symbol definitions
 */
export interface SymbolRegistry {
  get(id: string): SymbolDefinition | undefined;
  getByTag(tag: string): SymbolDefinition[];
  getByNotation(notationId: string): SymbolDefinition[];
  getAll(): SymbolDefinition[];
  has(id: string): boolean;
}

/**
 * Notation registry for looking up notation definitions
 */
export interface NotationRegistry {
  get(id: string): NotationDefinition | undefined;
  getAll(): NotationDefinition[];
  has(id: string): boolean;
  validate(notationId: string, nodes: GraphNode[], edges: GraphEdge[]): ValidationResult[];
}

/**
 * Validation result from notation validation
 */
export interface ValidationResult {
  ruleId: string;
  severity: 'error' | 'warning';
  message: string;
  nodeId?: string;
  edgeId?: string;
}

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
 * Reason why a connection is incompatible
 */
export type IncompatibilityReason =
  | 'symbol-not-allowed' // Source symbol cannot connect to target symbol
  | 'port-direction-mismatch' // Trying to connect in→in or out→out
  | 'max-connections-exceeded' // Port has reached maxConnections
  | 'self-connection' // Connecting node to itself
  | 'constraint-violation'; // Other notation constraint violated

/**
 * Result of validating a single connection
 */
export interface ConnectionValidation {
  /** Whether the connection is valid */
  valid: boolean;
  /** Warning but not blocking (e.g., style suggestion) */
  hasWarning: boolean;
  /** The reason for incompatibility, if any */
  reason?: IncompatibilityReason;
  /** Human-readable explanation */
  message?: string;
  /** Related constraint that was violated */
  constraintId?: string;
}

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
 * Handle/anchor visual state during drag
 */
export type HandleDragState = 'idle' | 'compatible' | 'incompatible';

/**
 * Props for connection validation context
 */
export interface ConnectionValidationContext {
  /** Current notation ID */
  notationId: string;
  /** Map of node ID to node info for validation */
  nodeInfo: Map<string, NodeConnectionInfo>;
  /** Existing edges for constraint checking */
  existingEdges: Array<{ source: string; target: string; sourcePort?: string; targetPort?: string }>;
}
