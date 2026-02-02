import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  reconnectEdge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';

// Edge styles are now generated dynamically based on theme - see getEdgeStyles()

import { parseCoralDSL, parseMermaidDSL, type GraphNode, type GraphEdge } from './parsers';
import { printCoralDSL, type GraphIR } from './printer';
import { useAutoRecovery } from './useAutoRecovery';
import { RecoveryBanner, UnsavedIndicator } from './RecoveryBanner';
import { useThemeColors, getEdgeStyles } from './theme';
import { useArmadaConnection } from './useArmadaConnection';
import { ArmadaConnectionDialog, ArmadaStatusBar } from './ArmadaConnection';
import { SymbolNode, type SymbolNodeData } from '@coral/viz';
import {
  shapeRegistry,
  symbolRegistry,
  notationRegistry,
  useLayoutHistory,
  FileControls,
  serialize,
  deserialize,
  resolvePositions,
  incrementalLayout,
  // Settings (CORAL-REQ-009)
  useSettings,
  SettingsPanel,
  // Compatibility (CORAL-REQ-010)
  useEdgeCompatibility,
  CompatibilityEdge,
  // Properties Panel and Inline Editing
  EditProvider,
  NodePropertiesPanel,
  type PropertyChange,
  type LayoutSettings,
  type CoralDocument,
  type CoralNode,
  type CoralEdge,
  type DiffableGraph,
  type Position,
  type NodeConnectionInfo,
} from '@coral/viz';

const elk = new ELK();

// Sample Coral DSL
const sampleCoralDSL = `// Error Handling Flowchart
// Try editing this code!

service "Loading URL failed"
service "Check console for errors"
module "Is JSON correct?"
service "Raise GitHub issue"
module "Someone sent link?"
service "Ask for complete link"
module "Copied complete URL?"
service "Check browser Timeline"

loading_url_failed -> check_console_for_errors
check_console_for_errors -> is_json_correct
is_json_correct -> raise_github_issue
is_json_correct -> someone_sent_link
someone_sent_link -> ask_for_complete_link
someone_sent_link -> copied_complete_url
copied_complete_url -> raise_github_issue
copied_complete_url -> check_browser_timeline
`;

// Sample Mermaid DSL
const sampleMermaidDSL = `flowchart TD
    A[Loading URL failed] --> B[Check console for errors]
    B --> C{Is JSON correct?}
    C -->|Yes| D[Raise GitHub issue]
    C -->|No| E{Someone sent link?}
    E -->|Yes| F[Ask for complete link]
    E -->|No| G{Copied complete URL?}
    G -->|Yes| D
    G -->|No| H[Check browser Timeline]
`;

type DSLType = 'coral' | 'mermaid';
type NotationType = 'architecture' | 'flowchart' | 'bpmn' | 'erd' | 'code';

// Register SymbolNode as the node type
const nodeTypes = {
  symbol: SymbolNode,
};

// Register CompatibilityEdge for visual feedback (CORAL-REQ-010)
const edgeTypes = {
  compatibility: CompatibilityEdge,
};

/**
 * Map parser node type + notation to symbol ID
 */
function mapToSymbolId(nodeType: string, notation: NotationType): string {
  // Notation-specific mappings
  const mappings: Record<NotationType, Record<string, string>> = {
    architecture: {
      service: 'arch-service',
      database: 'arch-database',
      module: 'arch-service',
      external_api: 'arch-external-api',
      actor: 'arch-actor',
      group: 'arch-container',
    },
    flowchart: {
      service: 'flowchart-process',
      database: 'flowchart-predefined',
      module: 'flowchart-decision',
      external_api: 'flowchart-io',
      actor: 'flowchart-terminal',
      group: 'flowchart-connector',
      process: 'flowchart-process',
      decision: 'flowchart-decision',
      terminal: 'flowchart-terminal',
    },
    bpmn: {
      service: 'bpmn-task',
      database: 'bpmn-data-store',
      module: 'bpmn-gateway-exclusive',
      external_api: 'bpmn-task',
      actor: 'bpmn-start-event',
      group: 'bpmn-pool',
    },
    erd: {
      service: 'erd-entity',
      database: 'erd-entity',
      module: 'erd-attribute',
      external_api: 'erd-entity',
      actor: 'erd-entity',
      group: 'erd-entity',
    },
    code: {
      // Generic types (for backward compatibility)
      service: 'code-function',
      database: 'code-module',
      external_api: 'code-interface',
      actor: 'code-package',
      group: 'code-module',
      // Armada code types
      function: 'code-function',
      method: 'code-function',
      class: 'code-class',
      interface: 'code-type',
      module: 'code-module',
      external_module: 'code-external',
      type_alias: 'code-type',
      variable: 'code-variable',
      constant: 'code-variable',
      property: 'code-variable',
      struct: 'code-class',
      namespace: 'code-namespace',
    },
  };

  return mappings[notation]?.[nodeType] || `${notation === 'architecture' ? 'arch' : notation}-process`;
}

/**
 * Get default node dimensions based on symbol
 */
function getNodeDimensions(symbolId: string): { width: number; height: number } {
  const symbol = symbolRegistry.get(symbolId);
  if (symbol) {
    const shape = shapeRegistry.get(symbol.shape);
    if (shape) {
      return {
        width: (symbol.defaults?.width as number) || shape.defaultSize.width,
        height: (symbol.defaults?.height as number) || shape.defaultSize.height,
      };
    }
  }
  return { width: 120, height: 60 };
}

// ELK layout function with symbol-aware sizing and configurable settings
async function layoutNodes(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  notation: NotationType,
  layoutSettings?: LayoutSettings
): Promise<Node<SymbolNodeData>[]> {
  if (graphNodes.length === 0) {
    console.log('No nodes to layout');
    return [];
  }

  console.log('Laying out', graphNodes.length, 'nodes and', graphEdges.length, 'edges with notation:', notation);

  // Pre-compute symbol IDs and dimensions
  const nodeInfo = graphNodes.map((n) => {
    const symbolId = mapToSymbolId(n.type, notation);
    const dims = getNodeDimensions(symbolId);
    return { node: n, symbolId, dims };
  });

  // Build ELK layout options from settings
  const algorithm = layoutSettings?.algorithm || 'layered';
  const direction = layoutSettings?.direction || 'DOWN';
  const nodeNodeSpacing = String(layoutSettings?.spacing?.nodeNode ?? 50);
  const layerSpacing = String(layoutSettings?.spacing?.layerSpacing ?? 70);

  // Base layout options
  const layoutOptions: Record<string, string> = {
    'elk.algorithm': algorithm,
    'elk.direction': direction,
    'elk.spacing.nodeNode': nodeNodeSpacing,
  };

  // Add layer spacing for layered algorithm
  if (algorithm === 'layered') {
    layoutOptions['elk.layered.spacing.nodeNodeBetweenLayers'] = layerSpacing;
  }

  // Merge any additional ELK options
  if (layoutSettings?.elkOptions) {
    for (const [key, value] of Object.entries(layoutSettings.elkOptions)) {
      layoutOptions[key] = String(value);
    }
  }

  try {
    const elkGraph = {
      id: 'root',
      layoutOptions,
      children: nodeInfo.map(({ node, dims }) => ({
        id: node.id,
        width: dims.width + 20, // Add padding for handles
        height: dims.height + 10,
      })),
      edges: graphEdges.map((e) => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      })),
    };

    const layouted = await elk.layout(elkGraph);
    console.log('ELK layout complete:', layouted);

    return nodeInfo.map(({ node, symbolId, dims }) => {
      const elkNode = layouted.children?.find((n) => n.id === node.id);
      return {
        id: node.id,
        type: 'symbol',
        position: { x: elkNode?.x || 0, y: elkNode?.y || 0 },
        data: {
          label: node.label,
          nodeType: node.type,
          symbolId,
          width: dims.width,
          height: dims.height,
        },
      };
    });
  } catch (err) {
    console.error('ELK layout error:', err);
    // Fallback: simple grid layout
    return nodeInfo.map(({ node, symbolId, dims }, i) => ({
      id: node.id,
      type: 'symbol',
      position: { x: (i % 3) * 200, y: Math.floor(i / 3) * 120 },
      data: {
        label: node.label,
        nodeType: node.type,
        symbolId,
        width: dims.width,
        height: dims.height,
      },
    }));
  }
}

// Convert edges to React Flow format
function convertEdges(graphEdges: GraphEdge[]): Edge[] {
  return graphEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: 'smoothstep',
    animated: false,
    reconnectable: true, // Enable edge reconnection
    style: { stroke: '#666', strokeWidth: 2 },
    labelStyle: { fontSize: 11, fill: '#666' },
    // Selected edges are highlighted
    focusable: true,
    interactionWidth: 20, // Easier to click
  }));
}

// Line numbers component - theme-aware
interface LineNumbersProps {
  count: number;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

function LineNumbers({ count, bgColor, textColor, borderColor }: LineNumbersProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '40px',
        paddingTop: '8px',
        paddingRight: '8px',
        textAlign: 'right',
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
        fontSize: '13px',
        lineHeight: '1.5',
        color: textColor,
        backgroundColor: bgColor,
        borderRight: `1px solid ${borderColor}`,
        userSelect: 'none',
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i + 1}>{i + 1}</div>
      ))}
    </div>
  );
}

// Floating Toolbar with zoom controls - must be inside ReactFlowProvider
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
  // Theme colors
  bgColor: string;
  bgHoverColor: string;
  textColor: string;
  textMutedColor: string;
  dividerColor: string;
  shadowColor: string;
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
  bgColor,
  bgHoverColor,
  textColor,
  textMutedColor,
  dividerColor,
  shadowColor,
}: FloatingToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

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
      style={{
        position: 'absolute',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: bgColor,
        borderRadius: '24px',
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        boxShadow: `0 4px 12px ${shadowColor}`,
        zIndex: 10,
      }}
      role="toolbar"
      aria-label="Canvas controls"
    >
      {/* Zoom controls */}
      <button
        onClick={() => zoomIn()}
        aria-label="Zoom in"
        title="Zoom In"
        style={buttonStyle}
        onMouseEnter={(e) => e.currentTarget.style.background = bgHoverColor}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        +
      </button>
      <button
        onClick={() => zoomOut()}
        aria-label="Zoom out"
        title="Zoom Out"
        style={buttonStyle}
        onMouseEnter={(e) => e.currentTarget.style.background = bgHoverColor}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        −
      </button>
      <button
        onClick={() => fitView({ padding: 0.2 })}
        aria-label="Fit diagram to view"
        title="Fit View"
        style={{ ...buttonStyle, fontSize: '12px' }}
        onMouseEnter={(e) => e.currentTarget.style.background = bgHoverColor}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        ⊡
      </button>

      {/* Divider */}
      <div style={{ width: '1px', height: '16px', background: dividerColor, margin: '0 4px' }} />

      {/* Reflow */}
      <button
        onClick={onReflow}
        disabled={isReflowing || disabled}
        aria-label="Reflow layout"
        title="Reflow Layout (Ctrl+Shift+L)"
        style={isReflowing || disabled ? disabledStyle : buttonStyle}
        onMouseEnter={(e) => {
          if (!isReflowing && !disabled) e.currentTarget.style.background = bgHoverColor;
        }}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          {isReflowing ? '...' : '↻'} Reflow
        </span>
      </button>

      {/* Divider */}
      <div style={{ width: '1px', height: '16px', background: dividerColor, margin: '0 4px' }} />

      {/* Undo/Redo */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        aria-label={`Undo (${undoCount} available)`}
        title={`Undo (Ctrl+Z) - ${undoCount} available`}
        style={canUndo ? buttonStyle : disabledStyle}
        onMouseEnter={(e) => { if (canUndo) e.currentTarget.style.background = bgHoverColor; }}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        ↩
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        aria-label={`Redo (${redoCount} available)`}
        title={`Redo (Ctrl+Shift+Z) - ${redoCount} available`}
        style={canRedo ? buttonStyle : disabledStyle}
        onMouseEnter={(e) => { if (canRedo) e.currentTarget.style.background = bgHoverColor; }}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
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

// Inspector tab type for right panel
type InspectorTab = 'document' | 'selection';

export default function App() {
  const [dslType, setDslType] = useState<DSLType>('mermaid');
  const [notation, setNotation] = useState<NotationType>('flowchart');
  const [dsl, setDsl] = useState(sampleMermaidDSL);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<SymbolNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [parseErrors, setParseErrors] = useState<Array<{ line: number; message: string }>>([]);
  const [debugInfo, setDebugInfo] = useState('');
  // Track if this is a format switch to bypass debounce
  const [formatSwitchPending, setFormatSwitchPending] = useState(false);
  // Track if a reflow operation is in progress
  const [isReflowing, setIsReflowing] = useState(false);
  // Document name for file operations
  const [documentName, setDocumentName] = useState('Untitled Diagram');
  // Right Inspector panel - always visible, with tabs
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('document');
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  // Selected node for properties tab
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // Armada connection dialog visibility
  const [showArmadaDialog, setShowArmadaDialog] = useState(false);

  // Store last parsed graph for reflow (so we can re-layout without re-parsing)
  const lastParsedRef = useRef<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  // Store previous diffable graph for incremental updates (CORAL-REQ-013)
  const previousGraphRef = useRef<DiffableGraph>({ nodes: [], edges: [] });
  // Track if we're doing undo/redo (skip layout during these operations)
  const isUndoRedoRef = useRef(false);
  // Track if this needs a full layout (format switch, initial load, explicit reflow)
  const needsFullLayoutRef = useRef(true);
  // Track if DSL update came from diagram changes (to prevent feedback loop)
  const isInternalDslUpdateRef = useRef(false);

  // Layout history for undo/redo
  const {
    saveSnapshot,
    undo,
    redo,
    canUndo,
    canRedo,
    undoCount,
    redoCount,
  } = useLayoutHistory();

  // Auto-recovery for session persistence (CORAL-REQ-016)
  const [recoveryState, recoveryActions] = useAutoRecovery({ warnOnExit: true });
  const { hasRecoveryData, recoveryData, isDirty, lastSaveTime } = recoveryState;
  const { applyRecovery, discardRecovery, markSaved, updateRecovery } = recoveryActions;

  // Settings hook (CORAL-REQ-009)
  const {
    userPreferences,
    documentSettings,
    selectedPreset,
    updateUserPreferences,
    updateDocumentSettings,
    applyLayoutPreset,
  } = useSettings({
    initialDocumentSettings: {
      notation,
      layout: {
        algorithm: 'layered',
        direction: 'DOWN',
        spacing: { nodeNode: 50, layerSpacing: 70 },
        elkOptions: { 'elk.edgeRouting': 'ORTHOGONAL' },
      },
    },
    onLayoutChange: () => {
      // Trigger reflow when layout settings change
      needsFullLayoutRef.current = true;
      setFormatSwitchPending(true);
    },
  });

  // Theme colors based on user preference
  const theme = useThemeColors(userPreferences.theme);
  const edgeStyles = useMemo(() => getEdgeStyles(theme), [theme]);

  // Get available notations for UI
  const availableNotations = useMemo(() => notationRegistry.getAll(), []);

  // Build node connection info for compatibility checking (CORAL-REQ-010)
  const nodeConnectionInfo = useMemo(() => {
    const info = new Map<string, NodeConnectionInfo>();
    for (const node of nodes) {
      info.set(node.id, {
        id: node.id,
        symbolId: node.data.symbolId || 'flowchart-process',
        variant: undefined,
      });
    }
    return info;
  }, [nodes]);

  // Edge compatibility hook (CORAL-REQ-010)
  const { getEdgeStatus, getEdgeValidation } = useEdgeCompatibility({
    notationId: notation,
    nodeInfo: nodeConnectionInfo,
    existingEdges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourcePort: undefined,
      targetPort: undefined,
    })),
  });

  // Apply compatibility styling to edges
  const styledEdges = useMemo(() => {
    return edges.map((edge) => {
      const status = getEdgeStatus(edge.id);
      const validation = getEdgeValidation(edge.id);

      // Only use compatibility edge type for edges with issues
      if (status === 'incompatible' || status === 'warning') {
        return {
          ...edge,
          type: 'compatibility',
          data: {
            ...edge.data,
            compatibilityStatus: status,
            validation,
            label: edge.label,
          },
        };
      }

      // Compatible edges use default styling
      return edge;
    });
  }, [edges, getEdgeStatus, getEdgeValidation]);

  // Get selected node for properties panel
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  // Track current nodes for snapshot saving (avoid stale closure)
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Sync diagram changes to DSL text (diagram → text direction)
  const syncDiagramToText = useCallback(() => {
    // Only sync when using Coral DSL (Mermaid has different syntax)
    if (dslType !== 'coral') {
      console.log('Skipping diagram→text sync for non-Coral DSL');
      return;
    }

    // Convert React Flow nodes to Graph-IR format
    const graphNodes = nodes.map((n) => ({
      id: n.id,
      type: n.data.nodeType || 'service',
      label: n.data.label,
      description: n.data.description,
      properties: n.data.properties as Record<string, unknown> | undefined,
    }));

    const graphEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === 'string' ? e.label : undefined,
    }));

    const graphIR: GraphIR = {
      version: '1.0.0',
      id: 'diagram',
      nodes: graphNodes,
      edges: graphEdges,
    };

    // Print to DSL text
    const newDsl = printCoralDSL(graphIR);

    // Set flag to prevent feedback loop
    isInternalDslUpdateRef.current = true;

    // Update DSL text
    setDsl(newDsl);

    // Reset flag after a microtask (allows state update to complete)
    Promise.resolve().then(() => {
      isInternalDslUpdateRef.current = false;
    });

    console.log('Synced diagram changes to DSL text');
  }, [dslType, nodes, edges, setDsl]);

  // Handle property change from properties panel
  const handlePropertyChange = useCallback((change: PropertyChange) => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== change.nodeId) return node;

        if (change.field === 'label') {
          // Also update lastParsedRef so reflow uses new label
          lastParsedRef.current = {
            ...lastParsedRef.current,
            nodes: lastParsedRef.current.nodes.map((n) =>
              n.id === change.nodeId ? { ...n, label: change.newValue as string } : n
            ),
          };
          return {
            ...node,
            data: { ...node.data, label: change.newValue as string },
          };
        }
        if (change.field === 'description') {
          return {
            ...node,
            data: { ...node.data, description: change.newValue as string },
          };
        }
        if (change.field === 'property' && change.propertyKey) {
          return {
            ...node,
            data: {
              ...node.data,
              properties: {
                ...(node.data.properties as Record<string, unknown> || {}),
                [change.propertyKey]: change.newValue,
              },
            },
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  // Handle add property from properties panel
  const handleAddProperty = useCallback((nodeId: string, key: string, value: unknown) => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          data: {
            ...node.data,
            properties: {
              ...(node.data.properties as Record<string, unknown> || {}),
              [key]: value,
            },
          },
        };
      })
    );
  }, [setNodes]);

  // Handle remove property from properties panel
  const handleRemoveProperty = useCallback((nodeId: string, key: string) => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== nodeId) return node;
        const newProps = { ...(node.data.properties as Record<string, unknown> || {}) };
        delete newProps[key];
        return {
          ...node,
          data: {
            ...node.data,
            properties: newProps,
          },
        };
      })
    );
  }, [setNodes]);

  // Handle inline label edit from SymbolNode (via EditProvider)
  const handleLabelEdit = useCallback((nodeId: string, newLabel: string) => {
    handlePropertyChange({
      nodeId,
      field: 'label',
      oldValue: nodes.find((n) => n.id === nodeId)?.data.label,
      newValue: newLabel,
    });
  }, [handlePropertyChange, nodes]);

  // Sync to text after node changes (debounced)
  const syncTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    // Skip sync on initial load or during undo/redo
    if (isUndoRedoRef.current || isInternalDslUpdateRef.current) return;

    // Clear any pending sync
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    // Debounce the sync to avoid rapid updates
    syncTimeoutRef.current = window.setTimeout(() => {
      syncDiagramToText();
    }, 500);

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [nodes, syncDiagramToText]);

  // Handle node selection - switch to Selection tab in Inspector
  const handleSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    if (selectedNodes.length === 1) {
      setSelectedNodeId(selectedNodes[0].id);
      setInspectorTab('selection');
      setInspectorCollapsed(false); // Ensure inspector is visible
    } else if (selectedNodes.length === 0) {
      setSelectedNodeId(null);
      // Stay on current tab, don't force switch
    }
    // Multi-select: keep showing last selected
  }, []);

  // Parse DSL and update diagram with position stability (CORAL-REQ-013)
  const updateDiagram = useCallback(async (text: string, type: DSLType, currentNotation: NotationType) => {
    // Skip if we're in the middle of undo/redo
    if (isUndoRedoRef.current) {
      console.log('Skipping updateDiagram during undo/redo');
      return;
    }

    setLoading(true);

    const result = type === 'coral' ? parseCoralDSL(text) : parseMermaidDSL(text);
    console.log('Parse result:', result);
    setParseErrors(result.errors);
    setDebugInfo(`Parsed: ${result.nodes.length} nodes, ${result.edges.length} edges (${currentNotation} notation)`);

    // Store parsed graph for potential reflow
    lastParsedRef.current = { nodes: result.nodes, edges: result.edges };

    if (result.nodes.length === 0) {
      setNodes([]);
      setEdges([]);
      previousGraphRef.current = { nodes: [], edges: [] };
      setLoading(false);
      return;
    }

    // Pre-compute symbol IDs and dimensions for all nodes
    const nodeInfoMap = new Map<string, { symbolId: string; dims: { width: number; height: number } }>();
    for (const n of result.nodes) {
      const symbolId = mapToSymbolId(n.type, currentNotation);
      const dims = getNodeDimensions(symbolId);
      nodeInfoMap.set(n.id, { symbolId, dims });
    }

    // Create new diffable graph
    const newGraph: DiffableGraph = {
      nodes: result.nodes.map((n) => ({ id: n.id, type: n.type, label: n.label })),
      edges: result.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    };

    // Determine if we need full layout or incremental update
    if (needsFullLayoutRef.current || previousGraphRef.current.nodes.length === 0) {
      // Full layout: initial load, format switch, or explicit request
      console.log('Performing full ELK layout');
      const layoutedNodes = await layoutNodes(result.nodes, result.edges, currentNotation, documentSettings.layout);

      // Save current positions before setting new ones (for undo)
      if (nodesRef.current.length > 0) {
        saveSnapshot(nodesRef.current, 'parse');
      }

      setNodes(layoutedNodes);
      setEdges(convertEdges(result.edges));

      // Save new positions after layout
      saveSnapshot(layoutedNodes, 'layout');

      // Reset the flag
      needsFullLayoutRef.current = false;
    } else {
      // Incremental update: preserve existing positions, only layout new nodes
      console.log('Performing incremental layout');

      // Get current positions from nodes ref
      const currentPositions = new Map<string, Position>();
      for (const node of nodesRef.current) {
        currentPositions.set(node.id, { ...node.position });
      }

      // Resolve positions based on diff
      const resolution = resolvePositions(previousGraphRef.current, newGraph, currentPositions);

      let finalPositions: Map<string, Position>;

      if (resolution.needsLayout.length > 0) {
        // Some nodes need layout - run incremental ELK
        const nodeInfos = result.nodes.map((n) => {
          const info = nodeInfoMap.get(n.id)!;
          return {
            id: n.id,
            type: n.type,
            label: n.label,
            width: info.dims.width + 20,
            height: info.dims.height + 10,
          };
        });

        finalPositions = await incrementalLayout(
          nodeInfos,
          result.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
          resolution.positions,
          resolution.needsLayout,
          { direction: 'DOWN', spacing: 50 }
        );
      } else {
        // No nodes need layout - use resolved positions directly
        finalPositions = resolution.positions;
      }

      // Build React Flow nodes with preserved/computed positions
      const newNodes: Node<SymbolNodeData>[] = result.nodes.map((n) => {
        const info = nodeInfoMap.get(n.id)!;
        const pos = finalPositions.get(n.id) || { x: 0, y: 0 };
        return {
          id: n.id,
          type: 'symbol',
          position: pos,
          data: {
            label: n.label,
            nodeType: n.type,
            symbolId: info.symbolId,
            width: info.dims.width,
            height: info.dims.height,
          },
        };
      });

      setNodes(newNodes);
      setEdges(convertEdges(result.edges));
    }

    // Update previous graph for next diff
    previousGraphRef.current = newGraph;
    setLoading(false);
  }, [setNodes, setEdges, saveSnapshot, documentSettings.layout]);

  // Switch DSL type - clear diagram immediately and trigger fresh parse
  const handleDslTypeChange = useCallback((newType: DSLType) => {
    // Clear the diagram immediately to avoid stale state
    setNodes([]);
    setEdges([]);
    setDslType(newType);
    setDsl(newType === 'coral' ? sampleCoralDSL : sampleMermaidDSL);
    // Mark that we need a full layout (new DSL format)
    needsFullLayoutRef.current = true;
    previousGraphRef.current = { nodes: [], edges: [] };
    // Mark that we need an immediate update (bypass debounce)
    setFormatSwitchPending(true);
  }, [setNodes, setEdges]);

  // Switch notation - re-render with new symbols
  const handleNotationChange = useCallback((newNotation: NotationType) => {
    setNotation(newNotation);
    // Mark that we need a full layout (notation change affects symbols)
    needsFullLayoutRef.current = true;
    setFormatSwitchPending(true);
  }, []);

  // Track edge being reconnected for visual feedback
  const edgeReconnectSuccessful = useRef(true);

  // Handle edge reconnection start - dim the edge
  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  // Handle edge reconnection - update the edge with new connection
  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      edgeReconnectSuccessful.current = true;
      setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds));
    },
    [setEdges]
  );

  // Handle edge reconnection end - remove edge if dropped in empty space
  const onReconnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, edge: Edge) => {
      if (!edgeReconnectSuccessful.current) {
        // Edge was dropped in empty space - optionally remove it
        // For now, we'll keep it (user can press Delete to remove)
        console.log('Edge reconnection cancelled for edge:', edge.id);
      }
      edgeReconnectSuccessful.current = true;
    },
    []
  );

  // Reflow: re-run ELK layout on current nodes
  const handleReflow = useCallback(async () => {
    if (lastParsedRef.current.nodes.length === 0) return;

    setIsReflowing(true);

    // Save current positions before reflow (use ref to avoid stale closure)
    if (nodesRef.current.length > 0) {
      saveSnapshot(nodesRef.current, 'before-reflow');
    }

    try {
      const layoutedNodes = await layoutNodes(
        lastParsedRef.current.nodes,
        lastParsedRef.current.edges,
        notation,
        documentSettings.layout
      );
      setNodes(layoutedNodes);

      // Save new positions after reflow
      saveSnapshot(layoutedNodes, 'reflow');
    } finally {
      setIsReflowing(false);
    }
  }, [notation, setNodes, saveSnapshot, documentSettings.layout]);

  // Undo: restore previous node positions (CORAL-REQ-013: skip layout during undo)
  const handleUndo = useCallback(() => {
    const positions = undo();
    if (positions) {
      // Set flag to prevent layout during position restoration
      isUndoRedoRef.current = true;
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          const pos = positions.get(node.id);
          return pos ? { ...node, position: pos } : node;
        })
      );
      // Reset flag after a microtask to ensure state update completes
      Promise.resolve().then(() => {
        isUndoRedoRef.current = false;
      });
    }
  }, [undo, setNodes]);

  // Redo: restore next node positions (CORAL-REQ-013: skip layout during redo)
  const handleRedo = useCallback(() => {
    const positions = redo();
    if (positions) {
      // Set flag to prevent layout during position restoration
      isUndoRedoRef.current = true;
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          const pos = positions.get(node.id);
          return pos ? { ...node, position: pos } : node;
        })
      );
      // Reset flag after a microtask to ensure state update completes
      Promise.resolve().then(() => {
        isUndoRedoRef.current = false;
      });
    }
  }, [redo, setNodes]);

  // Get current document for saving
  const handleGetDocument = useCallback((): CoralDocument => {
    // Convert React Flow nodes/edges to Coral format
    const coralNodes: CoralNode[] = nodes.map((n) => ({
      id: n.id,
      type: n.data.nodeType || 'service',
      position: n.position,
      data: {
        label: n.data.label,
        nodeType: n.data.nodeType || 'service',
      },
    }));

    const coralEdges: CoralEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === 'string' ? e.label : undefined,
      data: {
        label: typeof e.label === 'string' ? e.label : undefined,
      },
    }));

    return serialize(coralNodes, coralEdges, {
      name: documentName,
      settings: {
        notation,
        layout: {
          algorithm: 'layered',
          direction: 'DOWN',
        },
      },
    });
  }, [nodes, edges, documentName, notation]);

  // Load document from file
  const handleLoadDocument = useCallback((doc: CoralDocument) => {
    try {
      const result = deserialize(doc);

      // Update document name
      setDocumentName(doc.metadata.name);

      // Update notation if present
      if (result.settings.notation) {
        setNotation(result.settings.notation as NotationType);
      }

      // Convert to React Flow format with symbol data
      const flowNodes: Node<SymbolNodeData>[] = result.nodes.map((n: CoralNode) => {
        const symbolId = mapToSymbolId(n.data.nodeType || 'service', (result.settings.notation || notation) as NotationType);
        const dims = getNodeDimensions(symbolId);
        return {
          id: n.id,
          type: 'symbol',
          position: n.position,
          data: {
            label: n.data.label,
            nodeType: n.data.nodeType || 'service',
            symbolId,
            width: dims.width,
            height: dims.height,
          },
        };
      });

      const flowEdges: Edge[] = result.edges.map((e: CoralEdge) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.data?.label,
        type: 'smoothstep',
        reconnectable: true,
        style: { stroke: '#666', strokeWidth: 2 },
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);

      // Update last parsed ref for reflow
      lastParsedRef.current = {
        nodes: result.nodes.map((n: CoralNode) => ({
          id: n.id,
          type: n.data.nodeType || 'service',
          label: n.data.label,
        })),
        edges: result.edges.map((e: CoralEdge) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.data?.label,
        })),
      };

      // Clear DSL since we loaded from file
      setDsl('// Loaded from file: ' + doc.metadata.name);

      setDebugInfo(`Loaded: ${result.nodes.length} nodes, ${result.edges.length} edges`);
    } catch (error) {
      console.error('Failed to load document:', error);
      alert(`Failed to load document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [notation, setNodes, setEdges]);

  // Armada connection hook (CORAL-REQ-017)
  const armada = useArmadaConnection({
    onDocumentLoad: (doc) => {
      handleLoadDocument(doc);
      // Switch to code notation for Armada diagrams
      if (doc.settings?.notation === 'code') {
        setNotation('code');
      }
      // Close dialog on successful load
      setShowArmadaDialog(false);
    },
  });

  // Dialog theme colors (derived from main theme)
  const dialogTheme = useMemo(() => ({
    dialogBg: theme.inspectorBg,
    dialogBorder: theme.inspectorBorder,
    dialogText: theme.inspectorText,
    inputBg: theme.editorBg,
    inputBorder: theme.controlBorder,
    inputText: theme.editorText,
    buttonBg: theme.controlBgActive,
    buttonText: theme.controlText,
    buttonHoverBg: theme.controlBgHover,
    errorBg: theme.errorBg,
    errorText: theme.errorText,
    successBg: theme.successBg,
    successText: theme.successText,
    mutedText: theme.controlTextMuted,
  }), [theme]);

  // Handle format switch immediately (no debounce)
  useEffect(() => {
    if (formatSwitchPending) {
      setFormatSwitchPending(false);
      updateDiagram(dsl, dslType, notation);
    }
  }, [formatSwitchPending, dsl, dslType, notation, updateDiagram]);

  // Initial load
  useEffect(() => {
    updateDiagram(dsl, dslType, notation);
  }, []);

  // Debounced update on DSL text change (not format switch or internal update)
  useEffect(() => {
    // Skip debounced update if this was triggered by a format switch
    if (formatSwitchPending) return;

    // Skip if this update came from diagram → text sync (prevents feedback loop)
    if (isInternalDslUpdateRef.current) {
      console.log('Skipping re-parse: DSL update was from diagram sync');
      return;
    }

    const timeout = setTimeout(() => {
      updateDiagram(dsl, dslType, notation);
    }, 300);
    return () => clearTimeout(timeout);
  }, [dsl, dslType, notation, updateDiagram, formatSwitchPending]);

  // Auto-save to localStorage for recovery (CORAL-REQ-016)
  useEffect(() => {
    // Don't auto-save during initial load or recovery
    if (loading) return;

    // Build node positions map
    const nodePositions: Record<string, { x: number; y: number }> = {};
    for (const node of nodes) {
      nodePositions[node.id] = { x: node.position.x, y: node.position.y };
    }

    updateRecovery({
      documentName,
      dslType,
      dsl,
      notation,
      nodePositions,
    });
  }, [dsl, dslType, notation, documentName, nodes, loading, updateRecovery]);

  // Handle recovery application
  const handleApplyRecovery = useCallback(() => {
    const data = applyRecovery();
    if (data) {
      setDocumentName(data.documentName);
      setDslType(data.dslType);
      setDsl(data.dsl);
      setNotation(data.notation as NotationType);
      // Node positions will be applied after re-parse
      // Mark that we need a full layout since we're loading from recovery
      needsFullLayoutRef.current = true;
      setFormatSwitchPending(true);
    }
  }, [applyRecovery]);

  // Wrap handleGetDocument to mark as saved after explicit save
  const handleSaveDocument = useCallback(() => {
    const doc = handleGetDocument();
    markSaved();
    return doc;
  }, [handleGetDocument, markSaved]);

  const lineCount = useMemo(() => dsl.split('\n').length, [dsl]);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Inject custom edge styles */}
      <style>{edgeStyles}</style>

      {/* Recovery Banner - shown when there's recoverable data */}
      {hasRecoveryData && recoveryData && (
        <RecoveryBanner
          recoveryData={recoveryData}
          onRecover={handleApplyRecovery}
          onDiscard={discardRecovery}
        />
      )}

      {/* Minimal Top App Bar - M3 pattern */}
      <header
        style={{
          padding: '8px 16px',
          background: theme.headerBg,
          color: theme.headerText,
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          height: '48px',
          flexShrink: 0,
        }}
      >
        {/* Logo/Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>◇</span>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Coral</span>
        </div>

        {/* Document Name - editable */}
        <input
          type="text"
          value={documentName}
          onChange={(e) => setDocumentName(e.target.value)}
          style={{
            background: theme.inputBg,
            border: 'none',
            color: theme.inputText,
            fontSize: '14px',
            padding: '4px 8px',
            borderRadius: '4px',
            outline: 'none',
            minWidth: '150px',
          }}
          onFocus={(e) => e.target.style.background = theme.controlBg}
          onBlur={(e) => e.target.style.background = 'transparent'}
          aria-label="Document name"
        />

        {/* Unsaved Changes Indicator */}
        <UnsavedIndicator isDirty={isDirty} lastSaveTime={lastSaveTime} />

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* DSL Format - Segmented Control */}
        <div
          role="radiogroup"
          aria-label="DSL format"
          style={{
            display: 'flex',
            background: theme.controlBg,
            borderRadius: '6px',
            padding: '2px',
          }}
        >
          <button
            role="radio"
            aria-checked={dslType === 'mermaid'}
            onClick={() => handleDslTypeChange('mermaid')}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              borderRadius: '4px',
              border: 'none',
              background: dslType === 'mermaid' ? theme.controlBgActive : 'transparent',
              color: dslType === 'mermaid' ? theme.controlText : theme.controlTextMuted,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Mermaid
          </button>
          <button
            role="radio"
            aria-checked={dslType === 'coral'}
            onClick={() => handleDslTypeChange('coral')}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              borderRadius: '4px',
              border: 'none',
              background: dslType === 'coral' ? theme.controlBgActive : 'transparent',
              color: dslType === 'coral' ? theme.controlText : theme.controlTextMuted,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Coral
          </button>
        </div>

        {/* File Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileControls
            document={null}
            onGetDocument={handleSaveDocument}
            onLoad={handleLoadDocument}
            showExport={true}
          />
          {/* Armada Connection Button (CORAL-REQ-017) */}
          {armada.isConnected ? (
            <button
              onClick={() => armada.disconnect()}
              title={`Connected to ${armada.config.serverUrl}`}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                borderRadius: '4px',
                border: `1px solid ${theme.successText}`,
                background: theme.successBg,
                color: theme.successText,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span style={{ color: '#22c55e' }}>●</span>
              Armada
            </button>
          ) : (
            <button
              onClick={() => setShowArmadaDialog(true)}
              title="Connect to Armada server"
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                borderRadius: '4px',
                border: `1px solid ${theme.controlBorder}`,
                background: theme.controlBg,
                color: theme.controlText,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span style={{ fontSize: '14px' }}>⚓</span>
              Armada
            </button>
          )}
        </div>

        {/* Inspector Toggle */}
        <button
          onClick={() => setInspectorCollapsed(!inspectorCollapsed)}
          aria-label={inspectorCollapsed ? 'Show inspector' : 'Hide inspector'}
          aria-pressed={!inspectorCollapsed}
          style={{
            padding: '6px 10px',
            fontSize: '12px',
            borderRadius: '4px',
            border: 'none',
            background: inspectorCollapsed ? theme.controlBg : theme.controlBgActive,
            color: theme.controlText,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span style={{ fontSize: '14px' }}>☰</span>
        </button>
      </header>

      {/* Armada Status Bar - shown when connected (CORAL-REQ-017) */}
      {armada.isConnected && (
        <ArmadaStatusBar
          isConnected={armada.isConnected}
          serverUrl={armada.config.serverUrl}
          mode={armada.config.mode}
          stats={armada.stats}
          isLoading={armada.isLoading}
          onModeChange={armada.setModeAndFetch}
          onRefresh={armada.refresh}
          onDisconnect={armada.disconnect}
          availableModes={armada.availableModes}
          theme={dialogTheme}
        />
      )}

      {/* Three-Pane Layout: Stage (Editor + Canvas) | Inspector */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* LEFT: Text Editor Pane (part of Stage) */}
        <div
          style={{
            width: '35%',
            minWidth: '280px',
            display: 'flex',
            flexDirection: 'column',
            background: theme.editorBg,
          }}
        >
          {/* Editor Header */}
          <div
            style={{
              padding: '6px 12px',
              background: theme.editorHeaderBg,
              fontSize: '11px',
              fontWeight: 500,
              color: theme.editorHeaderText,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{dslType === 'coral' ? 'CORAL DSL' : 'MERMAID'}</span>
            <span style={{ color: theme.lineNumbersText }}>{lineCount} lines</span>
          </div>

          {/* Editor Content */}
          <div style={{ flex: 1, position: 'relative', overflow: 'auto' }}>
            <LineNumbers
              count={lineCount}
              bgColor={theme.lineNumbersBg}
              textColor={theme.lineNumbersText}
              borderColor={theme.lineNumbersBorder}
            />
            <textarea
              value={dsl}
              onChange={(e) => setDsl(e.target.value)}
              spellCheck={false}
              aria-label="DSL editor"
              style={{
                width: '100%',
                height: '100%',
                padding: '8px 12px 8px 48px',
                border: 'none',
                outline: 'none',
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
                fontSize: '13px',
                lineHeight: '1.5',
                resize: 'none',
                backgroundColor: theme.editorBg,
                color: theme.editorText,
              }}
            />
          </div>

          {/* Status Bar */}
          <div
            style={{
              padding: '4px 12px',
              background: parseErrors.length > 0 ? theme.errorBg : theme.successBg,
              fontSize: '11px',
              color: parseErrors.length > 0 ? theme.errorText : theme.successText,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ fontSize: '10px' }}>{parseErrors.length > 0 ? '✗' : '✓'}</span>
            {parseErrors.length > 0 ? (
              <span>Line {parseErrors[0].line}: {parseErrors[0].message}</span>
            ) : (
              <span>{debugInfo}</span>
            )}
          </div>
        </div>

        {/* CENTER: Visual Canvas (main Stage area) */}
        <main
          aria-label="Diagram editor"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            background: theme.canvasBg,
          }}
        >
          {/* Canvas with ReactFlowProvider for toolbar controls */}
          <div style={{ flex: 1, position: 'relative' }}>
            <ReactFlowProvider>
              {nodes.length > 0 ? (
                <EditProvider onLabelEdit={handleLabelEdit}>
                  <ReactFlow
                    nodes={nodes}
                    edges={styledEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onSelectionChange={handleSelectionChange}
                    onReconnectStart={onReconnectStart}
                    onReconnect={onReconnect}
                    onReconnectEnd={onReconnectEnd}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.2 }}
                    defaultEdgeOptions={{ style: { strokeWidth: 2 } }}
                    style={{ background: theme.canvasBg }}
                  >
                    <Background color={theme.gridColor} gap={20} />
                    <MiniMap
                      style={{ background: theme.miniMapBg, border: `1px solid ${theme.miniMapBorder}` }}
                      maskColor={theme.miniMapMask}
                    />
                    {/* Floating Toolbar inside ReactFlow for useReactFlow access */}
                    <FloatingToolbar
                      onReflow={handleReflow}
                      onUndo={handleUndo}
                      onRedo={handleRedo}
                      canUndo={canUndo}
                      canRedo={canRedo}
                      undoCount={undoCount}
                      redoCount={redoCount}
                      isReflowing={isReflowing}
                      isLoading={loading}
                      disabled={nodes.length === 0}
                      bgColor={theme.floatingToolbarBg}
                      bgHoverColor={theme.controlBgHover}
                      textColor={theme.controlText}
                      textMutedColor={theme.canvasText}
                      dividerColor={theme.controlBorder}
                      shadowColor={theme.floatingToolbarShadow}
                    />
                  </ReactFlow>
                </EditProvider>
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: theme.canvasText,
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ fontSize: '14px' }}>No diagram to display</div>
                  <div style={{ fontSize: '12px' }}>Edit the DSL to add nodes</div>
                </div>
              )}
            </ReactFlowProvider>
          </div>

          {/* Canvas Status Bar */}
          <div
            style={{
              padding: '4px 12px',
              background: theme.canvasStatusBg,
              fontSize: '11px',
              color: theme.canvasStatusText,
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            <span>{nodes.length} nodes</span>
            <span>{edges.length} edges</span>
            <span style={{ marginLeft: 'auto' }}>
              {notation.charAt(0).toUpperCase() + notation.slice(1)} notation
            </span>
          </div>
        </main>

        {/* RIGHT: Inspector Panel (contextual) */}
        {!inspectorCollapsed && (
          <aside
            aria-label="Properties panel"
            style={{
              width: '320px',
              flexShrink: 0,
              background: theme.inspectorBg,
              display: 'flex',
              flexDirection: 'column',
              borderLeft: `1px solid ${theme.inspectorBorder}`,
            }}
          >
            {/* Tab Bar */}
            <div
              role="tablist"
              aria-label="Inspector tabs"
              style={{
                display: 'flex',
                background: theme.inspectorHeaderBg,
                borderBottom: `1px solid ${theme.inspectorBorder}`,
              }}
            >
              <button
                role="tab"
                aria-selected={inspectorTab === 'document'}
                aria-controls="panel-document"
                id="tab-document"
                onClick={() => setInspectorTab('document')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  background: inspectorTab === 'document' ? theme.tabActiveBg : 'transparent',
                  border: 'none',
                  borderBottom: inspectorTab === 'document' ? `2px solid ${theme.tabActiveIndicator}` : '2px solid transparent',
                  color: inspectorTab === 'document' ? theme.tabActiveText : theme.tabInactiveText,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                Document
              </button>
              <button
                role="tab"
                aria-selected={inspectorTab === 'selection'}
                aria-controls="panel-selection"
                id="tab-selection"
                onClick={() => setInspectorTab('selection')}
                disabled={!selectedNode}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  background: inspectorTab === 'selection' ? theme.tabActiveBg : 'transparent',
                  border: 'none',
                  borderBottom: inspectorTab === 'selection' ? `2px solid ${theme.tabActiveIndicator}` : '2px solid transparent',
                  color: !selectedNode ? theme.lineNumbersText : (inspectorTab === 'selection' ? theme.tabActiveText : theme.tabInactiveText),
                  cursor: selectedNode ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s',
                }}
              >
                Selection {selectedNode ? `(${selectedNode.data.label.slice(0, 12)}${selectedNode.data.label.length > 12 ? '...' : ''})` : ''}
              </button>
            </div>

            {/* Tab Panels */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* Document Settings Panel */}
              <div
                role="tabpanel"
                id="panel-document"
                aria-labelledby="tab-document"
                hidden={inspectorTab !== 'document'}
                style={{ display: inspectorTab === 'document' ? 'block' : 'none' }}
              >
                <SettingsPanel
                  documentSettings={documentSettings}
                  userPreferences={userPreferences}
                  selectedPreset={selectedPreset}
                  notations={availableNotations.map((n) => ({ id: n.id, name: n.name }))}
                  onDocumentSettingsChange={(settings) => {
                    updateDocumentSettings(settings);
                    if (settings.notation !== notation) {
                      handleNotationChange(settings.notation as NotationType);
                    }
                  }}
                  onUserPreferencesChange={updateUserPreferences}
                  onPresetChange={applyLayoutPreset}
                  onApplyLayout={handleReflow}
                />
              </div>

              {/* Selection Properties Panel */}
              <div
                role="tabpanel"
                id="panel-selection"
                aria-labelledby="tab-selection"
                hidden={inspectorTab !== 'selection'}
                style={{
                  display: inspectorTab === 'selection' ? 'block' : 'none',
                  padding: '8px',
                }}
              >
                <NodePropertiesPanel
                  selectedNode={selectedNode}
                  onPropertyChange={handlePropertyChange}
                  onAddProperty={handleAddProperty}
                  onRemoveProperty={handleRemoveProperty}
                />
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Armada Connection Dialog (CORAL-REQ-017) */}
      <ArmadaConnectionDialog
        isOpen={showArmadaDialog}
        onClose={() => setShowArmadaDialog(false)}
        config={armada.config}
        onConnect={armada.connect}
        isConnecting={armada.isConnecting}
        error={armada.error}
        availableModes={armada.availableModes}
        theme={dialogTheme}
      />
    </div>
  );
}
