/** Shared, private endpoint grammar. Offsets are relative to the scanned line. */
import type { RelationshipEnd } from './types.js';
import { unescapeString } from './strings.js';

const FILLABLE = new Set(['arrow', 'triangle', 'diamond', 'circle']);
const FIXED = new Set(['none', 'bar', 'crow-foot', 'zero-or-one', 'one', 'zero-or-many', 'one-or-many']);
const NAVIGABILITY = { nav: 'navigable', nonav: 'non-navigable' } as const;
const NAVIGABILITY_TOKEN: Record<string, string> = { navigable: 'nav', 'non-navigable': 'nonav' };

/** Canonical compact part order (Slice 52 FIX-1 D52-2). */
export const COMPACT_END_PART_ORDER = ['multiplicity', 'role', 'marker', 'navigability'] as const;
/** The compact bound domain: plain digits up to the largest safe integer. */
export const MAX_COMPACT_BOUND = Number.MAX_SAFE_INTEGER;
export const COMPACT_BOUND_RULE =
  `a bound is plain nonnegative integer digits no greater than ${MAX_COMPACT_BOUND}, and equal bounds are written once`;

const LOOSE_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const MULTIPLICITY_SHAPED = /^[+-]?\.?\d/;
const PLAIN_BOUND = /^(?:0|[1-9]\d*)$/;
/** Spacing inside an annotation is spaces and tabs only, as in the EBNF `hspace` (R52-4). */
const HSPACE = /[ \t]/;

const compactBound = (bound: number | '*'): boolean =>
  bound === '*' || (Number.isSafeInteger(bound) && bound >= 0);

/**
 * Requires an already validated end. Explicitly enumerate supported keys.
 * Returns undefined for an end the compact grammar cannot express: empty,
 * explicit unspecified navigability, or a bound outside the compact domain.
 */
export function formatCompactEnd(end: RelationshipEnd): string | undefined {
  const keys = Object.keys(end);
  if (!keys.length || keys.some(key => !(COMPACT_END_PART_ORDER as readonly string[]).includes(key))) return undefined;
  const parts: string[] = [];
  if (end.multiplicity) {
    const { lower, upper } = end.multiplicity;
    if (!compactBound(lower) || !compactBound(upper)) return undefined;
    parts.push(lower === upper ? String(lower) : `${lower}..${upper}`);
  }
  if (end.role !== undefined) parts.push(JSON.stringify(end.role));
  if (end.marker) {
    const { kind, fill } = end.marker;
    if (!FILLABLE.has(kind) && !FIXED.has(kind)) return undefined;
    parts.push(kind + (fill === 'open' ? '-' : fill === 'filled' ? '+' : ''));
  }
  if (end.navigability !== undefined) {
    const token = NAVIGABILITY_TOKEN[end.navigability];
    if (!token) return undefined;
    parts.push(token);
  }
  return `(${parts.join(' ')})`;
}

type Multiplicity = NonNullable<RelationshipEnd['multiplicity']>;
/** A multiplicity-shaped part that is not a canonical compact multiplicity. */
export interface MultiplicityProblem {
  canonical?: string;
  /** Plain digits above the compact domain; only whole-end data can carry the bound (R52-5). */
  oversized?: boolean;
}

/**
 * Read a multiplicity-shaped part strictly. Only canonical bounds are values;
 * any other numeric spelling is a problem, with its canonical token when the
 * bounds are representable. Descending bounds stay values for E-validation.
 */
function readMultiplicity(text: string): { value: Multiplicity } | { problem: MultiplicityProblem } {
  const separator = text.indexOf('..');
  const lowerText = separator < 0 ? text : text.slice(0, separator);
  const upperText = separator < 0 ? undefined : text.slice(separator + 2);
  const bound = (raw: string): number | undefined => {
    if (!LOOSE_NUMBER.test(raw)) return undefined;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= 0 && !(raw.startsWith('-') && value !== 0) ? value : undefined;
  };
  const lower = bound(lowerText);
  const upper = upperText === '*' ? '*' : upperText === undefined ? lower : bound(upperText);
  if (lower === undefined || upper === undefined) {
    const digits = (raw: string | undefined) => raw === undefined || raw === '*' || PLAIN_BOUND.test(raw);
    const oversized = PLAIN_BOUND.test(lowerText) && digits(upperText);
    return { problem: oversized ? { oversized } : {} };
  }
  const canonical = lower === upper ? String(lower) : `${lower}..${upper}`;
  // Only the exact canonical text is a value: digits, and one bound when equal.
  if (text !== canonical) return { problem: { canonical } };
  return { value: { lower, upper } };
}

export interface EndPart {
  start: number;
  text: string;
  field?: typeof COMPACT_END_PART_ORDER[number];
  value?: unknown;
  /** A multiplicity-shaped part that is not canonical (FIX-1 D52-2/D52-6). */
  problem?: MultiplicityProblem;
  /**
   * A spacing error: `whitespace` is a whitespace character other than space
   * or tab (R52-4); `missing` is the first character of a part glued to the
   * preceding string, which consumes that glued part (code review C52-1).
   */
  spacing?: 'whitespace' | 'missing';
}
export interface EndAnnotation { start: number; text: string; parts: EndPart[] }
export interface ReferenceSpan { start: number; text: string; value: string }
export interface EdgePrefix { source: ReferenceSpan; target: ReferenceSpan; sourceEnds: EndAnnotation[]; targetEnds: EndAnnotation[]; end: number }

/** Quote-aware prefix cursor, also used by source-analysis consumers through their own bounded scanner. */
export function scanEdgePrefix(line: string): EdgePrefix | undefined {
  let cursor = 0;
  const space = () => { while (/\s/.test(line[cursor] ?? '')) cursor++; };
  const reference = (): ReferenceSpan | undefined => {
    space();
    const start = cursor;
    const match = line.slice(cursor).match(/^(?:"(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*)/);
    if (!match) return undefined;
    cursor += match[0].length;
    return { start, text: match[0], value: match[0][0] === '"' ? unescapeString(match[0].slice(1, -1)) : match[0] };
  };
  const hspace = () => { while (HSPACE.test(line[cursor] ?? '')) cursor++; };
  const ends = (): EndAnnotation[] | undefined => {
    const annotations: EndAnnotation[] = [];
    space();
    while (line[cursor] === '(') {
      const start = cursor++;
      const parts: EndPart[] = [];
      hspace();
      let glued = false;
      while (cursor < line.length && line[cursor] !== ')') {
        const partStart = cursor;
        if (/\s/.test(line[cursor])) {
          // Other whitespace is not spacing here; report it at the character.
          parts.push({ start: cursor, text: line[cursor], spacing: 'whitespace' });
          cursor++;
          hspace();
          continue;
        }
        if (line[cursor] === '"') {
          cursor++;
          while (cursor < line.length && line[cursor] !== '"') {
            if (line[cursor] === '\\') cursor++;
            cursor++;
          }
          if (cursor === line.length) return undefined;
          cursor++;
        } else {
          while (cursor < line.length && !/[\s)]/.test(line[cursor])) cursor++;
        }
        const text = line.slice(partStart, cursor);
        if (glued) {
          // Only a string can be followed immediately by another part. Report
          // the missing spacing once, at the glued column, and consume the
          // glued part so it is not also reported as a part.
          parts.push({ start: partStart, text: line[partStart], spacing: 'missing' });
          glued = cursor < line.length && line[cursor] !== ')' && !/\s/.test(line[cursor]);
          if (!glued) hspace();
          continue;
        }
        const marker = text.match(/^([a-z]+(?:-[a-z]+)*)([+-]?)$/);
        let part: EndPart = { start: partStart, text };
        if (text.startsWith('"')) {
          // End roles use JSON-compatible strings, including control/Unicode
          // escapes; endpoint references retain the pre-existing decoder.
          try { part = { ...part, field: 'role', value: JSON.parse(text) }; } catch { /* invalid role token */ }
        } else if (MULTIPLICITY_SHAPED.test(text)) {
          const read = readMultiplicity(text);
          part = 'value' in read ? { ...part, field: 'multiplicity', value: read.value } : { ...part, field: 'multiplicity', problem: read.problem };
        } else if (text === 'nav' || text === 'nonav') {
          part = { ...part, field: 'navigability', value: NAVIGABILITY[text] };
        } else if (marker && (FILLABLE.has(marker[1]) || (FIXED.has(marker[1]) && !marker[2]))) {
          part = { ...part, field: 'marker', value: { kind: marker[1], fill: marker[2] === '+' ? 'filled' : marker[2] === '-' ? 'open' : 'unspecified' } };
        }
        parts.push(part);
        glued = cursor < line.length && line[cursor] !== ')' && !/\s/.test(line[cursor]);
        if (!glued) hspace();
      }
      if (line[cursor] !== ')') return undefined;
      cursor++;
      annotations.push({ start, text: line.slice(start, cursor), parts });
      space();
    }
    return annotations;
  };
  const source = reference();
  if (!source) return undefined;
  const sourceEnds = ends();
  if (!sourceEnds || !line.startsWith('->', cursor)) return undefined;
  cursor += 2;
  const target = reference();
  if (!target) return undefined;
  const targetEnds = ends();
  if (!targetEnds) return undefined;
  // Preserve whitespace before existing trailing clauses.
  let end = cursor;
  while (end > 0 && /\s/.test(line[end - 1])) end--;
  return { source, target, sourceEnds, targetEnds, end };
}
