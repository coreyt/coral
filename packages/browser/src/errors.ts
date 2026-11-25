/** The public diagnostic and error types of `@coral-viz/browser`. */

/** 1-based display location; offsets remain absolute UTF-16 code units. */
export interface CoralSourcePoint {
  line: number;
  column: number;
  offset: number;
}

export interface CoralSourceRange {
  start: CoralSourcePoint;
  end: CoralSourcePoint;
}

export interface CoralDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  /** 1-based. */
  line?: number;
  /** 1-based. */
  column?: number;
  /** Half-open authored range, with 1-based line and column. */
  range?: CoralSourceRange;
  related?: readonly { message: string; line: number; column: number;
    range?: CoralSourceRange }[];
  subject?: { kind: string; id: string };
}

export type CoralErrorCode =
  | 'coral.browser.input.type'
  | 'coral.browser.input.invalid'
  | 'coral.browser.input.format'
  | 'coral.browser.input.empty'
  | 'coral.browser.option.invalid'
  | 'coral.browser.render.failed'
  | 'coral.browser.target.missing'
  | 'coral.browser.element.conflict'
  | 'coral.browser.environment.unsupported';

/**
 * Every fatal failure of this package. The ESM and IIFE builds are separate
 * copies, so check `name` or `code` rather than `instanceof` across them.
 */
export class CoralRenderError extends Error {
  declare readonly name: 'CoralRenderError';
  readonly code: CoralErrorCode;
  readonly diagnostics: readonly CoralDiagnostic[];

  constructor(code: CoralErrorCode, message: string, diagnostics: readonly CoralDiagnostic[] = [], options?: { cause?: unknown }) {
    super(message, options);
    Object.defineProperty(this, 'name', { value: 'CoralRenderError', enumerable: false, configurable: true });
    this.code = code;
    this.diagnostics = Object.freeze([...diagnostics]);
  }
}
