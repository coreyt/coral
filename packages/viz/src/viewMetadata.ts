import type { ResolvedFont } from '@coral-viz/render';
import {
  CORAL_EDGE_VIEW_METADATA,
  CORAL_NODE_VIEW_METADATA,
  type CoralEdgeViewMetadata,
  type CoralNodeViewMetadata,
  type DimensionSource,
} from './types.js';

function record(value: unknown): Record<PropertyKey, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? value as Record<PropertyKey, unknown>
    : undefined;
}

function dimensionSource(value: unknown): DimensionSource | undefined {
  return value === 'graph' || value === 'editor-font' ? value : undefined;
}

function resolvedFont(value: unknown): ResolvedFont | undefined {
  const candidate = record(value);
  if (!candidate) return undefined;
  const validId = candidate.id === 'sans'
    || candidate.id === 'serif'
    || candidate.id === 'mono'
    || candidate.id === 'handwritten';
  if (!validId
    || typeof candidate.requestedFamily !== 'string'
    || typeof candidate.cssFamily !== 'string'
    || typeof candidate.size !== 'number'
    || !Number.isFinite(candidate.size)
    || (candidate.weight !== 400 && candidate.weight !== 700)
    || typeof candidate.lineHeight !== 'number'
    || !Number.isFinite(candidate.lineHeight)
    || typeof candidate.usedFallback !== 'boolean') return undefined;
  return candidate as unknown as ResolvedFont;
}

export function readNodeViewMetadata(data: unknown): CoralNodeViewMetadata | undefined {
  const container = record(data);
  const candidate = record(container?.[CORAL_NODE_VIEW_METADATA]);
  if (!candidate) return undefined;
  const source = dimensionSource(candidate.dimensionSource);
  const font = resolvedFont(candidate.font);
  const lines = Array.isArray(candidate.lines)
    && candidate.lines.every((line) => typeof line === 'string')
    ? [...candidate.lines] as string[]
    : undefined;
  const lineHeightPx = typeof candidate.lineHeightPx === 'number'
    && Number.isFinite(candidate.lineHeightPx)
    && candidate.lineHeightPx > 0
    ? candidate.lineHeightPx
    : undefined;
  if (!source && !font && !lines && !lineHeightPx) return undefined;
  return {
    ...(source ? { dimensionSource: source } : {}),
    ...(font ? { font } : {}),
    ...(lines ? { lines } : {}),
    ...(lineHeightPx ? { lineHeightPx } : {}),
  };
}

export function readEdgeViewMetadata(data: unknown): CoralEdgeViewMetadata | undefined {
  const container = record(data);
  const candidate = record(container?.[CORAL_EDGE_VIEW_METADATA]);
  if (!candidate) return undefined;
  const font = resolvedFont(candidate.font);
  return font ? { font } : undefined;
}
