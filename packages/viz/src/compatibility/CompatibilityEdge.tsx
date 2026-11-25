/**
 * CompatibilityEdge Component (CORAL-REQ-010)
 *
 * A custom React Flow edge component that displays visual feedback
 * for edge compatibility status (incompatible, warning, compatible).
 */

import { memo, useState, useCallback, useRef, useEffect, type CSSProperties } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  type Edge,
} from '@xyflow/react';
import { IncompatibilityTooltip } from './IncompatibilityTooltip.js';
import { SpatialScenePart028 } from '../components/SpatialSceneSvg028.js';
import { readEdgeViewMetadata } from '../viewMetadata.js';
import type { EdgeCompatibilityStatus, ConnectionValidation, Position } from '../types.js';
import { inkRoutePath028, markerDomId028, placeEndpointLabels, resolveFont,
  retargetSpatialEdgeParts028, routeMidpoint028, stableSvgId, visualDashPattern028,
  visualStyle028, type RenderStyle028, type ResolvedFont, type ResolvedEndpoint,
  type ScenePartRecord028 } from '@coral-viz/render';

/** Portable renderer labels own a complete pair so host themes cannot reduce contrast. */
export const PORTABLE_EDGE_LABEL_COLORS = {
  backgroundColor: 'white',
  color: 'rgb(28, 37, 48)',
} as const;

/**
 * Build an SVG path string from routed bend points.
 * Produces orthogonal (right-angle) line segments.
 */
export function buildRoutedPath(
  startPoint: Position,
  endPoint: Position,
  bendPoints: Position[]
): string {
  const allPoints = [startPoint, ...bendPoints, endPoint];
  const parts = [`M ${allPoints[0].x} ${allPoints[0].y}`];
  for (let i = 1; i < allPoints.length; i++) {
    parts.push(`L ${allPoints[i].x} ${allPoints[i].y}`);
  }
  return parts.join(' ');
}

/**
 * Compute the midpoint of a routed path for label placement.
 */
function routedPathMidpoint(
  startPoint: Position,
  endPoint: Position,
  bendPoints: Position[]
): { x: number; y: number } {
  return routeMidpoint028([startPoint, ...bendPoints, endPoint]);
}

/**
 * Get edge style based on compatibility status
 */
export function getEdgeStyleForStatus(
  status: EdgeCompatibilityStatus | undefined,
  baseStyle?: CSSProperties
): CSSProperties {
  const baseStroke = (baseStyle?.stroke as string) || '#666666';
  const baseWidth = (baseStyle?.strokeWidth as number) || 1.5;

  switch (status) {
    case 'incompatible':
      return {
        ...baseStyle,
        stroke: '#ef4444', // red-500
        strokeWidth: baseWidth + 0.5,
      };
    case 'warning':
      return {
        ...baseStyle,
        stroke: '#f59e0b', // amber-500
        strokeWidth: baseWidth + 0.5,
        strokeDasharray: '5,3',
      };
    case 'compatible':
    default:
      return {
        ...baseStyle,
        stroke: baseStroke,
        strokeWidth: baseWidth,
      };
  }
}

/**
 * Waypoint data for rendering handles on edges (CORAL-REQ-015)
 */
export interface WaypointHandleData {
  id: string;
  x: number;
  y: number;
  type: 'corner' | 'smooth';
}

/**
 * Extended edge data for compatibility-aware edges
 */
export interface CompatibilityEdgeData {
  /** Owned shaft, marker contacts, and labels from the current scene. */
  sceneParts028?: readonly ScenePartRecord028[];
  sceneShift028?: { x: number; y: number };
  /** Temporary gesture projection; the settled scene replaces it on release. */
  sceneTransient028?: boolean;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  renderStyle028?: RenderStyle028;
  renderTheme028?: 'light' | 'dark';
  renderFont028?: ResolvedFont;
  /** Stable DOM scope shared with this canvas's marker definitions. */
  markerNamespace028?: string;
  /** Compatibility status */
  compatibilityStatus?: EdgeCompatibilityStatus;
  /** Validation result with message */
  validation?: ConnectionValidation;
  /** Edge label */
  label?: string;
  /** Endpoint labels, so the edge can name its connection for a screen reader */
  sourceLabel?: string;
  targetLabel?: string;
  /** Canonical endpoint semantics resolved by the shared rendering boundary. */
  sourceEndpoint?: ResolvedEndpoint;
  targetEndpoint?: ResolvedEndpoint;
  /** Force tooltip to be visible (e.g. when hovering a diagnostics log entry) */
  forceShowTooltip?: boolean;
  /** Escape of an interior-anchored port: offset from the handle (the attachment)
   * to the interior point, drawn as the first or last connector segment. */
  escape029?: { source?: Position; target?: Position };
  /** Waypoints for manual edge routing (CORAL-REQ-015) */
  waypoints?: WaypointHandleData[];
  /** Callback when user double-clicks edge to add a waypoint */
  onWaypointAdd?: (edgeId: string, position: Position) => void;
  /** Callback when user right-clicks a waypoint to remove it */
  onWaypointRemove?: (edgeId: string, waypointId: string) => void;
  /** Callback when user starts dragging a waypoint */
  onWaypointDrag?: (edgeId: string, waypointId: string, position: Position, epoch?: number) => void;
  onWaypointDragStart?: (edgeId: string, waypointId: string, position: Position) => number | void;
  /** When true, an undefined start epoch refuses local pointer ownership. */
  requiresWaypointDragEpoch?: boolean;
  onWaypointDragEnd?: (edgeId: string, waypointId: string, position: Position, epoch?: number) => void;
  onWaypointDragCancel?: (edgeId: string, waypointId: string, epoch?: number) => void;
  /** Owning editor's epoch, used to release stale local pointer capture. */
  waypointGestureEpoch?: number;
  /** Custom properties */
  [key: string]: unknown;
}

/**
 * Props for the CompatibilityEdge component
 */
export interface CompatibilityEdgeProps extends EdgeProps<Edge<CompatibilityEdgeData>> {
  /** Path type for the edge */
  pathType?: 'bezier' | 'smoothstep';
  /** Optional injected React Flow converter; standalone consumers need no provider. */
  screenToFlowPosition?: (position: Position) => Position;
}

/**
 * CompatibilityEdge - React Flow edge with compatibility feedback
 *
 * This component renders an edge with visual styling based on its
 * compatibility status (from notation rules). Incompatible edges
 * are shown in red, warnings in amber, and compatible in the default color.
 *
 * A tooltip is shown on hover for incompatible/warning edges explaining
 * the issue.
 *
 * @example
 * ```tsx
 * // In your React Flow configuration
 * const edgeTypes = {
 *   compatibility: CompatibilityEdge,
 * };
 *
 * // Usage with useEdgeCompatibility hook
 * const { edgeCompatibility } = useEdgeCompatibility({ nodes, edges, notationId });
 *
 * const styledEdges = edges.map(edge => {
 *   const compat = edgeCompatibility.find(ec => ec.edgeId === edge.id);
 *   return {
 *     ...edge,
 *     type: 'compatibility',
 *     data: {
 *       ...edge.data,
 *       compatibilityStatus: compat?.status,
 *       validation: compat?.validation,
 *     },
 *   };
 * });
 * ```
 */
export const CompatibilityEdge = memo(function CompatibilityEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerStart,
  markerEnd,
  style,
  selected,
  pathType = 'smoothstep',
  screenToFlowPosition,
}: CompatibilityEdgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const status = data?.compatibilityStatus;
  const validation = data?.validation;
  const label = data?.label;
  const visual = visualStyle028(data?.renderStyle028 ?? 'lowfi', data?.renderTheme028 ?? 'light');
  const resolvedFont = data?.renderFont028 ?? readEdgeViewMetadata(data)?.font ?? resolveFont({ family: visual.fontFamily, size: visual.roleSize,
    weight: data?.renderStyle028 === 'hifi' ? 600 : 500, lineHeight: 1.4 });
  const resolvedFontFamily = resolvedFont ? JSON.stringify(resolvedFont.cssFamily) : undefined;
  const isTooltipVisible = showTooltip || (data?.forceShowTooltip ?? false);

  // Waypoint data (CORAL-REQ-015)
  const waypoints = data?.waypoints;
  const onWaypointAdd = data?.onWaypointAdd as ((edgeId: string, pos: Position) => void) | undefined;
  const onWaypointRemove = data?.onWaypointRemove as ((edgeId: string, wpId: string) => void) | undefined;
  const onWaypointDrag = data?.onWaypointDrag;

  const activePointer = useRef<{
    pointerId: number; waypointId: string; element: HTMLElement; epoch?: number;
    origin: Position; start: Position;
    move: CompatibilityEdgeData['onWaypointDrag'];
    end: CompatibilityEdgeData['onWaypointDragEnd'];
    cancel: CompatibilityEdgeData['onWaypointDragCancel'];
  } | null>(null);
  const finishPointer = useCallback((cancelled: boolean, position?: Position) => {
    const gesture = activePointer.current;
    if (!gesture) return;
    // Clear before releasing capture, since release can emit lostpointercapture.
    activePointer.current = null;
    if (cancelled) gesture.cancel?.(id, gesture.waypointId, gesture.epoch);
    else if (position) gesture.end?.(id, gesture.waypointId, position, gesture.epoch);
    if (gesture.element.hasPointerCapture?.(gesture.pointerId)) {
      gesture.element.releasePointerCapture(gesture.pointerId);
    }
  }, [id]);
  useEffect(() => {
    const cancel = () => finishPointer(true);
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('blur', cancel); cancel(); };
  }, [finishPointer]);
  useEffect(() => {
    const gesture = activePointer.current;
    if (gesture && (selected !== true || !waypoints?.some((point) => point.id === gesture.waypointId)
      || (gesture.epoch !== undefined && data?.waypointGestureEpoch !== undefined
        && gesture.epoch !== data.waypointGestureEpoch))) finishPointer(true);
  }, [selected, waypoints, data?.waypointGestureEpoch, finishPointer]);
  const toDiagramPosition = useCallback((target: Element, x: number, y: number): Position => {
    if (screenToFlowPosition) return screenToFlowPosition({ x, y });
    // Compatibility fallback for direct consumers without an injected provider.
    // Use the path's matrix, not the outer SVG's untransformed coordinate space.
    const svg = target.closest('svg');
    if (svg && typeof svg.createSVGPoint === 'function') {
      const matrix = (target as SVGGraphicsElement).getScreenCTM?.() ?? svg.getScreenCTM();
      if (matrix) {
        const point = svg.createSVGPoint();
        point.x = x; point.y = y;
        const mapped = point.matrixTransform(matrix.inverse());
        return { x: mapped.x, y: mapped.y };
      }
    }
    const root = target.closest('.react-flow');
    const viewport = root?.querySelector('.react-flow__viewport');
    if (root && viewport) {
      const bounds = root.getBoundingClientRect();
      const matrix = new DOMMatrix(getComputedStyle(viewport).transform);
      return { x: (x - bounds.left - matrix.e) / matrix.a, y: (y - bounds.top - matrix.f) / matrix.d };
    }
    return { x, y };
  }, [screenToFlowPosition]);

  // Check for routed path data (from edge router or ELK sections)
  const routedPath = data?.routedPath as
    | { startPoint: Position; endPoint: Position; bendPoints: Position[] }
    | undefined;

  // Compute edge path — use routed bend points when available, else smoothstep/bezier
  let edgePath: string;
  let labelX: number;
  let labelY: number;
  // Points along the drawn path; endpoint labels derive from the same geometry.
  let pathPoints: Position[];

  // Check if routed path is still valid (endpoints near current handle positions).
  // After a node drag, ELK's absolute coordinates become stale — fall back to smoothstep.
  const STALE_THRESHOLD = 5;
  const isRoutedPathFresh =
    routedPath &&
    Math.abs(routedPath.startPoint.x - sourceX) < STALE_THRESHOLD &&
    Math.abs(routedPath.startPoint.y - sourceY) < STALE_THRESHOLD &&
    Math.abs(routedPath.endPoint.x - targetX) < STALE_THRESHOLD &&
    Math.abs(routedPath.endPoint.y - targetY) < STALE_THRESHOLD;

  if (waypoints?.length) {
    // Manual anchors remain authoritative even when node geometry invalidates
    // router endpoints; attach the route to React Flow's current handles.
    const bends = routedPath?.bendPoints ?? waypoints;
    pathPoints = [{ x: sourceX, y: sourceY }, ...bends, { x: targetX, y: targetY }];
    edgePath = buildRoutedPath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, bends);
    const mid = routedPathMidpoint({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, bends);
    labelX = mid.x; labelY = mid.y;
  } else if (isRoutedPathFresh) {
    // Use ELK's full computed path (startPoint, bendPoints, endPoint).
    // These coordinates are consistent with each other since ELK computed them
    // as a unified route.
    pathPoints = [routedPath!.startPoint, ...routedPath!.bendPoints, routedPath!.endPoint];
    edgePath = buildRoutedPath(routedPath!.startPoint, routedPath!.endPoint, routedPath!.bendPoints);
    const mid = routedPathMidpoint(routedPath!.startPoint, routedPath!.endPoint, routedPath!.bendPoints);
    labelX = mid.x;
    labelY = mid.y;
  } else {
    // During a drag the saved route is stale. Keep the current semantic
    // contacts and derive a temporary orthogonal route from the live handles.
    // The line and its labels must refer to the same points.
    const vertical = sourcePosition === 'top' || sourcePosition === 'bottom' ||
      targetPosition === 'top' || targetPosition === 'bottom';
    const middle = vertical ? (sourceY + targetY) / 2 : (sourceX + targetX) / 2;
    pathPoints = vertical
      ? [{ x: sourceX, y: sourceY }, { x: sourceX, y: middle },
        { x: targetX, y: middle }, { x: targetX, y: targetY }]
      : [{ x: sourceX, y: sourceY }, { x: middle, y: sourceY },
        { x: middle, y: targetY }, { x: targetX, y: targetY }];
    edgePath = buildRoutedPath(pathPoints[0]!, pathPoints[pathPoints.length - 1]!, pathPoints.slice(1, -1));
    const midpoint = routedPathMidpoint(pathPoints[0]!, pathPoints[pathPoints.length - 1]!, pathPoints.slice(1, -1));
    labelX = midpoint.x;
    labelY = midpoint.y;
  }

  // Every branch ends at the handles; an interior anchor's escape is part of the connector.
  const escape = data?.escape029;
  if (escape?.source || escape?.target) {
    const first = pathPoints[0]!;
    const last = pathPoints[pathPoints.length - 1]!;
    pathPoints = [
      ...(escape.source ? [{ x: first.x + escape.source.x, y: first.y + escape.source.y }] : []),
      ...pathPoints,
      ...(escape.target ? [{ x: last.x + escape.target.x, y: last.y + escape.target.y }] : []),
    ];
  }

  void pathType;
  edgePath = inkRoutePath028(pathPoints, data?.renderStyle028 ?? 'lowfi');

  // Apply compatibility styling
  const edgeStyle = getEdgeStyleForStatus(status, {
    ...(style as CSSProperties), stroke: visual.ink, strokeWidth: visual.strokeWidth,
  });
  if (status !== 'warning') {
    const lineStyle = data?.lineStyle ?? (style?.strokeDasharray ? 'dashed' : 'solid');
    edgeStyle.strokeDasharray = visualDashPattern028(id, data?.renderStyle028 ?? 'lowfi', lineStyle);
  }
  const markerStroke = String(edgeStyle.stroke ?? visual.ink);
  const markerNamespace = data?.markerNamespace028 ?? 'canvas';
  const hasSceneParts = data?.sceneParts028 !== undefined;
  const useSceneInk = hasSceneParts && (data.sceneParts028?.length ?? 0) > 0;
  const showBaseInk = !hasSceneParts;
  const sceneParts = useSceneInk && data?.sceneTransient028
    ? retargetSpatialEdgeParts028(data.sceneParts028!, pathPoints.map((point) => ({
      x: point.x + (data.sceneShift028?.x ?? 0),
      y: point.y + (data.sceneShift028?.y ?? 0),
    })), data.renderStyle028 ?? 'lowfi')
    : data?.sceneParts028;
  const sceneRoute = sceneParts?.find((part) => part.geometry.kind === 'route');
  const sceneNamespace = stableSvgId('coral-instance', markerNamespace);
  const visibleMarkerStart = data?.sourceEndpoint?.marker && data.sourceEndpoint.marker.kind !== 'none'
    ? `url(#${markerDomId028(data.sourceEndpoint.marker, markerStroke, markerNamespace)})` : markerStart;
  const visibleMarkerEnd = data?.targetEndpoint?.marker && data.targetEndpoint.marker.kind !== 'none'
    ? `url(#${markerDomId028(data.targetEndpoint.marker, markerStroke, markerNamespace)})` : markerEnd;
  const endpointLabels = placeEndpointLabels(
    pathPoints,
    data?.sourceEndpoint ?? {},
    data?.targetEndpoint ?? {},
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
  );

  // Show tooltip on hover for incompatible/warning edges
  const handleMouseEnter = useCallback(() => {
    if (status === 'incompatible' || status === 'warning') {
      setShowTooltip(true);
    }
  }, [status]);

  const handleMouseLeave = useCallback(() => {
    setShowTooltip(false);
  }, []);

  // Double-click on edge to add waypoint (CORAL-REQ-015)
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onWaypointAdd) return;
      e.stopPropagation();
      onWaypointAdd(id, toDiagramPosition(e.currentTarget as Element, e.clientX, e.clientY));
    },
    [id, onWaypointAdd, toDiagramPosition],
  );

  const connectionName =
    `Connection from ${data?.sourceLabel ?? 'source'} to ${data?.targetLabel ?? 'target'}` +
    (label ? `, ${label}` : '') +
    (data?.sourceEndpoint?.navigability ? `, source ${data.sourceEndpoint.navigability}` : '') +
    (data?.targetEndpoint?.navigability ? `, target ${data.targetEndpoint.navigability}` : '') +
    (status === 'incompatible' ? ', not allowed by this notation'
      : status === 'warning' ? ', has a warning' : '');

  return (
    <>
      {/* Invisible wider path for easier hover detection + double-click to add waypoint */}
      <path
        data-coral-edge-hit={id}
        role={useSceneInk ? 'img' : undefined}
        aria-label={useSceneInk ? connectionName : undefined}
        aria-hidden={hasSceneParts && !useSceneInk ? true : undefined}
        d={useSceneInk && sceneRoute?.geometry.kind === 'route' ? sceneRoute.geometry.d : edgePath}
        transform={useSceneInk && sceneRoute
          ? `translate(${-(data?.sceneShift028?.x ?? 0)},${-(data?.sceneShift028?.y ?? 0)})` : undefined}
        fill="none"
        strokeWidth={useSceneInk && sceneRoute?.geometry.kind === 'route'
          ? sceneRoute.geometry.hitStrokeWidth : 20}
        stroke="transparent"
        style={{ cursor: 'pointer' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
      />

      {data?.sourceEndpoint?.navigability && (
        <g data-coral-endpoint="source" data-coral-navigability={data.sourceEndpoint.navigability} />
      )}
      {data?.targetEndpoint?.navigability && (
        <g data-coral-endpoint="target" data-coral-navigability={data.targetEndpoint.navigability} />
      )}

      {/* Visible edge. Edges carried no ARIA, so the connection a diagram is
          mostly made of was invisible to a screen reader (R-014). */}
      {useSceneInk && <g data-coral-scene-edge={id} pointerEvents="none" aria-hidden="true"
        transform={`translate(${-(data.sceneShift028?.x ?? 0)},${-(data.sceneShift028?.y ?? 0)})`}>
        {sceneParts?.map((part) => <SpatialScenePart028 key={part.id} part={part} namespace={sceneNamespace} />)}
      </g>}
      {useSceneInk && sceneParts?.filter((part) => part.role === 'edge-label').map((part) => (
        <rect key={`${part.id}:hit`} data-coral-edge-label-hit={id}
          x={part.bounds.x} y={part.bounds.y} width={part.bounds.width} height={part.bounds.height}
          transform={`translate(${-(data?.sceneShift028?.x ?? 0)},${-(data?.sceneShift028?.y ?? 0)})`}
          fill="transparent" pointerEvents="all" aria-hidden="true" style={{ cursor: 'pointer' }}
          onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} />
      ))}
      {showBaseInk && <BaseEdge
        onDoubleClick={handleDoubleClick}
        id={id}
        path={edgePath}
        markerStart={visibleMarkerStart}
        markerEnd={visibleMarkerEnd}
        style={edgeStyle}
        interactionWidth={0}
        aria-label={connectionName}
      />}

      {/* Edge label with tooltip */}
      {showBaseInk && (label || isTooltipVisible) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <IncompatibilityTooltip
              status={status}
              validation={validation}
              show={isTooltipVisible}
              position="top"
            >
              {label && (
                <div
                  data-coral-edge-label
                  className={resolvedFont ? 'coral-font-text' : undefined}
                  style={{
                    ...PORTABLE_EDGE_LABEL_COLORS,
                    backgroundColor: visual.paper,
                    color: visual.ink,
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: resolvedFont ? `${resolvedFont.size}px` : `${visual.roleSize}px`,
                    fontFamily: resolvedFontFamily ?? visual.fontFamily,
                    fontWeight: resolvedFont?.weight,
                    lineHeight: resolvedFont?.lineHeight,
                    ...(resolvedFont ? {
                      fontKerning: 'none',
                      fontOpticalSizing: 'none',
                      fontVariantLigatures: 'none',
                      fontFeatureSettings: '"kern" 0, "liga" 0, "clig" 0, "calt" 0',
                    } : {}),
                    border: `1px solid ${edgeStyle.stroke || '#666'}`,
                  }}
                >
                  {label}
                </div>
              )}
              {!label && isTooltipVisible && (
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    backgroundColor:
                      status === 'incompatible' ? '#ef4444' : '#f59e0b',
                    borderRadius: '50%',
                    border: '2px solid white',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                />
              )}
            </IncompatibilityTooltip>
          </div>
        </EdgeLabelRenderer>
      )}
      {useSceneInk && isTooltipVisible && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan" style={{ position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'none' }}>
            <IncompatibilityTooltip status={status} validation={validation}
              show position="top">
              <span aria-hidden="true" style={{ color: markerStroke }}>!</span>
            </IncompatibilityTooltip>
          </div>
        </EdgeLabelRenderer>
      )}

      {showBaseInk && endpointLabels.length > 0 && (
        <EdgeLabelRenderer>
          {endpointLabels.map((endpointLabel) => (
            <div
              key={`${endpointLabel.endpoint}:${endpointLabel.kind}`}
              data-coral-endpoint-label={`${endpointLabel.endpoint}:${endpointLabel.kind}`}
              data-coral-navigability={endpointLabel.endpoint === 'source'
                ? data?.sourceEndpoint?.navigability : data?.targetEndpoint?.navigability}
              className="nodrag nopan"
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${endpointLabel.x}px,${endpointLabel.y}px)`,
                pointerEvents: 'none',
                color: edgeStyle.stroke as string,
                background: 'white',
                fontSize: 10,
                padding: '0 2px',
              }}
            >
              {endpointLabel.text}
            </div>
          ))}
        </EdgeLabelRenderer>
      )}

      {/* Waypoint handles (CORAL-REQ-015) — only when selected */}
      {selected && waypoints && waypoints.length > 0 && (
        <EdgeLabelRenderer>
          {waypoints.map((wp) => (
            <div
              key={wp.id}
              data-waypoint-id={wp.id}
              className="nodrag nopan"
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${wp.x}px,${wp.y}px)`,
                width: '8px',
                height: '8px',
                backgroundColor: '#3b82f6',
                borderRadius: '50%',
                border: '1.5px solid white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                cursor: 'grab',
                pointerEvents: 'all',
                touchAction: 'none',
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                finishPointer(true);
                onWaypointRemove?.(id, wp.id);
              }}
              onPointerDown={(event) => {
                if (event.button !== 0 || !event.isPrimary || activePointer.current) return;
                event.preventDefault();
                event.stopPropagation();
                const epoch = data?.onWaypointDragStart?.(id, wp.id, { x: wp.x, y: wp.y });
                if (data?.requiresWaypointDragEpoch && epoch === undefined) return;
                activePointer.current = {
                  pointerId: event.pointerId, waypointId: wp.id, element: event.currentTarget,
                  origin: toDiagramPosition(event.currentTarget, event.clientX, event.clientY), start: { x: wp.x, y: wp.y },
                  epoch: epoch === undefined ? undefined : epoch,
                  move: onWaypointDrag, end: data?.onWaypointDragEnd, cancel: data?.onWaypointDragCancel,
                };
                try { event.currentTarget.setPointerCapture(event.pointerId); }
                catch { finishPointer(true); return; }
                if (!data?.onWaypointDragStart) onWaypointDrag?.(id, wp.id, { x: wp.x, y: wp.y });
              }}
              onPointerMove={(event) => {
                const gesture = activePointer.current;
                if (!gesture || gesture.pointerId !== event.pointerId) return;
                event.stopPropagation();
                const mapped = toDiagramPosition(event.currentTarget, event.clientX, event.clientY);
                const position = { x: gesture.start.x + mapped.x - gesture.origin.x, y: gesture.start.y + mapped.y - gesture.origin.y };
                if (gesture.epoch === undefined) gesture.move?.(id, gesture.waypointId, position);
                else gesture.move?.(id, gesture.waypointId, position, gesture.epoch);
              }}
              onPointerUp={(event) => {
                const gesture = activePointer.current;
                if (!gesture || gesture.pointerId !== event.pointerId || event.button !== 0) return;
                event.stopPropagation();
                const mapped = toDiagramPosition(event.currentTarget, event.clientX, event.clientY);
                const position = { x: gesture.start.x + mapped.x - gesture.origin.x, y: gesture.start.y + mapped.y - gesture.origin.y };
                if (!gesture.end) {
                  if (gesture.epoch === undefined) gesture.move?.(id, gesture.waypointId, position);
                  else gesture.move?.(id, gesture.waypointId, position, gesture.epoch);
                }
                finishPointer(false, position);
              }}
              onPointerCancel={(event) => {
                if (activePointer.current?.pointerId === event.pointerId) finishPointer(true);
              }}
              onLostPointerCapture={(event) => {
                if (activePointer.current?.pointerId === event.pointerId) finishPointer(true);
              }}
            />
          ))}
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export default CompatibilityEdge;
