/**
 * Core types for coral-code-design
 */

// Re-export types from @coral/viz that we use
import type {
  GraphIR as VizGraphIR,
  GraphNode as VizGraphNode,
  GraphEdge as VizGraphEdge,
  Position as VizPosition,
  LayoutOptions as VizLayoutOptions,
  CoralDocument as VizCoralDocument,
} from '@coral/viz';

export type GraphIR = VizGraphIR;
export type GraphNode = VizGraphNode;
export type GraphEdge = VizGraphEdge;
export type Position = VizPosition;
export type LayoutOptions = VizLayoutOptions;
export type CoralDocument = VizCoralDocument;

// ============================================================================
// Symbol IDs (Armada)
// ============================================================================

/** Armada symbol ID (SCIP format) */
export type SymbolId = string; // e.g., "scip:src/auth/svc.ts:AuthService#"

/** Edge key for annotation lookup */
export type EdgeKey = `${SymbolId}->${SymbolId}`;

// ============================================================================
// Workspace
// ============================================================================

export interface Workspace {
  id: string;
  name: string;
  rootPath: string;
  armadaConnection: ArmadaConnectionConfig;
  openDiagrams: DiagramReference[];
  activeLayout: LayoutConfig;
  annotations: AnnotationStore;
  settings: WorkspaceSettings;
}

export interface WorkspaceSettings {
  defaultNotation: NotationType;
  defaultDiagramType: DiagramType;
  autoRefresh: boolean;
  refreshInterval: number; // ms
}

export interface ArmadaConnectionConfig {
  serverUrl: string;
  mode: GraphMode;
}

export type GraphMode =
  | 'call-graph'
  | 'dependency-graph'
  | 'inheritance-tree'
  | 'impact-graph'
  | 'full-graph';

export type NotationType =
  | 'architecture'
  | 'flowchart'
  | 'bpmn'
  | 'erd'
  | 'code';

// ============================================================================
// Diagrams
// ============================================================================

export type DiagramType =
  | 'codebase-overview'
  | 'module-graph'
  | 'component-detail'
  | 'call-graph'
  | 'dependency-graph'
  | 'inheritance-tree'
  | 'data-flow'
  | 'impact-analysis'
  | 'custom';

export interface DiagramReference {
  id: string;
  name: string;
  type: DiagramType;
  scope: ScopeConfig;
}

export interface DiagramConfig {
  id: string;
  name: string;
  type: DiagramType;
  scope: ScopeConfig;
  filters: FilterConfig;
  notation: NotationType;
  layout: LayoutOptions;
}

export interface ScopeConfig {
  rootPath?: string;
  rootSymbol?: string;
  depth?: number;
  direction?: 'upstream' | 'downstream' | 'both';
}

export interface FilterConfig {
  pathPatterns?: string[];
  excludePatterns?: string[];
  nodeTypes?: string[];
  tags?: string[];
  connectedTo?: string;
  maxDepth?: number;
  minConfidence?: number;
}

// ============================================================================
// Layout (Multi-Diagram View)
// ============================================================================

export type LayoutMode =
  | 'tabs'
  | 'split-h'
  | 'split-v'
  | 'grid-2x2'
  | 'focus+context';

export interface LayoutConfig {
  mode: LayoutMode;
  panes: PaneConfig[];
  linkedSelection: boolean;
  linkedNavigation: boolean;
  scopeLinking: ScopeLinkingConfig;
}

export interface PaneConfig {
  id: string;
  diagramId: string;
  position: 'left' | 'right' | 'top' | 'bottom' | number;
  size?: number; // percentage
}

export interface ScopeLinkingConfig {
  enabled: boolean;
  mode: 'manual' | 'follow-selection';
  primaryPane: string;
  linkedPanes: string[];
}

// ============================================================================
// Diagram Presets
// ============================================================================

export type DiagramPreset =
  | 'overview-and-detail'
  | 'code-and-flow'
  | 'dependencies-both-ways'
  | 'before-and-after'
  | 'call-trace'
  | 'custom';

export interface DiagramPresetConfig {
  id: DiagramPreset;
  name: string;
  description: string;
  layout: LayoutMode;
  diagrams: PresetDiagramConfig[];
  scopeLinking: ScopeLinkingConfig;
}

export interface PresetDiagramConfig {
  panePosition: PaneConfig['position'];
  diagramType: DiagramType;
  scopeRelation: 'independent' | 'selected-node' | 'parent' | 'children';
}

// ============================================================================
// Named Layouts
// ============================================================================

export interface NamedLayout {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  modifiedAt: string;
  config: LayoutConfig;
  diagrams: SavedDiagramState[];
}

export interface SavedDiagramState {
  paneId: string;
  diagramType: DiagramType;
  scope: ScopeConfig;
  filters: FilterConfig;
  viewState?: {
    zoom: number;
    pan: { x: number; y: number };
  };
}

// ============================================================================
// Annotations
// ============================================================================

export interface AnnotationStore {
  version: string;
  nodes: Record<SymbolId, NodeAnnotation>;
  edges: Record<EdgeKey, EdgeAnnotation>;
  groups: GroupAnnotation[];
  tags: TagDefinition[];
  orphaned: OrphanedAnnotation[];
}

export interface NodeAnnotation {
  symbolId: SymbolId;
  note?: string;
  color?: string;
  tags?: string[];
  positionOverride?: Position;
  hidden?: boolean;
  lastVerified?: string;
}

export interface EdgeAnnotation {
  sourceSymbolId: SymbolId;
  targetSymbolId: SymbolId;
  note?: string;
  color?: string;
  style?: 'solid' | 'dashed' | 'dotted';
}

export interface GroupAnnotation {
  id: string;
  label: string;
  symbolIds: SymbolId[];
  color?: string;
  note?: string;
}

export interface TagDefinition {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface OrphanedAnnotation {
  originalSymbolId: SymbolId;
  annotation: NodeAnnotation;
  orphanedAt: string;
  lastKnownName?: string;
  lastKnownPath?: string;
}

// ============================================================================
// Navigation
// ============================================================================

export interface NavigationRequest {
  type: 'open-file' | 'reveal-symbol' | 'show-references';
  target: {
    file: string;
    line?: number;
    column?: number;
    symbol?: string;
  };
}

export interface NavigationProvider {
  navigate(request: NavigationRequest): Promise<void>;
  canNavigate(request: NavigationRequest): boolean;
}

// ============================================================================
// Inspector
// ============================================================================

export interface InspectorNodeData {
  symbolId: SymbolId;
  name: string;
  type: string;
  file: string;
  startLine?: number;
  endLine?: number;
  signature?: string;
  docstring?: string;
  annotation?: NodeAnnotation;
}
