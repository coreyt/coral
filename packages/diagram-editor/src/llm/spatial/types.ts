import type { GraphIR, Position } from '@coral-viz/language';

export type SpatialClassification =
  | 'spatial-only'
  | 'mixed'
  | 'non-spatial'
  | 'unsupported';

export type SpatialRelation = 'above' | 'below' | 'left-of' | 'right-of';
export type SpatialSide = 'top' | 'bottom' | 'left' | 'right';
export type ArrangementAxis = 'row' | 'column';
export type ArrangementDirection =
  | 'left-to-right'
  | 'right-to-left'
  | 'top-to-bottom'
  | 'bottom-to-top';

export interface TextRange {
  readonly start: number;
  readonly end: number;
}

export interface SpatialReference {
  readonly text: string;
}

export type SpatialCommand =
  | {
      readonly kind: 'relative';
      readonly subject: SpatialReference;
      readonly relation: SpatialRelation;
      readonly target: SpatialReference;
    }
  | {
      readonly kind: 'boundary';
      readonly subject: SpatialReference;
      readonly side: SpatialSide;
      readonly scope: { readonly kind: 'diagram' } | { readonly kind: 'group'; readonly reference: SpatialReference };
    }
  | {
      readonly kind: 'arrange';
      readonly members:
        | { readonly kind: 'explicit'; readonly references: readonly SpatialReference[] }
        | { readonly kind: 'group'; readonly reference: SpatialReference };
      readonly axis: ArrangementAxis;
      readonly direction: ArrangementDirection;
    };

export type SpatialDiagnosticCode =
  | 'spatial.unsupported'
  | 'spatial.reference.missing'
  | 'spatial.reference.ambiguous'
  | 'spatial.scope.invalid'
  | 'spatial.geometry.invalid'
  | 'spatial.member.duplicate'
  | 'spatial.contradiction'
  | 'spatial.anchor.alignment'
  | 'spatial.anchor.order'
  | 'spatial.anchor.space'
  | 'spatial.preservation'
  | 'spatial.plan.stale'
  | 'spatial.outcome.unsatisfied';

export interface SpatialDiagnostic {
  readonly code: SpatialDiagnosticCode;
  readonly message: string;
  readonly entityIds?: readonly string[];
}

export interface SpatialRecognition {
  readonly classification: SpatialClassification;
  readonly command?: SpatialCommand;
  readonly consumedRanges: readonly TextRange[];
  readonly diagnostics: readonly SpatialDiagnostic[];
}

export interface CapturedNodeGeometry {
  readonly id: string;
  readonly position: Readonly<Position>;
  readonly width: number;
  readonly height: number;
  readonly origin?: readonly [number, number];
  readonly parentId?: string;
}

export interface SpatialRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SpatialSnapshotNode {
  readonly id: string;
  readonly label?: string;
  readonly type: string;
  readonly parentId?: string;
  readonly childIds: readonly string[];
  readonly pinned: boolean;
  readonly baselinePosition?: Readonly<Position>;
  readonly canonicalPosition: Readonly<Position>;
  readonly origin: readonly [number, number];
  readonly bounds: SpatialRect;
  readonly dimensions?: { readonly width: number; readonly height: number };
}

export type ResolvedSpatialOperation =
  | {
      readonly kind: 'relative';
      readonly subjectIds: readonly [string];
      readonly relation: SpatialRelation;
      readonly targetId: string;
    }
  | {
      readonly kind: 'boundary';
      readonly subjectIds: readonly [string];
      readonly side: SpatialSide;
      readonly scope: { readonly kind: 'diagram' } | { readonly kind: 'group'; readonly id: string };
    }
  | {
      readonly kind: 'arrange';
      readonly subjectIds: readonly string[];
      readonly axis: ArrangementAxis;
      readonly direction: ArrangementDirection;
    };

export interface SpatialPlan {
  readonly version: 1;
  readonly graphId: string;
  readonly graphVersion: string;
  readonly classification: 'spatial-only' | 'mixed';
  readonly operation: ResolvedSpatialOperation;
  readonly snapshot: readonly SpatialSnapshotNode[];
  readonly gap: number;
  readonly tolerance: number;
  readonly pinPolicy: 'direct-move-preserves-pin-arrangement-pins-anchor';
  readonly positionDependencies: readonly string[];
  readonly baselineEdges: readonly {
    readonly id: string;
    readonly source: string;
    readonly target: string;
    readonly sourcePort?: string;
    readonly targetPort?: string;
  }[];
}

export type SpatialPlanResult =
  | { readonly success: true; readonly plan: SpatialPlan; readonly diagnostics: readonly [] }
  | { readonly success: false; readonly diagnostics: readonly SpatialDiagnostic[] };

export interface SpatialEvidence {
  readonly predicate: string;
  readonly satisfied: boolean;
  readonly entityIds: readonly string[];
  readonly actual: number;
  readonly expected: number;
  readonly tolerance: number;
}

export interface SpatialEvaluationResult {
  readonly success: boolean;
  readonly evidence: readonly SpatialEvidence[];
  readonly diagnostics: readonly SpatialDiagnostic[];
}

export interface SpatialPreservationResult {
  readonly success: boolean;
  readonly diagnostics: readonly SpatialDiagnostic[];
}

export interface SpatialApplyInput {
  readonly original: GraphIR;
  readonly candidate: GraphIR;
  readonly plan: SpatialPlan;
}

export type SpatialPositionResult =
  | {
      readonly success: true;
      readonly positions: readonly { readonly id: string; readonly position: Readonly<Position> }[];
      readonly diagnostics: readonly [];
    }
  | {
      readonly success: false;
      readonly positions: readonly [];
      readonly diagnostics: readonly SpatialDiagnostic[];
    };

export type SpatialApplyResult =
  | {
      readonly success: true;
      readonly graph: GraphIR;
      readonly evidence: readonly SpatialEvidence[];
      readonly diagnostics: readonly [];
    }
  | {
      readonly success: false;
      readonly graph: GraphIR;
      readonly evidence: readonly SpatialEvidence[];
      readonly diagnostics: readonly SpatialDiagnostic[];
    };
