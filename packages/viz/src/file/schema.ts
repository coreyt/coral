/**
 * Coral Document Schema (CORAL-REQ-008)
 *
 * Defines the TypeScript types for the Coral file format.
 * File extension: .coral.json
 */

import type { GraphIR, SizingMode } from '../types.js';

/**
 * Current schema version. Increment when making breaking changes.
 */
export const CURRENT_SCHEMA_VERSION = '1.0.0';

/**
 * Supported schema versions for migration
 */
export const SUPPORTED_SCHEMA_VERSIONS = ['0.9.0', '1.0.0'] as const;

/**
 * Document metadata
 */
export interface DocumentMetadata {
  /** Document name (required) */
  name: string;
  /** Optional description */
  description?: string;
  /** Optional tags for organization */
  tags?: string[];
  /** User-defined document version */
  version?: string;
  /** ISO 8601 timestamp of creation */
  created: string;
  /** ISO 8601 timestamp of last modification */
  modified: string;
}

/**
 * Layout direction options
 */
export type LayoutDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

/**
 * Layout spacing options
 */
export interface LayoutSpacing {
  /** Spacing between nodes */
  nodeNode?: number;
  /** Spacing between edges and nodes */
  edgeNode?: number;
  /** Spacing between layers (for layered algorithm) */
  layerSpacing?: number;
}

/**
 * Layout configuration
 */
export interface LayoutSettings {
  /** Layout algorithm (e.g., 'layered', 'stress', 'force') */
  algorithm: string;
  /** Layout direction */
  direction: LayoutDirection;
  /** Spacing options */
  spacing?: LayoutSpacing;
  /** Additional ELK options as key-value pairs */
  elkOptions?: Record<string, string | number | boolean>;
  /** Node sizing mode (CORAL-REQ-011) */
  sizingMode?: SizingMode;
}

/**
 * Document settings (saved with file)
 */
export interface DocumentSettings {
  /** Notation type (e.g., 'flowchart', 'bpmn', 'erd') */
  notation: string;
  /** Layout configuration */
  layout: LayoutSettings;
}

/**
 * View state for restoring exact view
 */
export interface ViewState {
  /** Zoom level */
  zoom: number;
  /** Pan offset */
  pan: { x: number; y: number };
  /** Currently selected node IDs */
  selectedNodes?: string[];
  /** If true, fit view on load instead of using zoom/pan */
  fitView?: boolean;
}

/**
 * Node position
 */
export interface NodePosition {
  x: number;
  y: number;
}

/**
 * DSL content type
 */
export type DslType = 'coral' | 'mermaid' | 'dot';

/**
 * Document content - either DSL text or Graph-IR
 */
export interface DocumentContent {
  /** Content format */
  format: 'dsl' | 'graph-ir';
  /** DSL type if format is 'dsl' */
  dslType?: DslType;
  /** DSL text if format is 'dsl' */
  text?: string;
  /** Graph-IR if format is 'graph-ir' */
  graphIR?: GraphIR;
}

/**
 * Coral Document - the complete file format
 */
export interface CoralDocument {
  /** Schema version for migrations */
  schemaVersion: string;
  /** Document metadata */
  metadata: DocumentMetadata;
  /** Document content */
  content: DocumentContent;
  /** Document settings */
  settings: DocumentSettings;
  /** Optional view state for restoring exact view */
  viewState?: ViewState;
  /** Node positions (for preserving manual layout) */
  nodePositions?: Record<string, NodePosition>;
}

/**
 * Options for creating a new document
 */
export interface CreateDocumentOptions {
  /** Document name (required) */
  name: string;
  /** Optional description */
  description?: string;
  /** Optional tags */
  tags?: string[];
  /** Optional version */
  version?: string;
  /** Content configuration */
  content?: Partial<DocumentContent>;
  /** Settings configuration */
  settings?: Partial<DocumentSettings>;
  /** View state */
  viewState?: ViewState;
  /** Node positions */
  nodePositions?: Record<string, NodePosition>;
}

/**
 * Options for serializing nodes/edges
 */
export interface SerializeOptions {
  /** Document name (required) */
  name: string;
  /** Optional description */
  description?: string;
  /** Optional tags */
  tags?: string[];
  /** Optional version */
  version?: string;
  /** Settings configuration */
  settings?: Partial<DocumentSettings>;
  /** View state */
  viewState?: ViewState;
  /** Existing created timestamp (for updates) */
  created?: string;
}

/**
 * Result of deserializing a document
 */
export interface DeserializeResult {
  /** React Flow nodes */
  nodes: import('../types.js').CoralNode[];
  /** React Flow edges */
  edges: import('../types.js').CoralEdge[];
  /** Document settings */
  settings: DocumentSettings;
  /** View state (if present) */
  viewState?: ViewState;
  /** Document metadata */
  metadata: DocumentMetadata;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the document is valid */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
}

// ============================================================================
// Settings Types (CORAL-REQ-009)
// ============================================================================

/**
 * ELK edge routing options
 */
export type EdgeRouting = 'ORTHOGONAL' | 'POLYLINE' | 'SPLINES';

/**
 * ELK layout algorithm options
 */
export type LayoutAlgorithm = 'layered' | 'mrtree' | 'stress' | 'force' | 'radial' | 'box';

/**
 * Layout preset identifier
 */
export type LayoutPresetId = 'flowchart' | 'org-chart' | 'network' | 'radial' | 'custom';

/**
 * Layout preset definition
 */
export interface LayoutPreset {
  /** Unique identifier */
  id: LayoutPresetId;
  /** Display name */
  name: string;
  /** Description of when to use this preset */
  description: string;
  /** Preset settings */
  settings: LayoutSettings;
}

/**
 * User preferences stored in localStorage
 * These are NOT saved with the document
 */
export interface UserPreferences {
  /** Default notation for new diagrams */
  defaultNotation: string;
  /** Default layout preset for new diagrams */
  defaultLayoutPreset: LayoutPresetId;
  /** Theme (future use) */
  theme: 'light' | 'dark' | 'system';
  /** Show minimap by default */
  showMinimap: boolean;
  /** Show controls by default */
  showControls: boolean;
  /** Fit view on load */
  fitViewOnLoad: boolean;
  /** Auto-save interval in ms (0 = disabled) */
  autoSaveInterval: number;
  /** Remember last opened files */
  recentFiles: string[];
  /** Maximum recent files to remember */
  maxRecentFiles: number;
}

/**
 * Default user preferences
 */
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  defaultNotation: 'flowchart',
  defaultLayoutPreset: 'flowchart',
  theme: 'system',
  showMinimap: true,
  showControls: true,
  fitViewOnLoad: true,
  autoSaveInterval: 0,
  recentFiles: [],
  maxRecentFiles: 10,
};

/**
 * Default layout settings
 */
export const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
  algorithm: 'layered',
  direction: 'DOWN',
  spacing: {
    nodeNode: 50,
    edgeNode: 20,
    layerSpacing: 70,
  },
  elkOptions: {
    'elk.edgeRouting': 'ORTHOGONAL',
  },
  sizingMode: 'adaptive',
};

/**
 * Layout presets
 */
export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: 'flowchart',
    name: 'Flowchart',
    description: 'Top-to-bottom layered layout, ideal for process flows',
    settings: {
      algorithm: 'layered',
      direction: 'DOWN',
      spacing: { nodeNode: 50, layerSpacing: 70 },
      elkOptions: { 'elk.edgeRouting': 'ORTHOGONAL' },
      sizingMode: 'adaptive',
    },
  },
  {
    id: 'org-chart',
    name: 'Org Chart',
    description: 'Tree layout for hierarchical structures',
    settings: {
      algorithm: 'mrtree',
      direction: 'DOWN',
      spacing: { nodeNode: 40, layerSpacing: 80 },
      elkOptions: {
        'elk.edgeRouting': 'POLYLINE',
        'elk.mrtree.weighting': 'CONSTRAINT',
      },
      sizingMode: 'uniform',
    },
  },
  {
    id: 'network',
    name: 'Network',
    description: 'Force-directed layout for even distribution',
    settings: {
      algorithm: 'stress',
      direction: 'DOWN',
      spacing: { nodeNode: 80 },
      elkOptions: {
        'elk.stress.desiredEdgeLength': '100',
      },
      sizingMode: 'adaptive',
    },
  },
  {
    id: 'radial',
    name: 'Radial',
    description: 'Circular layout radiating from a center point',
    settings: {
      algorithm: 'radial',
      direction: 'DOWN',
      spacing: { nodeNode: 60, layerSpacing: 100 },
      elkOptions: {},
      sizingMode: 'adaptive',
    },
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Manual configuration of layout options',
    settings: DEFAULT_LAYOUT_SETTINGS,
  },
];

/**
 * Get a layout preset by ID
 */
export function getLayoutPreset(id: LayoutPresetId): LayoutPreset | undefined {
  return LAYOUT_PRESETS.find((p) => p.id === id);
}

/**
 * Combined settings for the settings panel
 */
export interface SettingsPanelState {
  /** Document-level settings (saved with file) */
  document: DocumentSettings;
  /** User preferences (saved to localStorage) */
  user: UserPreferences;
  /** Currently selected preset (for UI display) */
  selectedPreset: LayoutPresetId;
}
