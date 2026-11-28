/** Compact UML State pseudostate geometry (edition 0.2.17). */
import type { GraphNode } from '@graph-ir/core';
import type { LayoutDirection } from './layout/types.js';
import type { RenderStyle028 } from './visualStyle028.js';
import type { StencilPathPrimitive028 } from './drawingPrimitives028.js';
import { roundedRectanglePath028 } from './roundedRectanglePath028.js';

export function isStateCircleSymbol0217(symbolId: string | undefined): boolean {
  return symbolId === 'uml-state-initial' || symbolId === 'uml-state-final';
}

export function isStateSyncBarSymbol0217(symbolId: string | undefined): boolean {
  return symbolId === 'uml-state-fork' || symbolId === 'uml-state-join';
}

export function isStateMarkerSymbol0217(symbolId: string | undefined): boolean {
  return isStateCircleSymbol0217(symbolId) || isStateSyncBarSymbol0217(symbolId);
}

export function isUnlabeledStateChoice0217(
  node: Pick<GraphNode, 'id' | 'label'>, symbolId: string | undefined,
): boolean {
  return symbolId === 'uml-state-choice' && (!node.label || node.label === node.id);
}

export function stateMarkerSize0217(
  symbolId: string | undefined, direction: LayoutDirection = 'RIGHT',
): { width: number; height: number } {
  if (symbolId === 'uml-state-initial') return { width: 24, height: 24 };
  if (symbolId === 'uml-state-final') return { width: 28, height: 28 };
  return direction === 'DOWN' || direction === 'UP'
    ? { width: 72, height: 10 } : { width: 10, height: 72 };
}

export function stateCircleRadius0217(width: number, height: number): number {
  return Math.max(4, Math.min(width, height) / 2 - 2);
}

export function stateCirclePath0217(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy - r} A${r} ${r} 0 1 1 ${cx} ${cy + r} A${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
}

export function stateMarkerPathPrimitives0217(
  ownerId: string, symbolId: string, style: RenderStyle028,
  width: number, height: number, fill: string, stroke: string, paper: string,
): readonly StencilPathPrimitive028[] {
  const base = { ownerId, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const lowfi = style === 'lowfi';
  if (isStateCircleSymbol0217(symbolId)) {
    const cx = width / 2;
    const cy = height / 2;
    const r = stateCircleRadius0217(width, height);
    if (symbolId === 'uml-state-initial') {
      return [{ ...base, id: `${ownerId}:outline`, role: 'outline',
        d: stateCirclePath0217(cx, cy, r), fill, stroke, strokeWidth: lowfi ? 2 : 1.5 }];
    }
    const ri = Number(Math.max(2, r * 0.6).toFixed(2));
    return [
      { ...base, id: `${ownerId}:outline`, role: 'outline',
        d: stateCirclePath0217(cx, cy, r), fill: paper, stroke, strokeWidth: lowfi ? 2.2 : 1.8 },
      { ...base, id: `${ownerId}:inner-outline`, role: 'inner-outline',
        d: stateCirclePath0217(cx, cy, ri), fill: stroke, stroke: 'none', strokeWidth: 0 },
    ];
  }
  const rad = Math.min(4, width / 2, height / 2);
  return [{ ...base, id: `${ownerId}:outline`, role: 'outline',
    d: roundedRectanglePath028(width, height, rad), fill, stroke, strokeWidth: lowfi ? 2 : 1.5 }];
}
