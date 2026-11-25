/** Canonical Graph-IR types are owned by @graph-ir/core. */
import type { GraphIR } from '@graph-ir/core';
import type { ParseDiagnostic } from './diagnostics.js';

export type {
  GraphIR,
  GraphNode,
  GraphEdge,
  Port,
  PortSide,
  Dimensions,
  Position,
  EdgeStyle,
  LayoutOptions,
  SpacingOptions,
  NodeLayoutOptions,
  NodeLabelPlacement,
  EdgeLabelPlacement,
  PlacementSide,
  ConstraintStrength,
  ConstraintAlignment,
  ConstraintNodeReference,
  BoundaryScope,
  RelativeConstraint,
  BoundaryConstraint,
  ArrangementConstraint,
  SpatialConstraint,
  RouteAnchor,
  WaypointPlacement,
  RouteWaypoint,
  RouteIntent,
  GraphMetadata,
  SourceInfo,
  SourceRange,
  Comment,
  GraphIR2,
  NotationProfile,
  Classifier,
  ClassifierKind,
  ClassifierCompartment,
  ClassifierAttribute,
  ClassifierOperation,
  ClassifierParameter,
  ClassifierLiteral,
  RelationshipEnd,
  Multiplicity,
  EndpointMarker,
  Interaction,
  InteractionParticipant,
  InteractionMessage,
  InteractionActivation,
  InteractionFragment,
  InteractionOperand,
  InteractionGuard,
  InteractionNote,
} from '@graph-ir/core';

/**
 * Parser options
 */
export interface ParseOptions {
  /** Explicit draft-0.2.8 source trial until its saved header is settled. */
  edition?: '0.2.8-preview';
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
  /**
   * Best-effort graph. Populated even when `success` is false, so one bad line
   * does not discard everything that parsed (R-009 AC-8).
   */
  graph?: GraphIR;
  /**
   * The error-severity view of `diagnostics`: element-identical, same order,
   * frozen. Derived by the builder, never accumulated in parallel (R-011 AC-2).
   */
  errors: ParseError[];
  /** Every diagnostic, at every severity (R-011). */
  diagnostics: ParseDiagnostic[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  offset: number;
}
