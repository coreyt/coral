import type { GraphIR, NodeLayoutOptions, Padding } from '@graph-ir/core';
import type { ElkNode } from 'elkjs';
import type { SvgOptions } from '../svg/serialize.js';

export interface Point { x: number; y: number }

export type LayoutAlgorithm = 'layered' | 'mrtree' | 'stress' | 'force' | 'radial' | 'box' | 'fixed';
export type LayoutDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
export type LayoutRouting = 'ORTHOGONAL' | 'POLYLINE' | 'SPLINES';
export type HierarchyHandling = 'INCLUDE_CHILDREN' | 'SEPARATE_CHILDREN';

export interface LayoutSpacingInput {
  nodeNode?: number;
  nodeEdge?: number;
  edgeNode?: number;
  edgeEdge?: number;
  layerSpacing?: number;
}

export interface LayoutOptionInput {
  algorithm?: string;
  direction?: string;
  spacing?: LayoutSpacingInput;
  edgeRouting?: string;
  hierarchyHandling?: string;
  elkOptions?: Record<string, string | number | boolean>;
}

export interface LayoutDefaults extends LayoutOptionInput {
  algorithm: string;
  direction: string;
}

export interface LayoutPort {
  id: string;
  /** Derived normalized point on the visible stencil outline; never authored GraphIR geometry. */
  outlinePoint?: Point;
  /** Stencil whose aspect-preserving fit maps that point into the node box. */
  stencilShapeId?: string;
  /** Semantic symbol ID paired with stencilShapeId for domain-notation caption fitting. */
  stencilSymbolId?: string;
  /** Derived catalog contour for a free attachment chosen after layout; not portable GraphIR intent. */
  freeStencil?: { shapeId: string; cornerRadius?: number };
  /** A semantic auto/side attachment lets layout choose; omitted keeps legacy fixed geometry. */
  attachment?: 'free' | 'fixed';
  /** Restrict a free semantic attachment after layout chooses its side. */
  attachmentClass?: 'side' | 'corner';
  /** Preferred side for a free attachment; exact side for a fixed attachment. */
  side: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
  position?: number;
  /** User-symbol outline value; the frame maps its points by the identity. */
  frameOutline029?: { symbolId: string; outline: 'rectangle' | 'rounded' | 'ellipse' | 'diamond';
    width: number; height: number };
  /** Normalized interior point of an interior-anchored port with a non-empty escape. */
  escape029?: { interior: Point };
}

/** A label ELK keeps clear outside the node box (a user symbol's definition side). */
export interface OutsideLabel029 {
  side: 'above' | 'below' | 'left' | 'right';
  width: number;
  height: number;
}

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
  position?: Point;
  pinned?: boolean;
  ports?: LayoutPort[];
  layoutOptions?: NodeLayoutOptions;
  /**
   * D6: the padding ELK places a mixed group's automatic children in. Its
   * authored children stay local to `layoutOptions.padding`.
   */
  automaticPadding028?: Padding;
  /** Reserved outside label; the node's size and ports are unchanged. */
  outsideLabel029?: OutsideLabel029;
  children?: LayoutNode[];
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
}

export interface LayoutRequest {
  id: string;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  options?: LayoutOptionInput;
  defaults: LayoutDefaults;
}

export interface LayoutSection {
  startPoint: Point;
  bendPoints: Point[];
  endPoint: Point;
}

export type LayoutDiagnosticCode =
  | 'layout.option.invalid'
  | 'layout.port.invalid'
  | 'layout.port.missing'
  | 'layout.engine.failed'
  | 'layout.worker.fallback'
  | 'layout.worker.unavailable';

export interface LayoutDiagnostic {
  code: LayoutDiagnosticCode;
  severity: 'warning' | 'error';
  message: string;
  path?: string;
}

export type SpatialLayoutDiagnosticCode =
  | 'layout.geometry.invalid'
  | 'layout.route.invalid'
  | 'layout.capability.unsupported'
  | 'layout.constraint.dependency-unsupported'
  | 'layout.constraint.required-unsatisfied'
  | 'layout.constraint.preferred-rejected'
  | 'layout.constraint.overlap-forced'
  | 'layout.proximity.rejected'
  | 'layout.route.anchor-missing'
  /** A generated connector drawn sharing a corridor with a generated parallel connector after every fallback. */
  | 'layout.route.degraded'
  /** A generated-route failure was laid out again with 1.5× spacing, or also the other node placement. */
  | 'layout.route.retried';

export interface SpatialLayoutDiagnostic {
  code: SpatialLayoutDiagnosticCode;
  severity: 'warning' | 'error';
  message: string;
  path?: string;
  subject?: { kind: 'node' | 'edge'; id: string };
}

export type ResolvedLayoutDiagnostic = LayoutDiagnostic | SpatialLayoutDiagnostic;

export interface LayoutResult {
  nodes: Array<{
    id: string;
    parentId?: string;
    position: Point;
    absolutePosition: Point;
    width: number;
    height: number;
    /** The outside label the request reserved for this node. */
    outsideLabel029?: OutsideLabel029;
  }>;
  edges: Array<{ id: string; sections: LayoutSection[] }>;
  width: number;
  height: number;
  effectiveOptions: Record<string, string>;
  diagnostics: LayoutDiagnostic[];
}

export type SpatialLayoutOperation = 'load' | 'incremental' | 'reflow';

export interface ResolvedNodeRect {
  id: string;
  parentId?: string;
  /** Local to the immediate parent's outer rectangle. */
  position: Point;
  /** Graph-absolute. */
  absolutePosition: Point;
  width: number;
  height: number;
}

export interface ResolvedEdgeRoute {
  id: string;
  /** Graph-absolute resolved route sections. */
  sections: LayoutSection[];
  /** Authored waypoint order represented by the section joins. */
  waypointIds: string[];
}

export interface ResolvedLayout {
  /** Graph-absolute measured primary labels used verbatim by every scene consumer. */
  labelBounds028?: Record<string, { x: number; y: number; width: number; height: number }>;
  revision: string;
  nodes: ResolvedNodeRect[];
  edges: ResolvedEdgeRoute[];
  width: number;
  height: number;
  acceptedConstraintIds: string[];
  rejectedConstraintIds: string[];
  diagnostics: ResolvedLayoutDiagnostic[];
}

export interface SpatialLayoutRequest {
  revision: string;
  graph: GraphIR;
  operation: SpatialLayoutOperation;
  options?: LayoutOptionInput;
  defaults?: LayoutDefaults;
  /** Optional precomputed engine candidate (for example, from a worker). */
  candidateLayout?: LayoutResult;
  /**
   * Re-runs the caller's engine with a retry's defaults and options, so a
   * caller that supplies `candidateLayout` gets the same bounded relayouts
   * (R-039 AC-8) as one that lets the resolver run ELK. Without it, a
   * supplied candidate is never retried.
   */
  relayoutCandidate?: (retry: Pick<LayoutRequest, 'defaults' | 'options'>) => Promise<LayoutResult>;
  /** Edge IDs whose candidate layout was ranked target-to-source for UML inheritance. */
  candidateRankReversedEdgeIds?: readonly string[];
  /** Local scene context for preserving stronger authored label placement. */
  proximitySceneOptions?: Pick<SvgOptions, 'style' | 'fontSettings' | 'fontSize' | 'fontFamily' | 'fontWeight' | 'lineHeight'>;
  execution?: LayoutExecution;
  /** Edition 0.2.9 document catalog; user-symbol nodes resolve only through it. */
  documentCatalog029?: import('../interpretation028.js').CatalogSnapshot028;
  /** D6: automatic-child padding of mixed groups, by node ID (`containerAutomaticPadding028`). */
  automaticPadding028?: ReadonlyMap<string, Padding>;
}

export interface LayoutEngine {
  layout(graph: ElkNode): Promise<ElkNode>;
}

export interface LayoutExecution {
  signal?: AbortSignal;
  engine?: LayoutEngine;
}

export interface NormalizedLayoutOptions {
  effectiveOptions: Record<string, string>;
  diagnostics: LayoutDiagnostic[];
}
