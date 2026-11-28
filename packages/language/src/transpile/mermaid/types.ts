/**
 * Public and internal types for the deterministic 5-stage Mermaid-to-Coral transpiler.
 * Pure type definitions — zero runtime side effects.
 */

export type MermaidTop5Kind = 'flowchart' | 'sequence' | 'class' | 'er' | 'state';

export type FlowchartTargetNotation = 'flowchart' | 'block' | 'architecture';

export type StateTargetEdition = '0.2.17' | '0.2.8';

export type TranspileMode = 'best-effort' | 'strict';

/**
 * 'visual-safe' (default): degrades Coral edge strokeWeight/strokeColor/motion that
 * successorSourceDisplay028 currently rejects so Editor & coral_render always succeed.
 * 'portable': emits portable Coral 0.2.14 edge styles; Stage 4B sets visualRenderable = false.
 */
export type EdgeStyleMode = 'visual-safe' | 'portable';

export type CoralTargetNotation =
  | 'flowchart'
  | 'block'
  | 'architecture'
  | 'uml-sequence'
  | 'uml-class'
  | 'erd'
  | 'uml-state';

export type CoralTargetEdition = '0.2.8' | '0.2.14' | '0.2.17';

export interface MermaidTranspileOptions {
  /** Default: 'best-effort'. */
  mode?: TranspileMode;
  /** Target notation for Mermaid flowcharts. Default: 'flowchart'. */
  flowchartTarget?: FlowchartTargetNotation;
  /** Edge style emission policy. Default: 'visual-safe'. */
  edgeStyleMode?: EdgeStyleMode;
  /** Target Coral edition for Mermaid stateDiagram. Default: '0.2.17' (visual & hierarchical). */
  stateTargetEdition?: StateTargetEdition;
  /** Preserve Mermaid %% comments as Coral // comments where grammatically valid. Default: false. */
  preserveComments?: boolean;
  /** Maximum input size in UTF-16 code units (DoS guard). Default: 524_288 (512 KB). */
  maxInputLength?: number;
  /** Maximum block/subgraph/fragment nesting depth. Default: 32. */
  maxNestingDepth?: number;
}

export interface TranspileSourcePosition {
  /** 1-based line number in original UTF-16 source. */
  line: number;
  /** 0-based UTF-16 column offset within the line. */
  column: number;
  /** 0-based absolute UTF-16 code-unit offset. */
  offset: number;
}

export interface TranspileSourceRange {
  start: TranspileSourcePosition;
  end: TranspileSourcePosition;
}

export interface TranspileDiagnostic {
  severity: 'error' | 'warning' | 'info';
  /** Stable dot-separated code: mermaid.<diagram>.<construct>.<disposition> or coral.* */
  code: string;
  message: string;
  /** Location in the input Mermaid source (1-based line, 0-based UTF-16 column/offset). */
  range?: TranspileSourceRange;
  /** Optional raw snippet for human display. */
  source?: string;
}

export interface TranspileLossSummary {
  /** True iff any diagnostic has severity === 'warning' or 'error'. */
  lossy: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  /** Distinct diagnostic codes grouped with occurrence counts (Object.create(null) built). */
  byCode: Readonly<Record<string, number>>;
}

export interface MermaidTranspileResult {
  /** True iff coral text was emitted, passed Stage 4 verification, and satisfied mode. */
  ok: boolean;
  detectedKind: MermaidTop5Kind | string | null;
  targetNotation: CoralTargetNotation | null;
  targetEdition: CoralTargetEdition | null;
  /** Present iff ok === true (never returns unverified or malformed Coral). */
  coral?: string;
  /**
   * Deterministic mapping keyed by canonical qualified Coral ID (e.g. "backend.api", "LINE_ITEM")
   * to the original Mermaid ID.
   */
  idMap: Readonly<Record<string, string>>;
  /** Frozen, source-position-ordered diagnostic list. */
  diagnostics: readonly TranspileDiagnostic[];
  lossSummary: TranspileLossSummary;
  /** True iff Coral's visual display seam admits the emitted source. */
  visualRenderable: boolean;
  /** For uml-state, true iff character preview envelope admits the emitted source. */
  characterRenderable?: boolean;
}

// ---------------------------------------------------------------------------
// Internal Coral Source IR (Stage 2 -> Stage 3)
// ---------------------------------------------------------------------------

export type CoralLayoutDirection = 'DOWN' | 'UP' | 'RIGHT' | 'LEFT';

export interface CoralClassAttributeIr {
  visibility: '+' | '-' | '#' | '~';
  name: string;
  type: string;
}

export interface CoralClassOperationIr {
  visibility: '+' | '-' | '#' | '~';
  name: string;
  parameters: Array<{ name: string; type: string }>;
  returnType?: string;
}

export interface CoralErdColumnIr {
  name: string;
  type: string;
  flags: string[];
}

export interface CoralNodeIr {
  id: string;
  kind: string;
  label?: string;
  explicitEmptyLabel?: boolean;
  symbol?: string;
  variant?: string;
  description?: string;
  style?: string;
  children?: CoralNodeIr[];
  attributes?: CoralClassAttributeIr[];
  operations?: CoralClassOperationIr[];
  columns?: CoralErdColumnIr[];
}

export interface CoralEdgeIr {
  id?: string;
  source: string;
  target: string;
  operator: string;
  relation?: string;
  firstEnd?: string;
  secondEnd?: string;
  firstLabel?: string;
  secondLabel?: string;
  style?: string;
  label?: string;
}

export interface CoralSequenceParticipantIr {
  id: string;
  kind: 'participant' | 'actor';
  label?: string;
}

export interface CoralSequenceGroupIr {
  id: string;
  members: string[];
  label?: string;
}

export type CoralSequenceItemIr =
  | {
    kind: 'message';
    id: string;
    source: string;
    target: string;
    operator: string;
    relation?: 'create' | 'destroy';
    label?: string;
  }
  | {
    kind: 'note';
    text: string;
    targets: string[];
  }
  | {
    kind: 'activation';
    participant: string;
    items: CoralSequenceItemIr[];
  }
  | {
    kind: 'region';
    label?: string;
    items: CoralSequenceItemIr[];
  }
  | {
    kind: 'fragment';
    fragmentKind: 'alt' | 'opt' | 'loop' | 'par' | 'critical' | 'break';
    operands: Array<{ guard?: string; items: CoralSequenceItemIr[] }>;
  };

export interface CoralSourceIr {
  notation: CoralTargetNotation;
  edition: CoralTargetEdition;
  direction?: CoralLayoutDirection;
  comments?: string[];
  nodes?: CoralNodeIr[];
  edges?: CoralEdgeIr[];
  sequence?: {
    participants: CoralSequenceParticipantIr[];
    groups: CoralSequenceGroupIr[];
    items: CoralSequenceItemIr[];
  };
}
