/**
 * @coral/viz - Coral Visual Diagram Editor
 */

// Main Editor
export { CoralEditor, useGraphIR, type CoralEditorProps } from './editor/index.js';

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
} from './components/index.js';

// Layout
export { layoutGraph, layoutFlowNodes, getElk } from './layout/index.js';

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
} from './types.js';
