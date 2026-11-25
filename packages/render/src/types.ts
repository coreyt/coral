import type { GraphNode, GraphEdge, Dimensions, EndpointMarker, RelationshipEnd } from '@graph-ir/core';

export type { GraphNode, GraphEdge, Dimensions, EndpointMarker, RelationshipEnd };

/**
 * Pure definition types for shapes, symbols and notations.
 *
 * This module carries no browser or React dependency, so the MCP server and
 * any Node consumer can use the same definitions the editor renders from.
 * View-model types that wrap React Flow's `Node` and `Edge` stay in
 * `@coral-viz/viz`.
 */

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
  lineHeight?: number;
  minWidth?: number;
  minHeight?: number;
  uniformSizes?: Map<string, { width: number; height: number }>;
  /** Optional independent glyph box for captioned stencils (REQ-B1 / ISC-5). */
  glyphSize?: { width: number; height: number };
  /** Optional caption wrap width override for captioned stencils (REQ-B1 / ISC-2). */
  captionWrapWidth?: number;
  /** Optional diagram notation ID for notation-aware caption sizing (DRQ-10 Option 2). */
  notationId?: string;
  /** Optional semantic symbol ID for notation-aware caption sizing (DRQ-10 Option 2). */
  symbolId?: string;
  /** Optional layout flow direction (DOWN/UP places outside icon captions to the right). */
  layoutDirection?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
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
  /** Present only on shapes introduced after the frozen 0.2.8 catalog. */
  addedInEdition?: string;
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

/** Named geometry on a selected stencil; semantic ports may hard-pin to its ID. */
export interface NamedSymbolAnchor {
  id: string;
  side: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
  position: number;
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
  /** Present list replaces the base symbol's named anchors, including `[]`. */
  namedAnchors?: NamedSymbolAnchor[];
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
  namedAnchors?: NamedSymbolAnchor[];
  marker?: string;
  isContainer?: boolean;
  /** Present only on symbols introduced after the frozen 0.2.8 catalog. */
  addedInEdition?: string;
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
  /** Fill used by the catalog marker; authored relationship ends still win. */
  targetFill?: 'open' | 'filled' | 'unspecified';
  /** Fill used by the catalog marker; authored relationship ends still win. */
  sourceFill?: 'open' | 'filled' | 'unspecified';
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

/** Conservative, serializable defaults used only when notation-aware layout is enabled. */
export interface NotationLayoutProfile {
  algorithm: 'layered';
  direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  spacing: { nodeNode: number; edgeNode: number; layerSpacing: number };
  edgeRouting: 'ORTHOGONAL' | 'POLYLINE' | 'SPLINES';
  elkOptions?: Partial<Record<
    | 'elk.layered.considerModelOrder.strategy'
    | 'elk.layered.crossingMinimization.forceNodeModelOrder',
    string | boolean
  >>;
}

/**
 * Notation definition - grammar layer
 */
export interface NotationDefinition {
  id: string;
  name: string;
  description?: string;
  version: string;
  layoutProfile?: NotationLayoutProfile;
  symbols: string[]; // references to symbol ids
  /** Additive symbols introduced in edition 0.2.14 (keeps 0.2.8 digests immutable). */
  symbols0214?: string[];
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

/**
 * Reason why a connection is incompatible
 */
export type IncompatibilityReason =
  | 'symbol-not-allowed' // Source symbol cannot connect to target symbol
  | 'symbol-unresolved' // Explicit symbol or variant has no usable catalog interpretation
  | 'port-conflict' // Authored semantic ports collide or conflict with legacy geometry
  | 'port-direction-mismatch' // Trying to connect in→in or out→out
  | 'port-not-found' // An explicit port id the node does not have
  | 'max-connections-exceeded' // Port has reached maxConnections
  | 'self-connection' // Connecting node to itself
  | 'constraint-violation'; // Other notation constraint violated

/**
 * Handle/anchor visual state during drag
 */
export type HandleDragState = 'idle' | 'compatible' | 'warning' | 'incompatible';

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
}



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
