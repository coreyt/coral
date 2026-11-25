/**
 * SymbolNode - React Flow node component that renders symbols
 *
 * This component looks up the symbol and shape from registries
 * and renders them with proper styling and handles.
 *
 * Supports inline label editing via double-click.
 */

import { memo, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Handle, Position, useStoreApi, useUpdateNodeInternals } from '@xyflow/react';
import { ShapeRenderer } from './ShapeRenderer.js';
import { bpmnEventCaptionOffsetX028, bpmnEventFrame028, bpmnEventLabelLayout028, classifierPresentation, classifierPrimitives028, isBpmnEventSymbol028, layoutNodeLabel, measureSvgNode, nodeLabelPrimitives028, notationRegistry, renderSymbolId, resolveFont, resolveNodeAppearance, resolveNotationNode028, semanticLayoutPorts028, shapeRegistry, stencilRayPoint028, symbolMarkerName, symbolMarkerPrimitives, visualStyle028, stableSvgId, catalogShape029, catalogSymbol029, frameFitPoint029, type DocumentCatalog029, type RenderStyle028, type ResolvedFont, type GraphNode, type ScenePartRecord028 } from '@coral-viz/render';
import type { LayoutDirection } from '@coral-viz/render/layout';
import { SpatialScenePart028 } from './SpatialSceneSvg028.js';
import { UserSymbolArtwork029 } from './UserSymbolArtwork029.js';
import { useEditContext } from './EditContext.js';
import { readNodeViewMetadata } from '../viewMetadata.js';
import { queueNodeInternals } from './queueNodeInternals.js';
import { effectiveInterpretedPorts028, effectiveSymbolPorts, type AuthoredPort, type CanvasPort028 } from '../compatibility/effectivePorts.js';
import type {
  HandleDragState, SymbolPort, CoralNodeData } from '../types.js';

/**
 * Extended node data for symbol-aware rendering
 */
/** Visually hidden, but announced. */
const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export interface SymbolNodeData extends CoralNodeData {
  /** Owned drawing parts from the current resolved scene; handles remain interactive. */
  sceneParts028?: readonly ScenePartRecord028[];
  markerNamespace028?: string;
  sceneOrigin028?: { x: number; y: number; width: number; height: number };
  /** Routed semantic port contacts from the prepared scene, in viewport coordinates. */
  scenePortContacts028?: Readonly<Record<string, Readonly<{ x: number; y: number }>>>;
  renderStyle028?: RenderStyle028;
  renderTheme028?: 'light' | 'dark';
  renderFont028?: ResolvedFont;
  /** Diagram profile used by the shared symbol resolver. */
  notationId?: string;
  /** Derived layout attachment sides; never authored or persisted port pins. */
  resolvedPortAttachments?: Readonly<Record<string, SymbolPort['anchor']>>;
  /** Derived normalized positions on those sides, needed for corner hints. */
  resolvedPortPositions?: Readonly<Record<string, number>>;
  /** Flow direction used only when deriving a view attachment without a routed result. */
  layoutDirection?: LayoutDirection;
  /** Symbol ID (e.g., 'flowchart-process', 'arch-service') */
  symbolId?: string;
  /** Variant ID (e.g., 'start', 'end') */
  variant?: string;
  /** Override fill color */
  fill?: string;
  /** Override stroke color */
  stroke?: string;
  /** Override stroke width */
  strokeWidth?: number;
  /** Node width */
  width?: number;
  /** Node height */
  height?: number;
  /** Enable hand-drawn sketch rendering */
  sketch?: boolean;
  /**
   * Live state of a connection gesture relative to this node, so its handles
   * can show whether dropping here would be accepted (R-016).
   */
  dragState?: HandleDragState;
  /** Live compatibility keyed by the concrete React Flow handle id. */
  dragStates?: Record<string, HandleDragState>;
}

/**
 * Props passed to SymbolNode by React Flow
 */
interface SymbolNodeProps {
  id: string;
  data: SymbolNodeData;
  selected?: boolean;
}

/**
 * Map anchor direction to React Flow Position
 */
function anchorToPosition(anchor: string): Position {
  switch (anchor) {
    case 'NORTH':
      return Position.Top;
    case 'SOUTH':
      return Position.Bottom;
    case 'EAST':
      return Position.Right;
    case 'WEST':
      return Position.Left;
    default:
      return Position.Top;
  }
}

/**
 * Get port position offset based on port count and index
 */
function getPortOffset(port: SymbolPort, portIndex: number, totalPortsOnSide: number): string {
  if (port.position !== undefined) {
    return `${port.position * 100}%`;
  }
  // Distribute ports evenly
  const offset = ((portIndex + 1) / (totalPortsOnSide + 1)) * 100;
  return `${offset}%`;
}

/**
 * Get styling from symbol/variant defaults
 */

/**
 * SymbolNode component - renders any symbol from the registry
 *
 * Supports inline label editing via double-click:
 * - Double-click to edit the label
 * - Press Enter or blur to save
 * - Press Escape to cancel
 */
export const SymbolNode = memo(function SymbolNode({ id, data, selected }: SymbolNodeProps) {
  const visual = visualStyle028(data.renderStyle028 ?? 'lowfi', data.renderTheme028 ?? 'light');
  // Edit context for label editing
  const { onLabelEdit, editingNodeId, startEditing, stopEditing } = useEditContext();
  const isEditing = editingNodeId === id;
  const updateNodeInternals = useUpdateNodeInternals();
  const flowStore = useStoreApi();
  const resolvedFont = data.renderFont028 ?? readNodeViewMetadata(data)?.font ?? resolveFont({ family: visual.fontFamily, size: visual.labelSize,
    weight: data.renderStyle028 === 'hifi' ? 600 : 500, lineHeight: 1.4 });
  const resolvedFontFamily = resolvedFont ? JSON.stringify(resolvedFont.cssFamily) : undefined;
  const hasResolvedFont = true;

  // Local state for edit value
  const [editValue, setEditValue] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);

  // Preserve an explicitly authored blank/unresolved symbol from the canonical
  // payload; absence alone permits semantic fallback, exactly as SVG output does.
  const projectedSymbol = Object.prototype.hasOwnProperty.call(data.canonical ?? {}, 'symbol')
    ? data.canonical?.symbol
    : data.symbolId;
  const authoredVariant = data.variant ?? data.canonical?.variant;
  const profileAvailable = !data.notationId || notationRegistry.get(data.notationId) !== undefined;
  // A user symbol resolves only through its document catalog; without it the node is unresolved.
  const catalog = data.documentCatalog029 as DocumentCatalog029 | undefined;
  const interpretation = data.notationId && profileAvailable
    ? resolveNotationNode028({ id, type: data.nodeType ?? 'node',
      ...(projectedSymbol !== undefined ? { symbol: projectedSymbol } : {}),
      ...(authoredVariant !== undefined ? { variant: authoredVariant } : {}),
      ...(data.authoredSemanticPorts !== undefined ? { authoredPorts: data.authoredSemanticPorts } : {}) },
    data.notationId, catalog)
    : undefined;
  const unresolved = !profileAvailable || interpretation?.status === 'unknown-symbol' ||
    interpretation?.status === 'unknown-variant';
  const portConflict = !!interpretation?.portCollisions.length ||
    (data.authoredSemanticPorts !== undefined &&
      (data.canonical?.ports !== undefined || !data.notationId));
  const interpretedShape = catalogShape029(interpretation?.effectiveShapeId ?? 'rectangle', catalog);
  const unsupportedExactAttachment = interpretation?.semanticPorts.some((port) => {
    if (port.anchor === 'auto' || port.anchor === 'side' || port.anchor === 'corner') return false;
    if (typeof port.anchor === 'object')
      return interpretation.invalidAnchorPortIds.includes(port.id) || !interpretedShape;
    if (!['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'].includes(port.anchor)) return true;
    return !interpretedShape;
  }) ?? false;
  // A user symbol's definition ports are semantic ports pinned to its own outline.
  const interpretedPorts = data.authoredSemanticPorts !== undefined || !!interpretation?.userSymbol029;
  let projectionUnavailable = false;
  if (interpretedPorts && interpretation && !unresolved && !portConflict &&
    !unsupportedExactAttachment) {
    try {
      const selectedSymbol = interpretation.effectiveSymbolId
        ? catalogSymbol029(interpretation.effectiveSymbolId, catalog) : undefined;
      semanticLayoutPorts028(interpretation, selectedSymbol, authoredVariant,
        data.layoutDirection ?? 'RIGHT');
    } catch {
      projectionUnavailable = true;
    }
  }
  const attachmentUnavailable = unsupportedExactAttachment || projectionUnavailable || (interpretation?.semanticPorts.some((port) => {
    if (port.anchor !== 'corner') return false;
    const side = data.resolvedPortAttachments?.[port.id];
    const position = data.resolvedPortPositions?.[port.id];
    return !interpretedShape || !side || (position !== 0 && position !== 1);
  }) ?? false);
  const unresolvedText = !profileAvailable ? `Unknown profile: ${data.notationId}`
    : interpretation?.status === 'unknown-symbol' ? `Unknown symbol: ${projectedSymbol}`
      : interpretation?.status === 'unknown-variant' ? `Unknown variant: ${authoredVariant}` : undefined;
  const portConflictText = interpretation?.portCollisions.length
    ? `Conflicting semantic port: ${interpretation.portCollisions.join(', ')}`
    : data.authoredSemanticPorts !== undefined && !data.notationId
      ? 'Profile required to resolve semantic ports'
      : portConflict ? 'Legacy geometric ports conflict with semantic ports' : undefined;
  const portIssueText = portConflictText ?? (unsupportedExactAttachment || projectionUnavailable
    ? 'Exact stencil anchor geometry is unavailable' : attachmentUnavailable
      ? 'Derived corner attachment is unavailable' : undefined);
  const symbolId = renderSymbolId({
    id, type: data.nodeType, symbol: projectedSymbol, properties: data.properties,
  } as GraphNode, data.notationId, catalog);

  // Look up symbol and shape
  const symbol = symbolId ? catalogSymbol029(symbolId, catalog) : undefined;
  const shape = unresolved ? undefined : symbol ? catalogShape029(symbol.shape, catalog) : shapeRegistry.get('rectangle');

  // Resolve the same catalog appearance used by standalone SVG output.
  const appearance = resolveNodeAppearance({
    id, type: data.nodeType, label: data.label, symbol: symbolId, variant: authoredVariant,
  }, { fill: '#ffffff', stroke: '#666666', text: '#111827', edge: '#666666' }, data.notationId, catalog);
  const baseStyle = appearance.style;
  // Without scene parts a user symbol draws its own definition; the node's
  // React ID scopes it so two nodes never share an SVG ID.
  const userSymbol = appearance.artwork029 && symbolId ? catalog?.userSymbols.get(symbolId) : undefined;
  const classifier = classifierPresentation(data.canonical?.classifier);
  const style = {
    fill: data.fill ?? visual.paper,
    stroke: data.stroke ?? visual.ink,
    strokeWidth: data.strokeWidth ?? visual.strokeWidth,
    strokeDasharray: baseStyle.strokeDasharray,
  };

  // Get dimensions
  const measured = !data.sceneParts028 && shape ? measureSvgNode({ id, type: data.nodeType ?? 'node', label: data.label,
    ...(symbolId !== undefined ? { symbol: symbolId } : {}),
    ...(data.canonical?.classifier ? { classifier: data.canonical.classifier } : {}),
  }, { style: data.renderStyle028 ?? 'lowfi', notation: data.notationId,
    fontFamily: resolvedFont.requestedFamily, fontSize: resolvedFont.size,
    fontWeight: resolvedFont.weight, lineHeight: resolvedFont.lineHeight,
    layoutDirection: data.layoutDirection ?? 'RIGHT' }) : undefined;
  const width = data.sceneOrigin028?.width ?? data.width ?? data.canonical?.dimensions?.width ?? measured?.width ?? shape?.defaultSize?.width ?? 120;
  const height = data.sceneOrigin028?.height ?? data.height ?? data.canonical?.dimensions?.height ?? measured?.height ?? shape?.defaultSize?.height ?? 60;
  const labelLayout = !data.sceneParts028 && shape && isBpmnEventSymbol028(symbolId)
    ? bpmnEventLabelLayout028(data.label, resolvedFont, width, height, data.layoutDirection ?? 'RIGHT')
    : !data.sceneParts028 && shape ? layoutNodeLabel({
    text: data.label, shapeId: shape.id, sizingMode: 'adaptive',
    fontFamily: resolvedFont.cssFamily, fontSize: resolvedFont.size,
    fontWeight: resolvedFont.weight, lineHeight: resolvedFont.lineHeight,
    dimensions: { width, height },
    notationId: data.notationId,
    symbolId,
  }) : undefined;
  const classifierDrawing = !data.sceneParts028 && classifier
    ? classifierPrimitives028(id, classifier, width, resolvedFont, visual.ink)
    : undefined;
  const defaultLabelFontSize = visual.labelSize;
  const defaultLabelLineClamp = Math.max(1, Math.floor((height - 16) / (defaultLabelFontSize * 1.2)));

  useEffect(() => {
    if (hasResolvedFont) return queueNodeInternals(flowStore.getState, id, updateNodeInternals);
  // Replacing a same-sized scene clears XYFlow's cached handle bounds too.
  // Refresh after its new geometry/contacts commit, even without a resize.
  }, [data.sceneParts028, data.scenePortContacts028,
    flowStore.getState, hasResolvedFont, height, id, updateNodeInternals, width]);

  // Get ports
  const authoredPorts = (data.canonical as { ports?: AuthoredPort[] } | undefined)?.ports;
  const ports: CanvasPort028[] = unresolved || portConflict || attachmentUnavailable || (interpretation && authoredPorts === undefined &&
    interpretation.semanticPorts.length === 0) ? [] :
    interpretation && interpretedPorts
      ? effectiveInterpretedPorts028(interpretation, symbol, authoredVariant,
        data.layoutDirection ?? 'RIGHT', data.resolvedPortAttachments, data.resolvedPortPositions)
      : effectiveSymbolPorts(symbol, authoredVariant, authoredPorts).map((port) => {
    const derived = data.resolvedPortAttachments?.[port.id];
    return authoredPorts === undefined &&
      (derived === 'NORTH' || derived === 'SOUTH' || derived === 'EAST' || derived === 'WEST')
      ? { ...port, anchor: derived } : port;
  });

  // Group ports by side for positioning
  const portsBySide = useMemo(() => {
    const grouped: Record<string, SymbolPort[]> = {};
    ports.forEach((port) => {
      const side = port.anchor;
      if (!grouped[side]) grouped[side] = [];
      grouped[side].push(port);
    });
    return grouped;
  }, [ports]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Sync edit value when data.label changes (external updates)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(data.label);
    }
  }, [data.label, isEditing]);

  // Handle double-click to start editing
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent React Flow from handling
      setEditValue(data.label);
      startEditing(id);
    },
    [id, data.label, startEditing]
  );

  // Handle save (Enter or blur)
  const handleSave = useCallback(() => {
    if (editValue.trim() !== data.label && onLabelEdit) {
      onLabelEdit(id, editValue.trim());
    }
    stopEditing();
  }, [id, editValue, data.label, onLabelEdit, stopEditing]);

  // Handle cancel (Escape)
  const handleCancel = useCallback(() => {
    setEditValue(data.label);
    stopEditing();
  }, [data.label, stopEditing]);

  // Handle key down events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  // Accessible name and state (R-014). Nodes carried no ARIA at all, so a
  // screen reader announced an unlabelled group of divs.
  const kindName = symbol?.name ?? data.symbolId ?? data.nodeType ?? 'node';
  const accessibleName = unresolved
    ? `${data.label ?? id}, ${unresolvedText}`
    : portIssueText ? `${data.label ?? id}, ${kindName}, ${portIssueText}`
      : classifier?.accessibleName ?? `${data.label ?? id}, ${kindName}`;
  const dragDescription =
    data.dragState === 'compatible'
      ? 'can connect here'
      : data.dragState === 'warning'
        ? 'can connect here with a warning'
      : data.dragState === 'incompatible'
        ? 'cannot connect here'
        : undefined;

  return (
    <div
      role="group"
      aria-label={accessibleName}
      aria-selected={selected}
      aria-describedby={dragDescription ? `${id}-drag-state` : undefined}
      tabIndex={0}
      style={{
        position: 'relative',
        width,
        height,
        cursor: isEditing ? 'text' : 'grab',
      }}
      onDoubleClick={handleDoubleClick}
    >
      {dragDescription && (
        <span id={`${id}-drag-state`} style={SR_ONLY}>
          {dragDescription}
        </span>
      )}
      {unresolved && (
        <div data-coral-unresolved-symbol role="alert" style={{
          position: 'absolute', inset: 0, border: '2px dashed #b91c1c',
          background: '#fff7f7', color: '#991b1b', boxSizing: 'border-box',
          padding: 5, fontSize: 11, overflow: 'hidden',
        }}>
          {unresolvedText}. {data.label}
        </div>
      )}
      {(portConflict || attachmentUnavailable) && !unresolved && (
        <span data-coral-port-conflict={portConflict ? '' : undefined}
          data-coral-port-attachment-unavailable={attachmentUnavailable ? '' : undefined}
          role="alert" title={portIssueText} style={{
          position: 'absolute', top: -8, right: -8, zIndex: 2,
          width: 18, height: 18, borderRadius: '50%',
          background: '#b91c1c', color: '#ffffff', fontSize: 12,
          lineHeight: '18px', textAlign: 'center', fontWeight: 700,
        }}>
          <span aria-hidden="true">!</span><span style={SR_ONLY}>{portIssueText}</span>
        </span>
      )}
      {data.sceneParts028 && data.sceneOrigin028 && (
        <svg data-coral-scene-node={id} width={width} height={height}
          viewBox={`${data.sceneOrigin028.x} ${data.sceneOrigin028.y} ${width} ${height}`}
          style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
          {data.sceneParts028.map((part) => <SpatialScenePart028 key={part.id} part={part} namespace={stableSvgId('coral-instance', data.markerNamespace028 ?? 'canvas')} />)}
        </svg>
      )}
      {selected && data.sceneParts028 && <div data-coral-selection-overlay
        style={{ position: 'absolute', inset: -3, border: '2px solid #0066ff',
          pointerEvents: 'none' }} />}
      {!data.sceneParts028 && userSymbol && (
        <UserSymbolArtwork029 symbol={userSymbol} width={width} height={height} color={visual.ink}
          style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }} />
      )}
      {/* Render the shape */}
      {shape && !data.sceneParts028 && !appearance.artwork029 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
          }}
        >
          <ShapeRenderer
            shape={shape}
            ownerId={id}
            symbolId={symbolId}
            width={width}
            height={height}
            fill={style.fill}
            stroke={selected ? '#0066ff' : style.stroke}
            strokeWidth={selected ? style.strokeWidth + 1 : style.strokeWidth}
            strokeDasharray={style.strokeDasharray}
            doubleOutline={baseStyle.doubleOutline}
            parameters={appearance.shapeParameters}
            renderStyle028={data.renderStyle028 ?? 'lowfi'}
            layoutDirection={data.layoutDirection ?? 'RIGHT'}
          />
        </div>
      )}

      {!unresolved && !data.sceneParts028 && appearance.glyph && (
        <svg
          role="img"
          aria-label={appearance.glyph.name}
          viewBox={appearance.glyph.viewBox}
          width={20}
          height={20}
          style={{ position: 'absolute', left: 8, top: 8, color: visual.ink }}
        >
          <title>{appearance.glyph.name}</title>
          {appearance.glyph.paths.map((path, index) => (
            <path key={index} d={path.d} fill={path.filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
      )}
      {!unresolved && !data.sceneParts028 && appearance.symbolMarker && (
        <svg
          role="img"
          aria-label={symbolMarkerName(appearance.symbolMarker)}
          data-coral-symbol-marker={appearance.symbolMarker}
          viewBox="0 0 16 16"
          width={16}
          height={16}
          style={{ position: 'absolute', right: 6, top: 6, color: visual.ink }}
        >
          <title>{symbolMarkerName(appearance.symbolMarker)}</title>
          {symbolMarkerPrimitives(appearance.symbolMarker).map((primitive, index) => (
            <path key={index} d={primitive.d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
      )}

      {/* Label overlay */}
      {!unresolved && (!data.sceneParts028 || isEditing) && <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px',
          boxSizing: 'border-box',
        }}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className={resolvedFont ? 'coral-font-text' : undefined}
            style={{
              fontSize: resolvedFont ? `${resolvedFont.size}px` : `${visual.labelSize}px`,
              fontWeight: resolvedFont?.weight ?? 500,
              ...(resolvedFont ? {
                fontFamily: resolvedFontFamily,
                lineHeight: resolvedFont.lineHeight,
                fontKerning: 'none',
                fontOpticalSizing: 'none',
                fontVariantLigatures: 'none',
                fontFeatureSettings: '"kern" 0, "liga" 0, "clig" 0, "calt" 0',
              } : {}),
              textAlign: 'center',
              color: visual.ink,
              fontStyle: appearance.text.fontStyle,
              textDecoration: appearance.text.textDecoration,
              width: '100%',
              maxWidth: '100%',
              padding: '2px 4px',
              border: '1px solid #0066ff',
              borderRadius: '2px',
              outline: 'none',
              background: 'white',
            }}
          />
        ) : (
          <div
            data-coral-node-label
            title={data.label}
            className={resolvedFont ? 'coral-font-text' : undefined}
            style={{
              fontSize: resolvedFont ? `${resolvedFont.size}px` : `${defaultLabelFontSize}px`,
              color: visual.ink,
              fontWeight: resolvedFont?.weight ?? 500,
              fontFamily: resolvedFontFamily ?? visual.fontFamily,
              lineHeight: resolvedFont?.lineHeight,
              ...(resolvedFont ? {
                fontKerning: 'none',
                fontOpticalSizing: 'none',
                fontVariantLigatures: 'none',
                fontFeatureSettings: '"kern" 0, "liga" 0, "clig" 0, "calt" 0',
                whiteSpace: 'nowrap',
              } : {}),
              textAlign: 'center',
              fontStyle: appearance.text.fontStyle,
              textDecoration: appearance.text.textDecoration,
              wordWrap: resolvedFont ? 'normal' : 'break-word',
              width: '100%',
              maxWidth: '100%',
              maxHeight: '100%',
              overflow: labelLayout || classifierDrawing ? 'visible' : 'hidden',
              textOverflow: resolvedFont ? 'clip' : 'ellipsis',
              ...(!resolvedFont ? {
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: defaultLabelLineClamp,
                overflowWrap: 'anywhere',
              } : {}),
            }}
          >
            {classifierDrawing ? (
              <svg data-coral-classifier width={width} height={height}
                viewBox={`0 0 ${width} ${height}`}
                style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}>
                <title>{classifier?.accessibleName}</title>
                {classifierDrawing.separators.map((separator) =>
                  <line key={separator.id} data-coral-part-id={separator.id}
                    data-coral-classifier-separator={separator.compartmentId}
                    x1={separator.x1} y1={separator.y1} x2={separator.x2} y2={separator.y2}
                    stroke={separator.stroke} strokeWidth={separator.strokeWidth} />)}
                {classifierDrawing.text.map((run) =>
                  <text key={run.id} data-coral-part-id={run.id}
                    data-coral-classifier-row={run.compartmentId}
                    data-coral-classifier-name={run.role === 'classifier-name' ? '' : undefined}
                    data-coral-classifier-stereotype={run.role === 'classifier-stereotype' ? '' : undefined}
                    x={run.x} y={run.y} fill={run.fill} textAnchor={run.anchor}
                    fontFamily={run.fontFamily} fontSize={run.fontSize} fontWeight={run.fontWeight}
                    fontStyle={run.fontStyle} textDecoration={run.textDecoration}
                    style={{ fontKerning: 'none', fontVariantLigatures: 'none',
                      fontOpticalSizing: 'none', fontFeatureSettings: '"kern" 0, "liga" 0, "clig" 0, "calt" 0' }}>
                    {run.text}
                  </text>)}
              </svg>
            ) : labelLayout
              ? <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
                  style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}>
                  {nodeLabelPrimitives028(id, labelLayout, resolvedFont, visual.ink).map((run) =>
                    <text key={run.id} data-coral-label-line data-coral-part-id={run.id}
                      x={run.x + (isBpmnEventSymbol028(symbolId)
                      ? bpmnEventCaptionOffsetX028(labelLayout, data.layoutDirection ?? 'RIGHT') : 0)} y={run.y} fill={run.fill} textAnchor={run.anchor}
                      fontFamily={run.fontFamily} fontSize={run.fontSize}
                      fontWeight={run.fontWeight}
                      style={{ fontKerning: 'none', fontVariantLigatures: 'none',
                        fontOpticalSizing: 'none', fontFeatureSettings: '"kern" 0, "liga" 0, "clig" 0, "calt" 0' }}>
                      {run.text}
                    </text>)}
                </svg>
              : data.label}
          </div>
        )}
      </div>}

      {/* Render handles for each port */}
      {ports.map((port) => {
        const portsOnSide = portsBySide[port.anchor] || [];
        const indexOnSide = portsOnSide.indexOf(port);
        const offset = getPortOffset(port, indexOnSide, portsOnSide.length);

        const position = anchorToPosition(port.anchor);
        const isVertical = position === Position.Top || position === Position.Bottom;

        const freePoint = !isBpmnEventSymbol028(symbolId) && !port.outlinePoint && port.freeStencil && shape ? (() => {
          const along = parseFloat(offset) / 100;
          const toward = port.anchor === 'NORTH' ? { x: along, y: 0 }
            : port.anchor === 'SOUTH' ? { x: along, y: 1 }
              : port.anchor === 'EAST' ? { x: 1, y: along } : { x: 0, y: along };
          return stencilRayPoint028(shape, toward, port.freeStencil);
        })() : undefined;
        const normalizedPoint = port.outlinePoint ?? freePoint;
        const eventFrame = isBpmnEventSymbol028(symbolId)
          ? bpmnEventFrame028(width, height, data.layoutDirection ?? 'RIGHT') : undefined;
        const eventPoint = eventFrame ? {
          x: (eventFrame.x + 28 + (port.anchor === 'EAST' ? 24 : port.anchor === 'WEST' ? -24 : 0)) / width,
          y: (eventFrame.y + 28 + (port.anchor === 'SOUTH' ? 24 : port.anchor === 'NORTH' ? -24 : 0)) / height,
        } : undefined;
        const outlinePoint = eventPoint ?? (normalizedPoint && shape
          ? frameFitPoint029(shape, normalizedPoint, width, height, { notationId: data.notationId, symbolId }) : normalizedPoint);
        const sceneContact = data.sceneOrigin028 && data.scenePortContacts028?.[port.id];
        const handleStyle: React.CSSProperties = sceneContact ? {
          position: 'absolute',
          left: `${sceneContact.x - data.sceneOrigin028!.x}px`,
          top: `${sceneContact.y - data.sceneOrigin028!.y}px`,
          right: 'auto', bottom: 'auto',
          transform: 'translate(-50%, -50%)',
        } : outlinePoint ? {
          position: 'absolute', left: `${outlinePoint.x * 100}%`,
          top: `${outlinePoint.y * 100}%`, right: 'auto', bottom: 'auto',
          transform: 'translate(-50%, -50%)',
        } : {
          position: 'absolute',
          ...(isVertical
            ? { left: offset, transform: 'translateX(-50%)' }
            : { top: offset, transform: 'translateY(-50%)' }),
        };

        // While a connection is being dragged, handles say whether dropping
        // here would be accepted. Idle handles keep the neutral colour.
        const targetHandleId = port.direction === 'inout' ? `${port.id}-in` : port.id;
        const sourceHandleId = port.direction === 'inout' ? `${port.id}-out` : port.id;
        const stateFor = (handleId: string): HandleDragState =>
          data.dragStates?.[handleId] ?? data.dragState ?? 'idle';
        const dragState: HandleDragState = stateFor(
          port.direction === 'out' ? sourceHandleId : targetHandleId,
        );
        const handleFill =
          dragState === 'compatible'
            ? '#22c55e'
            : dragState === 'warning'
              ? '#f59e0b'
              : dragState === 'incompatible'
                ? '#ef4444'
                : '#555';
        const handleSize = dragState === 'idle' ? 8 : 12;
        const handleVisual: React.CSSProperties = {
          background: handleFill,
          width: handleSize,
          height: handleSize,
          ...(dragState === 'incompatible' ? { cursor: 'not-allowed' } : {}),
        };

        // Handle type based on direction
        const handleType =
          port.direction === 'in'
            ? 'target'
            : port.direction === 'out'
              ? 'source'
              : undefined; // inout gets both

        if (port.direction === 'inout') {
          // Render both source and target for bidirectional ports
          return (
            <div key={port.id}>
              <Handle
                type="target"
                position={position}
                id={`${port.id}-in`}
                aria-label={`${port.label ?? port.id}: ${stateFor(targetHandleId)}`}
                style={{
                  ...handleStyle,
                  ...handleVisual,
                  background:
                    stateFor(targetHandleId) === 'compatible' ? '#22c55e'
                      : stateFor(targetHandleId) === 'warning' ? '#f59e0b'
                        : stateFor(targetHandleId) === 'incompatible' ? '#ef4444' : '#555',
                }}
              />
              <Handle
                type="source"
                position={position}
                id={`${port.id}-out`}
                aria-label={`${port.label ?? port.id}: ${stateFor(sourceHandleId)}`}
                style={{
                  ...handleStyle,
                  ...handleVisual,
                  background:
                    stateFor(sourceHandleId) === 'compatible' ? '#22c55e'
                      : stateFor(sourceHandleId) === 'warning' ? '#f59e0b'
                        : stateFor(sourceHandleId) === 'incompatible' ? '#ef4444' : '#555',
                }}
              />
            </div>
          );
        }

        return (
          <Handle
            key={port.id}
            type={handleType!}
            position={position}
            id={port.id}
            aria-label={`${port.label ?? port.id}: ${dragState}`}
            style={{
              ...handleStyle,
              ...handleVisual,
            }}
          />
        );
      })}
      {ports.length === 0 ? (
        // A portless node (a group, pool, lane, namespace, or catalog) stays
        // connectable on the canvas. Its handles carry no port id, so a new
        // connection saves as a port-less edge that reopens cleanly.
        (['target', 'source'] as const).map((type) => {
          const state: HandleDragState = data.dragStates?.['*'] ?? data.dragState ?? 'idle';
          return (
            <Handle
              key={type}
              type={type}
              position={type === 'target' ? Position.Top : Position.Bottom}
              className="coral-portless-handle"
              aria-label={`${type === 'target' ? 'Incoming' : 'Outgoing'} connection: ${state}`}
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                background: state === 'compatible' ? '#22c55e'
                  : state === 'warning' ? '#f59e0b'
                    : state === 'incompatible' ? '#ef4444' : '#555',
                width: state === 'idle' ? 8 : 12,
                height: state === 'idle' ? 8 : 12,
              }}
            />
          );
        })
      ) : (
        <>
          {/* An edge without explicit ports needs an endpoint even where the
              node has no port for that direction (an input-only database as
              a source). Hidden, non-connectable anchors keep it drawn. */}
          {!ports.some((port) => port.direction !== 'out') && (
            <Handle type="target" position={Position.Top} className="coral-edge-anchor"
              isConnectable={false} style={{ opacity: 0, pointerEvents: 'none' }} />
          )}
          {!ports.some((port) => port.direction !== 'in') && (
            <Handle type="source" position={Position.Bottom} className="coral-edge-anchor"
              isConnectable={false} style={{ opacity: 0, pointerEvents: 'none' }} />
          )}
        </>
      )}
    </div>
  );
});

export default SymbolNode;
