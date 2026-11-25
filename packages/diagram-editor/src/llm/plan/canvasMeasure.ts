/**
 * Slice 60 measurement with the canvas's own layout. Coordinates are valid
 * only for the layout that measured them, so a plan is placed with exactly
 * the call the editor makes for a full layout of source text: the same
 * parse, port projection, `incremental` operation (authored positions
 * retained), fonts and render style.
 */
import type { GraphIR } from '@graph-ir/core';
import type { SpatialSidecar028 } from '@coral-viz/render';
import { layoutNodes, type NotationType } from '../../hooks/diagramUtils';
import { parseCoralDSL } from '../../parsers';
import type { SpatialRect } from '../spatial/types';
import type { MeasurePlanGeometry, PlanGeometry } from './spatial';

/** The canvas settings a full layout reads (`documentSettings`). */
export interface CanvasLayoutSettings {
  notation: NotationType;
  layout: Parameters<typeof layoutNodes>[3];
  font: Parameters<typeof layoutNodes>[5];
  renderStyle028?: 'lowfi' | 'hifi';
}

/** Graph-absolute rectangles of canvas nodes, whose positions are local to their parent. */
export function canvasRects(nodes: readonly { id: string; position: { x: number; y: number }; parentId?: string;
  width?: number | null; height?: number | null }[]): Map<string, SpatialRect> {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const corner = (id: string): { x: number; y: number } => {
    const node = byId.get(id)!;
    const parent = node.parentId && byId.has(node.parentId) ? corner(node.parentId) : { x: 0, y: 0 };
    return { x: parent.x + node.position.x, y: parent.y + node.position.y };
  };
  return new Map(nodes.map(node => [node.id, { ...corner(node.id), width: node.width ?? NaN, height: node.height ?? NaN }]));
}

/** Lay out Coral source as the canvas's full layout does. */
export function canvasGeometry(settings: () => CanvasLayoutSettings, signal?: AbortSignal): MeasurePlanGeometry {
  return async (_graph, source): Promise<PlanGeometry> => {
    const { notation, layout, font, renderStyle028 } = settings();
    const parsed = parseCoralDSL(source);
    const envelope = (parsed.envelope ?? { version: '3.0.0', id: 'diagram' }) as Omit<GraphIR, 'nodes' | 'edges'>;
    const laid = await layoutNodes(parsed.nodes, parsed.edges, notation, layout, true, font, signal, envelope.constraints,
      'incremental', parsed.semanticInterpretations, envelope as SpatialSidecar028, renderStyle028 ?? 'lowfi');
    return Object.assign(canvasRects(laid.nodes), { diagnostics: laid.diagnostics });
  };
}
