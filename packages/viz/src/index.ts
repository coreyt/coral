/**
 * @coral/viz - Coral Visual Diagram Editor
 */

// Main Editor
export { CoralEditor, useGraphIR, type CoralEditorProps } from './editor/index.js';
export { LayoutControls, type LayoutControlsProps } from './editor/index.js';
export { FileControls, type FileControlsProps } from './editor/index.js';

// Text Editor
export {
  TextEditor,
  SplitEditor,
  useBidirectionalSync,
  type TextEditorProps,
  type SplitEditorProps,
  type SyntaxLanguage,
  type SplitLayout,
  type PrimaryPane,
  type SyncState,
  type SyncActions,
  type SyncOptions,
  type ParseFunction,
  type PrintFunction,
  type ParseResult,
  type ParseError,
  type ChangeSource,
} from './text-editor/index.js';

// Converters
export {
  convertGraphToFlow,
  convertNode,
  convertEdge,
  flattenNodes,
  convertFlowToGraphNodes,
  convertFlowToGraphEdges,
} from './editor/index.js';

// Components
export {
  ServiceNode,
  DatabaseNode,
  ExternalApiNode,
  ActorNode,
  ModuleNode,
  GroupNode,
  nodeTypes,
  // New symbol-aware components
  ShapeRenderer,
  SymbolNode,
  type ShapeRendererProps,
  type SymbolNodeData,
  // Edit context for inline label editing
  EditProvider,
  useEditContext,
  useIsEditing,
  type EditProviderProps,
  type OnLabelEditCallback,
} from './components/index.js';

// Layout
export { layoutGraph, layoutFlowNodes, getElk } from './layout/index.js';
export {
  useLayoutHistory,
  type PositionSnapshot,
  type UseLayoutHistoryOptions,
  type UseLayoutHistoryResult,
} from './layout/index.js';

// Position Stability (CORAL-REQ-013)
export {
  diffGraphs,
  resolvePositions,
  incrementalLayout,
} from './layout/index.js';
export {
  useDiagramState,
  type ParsedGraph,
  type DiagramNode,
  type DiagramEdge,
  type UseDiagramStateOptions,
  type UseDiagramStateResult,
} from './layout/index.js';

// Shapes, Symbols, Notations (Three-Layer Architecture)
export {
  shapeRegistry,
  getShape,
  getAllShapes,
} from './shapes/index.js';

export {
  symbolRegistry,
  getSymbol,
  getSymbolsByTag,
  getSymbolsForNotation,
  getAllSymbols,
  getAllLibraries,
  flowchartSymbols,
  bpmnSymbols,
  erdSymbols,
  codeSymbols,
  architectureSymbols,
} from './symbols/index.js';

export {
  notationRegistry,
  getNotation,
  getAllNotations,
  validateDiagram,
  flowchartNotation,
  bpmnNotation,
  erdNotation,
  codeNotation,
  architectureNotation,
} from './notations/index.js';

// File Format (CORAL-REQ-008)
export {
  CURRENT_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  createDocument,
  serialize,
  deserialize,
  validateDocument,
  migrateDocument,
  needsMigration,
  getMigrationSteps,
  type CoralDocument,
  type DocumentMetadata,
  type DocumentContent,
  type DocumentSettings,
  type LayoutDirection,
  type LayoutSettings,
  type LayoutSpacing,
  type ViewState,
  type NodePosition,
  type DslType,
  type CreateDocumentOptions,
  type SerializeOptions,
  type DeserializeResult,
  type ValidationResult as FileValidationResult,
  // Settings types (CORAL-REQ-009)
  type EdgeRouting,
  type LayoutAlgorithm,
  type LayoutPresetId,
  type LayoutPreset,
  type UserPreferences,
  type SettingsPanelState,
  DEFAULT_USER_PREFERENCES,
  DEFAULT_LAYOUT_SETTINGS,
  LAYOUT_PRESETS,
  getLayoutPreset,
} from './file/index.js';

// Settings (CORAL-REQ-009)
export {
  useSettings,
  type UseSettingsOptions,
  type UseSettingsResult,
  LayoutSettingsForm,
  type LayoutSettingsFormProps,
  SettingsPanel,
  type SettingsPanelProps,
  type SettingsTab,
} from './settings/index.js';

// Compatibility (CORAL-REQ-010)
export {
  validateConnection,
  checkPortDirection,
  checkMaxConnections,
  getEdgeCompatibility,
  useEdgeCompatibility,
  IncompatibilityTooltip,
  CompatibilityEdge,
  getEdgeStyleForStatus,
  type UseEdgeCompatibilityOptions,
  type UseEdgeCompatibilityResult,
  type IncompatibilityTooltipProps,
  type CompatibilityEdgeProps,
  type CompatibilityEdgeData,
} from './compatibility/index.js';

// Properties Panel
export {
  NodePropertiesPanel,
  type NodePropertiesPanelProps,
  type PropertyChange,
  // Utilities
  detectPropertyType,
  isEditableProperty,
  parsePropertyValue,
  extractPropertyFields,
  type PropertyType,
  type PropertyValue,
  type PropertyFieldMeta,
} from './properties/index.js';

// Types
export type {
  GraphIR,
  GraphNode,
  GraphEdge,
  Position,
  Dimensions,
  EdgeStyle,
  LayoutOptions,
  CoralNode,
  CoralEdge,
  CoralNodeData,
  CoralEdgeData,
  CoralNodeProps,
  EditorState,
  EditorCallbacks,
  EditorConfig,
  // Shape/Symbol/Notation types
  PortAnchor,
  ShapeParameter,
  ShapeDefinition,
  SymbolPort,
  SymbolVariant,
  SymbolDefinition,
  SymbolLibrary,
  NotationEdgeStyle,
  ConnectionConstraints,
  ConnectionRule,
  ValidationRule,
  FlowPoint,
  NotationValidation,
  NotationDefinition,
  ShapeRegistry,
  SymbolRegistry,
  NotationRegistry,
  ValidationResult,
  // Position Stability types (CORAL-REQ-013)
  PositionSource,
  PositionedNode,
  GraphDiff,
  PositionResolution,
  DiffableNode,
  DiffableGraph,
  // Port Compatibility types (CORAL-REQ-010)
  IncompatibilityReason,
  ConnectionValidation,
  ConnectionInfo,
  NodeConnectionInfo,
  EdgeCompatibilityStatus,
  EdgeCompatibility,
  HandleDragState,
  ConnectionValidationContext,
} from './types.js';
