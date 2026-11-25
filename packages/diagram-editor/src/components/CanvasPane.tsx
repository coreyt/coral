/**
 * CanvasPane - Center pane wrapping ReactFlow
 *
 * Contains the diagram canvas with:
 * - ReactFlowProvider + EditProvider + ReactFlow with all standard props
 * - Background, preference-controlled MiniMap (only when nodes exist)
 * - Preference-controlled FloatingToolbar with zoom, reflow, undo/redo controls
 * - Empty state overlay when no nodes
 * - Canvas status bar (node count, edge count, notation name)
 */

import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  useReactFlow,
  useViewport,
  applyNodeChanges,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type OnConnectStart,
  type OnConnectEnd,
  type IsValidConnection,
  type Connection,
  type EdgeProps,
} from '@xyflow/react';
import { SymbolNode, EditProvider, CompatibilityEdge, useAxisConstrain,
  SpatialSceneArtworkDefs029, SpatialSceneMarkerDefs028 } from '@coral-viz/viz';
import { caveatFontCss028, embeddedFontCssFor, stableSvgId, type RenderStyle0214, type RenderStyleInput0214,
  type PreparedSpatialScene028, type ScenePartRecord028 } from '@coral-viz/render';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { isNativeEditingTarget } from '../authoringShortcuts';
import { controlSafeFitPadding, MIN_CANVAS_ZOOM } from '../fitInsets';

// Register node types and edge types
const nodeTypes = { symbol: SymbolNode };
function CanvasCompatibilityEdge(props: EdgeProps) {
  const { screenToFlowPosition } = useReactFlow();
  const toFlowPosition = useCallback((position: { x: number; y: number }) =>
    screenToFlowPosition(position, { snapToGrid: false }), [screenToFlowPosition]);
  return <CompatibilityEdge {...props} screenToFlowPosition={toFlowPosition} />;
}
const edgeTypes = { compatibility: CanvasCompatibilityEdge };
const EMPTY_SCENE_PARTS028: readonly ScenePartRecord028[] = [];
// React Flow publishes changed option identities to every subscribed edge.
const DEFAULT_EDGE_OPTIONS = { style: { strokeWidth: 2 } };
const FIT_VIEW_OPTIONS = { padding: 0.2 };

/** One-dimensional drag keeps the existing side equation exactly representable. */
function NodeLabelPlacementHandle028({ scene, node, basis, onCommit }: {
  scene: PreparedSpatialScene028; node: CanvasPaneProps['nodes'][number]; basis: string;
  onCommit: NonNullable<CanvasPaneProps['onNodeLabelPlacementEdit']>;
}) {
  const viewport = useViewport();
  const drag = useRef<{ x: number; y: number; zoom: number; viewportX: number; viewportY: number; basis: string; offset: number; owner: string; side: string; pointer: number } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const part = scene.parts.find((item) => item.owner.kind === 'node' && item.owner.id === node.id && item.role === 'node-label');
  const placement = node.data.canonical?.labelPlacement as { side: string; offset?: number } | undefined;
  if (!part || !placement || placement.side === 'center') return null;
  const normal = { x: placement.side === 'right' ? 1 : placement.side === 'left' ? -1 : 0,
    y: placement.side === 'below' ? 1 : placement.side === 'above' ? -1 : 0 };
  const offset = placement.offset ?? 0;
  const liveDrag = (pointer: number) => Boolean(drag.current && drag.current.owner === node.id &&
    drag.current.side === placement.side && drag.current.basis === basis && drag.current.pointer === pointer &&
    drag.current.zoom === viewport.zoom && drag.current.viewportX === viewport.x && drag.current.viewportY === viewport.y);
  const delta = (event: { clientX: number; clientY: number }) => drag.current
    ? ((event.clientX - drag.current.x) * normal.x + (event.clientY - drag.current.y) * normal.y) / drag.current.zoom : 0;
  const movement = preview === null ? 0 : preview - offset;
  return <button type="button" className="nodrag nopan nokey"
    aria-label={`Move label for ${node.id}`} title="Drag outward or inward to change label offset"
    style={{ position: 'absolute', zIndex: 15, width: 18, height: 18, padding: 0, borderRadius: '50%',
      border: '1px solid #2563eb', background: '#fff', color: '#1d4ed8', touchAction: 'none',
      cursor: normal.x ? 'ew-resize' : 'ns-resize', transform: 'translate(-50%, -50%)',
      left: (part.bounds.x + part.bounds.width / 2 - scene.viewport.shiftX + normal.x * movement) * viewport.zoom + viewport.x,
      top: (part.bounds.y + part.bounds.height / 2 - scene.viewport.shiftY + normal.y * movement) * viewport.zoom + viewport.y }}
    onPointerDown={(event) => {
      if (event.button !== 0 || drag.current) return;
      event.preventDefault(); event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, y: event.clientY, zoom: viewport.zoom, viewportX: viewport.x, viewportY: viewport.y, basis, offset, owner: node.id, side: placement.side, pointer: event.pointerId };
      setPreview(offset);
    }}
    onPointerMove={(event) => {
      if (!drag.current || event.pointerId !== drag.current.pointer) return;
      if (!liveDrag(event.pointerId)) { drag.current = null; setPreview(null); return; }
      setPreview(Math.round((drag.current.offset + delta(event)) * 1000) / 1000);
    }}
    onPointerUp={(event) => {
      if (!drag.current || event.pointerId !== drag.current.pointer) return;
      event.preventDefault(); event.stopPropagation();
      if (!liveDrag(event.pointerId)) { drag.current = null; setPreview(null); return; }
      const value = Math.round((drag.current.offset + delta(event)) * 1000) / 1000;
      onCommit(drag.current.owner, { side: drag.current.side, offset: value }, drag.current.basis);
      drag.current = null; setPreview(null);
    }}
    onPointerCancel={(event) => { if (drag.current?.pointer === event.pointerId) { drag.current = null; setPreview(null); } }}
    onLostPointerCapture={(event) => { if (drag.current?.pointer === event.pointerId) { drag.current = null; setPreview(null); } }}
    onKeyDown={(event) => {
      if (event.key === 'Escape') { drag.current = null; setPreview(null); event.preventDefault(); return; }
      const direction = event.key === 'ArrowRight' ? normal.x : event.key === 'ArrowLeft' ? -normal.x
        : event.key === 'ArrowDown' ? normal.y : event.key === 'ArrowUp' ? -normal.y : 0;
      if (!direction) return;
      event.preventDefault(); event.stopPropagation();
      onCommit(node.id, { side: placement.side, offset: offset + direction * (event.shiftKey ? 10 : 1) }, basis);
    }}><span aria-hidden="true">{normal.x ? '↔' : '↕'}</span></button>;
}

/** A live editor-update owner, rendered from structured state, not wording. */
export interface CanvasUpdateStatus {
  kind: 'source-pending' | 'structural-layout';
  message: string;
}

export interface CanvasPaneProps {
  /** The same resolved scene used for SVG export at this document revision. */
  scene028?: PreparedSpatialScene028;
  /** Explicit capability failure for the current revision. */
  sceneError028?: string;
  /** A node is being dragged; connectors follow live handles until commit. */
  sceneTransient028?: boolean;
  renderStyle028: RenderStyle0214;
  onRenderStyle028Change: (style: RenderStyleInput0214) => void;
  // Deliberately loose in the node's data type: the composition root owns the
  // node shape, and the pane only renders and forwards.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes: Node<any>[];
  edges: Edge[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNodesChange: OnNodesChange<any>;
  onEdgesChange: OnEdgesChange;
  onNodeDragStart?: () => void;
  /** A verified 0.2.8 draft can commit pointer movement through Coral source. */
  sourceNodeDragEnabled?: boolean;
  onSourceNodeDrag?: (nodeIds: string[], delta: { x: number; y: number }) => void;
  /** Return true when a source-owned move handles the key before XYFlow. */
  onNodeKeyboardMove?: (key: string, shiftKey: boolean, event: KeyboardEvent) => boolean;
  onNodeKeyboardMoveEnd?: (event: KeyboardEvent) => void;
  onDeleteSelection?: () => void;
  focusRequest?: { token: number; kind: 'node' | 'edge'; id: string } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSelectionChange: (selection: { nodes: Node<any>[]; edges: Edge[] }) => void;
  onLabelEdit: (nodeId: string, newLabel: string) => void;
  /** A verified Coral source transaction may edit an edge directly on canvas. */
  nodeLabelPlacementEditable?: boolean;
  nodeLabelPlacementRevision?: string;
  onNodeLabelPlacementEdit?: (nodeId: string, placement: { side: string; offset: number }, basis: string) => boolean;
  edgeLabelEditable?: boolean;
  edgeLabelSourceRevision?: string;
  onEdgeLabelEdit?: (edgeId: string, label: string) => boolean;
  onEdgeLabelRemove?: (edgeId: string) => boolean;
  onReflow: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  isReflowing: boolean;
  isLoading: boolean;
  /** Refuse authored canvas gestures while retaining selection and navigation. */
  mutationsDisabled?: boolean;
  /** Reflow may refresh a verified source-owned display without editing the graph. */
  sourceReflowEnabled?: boolean;
  /** History can remain available for source-owned edits when structural gestures are locked. */
  historyDisabled?: boolean;
  /** Source-owned Coral may allow a verified connection while other gestures stay locked. */
  sourceConnectionsEnabled?: boolean;
  mutationDisabledReason?: string;
  reflowDisabled?: boolean;
  /** Why Reflow is unavailable under any update owner (design §12). */
  reflowDisabledReason?: string;
  /** Whether the overview minimap is visible. Canvas navigation remains available. */
  showMinimap: boolean;
  /** Whether the visual C1 toolbar is visible. Its commands remain available elsewhere. */
  showControls: boolean;
  notation: string;
  theme: Record<string, string>;

  // Connection gestures (R-016). The pane owns no policy; the composition root
  // decides what a valid connection is.
  onConnect?: OnConnect;
  onConnectStart?: OnConnectStart;
  onConnectEnd?: OnConnectEnd;
  isValidConnection?: IsValidConnection;

  // Edge reconnection, which the extracted pane did not carry.
  onReconnectStart?: () => void;
  onReconnect?: (oldEdge: Edge, connection: Connection) => void;
  onReconnectEnd?: (event: MouseEvent | TouchEvent, edge: Edge) => void;

  /** Announced to screen readers when layout or parsing finishes (R-014). */
  statusText?: string;
  /**
   * Displayed editor-update owner (S94-WI-05). Display only: the controller
   * decides which statuses it also announces through `statusText`.
   */
  updateStatus?: CanvasUpdateStatus | null;
  /** Extra CSS the canvas needs, such as selected-edge styling. */
  edgeStyles?: string;
}

/** Floating Toolbar sub-component — zoom in/out/fit, reflow, undo/redo */
interface FloatingToolbarProps {
  onReflow: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  isReflowing: boolean;
  isLoading: boolean;
  disabled: boolean;
  historyDisabled?: boolean;
  reflowDisabled?: boolean;
  disabledReason?: string;
  reflowDisabledReason?: string;
  bgColor: string;
  bgHoverColor: string;
  textColor: string;
  textMutedColor: string;
  dividerColor: string;
  shadowColor: string;
}

function ZoomReadout() {
  const { zoom } = useViewport();
  return <output className="coral-canvas-toolbar__zoom" aria-label="Current zoom">
    {Math.round(zoom * 100)}%
  </output>;
}

function FloatingToolbar({
  onReflow,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  undoCount,
  redoCount,
  isReflowing,
  isLoading,
  disabled,
  historyDisabled = disabled,
  reflowDisabled = false,
  disabledReason,
  reflowDisabledReason,
  bgColor,
  bgHoverColor,
  textColor,
  textMutedColor,
  dividerColor,
  shadowColor,
}: FloatingToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Fit into the canvas area the toolbar, minimap, and open Properties panel
  // leave visible, measured now rather than reserved at a maximum (R-044 AC-7).
  const fitToVisibleCanvas = () => {
    const toolbar = toolbarRef.current;
    const flow = toolbar?.closest('.react-flow');
    if (!toolbar || !flow) {
      void fitView({ padding: 0.2, minZoom: MIN_CANVAS_ZOOM });
      return;
    }
    const overlays = [toolbar, flow.querySelector('.react-flow__minimap'),
      document.querySelector('[aria-label="Properties panel"]')]
      .filter((element): element is Element => element !== null)
      .map((element) => element.getBoundingClientRect());
    void fitView({ padding: controlSafeFitPadding(flow.getBoundingClientRect(), overlays), minZoom: MIN_CANVAS_ZOOM });
  };

  const buttonStyle = {
    padding: '6px 10px',
    fontSize: '14px',
    background: 'transparent',
    border: 'none',
    color: textColor,
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'background 0.15s',
  };

  const disabledStyle = {
    ...buttonStyle,
    color: textMutedColor,
    cursor: 'not-allowed',
  };

  return (
    <div
      ref={toolbarRef}
      className="coral-canvas-toolbar"
      style={{
        position: 'absolute',
        bottom: '16px',
        right: '16px',
        background: bgColor,
        borderRadius: '8px',
        padding: '4px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        flexWrap: 'wrap',
        maxWidth: 'min(430px, calc(100% - 32px))',
        boxShadow: `0 4px 12px ${shadowColor}`,
        zIndex: 10,
      }}
      role="toolbar"
      aria-label="Canvas controls"
    >
      {/* Zoom controls */}
      <button
        className="coral-button coral-button--quiet"
        onClick={() => zoomOut()}
        aria-label="Zoom out"
        title="Zoom Out"
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = bgHoverColor)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        −
      </button>
      <ZoomReadout />
      <button
        className="coral-button coral-button--quiet"
        onClick={() => zoomIn()}
        aria-label="Zoom in"
        title="Zoom In"
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = bgHoverColor)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        +
      </button>
      <button
        className="coral-button coral-button--quiet"
        onClick={fitToVisibleCanvas}
        aria-label="Fit diagram to view"
        title="Fit View"
        style={{ ...buttonStyle, fontSize: '12px' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = bgHoverColor)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        ⊡
      </button>

      {/* Divider */}
      <div style={{ width: '1px', height: '16px', background: dividerColor, margin: '0 4px' }} />

      {/* Reflow */}
      <button
        className="coral-button coral-button--quiet"
        onClick={onReflow}
        disabled={isReflowing || disabled || reflowDisabled}
        aria-label="Reflow layout"
        title={(disabled || reflowDisabled ? reflowDisabledReason : undefined) ?? 'Reflow Layout (Ctrl+Shift+L)'}
        style={isReflowing || disabled || reflowDisabled ? disabledStyle : buttonStyle}
        onMouseEnter={(e) => {
          if (!isReflowing && !disabled && !reflowDisabled) e.currentTarget.style.background = bgHoverColor;
        }}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          {isReflowing ? '...' : '↻'} Reflow
        </span>
      </button>

      {/* Divider */}
      <div style={{ width: '1px', height: '16px', background: dividerColor, margin: '0 4px' }} />

      {/* Undo/Redo */}
      <button
        className="coral-button coral-button--quiet"
        onClick={onUndo}
        disabled={!canUndo || historyDisabled}
        aria-label={`Undo (${undoCount} available)`}
        title={historyDisabled ? (disabledReason ?? 'Undo is temporarily unavailable') : `Undo (Ctrl+Z) - ${undoCount} available`}
        style={canUndo && !historyDisabled ? buttonStyle : disabledStyle}
        onMouseEnter={(e) => {
          if (canUndo && !historyDisabled) e.currentTarget.style.background = bgHoverColor;
        }}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        ↩
      </button>
      <button
        className="coral-button coral-button--quiet"
        onClick={onRedo}
        disabled={!canRedo || historyDisabled}
        aria-label={`Redo (${redoCount} available)`}
        title={historyDisabled ? (disabledReason ?? 'Redo is temporarily unavailable') : `Redo (Ctrl+Shift+Z) - ${redoCount} available`}
        style={canRedo && !historyDisabled ? buttonStyle : disabledStyle}
        onMouseEnter={(e) => {
          if (canRedo && !historyDisabled) e.currentTarget.style.background = bgHoverColor;
        }}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        ↪
      </button>

      {/* Loading indicator */}
      {isLoading && (
        <>
          <div style={{ width: '1px', height: '16px', background: dividerColor, margin: '0 4px' }} />
          <span style={{ fontSize: '11px', color: textMutedColor }}>updating...</span>
        </>
      )}
    </div>
  );
}

export function CanvasPane({
  scene028,
  sceneError028,
  sceneTransient028 = false,
  renderStyle028,
  onRenderStyle028Change,
  nodes,
  edges,
  onNodesChange,
  onNodeDragStart,
  sourceNodeDragEnabled = false,
  onSourceNodeDrag,
  onNodeKeyboardMove,
  onNodeKeyboardMoveEnd,
  onDeleteSelection,
  focusRequest,
  onEdgesChange,
  onSelectionChange,
  onLabelEdit,
  nodeLabelPlacementEditable = false,
  nodeLabelPlacementRevision,
  onNodeLabelPlacementEdit,
  edgeLabelEditable = false,
  edgeLabelSourceRevision,
  onEdgeLabelEdit,
  onEdgeLabelRemove,
  onReflow,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  undoCount,
  redoCount,
  isReflowing,
  isLoading,
  mutationsDisabled = false,
  sourceReflowEnabled = false,
  historyDisabled = mutationsDisabled,
  sourceConnectionsEnabled = false,
  mutationDisabledReason,
  reflowDisabled = false,
  reflowDisabledReason,
  showMinimap,
  showControls,
  theme,
  onConnect,
  onConnectStart,
  onConnectEnd,
  isValidConnection,
  onReconnectStart,
  onReconnect,
  onReconnectEnd,
  statusText,
  updateStatus = null,
  edgeStyles,
}: CanvasPaneProps) {
  const markerNamespace028 = useId();
  const scenePartsByOwner = useMemo(() => {
    const index = new Map<string, readonly ScenePartRecord028[]>();
    for (const part of scene028?.parts ?? []) {
      const key = `${part.owner.kind}:${part.owner.id}`;
      index.set(key, [...(index.get(key) ?? []), part]);
    }
    return index;
  }, [scene028]);
  const sceneNodeOrigins = useMemo(() => new Map((scene028?.nodes ?? []).map((node) => [
    node.node.id, { x: node.x + scene028!.viewport.shiftX,
      y: node.y + scene028!.viewport.shiftY,
      width: node.width, height: node.height },
  ])), [scene028]);
  type SceneNodeCacheEntry028 = { source: CanvasPaneProps['nodes'][number];
    parts: readonly ScenePartRecord028[];
    origin?: { x: number; y: number; width: number; height: number };
    contacts?: Readonly<Record<string, Readonly<{ x: number; y: number }>>>;
    sourceDrag: boolean;
    output: CanvasPaneProps['nodes'][number] };
  const sceneNodeCache028 = useRef(new Map<string, SceneNodeCacheEntry028>());
  const sceneNodes = useMemo(() => {
    if (!scene028 && !sceneError028) {
      sceneNodeCache028.current = new Map();
      return nodes;
    }
    const previous = sceneNodeCache028.current;
    const next = new Map<string, SceneNodeCacheEntry028>();
    const projected = nodes.map((node) => {
      const parts = scenePartsByOwner.get(`node:${node.id}`) ?? EMPTY_SCENE_PARTS028;
      const origin = sceneNodeOrigins.get(node.id);
      const contacts = scene028?.portContacts?.[node.id];
      const cached = previous.get(node.id);
      if (cached?.source === node && cached.parts === parts && cached.origin === origin &&
        cached.contacts === contacts && cached.sourceDrag === sourceNodeDragEnabled) {
        next.set(node.id, cached);
        return cached.output;
      }
      const output = { ...node, draggable: sourceNodeDragEnabled || node.draggable, data: { ...node.data,
        markerNamespace028, sceneParts028: parts, sceneOrigin028: origin,
        scenePortContacts028: contacts } };
      next.set(node.id, { source: node, parts, origin, contacts, sourceDrag: sourceNodeDragEnabled, output });
      return output;
    });
    sceneNodeCache028.current = next;
    return projected;
  }, [nodes, markerNamespace028, scene028, sceneError028, scenePartsByOwner, sceneNodeOrigins, sourceNodeDragEnabled]);
  const [dragNodes, setDragNodes] = useState<typeof sceneNodes | null>(null);
  const draggingSceneNode = useRef(false);
  const bufferLargeSceneDrag = Boolean(scene028 && ((nodes.length >= 100 && !mutationsDisabled)
    || sourceNodeDragEnabled));
  const pendingDragCommit = useRef<{ id: string; x: number; y: number } | null>(null);
  const dragCommitTimer = useRef<number | undefined>(undefined);
  const clearSceneAxis = useRef<() => void>(() => {});
  const completedSceneDrag = useRef<{ id: string } | null>(null);
  useEffect(() => () => window.clearTimeout(dragCommitTimer.current), []);
  useEffect(() => {
    const cancel = () => {
      draggingSceneNode.current = false;
      clearSceneAxis.current();
      pendingDragCommit.current = null;
      window.clearTimeout(dragCommitTimer.current);
      setDragNodes(null);
    };
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, []);
  useEffect(() => {
    if (!bufferLargeSceneDrag || isReflowing || updateStatus) {
      draggingSceneNode.current = false;
      clearSceneAxis.current();
      pendingDragCommit.current = null;
      window.clearTimeout(dragCommitTimer.current);
      setDragNodes(null);
    }
  }, [bufferLargeSceneDrag, isReflowing, updateStatus]);
  useEffect(() => {
    const pending = pendingDragCommit.current;
    if (!pending) return;
    const committed = nodes.find((node) => node.id === pending.id);
    if (committed?.position.x !== pending.x || committed.position.y !== pending.y) return;
    pendingDragCommit.current = null;
    window.clearTimeout(dragCommitTimer.current);
    setDragNodes(null);
  }, [nodes]);
  const liveSceneDrag = dragNodes !== null;
  const movingNodeIds = useMemo(() => {
    const previous = new Map(nodes.map((node) => [node.id, node]));
    const displayed = dragNodes ?? nodes;
    const moving = new Set(displayed.filter((node) => {
      if (node.dragging) return true;
      const before = previous.get(node.id);
      return dragNodes !== null && before !== undefined &&
        (before.position.x !== node.position.x || before.position.y !== node.position.y);
    }).map((node) => node.id));
    // A moved group carries its descendants even when their local positions
    // do not change.
    for (let added = true; added;) {
      added = false;
      for (const node of displayed) {
        if (node.parentId && moving.has(node.parentId) && !moving.has(node.id)) {
          moving.add(node.id);
          added = true;
        }
      }
    }
    return moving;
  }, [dragNodes, nodes]);
  const commitSceneNodeDrag = (id: string, position: { x: number; y: number }) => {
    if (!draggingSceneNode.current) return;
    draggingSceneNode.current = false;
    const terminal = { id };
    completedSceneDrag.current = terminal;
    queueMicrotask(() => {
      if (completedSceneDrag.current === terminal) completedSceneDrag.current = null;
    });
    if (sourceNodeDragEnabled) {
      const original = sceneNodes.find((node) => node.id === id);
      if (original) {
        const delta = { x: position.x - original.position.x, y: position.y - original.position.y };
        if (delta.x !== 0 || delta.y !== 0) {
          const selected = sceneNodes.filter((node) => node.selected).map((node) => node.id);
          onSourceNodeDrag?.(selected.includes(id) ? selected : [id], delta);
        }
      }
      setDragNodes(null);
      return;
    }
    pendingDragCommit.current = { id, x: position.x, y: position.y };
    onNodesChange([{ id, type: 'position', position, dragging: false }]);
    // A constraint may reject or adjust that position. Release the local
    // view if no exact parent echo arrives.
    dragCommitTimer.current = window.setTimeout(() => {
      pendingDragCommit.current = null;
      setDragNodes(null);
    }, 250);
  };
  const { onNodesChange: constrainSceneDrag } = useAxisConstrain((changes) => {
    if (!draggingSceneNode.current) return;
    const positions = changes.filter((change) => change.type === 'position');
    if (positions.length) setDragNodes((current) =>
      applyNodeChanges(positions, current ?? sceneNodes));
    const final = positions.find((change) => change.dragging === false);
    if (final) {
      const position = final.position ?? dragNodes?.find((node) => node.id === final.id)?.position
        ?? sceneNodes.find((node) => node.id === final.id)?.position;
      if (position) commitSceneNodeDrag(final.id, position);
    }
  }, sceneNodes);
  clearSceneAxis.current = () => constrainSceneDrag(sceneNodes.map((node) => ({
    id: node.id, type: 'position', dragging: false,
  })));
  const handleSceneNodesChange: typeof onNodesChange = (changes) => {
    if (!draggingSceneNode.current) {
      // XYFlow can send its terminal position after onNodeDragStop. The
      // buffered transaction has already committed that constrained position.
      const remaining = changes.filter((change) => change.type !== 'position'
        || change.dragging !== false || completedSceneDrag.current?.id !== change.id);
      if (remaining.length) onNodesChange(remaining);
      return;
    }
    constrainSceneDrag(changes);
    const other = changes.filter((change) => change.type !== 'position');
    if (other.length) onNodesChange(other);
  };
  type SceneEdgeCacheEntry028 = {
    source: CanvasPaneProps['edges'][number];
    parts?: readonly ScenePartRecord028[];
    shiftX: number; shiftY: number; namespace: string; transient: boolean;
    output: CanvasPaneProps['edges'][number];
  };
  const sceneEdgeCache028 = useRef(new Map<string, SceneEdgeCacheEntry028>());
  const scopedEdges = useMemo(() => {
    const previous = sceneEdgeCache028.current;
    const next = new Map<string, SceneEdgeCacheEntry028>();
    const shiftX = scene028?.viewport.shiftX ?? 0;
    const shiftY = scene028?.viewport.shiftY ?? 0;
    const projected = edges.map((edge) => {
      const transient = (sceneTransient028 || liveSceneDrag) &&
        (movingNodeIds.has(edge.source) || movingNodeIds.has(edge.target));
      const parts = scene028 || sceneError028
        ? scenePartsByOwner.get(`edge:${edge.id}`) ?? EMPTY_SCENE_PARTS028 : undefined;
      const cached = previous.get(edge.id);
      if (cached?.source === edge && cached.parts === parts && cached.shiftX === shiftX &&
        cached.shiftY === shiftY && cached.namespace === markerNamespace028 && cached.transient === transient) {
        next.set(edge.id, cached);
        return cached.output;
      }
      const output = { ...edge, data: { ...edge.data, markerNamespace028,
        sceneTransient028: transient,
        ...(parts !== undefined ? { sceneParts028: parts, sceneShift028: { x: shiftX, y: shiftY } } : {}) } };
      next.set(edge.id, { source: edge, parts, shiftX, shiftY,
        namespace: markerNamespace028, transient, output });
      return output;
    });
    // Keep untouched edge data stable during node motion. React Flow supplies
    // changed endpoint positions to incident edges without redrawing every edge.
    sceneEdgeCache028.current = next;
    return projected;
  }, [edges, markerNamespace028, scene028, sceneError028,
    sceneTransient028, liveSceneDrag, movingNodeIds, scenePartsByOwner]);
  const canvasRootRef = useRef<HTMLElement>(null);
  const [editingEdge, setEditingEdge] = useState<{
    id: string; original: string; draft: string; revision?: string; x: number; y: number;
  } | null>(null);
  const edgeLabelPopupTop = `clamp(8px, ${editingEdge?.y ?? 8}px, calc(100% - 120px))`;
  const cancelEdgeBlurCommit = useRef(false);
  const handleEdgeDoubleClick = useCallback<NonNullable<React.ComponentProps<typeof ReactFlow>['onEdgeDoubleClick']>>((event, edge) => {
    if (!edgeLabelEditable || !onEdgeLabelEdit) return;
    const current = edges.find((candidate) => candidate.id === edge.id);
    if (!current) return;
    cancelEdgeBlurCommit.current = false;
    const bounds = canvasRootRef.current?.getBoundingClientRect();
    const label = typeof current.label === 'string' ? current.label : '';
    setEditingEdge({ id: edge.id, original: label, draft: label,
      revision: edgeLabelSourceRevision,
      x: Math.max(8, Math.min(event.clientX - (bounds?.left ?? 0), (bounds?.width ?? 240) - 220)),
      y: Math.max(8, Math.min(event.clientY - (bounds?.top ?? 0), (bounds?.height ?? 56) - 48)) });
  }, [edgeLabelEditable, onEdgeLabelEdit, edges, edgeLabelSourceRevision]);
  useEffect(() => {
    if (!editingEdge) return;
    const current = edges.find((edge) => edge.id === editingEdge.id);
    if (!edgeLabelEditable || !onEdgeLabelEdit || !current ||
      editingEdge.revision !== edgeLabelSourceRevision ||
      (typeof current.label === 'string' ? current.label : '') !== editingEdge.original)
      setEditingEdge(null);
  }, [edgeLabelEditable, edgeLabelSourceRevision, edges, editingEdge, onEdgeLabelEdit]);
  const commitEdgeLabel = () => {
    if (!editingEdge) return;
    const current = edges.find((edge) => edge.id === editingEdge.id);
    if (edgeLabelEditable && onEdgeLabelEdit && current &&
      editingEdge.revision === edgeLabelSourceRevision &&
      (typeof current.label === 'string' ? current.label : '') === editingEdge.original &&
      editingEdge.draft !== editingEdge.original)
      onEdgeLabelEdit(editingEdge.id, editingEdge.draft);
    setEditingEdge(null);
  };
  const removeEdgeLabel = () => {
    if (!editingEdge || !edgeLabelEditable || !onEdgeLabelRemove) return;
    const current = edges.find((edge) => edge.id === editingEdge.id);
    if (typeof current?.label !== 'string' ||
      editingEdge.revision !== edgeLabelSourceRevision ||
      current.label !== editingEdge.original) return;
    if (onEdgeLabelRemove(editingEdge.id)) {
      cancelEdgeBlurCommit.current = true;
      setEditingEdge(null);
    }
  };
  useEffect(() => {
    if (!focusRequest) return;
    let finished = false;
    const focus = () => {
      if (finished) return;
      const className = focusRequest.kind === 'node' ? 'react-flow__node' : 'react-flow__edge';
      const entity = [...(canvasRootRef.current?.querySelectorAll<HTMLElement>(`.${className}[data-id]`) ?? [])]
        .find((candidate) => candidate.getAttribute('data-id') === focusRequest.id);
      if (!entity) return;
      finished = true;
      observer.disconnect();
      entity.focus();
    };
    // React Flow publishes edges after its node measurement pass. Observe
    // that publication rather than guessing how long it will take.
    const observer = new MutationObserver(focus);
    if (canvasRootRef.current) observer.observe(canvasRootRef.current, { childList: true, subtree: true });
    const timer = window.setTimeout(focus, 0);
    return () => { finished = true; observer.disconnect(); window.clearTimeout(timer); };
  }, [focusRequest]);

  return (
    <main
      ref={canvasRootRef}
      data-coral-scene-transient={sceneTransient028 || liveSceneDrag ? 'true' : 'false'}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape' && !isNativeEditingTarget(event.target)) {
          const selectedNodes = nodes.filter((node) => node.selected)
            .map((node) => ({ id: node.id, type: 'select' as const, selected: false }));
          const selectedEdges = edges.filter((edge) => edge.selected)
            .map((edge) => ({ id: edge.id, type: 'select' as const, selected: false }));
          if (selectedNodes.length || selectedEdges.length) {
            event.preventDefault();
            event.stopPropagation();
            if (selectedNodes.length) onNodesChange(selectedNodes);
            if (selectedEdges.length) onEdgesChange(selectedEdges);
            return;
          }
        }
        if ((event.key === 'Delete' || event.key === 'Backspace')
          && !isNativeEditingTarget(event.target)) {
          event.preventDefault();
          event.stopPropagation();
          onDeleteSelection?.();
          return;
        }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        const target = event.target as Element;
        if (!target.closest('.react-flow__node')
          || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
        if (onNodeKeyboardMove?.(event.key, event.shiftKey, event.nativeEvent)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onKeyDown={(event) => onNodeKeyboardMoveEnd?.(event.nativeEvent)}
      onPointerDownCapture={(event) => {
        if (!event.shiftKey || !event.isPrimary || event.button !== 0) return;
        const node = (event.target as Element).closest('.react-flow__node');
        if (!node || node.classList.contains('nokey')) return;
        // React Flow 12.11.6 otherwise consumes Shift in its Pane capture
        // listener for box selection. Exempt this pointer dispatch only:
        // a permanent nokey marker would also disable node keyboard actions.
        node.classList.add('nokey');
        queueMicrotask(() => node.classList.remove('nokey'));
      }}
      aria-label="Diagram editor"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: theme.canvasBg,
      }}
    >
      <style>{scene028 ? embeddedFontCssFor(scene028.fontFaces) : caveatFontCss028()}</style>
      <label style={{ position: 'absolute', top: 8, right: 8, zIndex: 11,
        background: theme.floatingToolbarBg, color: theme.controlText,
        padding: '4px 6px', borderRadius: 4, fontSize: 12 }}>
        Style{' '}
        <select aria-label="Diagram style" value={renderStyle028}
          onChange={(event) => onRenderStyle028Change(event.target.value as RenderStyleInput0214)}>
          <option value="lowfi">Lowfi</option>
          <option value="hifi">Hifi</option>
          <option value="anemone">Anemone</option>
        </select>
      </label>
      {/* Keep ReactFlow mounted regardless of optional visual-control preferences. */}
      {edgeStyles && <style>{edgeStyles}</style>}
      {/* Layout and parse outcomes are announced (R-014). */}
      <div
        data-testid="canvas-status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      >
        {statusText}
      </div>
      {updateStatus && (
        <div
          data-testid="visible-update-status"
          data-update-kind={updateStatus.kind}
          // Display only: selection and pan beneath it stay available (§8.3).
          style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, padding: '4px 8px', pointerEvents: 'none',
            borderRadius: 4, background: theme.floatingToolbarBg, color: theme.controlText, fontSize: 12 }}
        >
          {updateStatus.message}
        </div>
      )}
      {sceneError028 && <div role="alert" data-coral-scene-error
        style={{ position: 'absolute', top: 44, left: 8, right: 8, zIndex: 12,
          padding: '8px 10px', background: theme.floatingToolbarBg,
          color: theme.controlText, border: '1px solid #b91c1c' }}>
        This diagram cannot be rendered: {sceneError028}
      </div>}
      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlowProvider>
          <EditProvider onLabelEdit={onLabelEdit}>
            <ReactFlow
              nodes={dragNodes ?? sceneNodes}
              edges={scopedEdges}
              // Low enough that explicit Fit can fit a large diagram into the
              // canvas area the overlays leave visible (R-044 AC-7).
              minZoom={MIN_CANVAS_ZOOM}
              onNodesChange={handleSceneNodesChange}
              onNodeDragStart={() => {
                if (bufferLargeSceneDrag) {
                  draggingSceneNode.current = false;
                  clearSceneAxis.current();
                  draggingSceneNode.current = true;
                  pendingDragCommit.current = null;
                  window.clearTimeout(dragCommitTimer.current);
                  setDragNodes(sceneNodes);
                }
                onNodeDragStart?.();
              }}
              onNodeDragStop={(_event, node) => {
                if (draggingSceneNode.current) constrainSceneDrag([
                  { id: node.id, type: 'position', position: node.position, dragging: false },
                ]);
              }}
              onEdgesChange={onEdgesChange}
              onEdgeDoubleClick={handleEdgeDoubleClick}
              nodesDraggable={!mutationsDisabled || sourceNodeDragEnabled}
              nodesConnectable={!mutationsDisabled || sourceConnectionsEnabled}
              edgesReconnectable={!mutationsDisabled}
              elementsSelectable
              onSelectionChange={onSelectionChange}
              onConnect={onConnect}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              isValidConnection={isValidConnection}
              deleteKeyCode={null}
              onReconnectStart={onReconnectStart}
              onReconnect={onReconnect}
              onReconnectEnd={onReconnectEnd}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={FIT_VIEW_OPTIONS}
              defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
              style={{ background: theme.canvasBg }}
            >
              {scene028 && <svg aria-hidden="true" width="0" height="0"><SpatialSceneMarkerDefs028
                scene={scene028} namespace={stableSvgId('coral-instance', markerNamespace028)} />
                <SpatialSceneArtworkDefs029 scene={scene028}
                  namespace={stableSvgId('coral-instance', markerNamespace028)} /></svg>}
              {nodeLabelPlacementEditable && onNodeLabelPlacementEdit && nodeLabelPlacementRevision && scene028 &&
                nodes.filter((node) => node.selected).length === 1 && !edges.some((edge) => edge.selected) &&
                <NodeLabelPlacementHandle028 key={nodes.find((node) => node.selected)!.id} scene={scene028} node={nodes.find((node) => node.selected)!}
                  basis={nodeLabelPlacementRevision} onCommit={onNodeLabelPlacementEdit} />}
              <Background color={theme.gridColor} gap={20} />
              {showMinimap && nodes.length > 0 && (
                <MiniMap
                  style={{ background: theme.miniMapBg,
                    border: `1px solid ${theme.miniMapBorder}` }}
                  maskColor={theme.miniMapMask}
                />
              )}
              {showControls && (
                <FloatingToolbar
                  onReflow={onReflow}
                  onUndo={onUndo}
                  onRedo={onRedo}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  undoCount={undoCount}
                  redoCount={redoCount}
                  isReflowing={isReflowing}
                  isLoading={isLoading}
                  disabled={mutationsDisabled && !sourceReflowEnabled}
                  historyDisabled={historyDisabled}
                  reflowDisabled={nodes.length === 0 || reflowDisabled}
                  disabledReason={mutationsDisabled ? mutationDisabledReason : undefined}
                  reflowDisabledReason={reflowDisabledReason}
                  bgColor={theme.floatingToolbarBg}
                  bgHoverColor={theme.controlBgHover}
                  textColor={theme.controlText}
                  textMutedColor={theme.canvasText}
                  dividerColor={theme.controlBorder}
                  shadowColor={theme.floatingToolbarShadow}
                />
              )}
            </ReactFlow>
          </EditProvider>
          {editingEdge && <div style={{ position: 'absolute',
            left: `clamp(8px, ${editingEdge.x}px, calc(100% - var(--coral-properties-safe-width, 0px) - 228px))`,
            top: edgeLabelPopupTop, maxHeight: `calc(100% - ${edgeLabelPopupTop} - 8px)`, overflowY: 'auto',
            zIndex: 20, padding: 6, borderRadius: 4, background: theme.floatingToolbarBg,
            color: theme.controlText, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4,
            width: 220, maxWidth: 'calc(100% - var(--coral-properties-safe-width, 0px) - 16px)', boxSizing: 'border-box' }}
          onPointerDown={(event) => event.stopPropagation()}>
            <span style={{ fontSize: 12, overflowWrap: 'anywhere' }}>Connector label for {editingEdge.id}</span>
            <input autoFocus aria-label={`Connector label for ${editingEdge.id}`}
              style={{ minWidth: 0, width: '100%', boxSizing: 'border-box' }}
              className="coral-input" value={editingEdge.draft}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setEditingEdge((current) => current &&
                { ...current, draft: event.target.value })}
              onBlur={() => {
                if (cancelEdgeBlurCommit.current) { cancelEdgeBlurCommit.current = false; return; }
                commitEdgeLabel();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
                if (event.key === 'Escape') {
                  event.preventDefault(); event.stopPropagation();
                  cancelEdgeBlurCommit.current = true;
                  setEditingEdge(null);
                }
              }} />
            {typeof edges.find((edge) => edge.id === editingEdge.id)?.label === 'string' &&
              onEdgeLabelRemove && <button type="button" aria-label="Remove connector label"
                onMouseDown={(event) => event.preventDefault()} onClick={removeEdgeLabel}>
                Remove label
              </button>}
          </div>}
          {/* Empty state overlay */}
          {nodes.length === 0 && (
            <div
              data-testid="empty-state"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: theme.canvasText,
                flexDirection: 'column',
                gap: '8px',
                pointerEvents: 'none',
              }}
            >
              <div style={{ fontSize: '14px' }}>No diagram to display</div>
              <div style={{ fontSize: '12px' }}>Edit the DSL to add nodes</div>
            </div>
          )}
        </ReactFlowProvider>
      </div>

    </main>
  );
}
