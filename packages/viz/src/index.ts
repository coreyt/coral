/**
 * @coral-viz/viz - Coral Visual Diagram Editor
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
  type EditorTheme,
  type EditorSourcePosition,
  type EditorSourceRange,
  type EditorDiagnostic,
  type EditorDecoration,
  type EditorAnalysisOwner,
  type SplitLayout,
  type PrimaryPane,
  type SyncState,
  type SyncActions,
  type SyncOptions,
  type ParseFunction,
  type PrintFunction,
  type SyncParseResult,
  type SyncParseError,
  // Deprecated aliases, kept for the 0.2.x line.
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
  SpatialSceneSvg028,
  SpatialScenePart028,
  SpatialSceneMarkerDefs028,
  SpatialSceneArtworkDefs029,
  UserSymbolArtwork029,
  type UserSymbolArtwork029Props,
  type SpatialSceneSvg028Props,
  type ShapeRendererProps,
  type SymbolNodeData,
  SequenceDiagram,
  type SequenceDiagramProps,
  type SequenceSelection,
  type SequenceSelectionKind,
  DiagramFontFaces,
  type DiagramFontFacesProps,
  // Edit context for inline label editing
  EditProvider,
  useEditContext,
  useIsEditing,
  type EditProviderProps,
  type OnLabelEditCallback,
} from './components/index.js';

// Layout
export {
  layoutGraph,
  layoutFlowNodes,
  layoutFlowNodesWithEdges,
  extractEdgeSections,
  getElk,
  type LayoutFlowResult,
  type ElkEdgeRouting,
} from './layout/index.js';
export {
  useLayoutHistory,
  type PositionSnapshot,
  type UndoRedoResult,
  type UseLayoutHistoryOptions,
  type UseLayoutHistoryResult,
} from './layout/index.js';

// Axis Constraint (Shift+drag)
export {
  useAxisConstrain,
  type UseAxisConstrainResult,
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
} from '@coral-viz/render';

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
  aimlSymbols,
  dataEngineeringSymbols,
  sketchSymbols,
  umlSymbols,
} from '@coral-viz/render';

export {
  notationRegistry,
  getNotation,
  getAllNotations,
  flowchartNotation,
  bpmnNotation,
  erdNotation,
  codeNotation,
  architectureNotation,
  aimlNotation,
  dataEngineeringNotation,
  sketchNotation,
  umlClassNotation,
} from '@coral-viz/render';

// File Format (CORAL-REQ-008)
export {
  CURRENT_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  createDocument,
  serialize,
  deserialize,
  validateDocument,
  migrateDocument,
  migrateDocumentWithDiagnostics,
  type DocumentMigrationResult,
  type DocumentMigrationOptions,
  materializeReferencedPorts,
  stripResolvedPorts,
  type GraphPort,
  type PortResolver,
  type PortMaterializationResult,
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
  type FontSettings,
  type DiagramFontSettings,
  type FontFamilyPreset,
  type FontSizePreset,
  DEFAULT_FONT_SETTINGS,
  DEFAULT_DIAGRAM_FONT_SETTINGS,
  FONT_FAMILY_PRESETS,
  FONT_SIZE_PRESETS,
  getFontFamilyPreset,
  getFontSizePreset,
  normalizeDiagramFontSettings,
  // Settings types (CORAL-REQ-009)
  type EdgeRouting,
  type LayoutAlgorithm,
  type LayoutPresetId,
  type LayoutPreset,
  type UserPreferences,
  type LLMProviderPreference,
  type SpeechRecognitionMode,
  type SettingsPanelState,
  DEFAULT_USER_PREFERENCES,
  normalizeLlmMaxRetries,
  DEFAULT_LAYOUT_SETTINGS,
  LAYOUT_PRESETS,
  getLayoutPreset,
  resolveNotationLayout,
  type LayoutProfileOverrides,
  type LayoutProfileDiagnostic,
  type ResolvedLayoutProfile,
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
  type SettingsPanelTheme,
  FontSettingsForm,
  type FontSettingsFormProps,
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
  buildRoutedPath,
  EndpointMarkerDefinitions,
  type EndpointMarkerDefinitionsProps,
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

// Waypoints (CORAL-REQ-015)
export {
  createWaypoint,
  addWaypointToEdge,
  removeWaypointFromEdge,
  moveWaypoint,
  insertWaypointAtPosition,
  routeWithWaypoints,
  useWaypointManager,
  type EdgeWaypoint,
  type RoutedPath,
  type UseWaypointManagerOptions,
  type UseWaypointManagerResult,
} from './waypoints/index.js';

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
  FontAwareCoralNodeData,
  FontAwareCoralEdgeData,
  CoralNodeViewMetadata,
  CoralEdgeViewMetadata,
  DimensionSource,
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

export {
  CORAL_NODE_VIEW_METADATA,
  CORAL_EDGE_VIEW_METADATA,
} from './types.js';
