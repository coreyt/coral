/**
 * Strict JSON for Coral source (R-063 AC-5).
 *
 * `JSON.parse` keeps the last of two equal keys silently. Coral states each
 * field once, so every `data`, `@graph`, and body JSON value is read here: the
 * value matches `JSON.parse`, the first occurrence of a key wins, and every
 * repeated decoded key is reported with its raw token range. `keys` lists every
 * key occurrence in source order, so a caller can position any key.
 *
 * Internal; not exported from the package entry point.
 */

export interface JsonKeyOccurrence {
  /** The decoded key. */
  key: string;
  /** Dotted key path with bracketed indices, such as `ports[0].properties.k`. */
  path: string;
  /** Unambiguous path segments; keys may themselves contain dots or brackets. */
  segments: readonly (string | number)[];
  /** Offset of the raw key token, quotes included, within the raw text. */
  start: number;
  end: number;
}

export type StrictJson =
  | { ok: true; value: unknown; duplicates: JsonKeyOccurrence[][]; keys: JsonKeyOccurrence[] }
  | { ok: false; reason: 'syntax' | 'depth' };

const MAX_DEPTH = 256;
const LITERAL = /true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

class DepthExceeded extends Error {}

export function parseStrictJson(raw: string): StrictJson {
  try {
    JSON.parse(raw);
  } catch (error) {
    return { ok: false, reason: error instanceof RangeError ? 'depth' : 'syntax' };
  }

  let index = 0;
  const duplicates: JsonKeyOccurrence[][] = [];
  const keys: JsonKeyOccurrence[] = [];

  const skipSpace = () => {
    while (index < raw.length && (raw[index] === ' ' || raw[index] === '\t' || raw[index] === '\n' || raw[index] === '\r')) index++;
  };

  const readString = (): { value: string; start: number; end: number } => {
    const start = index;
    index++; // opening quote
    while (raw[index] !== '"') index += raw[index] === '\\' ? 2 : 1;
    index++; // closing quote
    return { value: JSON.parse(raw.slice(start, index)) as string, start, end: index };
  };

  const displayPath = (segments: readonly (string | number)[]) => segments.map((segment, position) =>
    typeof segment === 'number' ? `[${segment}]` : `${position === 0 ? '' : '.'}${segment}`).join('');

  const readValue = (segments: readonly (string | number)[], depth: number): unknown => {
    if (depth > MAX_DEPTH) throw new DepthExceeded();
    skipSpace();
    const char = raw[index];
    if (char === '{') {
      index++;
      const out: Record<string, unknown> = {};
      const groups = new Map<string, JsonKeyOccurrence[]>();
      skipSpace();
      if (raw[index] === '}') {
        index++;
        return out;
      }
      for (;;) {
        skipSpace();
        const token = readString();
        const occurrenceSegments = [...segments, token.value];
        const occurrence = {
          key: token.value,
          path: displayPath(occurrenceSegments),
          segments: occurrenceSegments,
          start: token.start,
          end: token.end,
        };
        keys.push(occurrence);
        skipSpace();
        index++; // colon
        const value = readValue(occurrence.segments, depth + 1);
        const group = groups.get(token.value);
        if (group) group.push(occurrence);
        else {
          groups.set(token.value, [occurrence]);
          Object.defineProperty(out, token.value, { value, enumerable: true, writable: true, configurable: true });
        }
        skipSpace();
        if (raw[index++] === '}') break; // otherwise a comma
      }
      for (const group of groups.values()) if (group.length > 1) duplicates.push(group);
      return out;
    }
    if (char === '[') {
      index++;
      const out: unknown[] = [];
      skipSpace();
      if (raw[index] === ']') {
        index++;
        return out;
      }
      for (;;) {
        out.push(readValue([...segments, out.length], depth + 1));
        skipSpace();
        if (raw[index++] === ']') break;
      }
      return out;
    }
    if (char === '"') return readString().value;
    LITERAL.lastIndex = index;
    const literal = LITERAL.exec(raw)![0];
    index = LITERAL.lastIndex;
    if (literal === 'true') return true;
    if (literal === 'false') return false;
    if (literal === 'null') return null;
    return Number(literal);
  };

  try {
    const value = readValue([], 0);
    duplicates.sort((a, b) => a[0].start - b[0].start);
    return { ok: true, value, duplicates, keys };
  } catch (error) {
    if (error instanceof DepthExceeded) return { ok: false, reason: 'depth' };
    throw error;
  }
}
