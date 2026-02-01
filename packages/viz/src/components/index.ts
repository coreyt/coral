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

// Edit context for inline label editing
export {
  EditProvider,
  useEditContext,
  useIsEditing,
  type EditProviderProps,
  type OnLabelEditCallback,
} from './EditContext.js';
