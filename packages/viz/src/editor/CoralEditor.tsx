/**
 * CoralEditor - Main visual editor component
 *
 * Renders Graph-IR as an interactive diagram using React Flow.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type OnNodesChange,
  type OnEdgesChange,
  type OnSelectionChangeFunc,
  type NodeMouseHandler,
  BackgroundVariant,
} from '@xyflow/react';

import { SymbolNode } from '../components/SymbolNode.js';
import { SpatialSceneArtworkDefs029, SpatialSceneMarkerDefs028 } from '../components/SpatialSceneSvg028.js';
import { CompatibilityEdge } from '../compatibility/CompatibilityEdge.js';
import { convertGraphToFlow, convertFlowToGraphNodes, convertFlowToGraphEdges } from './converter.js';
import { effectiveGraphNotationId028, embeddedFontCssFor, prepareSpatialScene028, stableSvgId,
  type RenderStyle028, type ScenePartRecord028 } from '@coral-viz/render';
import type {
  GraphIR,
  GraphNode,
  GraphEdge,
  CoralNode,
  CoralEdge,
  EditorConfig,
  EditorCallbacks,
} from '../types.js';

export interface CoralEditorProps {
  /** Authoritative Graph-IR data to render; replacing it resets the interactive canvas state. */
  graph: GraphIR;
  /** Approved visual style used by the shared scene. */
  renderStyle028?: RenderStyle028;
  /** Editor configuration */
  config?: EditorConfig;
  /** Callbacks for editor events */
  callbacks?: EditorCallbacks;
  /** CSS class name for the container */
  className?: string;
  /** Inline styles for the container */
  style?: React.CSSProperties;
}

const edgeTypes = { compatibility: CompatibilityEdge };
const sceneNodeTypes = { symbol: SymbolNode };

const defaultConfig: EditorConfig = {
  draggable: true,
  connectable: false,
  selectable: true,
  zoomable: true,
  pannable: true,
  showMinimap: true,
  showControls: true,
  fitViewOnLoad: true,
};

/**
 * Main Coral Editor component
 */
export const CoralEditor: React.FC<CoralEditorProps> = (props) => {
  const previousGraph = useRef(props.graph);
  const revision = useRef(0);
  if (previousGraph.current !== props.graph) {
    previousGraph.current = props.graph;
    revision.current += 1;
  }
  // A replacement graph must never be projected with the prior graph's Flow
  // state for a frame. Remounting this state owner is an atomic replacement.
  return <CoralEditorContent key={revision.current} {...props} />;
};

const CoralEditorContent: React.FC<CoralEditorProps> = ({
  graph,
  renderStyle028 = 'lowfi',
  config: userConfig,
  callbacks,
  className,
  style,
}) => {
  const config = useMemo(() => ({ ...defaultConfig, ...userConfig }), [userConfig]);

  // Convert Graph-IR to React Flow format
  const initialData = useMemo(() => convertGraphToFlow(graph), [graph]);

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(initialData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData.edges);
  const markerNamespace028 = React.useId();
  const transientScene028 = nodes.some((node) => node.dragging === true);
  const movingNodeIds028 = useMemo(() => {
    const moving = new Set(nodes.filter((node) => node.dragging === true).map((node) => node.id));
    // A moving group carries child nodes although their local position stays fixed.
    for (let added = true; added;) {
      added = false;
      for (const node of nodes) {
        if (node.parentId && moving.has(node.parentId) && !moving.has(node.id)) {
          moving.add(node.id);
          added = true;
        }
      }
    }
    return moving;
  }, [nodes]);
  const settledScene028 = useRef<{ graph: GraphIR; style: RenderStyle028;
    result: { scene?: ReturnType<typeof prepareSpatialScene028>; error?: string } } | null>(null);
  const sceneResult = useMemo(() => {
    if (transientScene028 && settledScene028.current?.graph === graph &&
      settledScene028.current.style === renderStyle028 &&
      settledScene028.current.result.scene) return settledScene028.current.result;
    try {
      const drawing = { ...graph,
        nodes: convertFlowToGraphNodes(nodes, graph.nodes),
        edges: convertFlowToGraphEdges(edges, graph.edges) };
      return { scene: prepareSpatialScene028(drawing, { style: renderStyle028 }) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [graph, nodes, edges, renderStyle028, transientScene028]);
  useEffect(() => {
    if (!transientScene028) settledScene028.current = { graph, style: renderStyle028,
      result: sceneResult };
  }, [graph, renderStyle028, sceneResult, transientScene028]);
  const scene = sceneResult.scene;
  const ownedParts = useMemo(() => {
    const byOwner = new Map<string, readonly ScenePartRecord028[]>();
    for (const part of scene?.parts ?? []) {
      const key = `${part.owner.kind}:${part.owner.id}`;
      byOwner.set(key, [...(byOwner.get(key) ?? []), part]);
    }
    return byOwner;
  }, [scene]);
  const sceneOrigins = useMemo(() => new Map((scene?.nodes ?? []).map((node) => [
    node.node.id, { x: node.x + scene!.viewport.shiftX,
      y: node.y + scene!.viewport.shiftY,
      width: node.width, height: node.height },
  ])), [scene]);
  const renderNodes = useMemo(() => nodes.map((node) => ({ ...node,
    type: 'symbol', data: { ...node.data, markerNamespace028,
      notationId: effectiveGraphNotationId028(graph), renderStyle028,
      width: typeof node.style?.width === 'number' ? node.style.width : undefined,
      height: typeof node.style?.height === 'number' ? node.style.height : undefined,
      sceneParts028: ownedParts.get(`node:${node.id}`) ?? [],
      sceneOrigin028: sceneOrigins.get(node.id),
      scenePortContacts028: scene?.portContacts[node.id],
    },
  })), [nodes, graph, markerNamespace028, renderStyle028, ownedParts, sceneOrigins, scene]);
  const renderEdges = useMemo(() => edges.map((edge) => ({ ...edge,
    data: { ...edge.data, markerNamespace028, renderStyle028,
      sceneTransient028: transientScene028 &&
        (movingNodeIds028.has(edge.source) || movingNodeIds028.has(edge.target)),
      sceneParts028: ownedParts.get(`edge:${edge.id}`) ?? [],
      sceneShift028: { x: scene?.viewport.shiftX ?? 0, y: scene?.viewport.shiftY ?? 0 },
    } })), [edges, markerNamespace028, renderStyle028, transientScene028, movingNodeIds028,
      ownedParts, scene]);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);

  // Handle node changes and notify parent
  const handleNodesChange: OnNodesChange<CoralNode> = useCallback(
    (changes) => {
      onNodesChange(changes);

      // Notify parent of changes
      if (callbacks?.onNodesChange) {
        // Get updated nodes after change
        setNodes((currentNodes) => {
          callbacks.onNodesChange?.(currentNodes);
          return currentNodes;
        });
      }
    },
    [onNodesChange, callbacks, setNodes]
  );

  // Handle edge changes and notify parent
  const handleEdgesChange: OnEdgesChange<CoralEdge> = useCallback(
    (changes) => {
      onEdgesChange(changes);

      if (callbacks?.onEdgesChange) {
        setEdges((currentEdges) => {
          callbacks.onEdgesChange?.(currentEdges);
          return currentEdges;
        });
      }
    },
    [onEdgesChange, callbacks, setEdges]
  );

  // Handle selection changes
  const handleSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodeList, edges: selectedEdgeList }) => {
      const nodeIds = selectedNodeList.map((n) => n.id);
      const edgeIds = selectedEdgeList.map((e) => e.id);

      setSelectedNodes(nodeIds);
      setSelectedEdges(edgeIds);

      callbacks?.onNodeSelect?.(nodeIds);
      callbacks?.onEdgeSelect?.(edgeIds);
    },
    [callbacks]
  );

  // Handle node double click
  const handleNodeDoubleClick: NodeMouseHandler<CoralNode> = useCallback(
    (_event, node) => {
      callbacks?.onNodeDoubleClick?.(node.id);
    },
    [callbacks]
  );

  // Minimap node color based on type
  const getMinimapNodeColor = useCallback((node: CoralNode) => {
    switch (node.data.nodeType) {
      case 'service':
        return '#90caf9';
      case 'database':
        return '#ffb74d';
      case 'external_api':
        return '#f48fb1';
      case 'actor':
        return '#81c784';
      case 'module':
        return '#ce93d8';
      case 'group':
        return '#bdbdbd';
      default:
        return '#90caf9';
    }
  }, []);

  return (
    <div
      className={`coral-editor ${className || ''}`}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '400px',
        ...style,
      }}
    >
      <ReactFlow
        nodes={renderNodes}
        edges={renderEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onSelectionChange={handleSelectionChange}
        onNodeDoubleClick={handleNodeDoubleClick}
        nodeTypes={sceneNodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={config.draggable}
        nodesConnectable={config.connectable}
        elementsSelectable={config.selectable}
        zoomOnScroll={config.zoomable}
        panOnScroll={config.pannable}
        fitView={config.fitViewOnLoad}
        fitViewOptions={{ padding: 0.2 }}
        defaultEdgeOptions={{
          type: 'compatibility',
          animated: false,
        }}
      >
        {scene && <svg aria-hidden="true" width="0" height="0">
          <SpatialSceneMarkerDefs028 scene={scene}
            namespace={stableSvgId('coral-instance', markerNamespace028)} />
          <SpatialSceneArtworkDefs029 scene={scene}
            namespace={stableSvgId('coral-instance', markerNamespace028)} />
        </svg>}
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />

        {config.showControls && <Controls />}

        {config.showMinimap && (
          <MiniMap
            nodeColor={getMinimapNodeColor}
            nodeStrokeWidth={3}
            zoomable
            pannable
          />
        )}
      </ReactFlow>
      {scene && <style data-coral-scene-fonts
        dangerouslySetInnerHTML={{ __html: embeddedFontCssFor(scene.fontFaces) }} />}
      {sceneResult.error && <div role="alert" data-coral-scene-error>{sceneResult.error}</div>}
    </div>
  );
};

/**
 * Hook to get Graph-IR from current editor state
 */
export function useGraphIR(
  nodes: CoralNode[],
  edges: CoralEdge[],
  originalGraph: GraphIR
): GraphIR {
  return useMemo(() => {
    const graphNodes = convertFlowToGraphNodes(nodes, originalGraph.nodes);
    const graphEdges = convertFlowToGraphEdges(edges, originalGraph.edges);

    return {
      ...originalGraph,
      nodes: graphNodes,
      edges: graphEdges,
    };
  }, [nodes, edges, originalGraph]);
}

export default CoralEditor;
