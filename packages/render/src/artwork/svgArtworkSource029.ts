/** Artwork admission for Coral source: the C1 `admitArtwork` hook. Admission
 * failures become located diagnostics with their approved coral.artwork.svg.*
 * codes, at most 64 per block plus one counting the rest (profile §13.2). */
import {
  parseDiagnostic, type ArtworkAdmissionInput029, type DiagnosticRange, type ParseDiagnostic, type SourcePosition,
} from '@coral-viz/language';
import { admitSvgArtwork029 } from './svgArtworkAdmission029.js';
import { BoundedCache029, FAILURE_BYTES_029, REPORTED_FAILURES_029, textBytes029 } from './svgArtworkCache029.js';
import type { AdmittedSvgArtwork029, SvgArtworkCode029, SvgArtworkFailure029 } from './svgArtworkModel029.js';

/** The approved admission codes; the diagnostics catalog names this file as their owner. */
export const SVG_ARTWORK_CODES_029 = Object.freeze([
  'coral.artwork.svg.parse',
  'coral.artwork.svg.element.unsupported',
  'coral.artwork.svg.attribute.unsupported',
  'coral.artwork.svg.reference.unsupported',
  'coral.artwork.svg.reference.cycle',
  'coral.artwork.svg.budget.exceeded',
  'coral.artwork.svg.geometry.invalid',
  'coral.artwork.svg.viewbox.invalid',
] as const satisfies readonly SvgArtworkCode029[]);

/** Refusals with more failures than a block reports, truncated to the reported
 * failures plus the first suppressed one, with their total; never ingress refusals. */
const reports = new BoundedCache029<{ failures: readonly SvgArtworkFailure029[]; total: number }>(64, 32 * 1024 * 1024);

/** Mapped diagnostics for the last block position each refusal was reported at. */
const located = new WeakMap<readonly SvgArtworkFailure029[], { key: string; diagnostics: readonly ParseDiagnostic[] }>();

/** Map at most the reported failures, then one diagnostic for the rest of `total`;
 * the first 64 failures reported plus the first suppressed one, in document order. */
function locate(input: ArtworkAdmissionInput029, failures: readonly SvgArtworkFailure029[], total: number): readonly ParseDiagnostic[] {
  const key = `${input.content.start}:${input.open.start.line}:${input.definitionId}`;
  const cached = located.get(failures);
  if (cached?.key === key) return cached.diagnostics;
  const text = input.text;
  // Line starts of the artwork text; the text begins at column 0 of the line after the opening.
  const lineStarts = [0];
  for (let index = text.indexOf('\n'); index >= 0; index = text.indexOf('\n', index + 1)) lineStarts.push(index + 1);
  const position = (offset: number): SourcePosition => {
    let low = 0, high = lineStarts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (lineStarts[middle]! <= offset) low = middle;
      else high = middle - 1;
    }
    return { line: input.open.start.line + 1 + low, column: offset - lineStarts[low]!, offset: input.content.start + offset };
  };
  const diagnostic = (failure: SvgArtworkFailure029, detail: string) => {
    const whole = failure.phase === 'P1' || failure.phase === 'P7';
    const range: DiagnosticRange = whole ? input.open : { start: position(failure.start), end: position(failure.end) };
    return parseDiagnostic({ severity: 'error', code: failure.code, message: `Symbol ${input.definitionId} artwork: ${detail}`,
      position: range.start, range });
  };
  const diagnostics = failures.slice(0, REPORTED_FAILURES_029).map((failure) => diagnostic(failure, failure.detail));
  const suppressed = total - REPORTED_FAILURES_029;
  if (suppressed > 0) {
    diagnostics.push(diagnostic(failures[REPORTED_FAILURES_029]!,
      `${suppressed} further artwork failure${suppressed === 1 ? '' : 's'} suppressed`));
  }
  located.set(failures, { key, diagnostics });
  return diagnostics;
}

/** The C1 hook: admit one artwork block; record admitted artwork by definition ID. */
export function admitSourceArtwork029(input: ArtworkAdmissionInput029,
  admitted?: Map<string, AdmittedSvgArtwork029>): readonly ParseDiagnostic[] {
  const report = reports.get(input.text);
  if (report) return locate(input, report.failures, report.total);
  const result = admitSvgArtwork029(input.text);
  if (result.ok) {
    admitted?.set(input.definitionId, result.artwork);
    return [];
  }
  const { failures } = result;
  if (failures[0]!.phase === 'P1' || failures.length <= REPORTED_FAILURES_029 + 1) {
    return locate(input, failures, failures.length);
  }
  const kept = Object.freeze(failures.slice(0, REPORTED_FAILURES_029 + 1));
  reports.set(input.text, { failures: kept, total: failures.length },
    textBytes029(input.text) + FAILURE_BYTES_029 * kept.length);
  return locate(input, kept, failures.length);
}
