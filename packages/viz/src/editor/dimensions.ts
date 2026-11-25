import type { CoralNode, Dimensions } from '../types.js';
import type { DimensionSource } from '../types.js';
import { readNodeViewMetadata } from '../viewMetadata.js';

function finiteDimensions(value: unknown): Dimensions | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as { width?: unknown; height?: unknown };
  return typeof candidate.width === 'number'
    && Number.isFinite(candidate.width)
    && typeof candidate.height === 'number'
    && Number.isFinite(candidate.height)
    ? { width: candidate.width, height: candidate.height }
    : undefined;
}

/** Read only recognized dimension provenance from collision-safe metadata. */
export function nodeDimensionSource(node: CoralNode): DimensionSource | undefined {
  return readNodeViewMetadata(node.data)?.dimensionSource;
}

/** Resolve the dimensions that may cross a GraphIR persistence/text boundary. */
export function dimensionsForGraphProjection(node: CoralNode): Dimensions | undefined {
  const source = nodeDimensionSource(node);
  if (source === 'editor-font') return undefined;

  const current = finiteDimensions({ width: node.width, height: node.height });
  const canonical = finiteDimensions(node.data.canonical?.dimensions);
  return source === 'graph' ? canonical ?? current : current ?? canonical;
}
