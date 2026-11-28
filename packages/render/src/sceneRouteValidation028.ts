import { containerStencilShape028 } from './containerGeometry028.js';
/** Final painted-route checks shared by browser and SVG scene consumers. */
import type { GraphNode } from '@graph-ir/core';
import type { RenderScene, RenderSceneNode } from './scene.js';
import { resolveShapePath } from './scene.js';
import { sceneNodeShape029 } from './catalogLookup029.js';
import { isUserOutlineShape029 } from './userSymbolGeometry029.js';
import { stencilFit028 } from './stencilAnchorGeometry028.js';
import { svgPathContour028, type ContourSegment028 } from './svgPathContour028.js';
import { bpmnEventFrame028, isBpmnEventSymbol028 } from './bpmnEventVisual028.js';
import { bpmnGatewayFrame028, isBpmnGatewaySymbol028 } from './bpmnGatewayVisual028.js';
import { isStateCircleSymbol0217, isStateSyncBarSymbol0217, stateCirclePath0217, stateCircleRadius0217 } from './stateVisual0217.js';
import type { LayoutDirection, Point } from './layout/types.js';
import { segmentIntersectsBox } from './layout/routeGeometry.js';

// Treat subpixel contour sampling and stroke contact as boundary, not penetration.
const EPSILON = .15;
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function inside(p: Point, contour: readonly ContourSegment028[]): boolean {
  let winding = 0;
  for (const { start: a, end: b } of contour) {
    if (distanceToSegment(p, a, b) < EPSILON) return false;
    const cross = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
    if (a.y <= p.y && b.y > p.y && cross > 0) winding++;
    else if (a.y > p.y && b.y <= p.y && cross < 0) winding--;
  }
  return winding !== 0;
}
function penetrates(a: Point, b: Point, contour: readonly ContourSegment028[], strokeOnly = false): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  const parameters = [0, 1];
  for (const { start: c, end: d } of contour) {
    const ex = d.x - c.x, ey = d.y - c.y, determinant = dx * ey - dy * ex;
    if (Math.abs(determinant) < 1e-9) continue;
    const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / determinant;
    const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / determinant;
    if (strokeOnly && t * Math.hypot(dx, dy) > EPSILON && (1 - t) * Math.hypot(dx, dy) > EPSILON && u > 1e-6 && u < 1 - 1e-6) return true;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) parameters.push(t);
  }
  if (strokeOnly) return false;
  parameters.sort((left, right) => left - right);
  return parameters.slice(1).some((t, index) => {
    const middle = (t + parameters[index]!) / 2;
    return inside({ x: a.x + middle * dx, y: a.y + middle * dy }, contour);
  });
}
/** Absolute visible outline of a scene node: the geometry validation, contact
 * placement and repair all measure against. Open decorative strokes are excluded. */
export function sceneNodeContour029(node: Pick<RenderSceneNode, 'id' | 'x' | 'y' | 'width' | 'height' | 'shapeId'
  | 'symbolId' | 'shapeParameters' | 'container'>, direction: LayoutDirection,
  visibleContour?: (shapeId: string, parameters?: Readonly<Record<string, number | string | boolean>>,
    containerFrame?: { width: number; height: number }) => string): readonly ContourSegment028[] {
  if (isStateCircleSymbol0217(node.symbolId)) {
    const r = stateCircleRadius0217(node.width, node.height);
    const d = stateCirclePath0217(r, r, r);
    const circleShape = { id: 'ellipse', name: 'State Circle', type: 'ellipse' as const,
      viewBox: `0 0 ${r * 2} ${r * 2}`, path: d, defaultSize: { width: r * 2, height: r * 2 }, portAnchors: [] };
    const ox = node.x + node.width / 2 - r;
    const oy = node.y + node.height / 2 - r;
    return svgPathContour028(circleShape).map(({ start, end }) => ({
      start: { x: ox + start.x * r * 2, y: oy + start.y * r * 2 },
      end: { x: ox + end.x * r * 2, y: oy + end.y * r * 2 },
    }));
  }
  if (isStateSyncBarSymbol0217(node.symbolId)) {
    const barShape = containerStencilShape028(sceneNodeShape029(node)!, node.width, node.height, true);
    const rad = Math.min(4, node.width / 2, node.height / 2);
    const path = resolveShapePath(barShape, { cornerRadius: rad });
    return svgPathContour028({ ...barShape, path }).map(({ start, end }) => ({
      start: { x: node.x + start.x * node.width, y: node.y + start.y * node.height },
      end: { x: node.x + end.x * node.width, y: node.y + end.y * node.height },
    }));
  }
  const shape = containerStencilShape028(sceneNodeShape029(node)!, node.width, node.height, node.container);
  const event = isBpmnEventSymbol028(node.symbolId) ? bpmnEventFrame028(node.width, node.height, direction) : undefined;
  const frame = event ? { x: event.x + 4, y: event.y + 4, width: 48, height: 48 }
    : isBpmnGatewaySymbol028(node.symbolId) ? bpmnGatewayFrame028(node.width, node.height, direction)
      : { x: 0, y: 0, width: node.width, height: node.height };
  // A user outline is frame geometry: it maps into the node box by the identity.
  const fit = event ? { offsetX: 0, offsetY: 0, fittedWidth: 48, fittedHeight: 48 }
    : isUserOutlineShape029(shape) ? { offsetX: 0, offsetY: 0, fittedWidth: frame.width, fittedHeight: frame.height }
      : stencilFit028(shape, frame.width, frame.height, { symbolId: node.symbolId, layoutDirection: direction });
  const path = (isUserOutlineShape029(shape) ? undefined : visibleContour?.(shape.id, node.shapeParameters,
    node.container && shape.id === 'rectangle' ? { width: node.width, height: node.height } : undefined))
    ?? resolveShapePath(shape, node.shapeParameters);
  const segments = shape.strokeOnly ? svgPathContour028(path === shape.path ? shape : { ...shape, path })
    : (path.match(/M[^M]*/g) ?? []).flatMap((subpath) => {
      const contour = svgPathContour028({ ...shape, path: subpath });
      // Open decorative strokes have no filled interior. SVG implicitly
      // closes non-degenerate fill subpaths, including the brain outline.
      const first = contour[0]?.start, last = contour.at(-1)?.end;
      if (!first || !last) return [];
      const closed = [...contour, { start: last, end: first }];
      const area = closed.reduce((sum, segment) => sum + segment.start.x * segment.end.y - segment.end.x * segment.start.y, 0);
      return Math.abs(area) > 1e-8 ? closed : [];
    });
  return segments.map(({ start, end }) => ({
    start: { x: node.x + frame.x + fit.offsetX + start.x * fit.fittedWidth,
      y: node.y + frame.y + fit.offsetY + start.y * fit.fittedHeight },
    end: { x: node.x + frame.x + fit.offsetX + end.x * fit.fittedWidth,
      y: node.y + frame.y + fit.offsetY + end.y * fit.fittedHeight },
  }));
}

export function finalSceneRouteIssues028(scene: RenderScene, nodes: readonly GraphNode[],
  options: { layoutDirection?: LayoutDirection;
    visibleContour?: (shapeId: string, parameters?: Readonly<Record<string, number | string | boolean>>,
    containerFrame?: { width: number; height: number }) => string } = {},
): Array<{ edgeId: string; message: string }> {
  const parents = new Map<string, string>();
  const visit = (items: readonly GraphNode[], parent?: string) => {
    for (const node of items) {
      const owner = parent ?? node.parent;
      if (owner) parents.set(node.id, owner);
      visit(node.children ?? [], node.id);
    }
  };
  visit(nodes);
  const ancestor = (container: string, child: string): boolean => {
    const seen = new Set<string>();
    for (let id = parents.get(child); id && !seen.has(id); id = parents.get(id)) {
      if (id === container) return true;
      seen.add(id);
    }
    return false;
  };
  const contours = new Map<string, readonly ContourSegment028[]>();
  const issues: Array<{ edgeId: string; message: string }> = [];
  for (const edge of scene.edges) {
    if (edge.points.length < 2 || edge.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
      issues.push({ edgeId: edge.id, message: 'Final route has incomplete or non-finite geometry' }); continue;
    }
    for (const node of scene.nodes) {
      if (ancestor(node.id, edge.sourceId) || ancestor(node.id, edge.targetId)) continue;
      const bounds = { x: node.x, y: node.y, width: node.width, height: node.height };
      for (let index = 1; index < edge.points.length; index++) {
        // An interior anchor's escape runs inside its own node by definition.
        if (index === 1 && edge.escape029?.source && node.id === edge.sourceId) continue;
        if (index === edge.points.length - 1 && edge.escape029?.target && node.id === edge.targetId) continue;
        const a = edge.points[index - 1]!, b = edge.points[index]!;
        if (!segmentIntersectsBox(a, b, bounds)) continue;
        let contour = contours.get(node.id);
        if (!contour) { contour = sceneNodeContour029(node, options.layoutDirection ?? 'RIGHT', options.visibleContour); contours.set(node.id, contour); }
        if (penetrates(a, b, contour, sceneNodeShape029(node)?.strokeOnly)) {
          issues.push({ edgeId: edge.id,
            message: `Connector "${edge.id}" (${edge.sourceId} → ${edge.targetId}) passes through node "${node.id}"` }); break;
        }
      }
    }
  }
  return issues;
}
