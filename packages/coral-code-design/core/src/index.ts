/**
 * @coral-code-design/core
 *
 * Core React components for coral-code-design - software architecture visualization.
 * Designed to be embedded in standalone app or VS Code webview.
 */

// Components
export {
  WorkspaceLayout,
  DiagramView,
  Navigator,
  Inspector,
  SearchPalette,
  ArmadaConnectionDialog,
  DiagramRenderer,
  CodePreview,
  type WorkspaceLayoutProps,
  type DiagramViewProps,
  type NavigatorProps,
  type FileTreeNode,
  type SymbolOutlineNode,
  type InspectorProps,
  type SearchPaletteProps,
  type SearchResult,
  type ArmadaConnectionDialogProps,
  type DiagramRendererProps,
  type CodePreviewProps,
} from './components';

// Hooks
export {
  useDiagramData,
  type UseDiagramDataOptions,
  type UseDiagramDataResult,
} from './hooks';

// Providers
export {
  WorkspaceProvider,
  useWorkspace,
  ArmadaProvider,
  useArmada,
  NavigationProvider,
  useNavigation,
  type WorkspaceProviderProps,
  type WorkspaceContextValue,
  type FileSystemAdapter,
  type ArmadaProviderProps,
  type ArmadaContextValue,
  type ArmadaStats,
  type NavigationProviderProps,
  type NavigationContextValue,
  type PreviewState,
} from './providers';

// State
export {
  useWorkspaceStore,
  type WorkspaceState,
} from './state';

// Types
export type {
  // Core types
  SymbolId,
  EdgeKey,
  Workspace,
  WorkspaceSettings,
  ArmadaConnectionConfig,
  GraphMode,
  NotationType,
  // Diagrams
  DiagramType,
  DiagramReference,
  DiagramConfig,
  ScopeConfig,
  FilterConfig,
  // Layout
  LayoutMode,
  LayoutConfig,
  PaneConfig,
  ScopeLinkingConfig,
  // Presets
  DiagramPreset,
  DiagramPresetConfig,
  PresetDiagramConfig,
  // Named layouts
  NamedLayout,
  SavedDiagramState,
  // Annotations
  AnnotationStore,
  NodeAnnotation,
  EdgeAnnotation,
  GroupAnnotation,
  TagDefinition,
  OrphanedAnnotation,
  // Navigation
  NavigationRequest,
  NavigationProvider as INavigationProvider,
  // Inspector
  InspectorNodeData,
} from './types';
