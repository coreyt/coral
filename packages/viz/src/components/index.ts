/**
 * Coral Node Components
 */

export {
  ServiceNode,
  DatabaseNode,
  ExternalApiNode,
  ActorNode,
  ModuleNode,
  GroupNode,
  nodeTypes,
} from './nodes.js';

// New symbol-aware components
export { ShapeRenderer, type ShapeRendererProps } from './ShapeRenderer.js';
export { SymbolNode, type SymbolNodeData } from './SymbolNode.js';
export { UserSymbolArtwork029, type UserSymbolArtwork029Props } from './UserSymbolArtwork029.js';
export { SpatialSceneSvg028, SpatialScenePart028, SpatialSceneMarkerDefs028, SpatialSceneArtworkDefs029,
  type SpatialSceneSvg028Props } from './SpatialSceneSvg028.js';
export {
  SequenceDiagram,
  type SequenceDiagramProps,
  type SequenceSelection,
  type SequenceSelectionKind,
} from './SequenceDiagram.js';
export {
  DiagramFontFaces,
  type DiagramFontFacesProps,
} from './DiagramFontFaces.js';

// Edit context for inline label editing
export {
  EditProvider,
  useEditContext,
  useIsEditing,
  type EditProviderProps,
  type OnLabelEditCallback,
} from './EditContext.js';
