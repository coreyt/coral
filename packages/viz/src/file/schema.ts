/**
 * Coral Document Schema (CORAL-REQ-008)
 *
 * Defines the TypeScript types for the Coral file format.
 * File extension: .coral.json
 */

import type { GraphIR, SizingMode } from '../types.js';
import type { NotificationLevel, RenderStyle028, RenderStyleInput0214 } from '@coral-viz/render';

/**
 * Current schema version. Increment when making breaking changes.
 */
export const CURRENT_SCHEMA_VERSION = '1.0.0';

/**
 * Supported schema versions for migration
 */
export const SUPPORTED_SCHEMA_VERSIONS = ['0.9.0', '1.0.0', '1.0'] as const;

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

export interface LayoutProfileOverrides {
  algorithm?: string;
  direction?: LayoutDirection;
  spacing?: LayoutSpacing;
  edgeRouting?: EdgeRouting;
  elkOptions?: Record<string, string | number | boolean>;
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
  /** Opt in to the active notation's conservative layout profile. */
  profile?: 'notation';
  /** Sparse changes layered over the active notation profile. */
  profileOverrides?: LayoutProfileOverrides;
}

/**
 * Document settings (saved with file)
 */
export interface DocumentSettings {
  /** Notation type (e.g., 'flowchart', 'bpmn', 'erd') */
  notation: string;
  /** Production renderer style; absent documents open in lowfi. */
  renderStyle028?: RenderStyle028;
  /** 0.2.14 peer renderer style (`lowfi`, `hifi`, `anemone`, or shorthand `ane`). */
  renderStyle0214?: RenderStyleInput0214;
  /** Layout configuration */
  layout: LayoutSettings;
  /** Font settings (CORAL-REQ-012) */
  font?: DiagramFontSettings;
  /** Suppress error annotations on edges (issues still appear in diagnostics log) */
  suppressErrorAnnotations?: boolean;
  /** Suppress warning annotations on edges (issues still appear in diagnostics log) */
  suppressWarningAnnotations?: boolean;
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
export type DslType = 'coral' | 'mermaid' | 'dot' | 'plantuml';

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
 * Saved waypoint data for manual edge routing (CORAL-REQ-015)
 */
export interface SavedWaypoint {
  id: string;
  x: number;
  y: number;
  type: string;
}

/**
 * Saved edge routing data (ELK-compatible bend points)
 */
export interface EdgeRoutingData {
  /** Bend point coordinates */
  bendPoints: NodePosition[];
  /** Whether this routing was user-pinned (vs computed) */
  isPinned: boolean;
  /** User-placed waypoints (CORAL-REQ-015) — present when isPinned is true */
  waypoints?: SavedWaypoint[];
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
  /** Edge routing data (bend points, keyed by edge ID) */
  edgeRouting?: Record<string, EdgeRoutingData>;
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
  /** Existing GraphIR envelope whose graph-level fields must survive a save. */
  graphIR?: GraphIR;
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
  /** Restored edge waypoints (CORAL-REQ-015) — Map<edgeId, waypoints> */
  edgeWaypoints?: Map<string, Array<{ id: string; x: number; y: number; type: string }>>;
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
// Font Settings Types (CORAL-REQ-012)
// ============================================================================

/**
 * Font settings for diagram text
 */
export interface FontSettings {
  /** Font family (CSS font-family value) */
  family: string;
  /** Font size in pixels */
  size: number;
  /** Font weight */
  weight: 'normal' | 'bold' | number;
  /** Line height multiplier */
  lineHeight: number;
}

/**
 * Diagram font settings with optional symbol overrides
 */
export interface DiagramFontSettings {
  /** Default font settings for all text */
  default: FontSettings;
  /** Override font settings for specific symbol types */
  symbolOverrides?: Record<string, Partial<FontSettings>>;
}

/**
 * Font family preset
 */
export interface FontFamilyPreset {
  id: string;
  name: string;
  family: string;
}

/**
 * Font size preset
 */
export interface FontSizePreset {
  id: string;
  name: string;
  size: number;
}

/**
 * Default font settings
 */
export const DEFAULT_FONT_SETTINGS: FontSettings = {
  family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  size: 14,
  weight: 'normal',
  lineHeight: 1.3,
};

/**
 * Default requested font settings for a new diagram.
 *
 * This intentionally differs from the renderer's compatibility default.
 */
export const DEFAULT_DIAGRAM_FONT_SETTINGS: DiagramFontSettings = {
  default: DEFAULT_FONT_SETTINGS,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFamily(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFontWeight(value: unknown): value is FontSettings['weight'] {
  return value === 'normal'
    || value === 'bold'
    || (typeof value === 'number' && Number.isFinite(value));
}

function normalizePartialFontSettings(value: unknown): Partial<FontSettings> {
  if (!isRecord(value)) return {};

  const normalized: Partial<FontSettings> = {};
  if (isFamily(value.family)) normalized.family = value.family;
  if (isPositiveFiniteNumber(value.size)) normalized.size = value.size;
  if (isFontWeight(value.weight)) normalized.weight = value.weight;
  if (isPositiveFiniteNumber(value.lineHeight)) normalized.lineHeight = value.lineHeight;
  return normalized;
}

/**
 * Build a safe, complete requested-font view without mutating or
 * canonicalizing the stored document value.
 */
export function normalizeDiagramFontSettings(value: unknown): DiagramFontSettings {
  const input = isRecord(value) ? value : {};
  const normalizedDefault = normalizePartialFontSettings(input.default);
  const result: DiagramFontSettings = {
    default: {
      ...DEFAULT_FONT_SETTINGS,
      ...normalizedDefault,
    },
  };

  if (!isRecord(input.symbolOverrides)) return result;

  const symbolOverrides: Record<string, Partial<FontSettings>> = {};
  for (const [symbolId, override] of Object.entries(input.symbolOverrides)) {
    const normalized = normalizePartialFontSettings(override);
    if (Object.keys(normalized).length > 0) {
      symbolOverrides[symbolId] = normalized;
    }
  }

  if (Object.keys(symbolOverrides).length > 0) {
    result.symbolOverrides = symbolOverrides;
  }
  return result;
}

/**
 * Font family presets
 */
export const FONT_FAMILY_PRESETS: FontFamilyPreset[] = [
  {
    id: 'system',
    name: 'System',
    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  {
    id: 'sans',
    name: 'Sans Serif',
    family: '"Inter", "Helvetica Neue", Arial, sans-serif',
  },
  {
    id: 'serif',
    name: 'Serif',
    family: '"Georgia", "Times New Roman", serif',
  },
  {
    id: 'mono',
    name: 'Monospace',
    family: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
  },
  {
    id: 'handwritten',
    name: 'Handwritten',
    family: '"Comic Neue", "Comic Sans MS", cursive',
  },
];

/**
 * Font size presets
 */
export const FONT_SIZE_PRESETS: FontSizePreset[] = [
  { id: 'small', name: 'Small', size: 11 },
  { id: 'normal', name: 'Normal', size: 14 },
  { id: 'large', name: 'Large', size: 16 },
  { id: 'xlarge', name: 'Extra Large', size: 18 },
];

/**
 * Get a font family preset by ID
 */
export function getFontFamilyPreset(id: string): FontFamilyPreset | undefined {
  return FONT_FAMILY_PRESETS.find((p) => p.id === id);
}

/**
 * Get a font size preset by ID
 */
export function getFontSizePreset(id: string): FontSizePreset | undefined {
  return FONT_SIZE_PRESETS.find((p) => p.id === id);
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
 * LLM provider identifier for AI generation
 */
export type LLMProviderPreference = 'anthropic' | 'openai' | 'google' | 'mistral';

/**
 * Speech recognition mode for voice input (#49)
 * - 'local': On-device Whisper via Web Worker (default)
 * - 'browser': Native Web Speech API (Chrome/Edge, sends audio to cloud)
 * - 'off': Disabled
 */
export type SpeechRecognitionMode = 'local' | 'browser' | 'off';

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
  /** Highlight exact entity declarations and references in the DSL editor. */
  editorEntityHighlighting?: boolean;
  /** Ordinary conformance notice filter; never document meaning. */
  notificationLevel: NotificationLevel;
  /** Auto-save interval in ms (0 = disabled) */
  autoSaveInterval: number;
  /** Remember last opened files */
  recentFiles: string[];
  /** Maximum recent files to remember */
  maxRecentFiles: number;
  /** LLM provider for AI generation */
  llmProvider: LLMProviderPreference;
  /** LLM model for AI generation */
  llmModel: string;
  /** Whether to save API key to localStorage */
  llmSaveApiKey: boolean;
  /** Saved API key (only if llmSaveApiKey is true) */
  llmSavedApiKey: string;
  /** Editor generation retries, constrained to one through three. */
  llmMaxRetries?: number;
  /** Speech recognition mode for voice input (#49) */
  speechRecognitionMode: SpeechRecognitionMode;
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
  editorEntityHighlighting: false,
  notificationLevel: 'error',
  autoSaveInterval: 0,
  recentFiles: [],
  maxRecentFiles: 10,
  llmProvider: 'anthropic',
  llmModel: 'claude-sonnet-4-5-20250929',
  llmSaveApiKey: false,
  llmSavedApiKey: '',
  llmMaxRetries: 2,
  speechRecognitionMode: 'local',
};

export function normalizeLlmMaxRetries(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 2;
  return Math.min(3, Math.max(1, Math.floor(value)));
}

export function normalizeNotificationLevel(value: unknown): NotificationLevel {
  return value === 'warning' || value === 'info' || value === 'debug' ? value : 'error';
}

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
