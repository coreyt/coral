/**
 * Shared field validators (R-063 AC-5).
 *
 * The parser accepts a field value, and the printer emits one, only when it
 * passes the same predicate here, so the two cannot disagree about a field.
 * Range checks are NaN-safe: they are written so that `NaN` fails them.
 *
 * Internal; not exported from the package entry point.
 */

import type { GraphIR } from './types.js';
import { isJsonSafe, isPlainObject } from './structured.js';

export { validateRelationshipEnd } from './relationshipEnd.js';
export { BARE_IDENTIFIER } from './strings.js';

export const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;
export const ROUTINGS = ['orthogonal', 'polyline', 'spline'] as const;
export const ALIGNMENTS = ['start', 'center', 'end'] as const;
export const DIRECTIONS = ['forward', 'reverse'] as const;
export const LABEL_SIDES = ['above', 'below', 'left', 'right', 'center'] as const;

/** The value parameters each constraint kind accepts. */
export const CONSTRAINT_PARAMETERS = {
  relative: ['gap', 'alignment'],
  boundary: ['inset'],
  arrangement: ['gap', 'alignment', 'direction'],
} as const satisfies Record<'relative' | 'boundary' | 'arrangement', readonly string[]>;

export type ConstraintParameter = 'gap' | 'inset' | 'alignment' | 'direction';

export function isOneOf<T extends string>(choices: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (choices as readonly string[]).includes(value);
}

export function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && Number.isFinite(value);
}

export function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function optionalEnum(value: unknown, choices: readonly string[]): boolean {
  return value === undefined || (typeof value === 'string' && choices.includes(value));
}

function optionalNonNegative(value: unknown): boolean {
  return value === undefined || isNonNegativeFinite(value);
}

export function isDimensions(value: unknown): boolean {
  return isPlainObject(value) && isNonNegativeFinite(value.width) && isNonNegativeFinite(value.height) &&
    hasOnlyKeys(value, ['width', 'height']);
}

export function isGraphMetadata(value: unknown): value is NonNullable<GraphIR['metadata']> {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ['author', 'created', 'modified', 'description', 'tags', 'notation', 'custom'])) return false;
  for (const key of ['author', 'created', 'modified', 'description', 'notation'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'string') return false;
  }
  if (value.tags !== undefined && (!Array.isArray(value.tags) || !value.tags.every((tag) => typeof tag === 'string'))) return false;
  return value.custom === undefined || (isPlainObject(value.custom) && isJsonSafe(value.custom));
}

export function isLayoutOptions(value: unknown): value is NonNullable<GraphIR['layoutOptions']> {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ['algorithm', 'direction', 'spacing', 'edgeRouting', 'hierarchyHandling'])) return false;
  if (!optionalEnum(value.algorithm, ['layered', 'force', 'radial', 'tree', 'fixed'])) return false;
  if (!optionalEnum(value.direction, ['DOWN', 'UP', 'LEFT', 'RIGHT'])) return false;
  if (!optionalEnum(value.edgeRouting, ['orthogonal', 'polyline', 'spline'])) return false;
  if (!optionalEnum(value.hierarchyHandling, ['INCLUDE_CHILDREN', 'SEPARATE_CHILDREN'])) return false;
  if (value.spacing !== undefined) {
    if (!isPlainObject(value.spacing) || !hasOnlyKeys(value.spacing, ['nodeNode', 'nodeEdge', 'edgeEdge', 'layerSpacing'])) return false;
    const spacing = value.spacing;
    if (!['nodeNode', 'nodeEdge', 'edgeEdge', 'layerSpacing'].every((key) => optionalNonNegative(spacing[key]))) return false;
  }
  return true;
}

export function isNodeLayoutOptions(value: unknown): boolean {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ['portConstraints', 'portAlignment', 'sizeConstraints', 'minimumSize', 'padding'])) return false;
  if (!optionalEnum(value.portConstraints, ['FREE', 'FIXED_SIDE', 'FIXED_ORDER', 'FIXED_POS'])) return false;
  if (!optionalEnum(value.portAlignment, ['BEGIN', 'CENTER', 'END', 'JUSTIFIED'])) return false;
  if (value.sizeConstraints !== undefined && (!Array.isArray(value.sizeConstraints) || !value.sizeConstraints.every(
    (item) => typeof item === 'string' && ['MINIMUM_SIZE', 'NODE_LABELS', 'PORTS'].includes(item)
  ))) return false;
  if (value.minimumSize !== undefined && !isDimensions(value.minimumSize)) return false;
  if (value.padding !== undefined) {
    if (!isPlainObject(value.padding) || !hasOnlyKeys(value.padding, ['top', 'right', 'bottom', 'left'])) return false;
    const padding = value.padding;
    if (!['top', 'right', 'bottom', 'left'].every((key) => optionalNonNegative(padding[key]))) return false;
  }
  return true;
}

export function isPorts(value: unknown): boolean {
  const sides = new Set(['NORTH', 'SOUTH', 'EAST', 'WEST']);
  return Array.isArray(value) && value.every((port) => isPlainObject(port) &&
    hasOnlyKeys(port, ['id', 'side', 'label', 'position', 'properties']) &&
    typeof port.id === 'string' && port.id.length > 0 && typeof port.side === 'string' && sides.has(port.side) &&
    (port.label === undefined || typeof port.label === 'string') &&
    (port.position === undefined || (typeof port.position === 'number' && port.position >= 0 && port.position <= 1)) &&
    (port.properties === undefined || (isPlainObject(port.properties) && isJsonSafe(port.properties))));
}

/** A label offset is non-negative and finite; `center` takes zero or no offset. */
function isLabelOffset(side: unknown, offset: unknown): boolean {
  if (offset === undefined) return true;
  return isNonNegativeFinite(offset) && (side !== 'center' || offset === 0);
}

export function isNodeLabelPlacement(value: unknown): boolean {
  return isPlainObject(value) && hasOnlyKeys(value, ['side', 'offset']) && isOneOf(LABEL_SIDES, value.side) &&
    isLabelOffset(value.side, value.offset);
}

export function isEdgeLabelPlacement(value: unknown): boolean {
  return isPlainObject(value) && hasOnlyKeys(value, ['side', 'at', 'offset']) && isOneOf(LABEL_SIDES, value.side) &&
    (value.at === undefined || (typeof value.at === 'number' && value.at >= 0 && value.at <= 1)) &&
    isLabelOffset(value.side, value.offset);
}

/** A waypoint id is non-empty and unique on its edge. */
export function isWaypointId(id: unknown, seen: ReadonlySet<string>): id is string {
  return typeof id === 'string' && id.length > 0 && !seen.has(id);
}

/** Whether a constraint value parameter is applicable to the kind and has a valid value. */
export function isConstraintParameter(
  kind: 'relative' | 'boundary' | 'arrangement',
  name: ConstraintParameter,
  value: unknown,
): boolean {
  if (!(CONSTRAINT_PARAMETERS[kind] as readonly string[]).includes(name)) return false;
  if (name === 'gap' || name === 'inset') return isNonNegativeFinite(value);
  return name === 'alignment' ? isOneOf(ALIGNMENTS, value) : isOneOf(DIRECTIONS, value);
}
