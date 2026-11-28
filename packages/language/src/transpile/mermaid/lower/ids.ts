import type { TranspileDiagnostic, TranspileSourceRange } from '../types.js';

/**
 * The 27 canonical Coral saved-source reserved words (01 §5.0, 02 §4 Stage 2A).
 * Plain object literal — zero module-level side effects, zero prototype lookups.
 */
const CORAL_RESERVED_WORDS: Readonly<Record<string, true>> = {
  layout: true,
  route: true,
  constraint: true,
  arrange: true,
  group: true,
  columns: true,
  attributes: true,
  operations: true,
  alt: true,
  else: true,
  opt: true,
  loop: true,
  par: true,
  and: true,
  critical: true,
  break: true,
  activation: true,
  region: true,
  participants: true,
  note: true,
  as: true,
  port: true,
  on: true,
  at: true,
  pinned: true,
  label: true,
  waypoint: true,
};

export function isCoralReservedWord(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(CORAL_RESERVED_WORDS, id);
}

export function isBareCoralId(id: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(id) && !isCoralReservedWord(id);
}

/**
 * Deterministically compute the sanitized base Coral identifier for a raw Mermaid ID.
 */
export function sanitizeBaseId(raw: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) {
    return isCoralReservedWord(raw) ? `${raw}_id` : raw;
  }
  let s = '';
  let prevUnderscore = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    const ok = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95;
    if (ok) {
      s += raw[i]!;
      prevUnderscore = c === 95;
    } else if (!prevUnderscore) {
      s += '_';
      prevUnderscore = true;
    }
  }
  // Trim trailing underscores (preserve leading underscore if present)
  while (s.length > 1 && s.endsWith('_')) s = s.slice(0, -1);
  if (!s || s === '_') s = 'n_id';
  else if (s.charCodeAt(0) >= 48 && s.charCodeAt(0) <= 57) s = `n_${s}`;
  if (isCoralReservedWord(s)) s = `${s}_id`;
  return s;
}

/**
 * Allocate a collision-free identifier within `taken`, looping k = 2, 3, ... until free.
 */
export function allocateUniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let k = 2;
  while (taken.has(`${base}_${k}`)) k++;
  const candidate = `${base}_${k}`;
  taken.add(candidate);
  return candidate;
}

/**
 * Allocate a Coral identifier for `rawId` inside a scope's `taken` set, emitting
 * `mermaid.id.normalized` (info) whenever the allocated ID differs from `rawId`.
 */
export function allocateSanitizedId(
  rawId: string,
  taken: Set<string>,
  diagnostics: TranspileDiagnostic[],
  range?: TranspileSourceRange,
): { coralId: string; renamed: boolean } {
  const base = sanitizeBaseId(rawId);
  const coralId = allocateUniqueId(base, taken);
  const renamed = coralId !== rawId;
  if (renamed) {
    diagnostics.push({
      severity: 'info',
      code: 'mermaid.id.normalized',
      message: `Identifier "${rawId}" was normalized to "${coralId}" to satisfy Coral bare-ID rules.`,
      ...(range ? { range } : {}),
    });
  }
  return { coralId, renamed };
}

/**
 * Create a prototype-free idMap object.
 */
export function createNullMap<V = string>(): Record<string, V> {
  return Object.create(null) as Record<string, V>;
}
