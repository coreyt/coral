/**
 * Graph-IR types for Coral parser output
 * These match the schema from @graph-ir-tools/core
 */

export interface GraphIR {
  version: string;
  id: string;
  name?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata?: GraphMetadata;
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
  ports?: Port[];
  dimensions?: Dimensions;
  position?: Position;
  pinned?: boolean;
  layoutOptions?: NodeLayoutOptions;
  sourceInfo?: SourceInfo;
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
  routingPoints?: Position[];
  style?: EdgeStyle;
  sourceInfo?: SourceInfo;
}

export interface Port {
  id: string;
  side: PortSide;
  label?: string;
  position?: number;
  properties?: Record<string, unknown>;
}

export type PortSide = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';

export interface Dimensions {
  width: number;
  height: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface EdgeStyle {
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  targetArrow?: 'arrow' | 'diamond' | 'circle' | 'none';
  sourceArrow?: 'arrow' | 'diamond' | 'circle' | 'none';
  routing?: 'orthogonal' | 'polyline' | 'spline';
}

export interface LayoutOptions {
  algorithm?: 'layered' | 'force' | 'radial' | 'tree' | 'fixed';
  direction?: 'DOWN' | 'UP' | 'LEFT' | 'RIGHT';
  spacing?: SpacingOptions;
  edgeRouting?: 'orthogonal' | 'polyline' | 'spline';
  hierarchyHandling?: 'INCLUDE_CHILDREN' | 'SEPARATE_CHILDREN';
  algorithmOptions?: Record<string, string | number | boolean>;
}

export interface SpacingOptions {
  nodeNode?: number;
  nodeEdge?: number;
  edgeEdge?: number;
  layerSpacing?: number;
}

export interface NodeLayoutOptions {
  portConstraints?: 'FREE' | 'FIXED_SIDE' | 'FIXED_ORDER' | 'FIXED_POS';
  portAlignment?: 'BEGIN' | 'CENTER' | 'END' | 'JUSTIFIED';
  sizeConstraints?: ('MINIMUM_SIZE' | 'NODE_LABELS' | 'PORTS')[];
  minimumSize?: Dimensions;
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
}

export interface GraphMetadata {
  author?: string;
  created?: string;
  modified?: string;
  description?: string;
  tags?: string[];
  custom?: Record<string, unknown>;
}

export interface SourceInfo {
  range: SourceRange;
  leadingComments?: Comment[];
  trailingComment?: Comment;
  leadingWhitespace?: string;
  modified?: boolean;
  originalText?: string;
}

export interface SourceRange {
  start: number;
  end: number;
  startPosition?: { line: number; column: number };
  endPosition?: { line: number; column: number };
}

export interface Comment {
  text: string;
  style: 'line' | 'block';
  range?: SourceRange;
}

/**
 * Parser options
 */
export interface ParseOptions {
  /** Include source info for roundtripping */
  includeSourceInfo?: boolean;
  /** Graph ID (defaults to 'coral-graph') */
  graphId?: string;
  /** Graph name */
  graphName?: string;
}

/**
 * Parse result
 */
export interface ParseResult {
  success: boolean;
  graph?: GraphIR;
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  offset: number;
}
