/**
 * Diagnostics channel (R-011).
 *
 * Parsers, importers and the printer report what they could not represent, not
 * only what stopped them. One builder constructs every `ParseResult`, so the
 * relationship between `diagnostics`, `errors` and `success` is structural
 * rather than a convention repeated at nineteen construction sites.
 */

import type { GraphIR, ParseError, ParseResult } from './types.js';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * A source location.
 *
 * Named `SourcePosition` rather than `Position` because `Position` is already
 * re-exported from `@graph-ir/core` as the `{ x, y }` of node geometry.
 */
export interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

/** Exact half-open source range in UTF-16 code units. */
export interface DiagnosticRange {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

/** Another authored occurrence belonging to the same diagnostic. */
export interface DiagnosticRelatedLocation {
  message: string;
  position: SourcePosition;
  range?: DiagnosticRange;
}

/** The IR element a loss attaches to, when one is known. */
export interface DiagnosticSubject {
  kind: 'node' | 'edge' | 'graph';
  id: string;
}

/**
 * A diagnostic with no inherent source location — what the printer produces,
 * since a graph has no line numbers.
 */
export interface Diagnostic {
  severity: DiagnosticSeverity;
  /** `<producer>.<construct>.<disposition>`; the construct may itself be dotted. */
  code: string;
  message: string;
  position?: SourcePosition;
  /** Exact half-open range when both boundaries are known. */
  range?: DiagnosticRange;
  related?: readonly DiagnosticRelatedLocation[];
  /** Verbatim source slice that was dropped or degraded. */
  source?: string;
  subject?: DiagnosticSubject;
  hint?: string;
}

/**
 * A diagnostic from a parser, which always knows where it is.
 *
 * Extends `ParseError` as well as `Diagnostic` and mirrors `position` into the
 * flat `line`/`column`/`offset` fields, because `ParseError` is flat and the
 * derived `errors` view must stay assignable to `ParseError[]` without a cast
 * while remaining element-identical to the entries in `diagnostics`.
 */
export interface ParseDiagnostic extends Diagnostic, ParseError {
  position: SourcePosition;
  range?: DiagnosticRange;
}

/** Options for constructing a single parse diagnostic. */
export interface ParseDiagnosticInput {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  position: SourcePosition;
  range?: DiagnosticRange;
  related?: readonly DiagnosticRelatedLocation[];
  source?: string;
  subject?: DiagnosticSubject;
  hint?: string;
}

/**
 * Build a parse diagnostic, mirroring the position into the flat fields.
 *
 * This is the only place a `ParseDiagnostic` is constructed, so the mirror
 * cannot drift from the nested position.
 */
export function parseDiagnostic(input: ParseDiagnosticInput): ParseDiagnostic {
  const { position } = input;
  return {
    severity: input.severity,
    code: input.code,
    message: input.message,
    position,
    ...(input.range !== undefined ? { range: Object.freeze({
      start: Object.freeze({ ...input.range.start }),
      end: Object.freeze({ ...input.range.end }),
    }) } : {}),
    ...(input.related !== undefined ? { related: freezeRelated(input.related) } : {}),
    line: position.line,
    column: position.column,
    offset: position.offset,
    ...(input.source !== undefined ? { source: input.source } : {}),
    ...(input.subject !== undefined ? { subject: input.subject } : {}),
    ...(input.hint !== undefined ? { hint: input.hint } : {}),
  };
}

/** Build a printer diagnostic, which carries no position. */
export function printDiagnostic(input: Omit<Diagnostic, 'position'>): Diagnostic {
  return { ...input, ...(input.related !== undefined ? { related: freezeRelated(input.related) } : {}) };
}

function freezeRelated(related: readonly DiagnosticRelatedLocation[]): readonly DiagnosticRelatedLocation[] {
  return Object.freeze(related.map(item => Object.freeze({
    message: item.message,
    position: Object.freeze({ ...item.position }),
    ...(item.range ? { range: Object.freeze({
      start: Object.freeze({ ...item.range.start }), end: Object.freeze({ ...item.range.end }),
    }) } : {}),
  })));
}

/** Order by line, then column, then offset. */
function bySourcePosition(a: ParseDiagnostic, b: ParseDiagnostic): number {
  return (
    a.position.line - b.position.line ||
    a.position.column - b.position.column ||
    a.position.offset - b.position.offset
  );
}

/**
 * Construct a `ParseResult` from accumulated diagnostics.
 *
 * `success` is derived from the absence of errors, so a warning never fails a
 * parse; `errors` is the error-severity view of `diagnostics`, element-identical
 * and in the same order; both arrays are frozen so neither can be desynchronised
 * from the other.
 */
export function finishParse(diagnostics: ParseDiagnostic[], graph?: GraphIR): ParseResult {
  const ordered = Object.freeze([...diagnostics].sort(bySourcePosition));
  const errors = Object.freeze(ordered.filter((d) => d.severity === 'error'));
  const success = errors.length === 0;

  return {
    success,
    ...(graph !== undefined ? { graph } : {}),
    errors: errors as unknown as ParseError[],
    diagnostics: ordered as unknown as ParseDiagnostic[],
  };
}
