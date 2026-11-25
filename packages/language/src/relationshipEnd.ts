import type { RelationshipEnd } from './types.js';
import { isJsonSafe, isPlainObject } from './structured.js';

const END_FIELDS = new Set(['role', 'multiplicity', 'navigability', 'marker']);
const NAVIGABILITY = new Set(['navigable', 'non-navigable', 'unspecified']);
const MARKER_KINDS = new Set([
  'none', 'arrow', 'triangle', 'diamond', 'circle', 'bar', 'crow-foot',
  'zero-or-one', 'one', 'zero-or-many', 'one-or-many',
]);
const MARKER_FILLS = new Set(['open', 'filled', 'unspecified']);
const UNSPECIFIED_FILL_KINDS = new Set([
  'none', 'bar', 'crow-foot', 'zero-or-one', 'one', 'zero-or-many', 'one-or-many',
]);
const CARDINALITY: Readonly<Record<string, readonly [number, number | '*']>> = {
  'zero-or-one': [0, 1],
  one: [1, 1],
  'zero-or-many': [0, '*'],
  'one-or-many': [1, '*'],
};

export type RelationshipEndValidation =
  | { valid: true; value: RelationshipEnd }
  | { valid: false; message: string };

const exactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean =>
  Object.keys(value).length === expected.length &&
  expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));

/** Validate the public GraphIR 3 RelationshipEnd contract without narrowing its integer domain. */
export function validateRelationshipEnd(value: unknown, field: string): RelationshipEndValidation {
  if (!isPlainObject(value) || !isJsonSafe(value)) {
    return { valid: false, message: `${field} must be an object` };
  }
  for (const key of Object.keys(value)) {
    if (!END_FIELDS.has(key)) {
      return { valid: false, message: `${field}.${key} is not a relationship-end field` };
    }
  }
  if (value.role !== undefined && (typeof value.role !== 'string' || value.role.length === 0)) {
    return { valid: false, message: `${field}.role must be a non-empty string` };
  }

  let multiplicity: Record<string, unknown> | undefined;
  if (value.multiplicity !== undefined) {
    if (!isPlainObject(value.multiplicity) || !exactKeys(value.multiplicity, ['lower', 'upper'])) {
      return { valid: false, message: `${field}.multiplicity requires lower and upper` };
    }
    multiplicity = value.multiplicity;
    if (typeof multiplicity.lower !== 'number' || !Number.isInteger(multiplicity.lower) || multiplicity.lower < 0) {
      return { valid: false, message: `${field}.multiplicity.lower must be a non-negative integer` };
    }
    if (!(
      multiplicity.upper === '*' ||
      (typeof multiplicity.upper === 'number' && Number.isInteger(multiplicity.upper) && multiplicity.upper >= 0)
    )) {
      return { valid: false, message: `${field}.multiplicity.upper must be a non-negative integer or "*"` };
    }
    if (typeof multiplicity.upper === 'number' && multiplicity.upper < multiplicity.lower) {
      return { valid: false, message: `${field}.multiplicity.upper must not be less than lower` };
    }
  }

  if (value.navigability !== undefined &&
      (typeof value.navigability !== 'string' || !NAVIGABILITY.has(value.navigability))) {
    return { valid: false, message: `${field}.navigability must be navigable, non-navigable, or unspecified` };
  }

  if (value.marker !== undefined) {
    if (!isPlainObject(value.marker) || !exactKeys(value.marker, ['kind', 'fill'])) {
      return { valid: false, message: `${field}.marker requires kind and fill` };
    }
    const { kind, fill } = value.marker;
    if (typeof kind !== 'string' || !MARKER_KINDS.has(kind)) {
      return { valid: false, message: `${field}.marker.kind is not a GraphIR endpoint marker` };
    }
    if (typeof fill !== 'string' || !MARKER_FILLS.has(fill)) {
      return { valid: false, message: `${field}.marker.fill must be open, filled, or unspecified` };
    }
    if (UNSPECIFIED_FILL_KINDS.has(kind) && fill !== 'unspecified') {
      return { valid: false, message: `${field}.marker.fill must be unspecified for ${kind}` };
    }
    const bounds = CARDINALITY[kind];
    if (bounds && multiplicity &&
        (multiplicity.lower !== bounds[0] || multiplicity.upper !== bounds[1])) {
      return {
        valid: false,
        message: `${field}.marker ${kind} contradicts multiplicity ${String(multiplicity.lower)}..${String(multiplicity.upper)}`,
      };
    }
  }

  return { valid: true, value: value as RelationshipEnd };
}
