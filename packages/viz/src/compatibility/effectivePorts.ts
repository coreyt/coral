/**
 * Effective node ports (R-063 AC-3, Slice 93).
 *
 * An explicit GraphIR `ports` list is complete, including an empty list. Its
 * direction is the existing `properties.direction` extension: `in`, `out`, or
 * `inout`, with omission meaning `inout`. Without an authored list, a variant's
 * ports, then the symbol's ports (an empty list means portless), then the
default in/out pair for a node with no symbol apply.
 * An unrecognized authored direction is shown as `inout` here only so a handle
 * exists; the editor's publication check reports it (never silently accepted).
 */
import { layoutPortShape029, semanticLayoutPorts028, cornerAnchorForAttachment028,
  stencilAnchorPoint028, type GraphNode, type NodeInterpretation028 } from '@coral-viz/render';
import type { LayoutDirection, LayoutPort, Point } from '@coral-viz/render/layout';
import type { SymbolDefinition, SymbolPort } from '../types.js';

export type AuthoredPort = NonNullable<GraphNode['ports']>[number];
export type CanvasPort028 = SymbolPort & { outlinePoint?: Point;
  freeStencil?: { shapeId: string; cornerRadius?: number };
  /** User-symbol frame outline: its points map into the node box by the identity. */
  frameOutline029?: LayoutPort['frameOutline029'] };

const DEFAULT_PORTS: SymbolPort[] = [
  { id: 'in', anchor: 'NORTH', direction: 'in' },
  { id: 'out', anchor: 'SOUTH', direction: 'out' },
];

export function authoredPortDirection(port: AuthoredPort): SymbolPort['direction'] | undefined {
  const direction = port.properties?.direction;
  if (direction === undefined) return 'inout';
  return direction === 'in' || direction === 'out' || direction === 'inout' ? direction : undefined;
}

export function effectiveSymbolPorts(
  symbol: SymbolDefinition | undefined,
  variant?: string,
  authored?: readonly AuthoredPort[],
): SymbolPort[] {
  if (authored !== undefined) {
    return authored.map((port) => {
      const maxConnections = port.properties?.maxConnections;
      return {
        id: port.id,
        anchor: port.side,
        direction: authoredPortDirection(port) ?? 'inout',
        ...(port.label !== undefined ? { label: port.label } : {}),
        ...(port.position !== undefined ? { position: port.position } : {}),
        ...(typeof maxConnections === 'number' ? { maxConnections } : {}),
      };
    });
  }
  if (!symbol) return DEFAULT_PORTS;
  if (variant && symbol.variants?.[variant]?.ports) return symbol.variants[variant].ports!;
  return symbol.ports ?? DEFAULT_PORTS;
}

/** Project the shared semantic union into canvas handles without persisting geometry. */
export function effectiveInterpretedPorts028(
  interpretation: NodeInterpretation028,
  symbol: SymbolDefinition | undefined,
  variant: string | undefined,
  direction: LayoutDirection,
  resolvedSides?: Readonly<Record<string, SymbolPort['anchor']>>,
  resolvedPositions?: Readonly<Record<string, number>>,
): CanvasPort028[] {
  const catalog = effectiveSymbolPorts(symbol, variant);
  const layout = semanticLayoutPorts028(interpretation, symbol, variant, direction);
  return interpretation.semanticPorts.map((port) => {
    const inherited = catalog.find((candidate) => candidate.id === port.id);
    const derived = layout.ports.find((candidate) => candidate.id === port.id)!;
    const freeStencil = derived.freeStencil;
    const cornerShape = freeStencil ? layoutPortShape029(derived) : undefined;
    const resolvedSide = resolvedSides?.[port.id];
    const resolvedPosition = resolvedPositions?.[port.id];
    const cornerPoint = port.anchor === 'corner' && cornerShape && resolvedSide && resolvedPosition !== undefined
      ? stencilAnchorPoint028(cornerShape,
        cornerAnchorForAttachment028(resolvedSide, resolvedPosition), freeStencil) : undefined;
    const outlinePoint = cornerPoint ?? derived.outlinePoint;
    return {
      ...inherited,
      id: port.id,
      direction: port.direction,
      anchor: resolvedSides?.[port.id] ?? derived.side,
      ...(outlinePoint ? { outlinePoint } : {}),
      ...(freeStencil ? { freeStencil } : {}),
      ...(derived.frameOutline029 ? { frameOutline029: derived.frameOutline029 } : {}),
      ...(port.label !== undefined ? { label: port.label } : {}),
      ...(port.maxConnections !== undefined ? { maxConnections: port.maxConnections } : {}),
      ...(resolvedPositions?.[port.id] !== undefined ? { position: resolvedPositions[port.id] }
        : derived.position !== undefined ? { position: derived.position } : {}),
    };
  });
}
