/**
 * Coral Layout Module
 *
 * Provides automatic layout computation using ELK (Eclipse Layout Kernel).
 */

export {
  layoutGraph,
  layoutFlowNodes,
  layoutFlowNodesWithEdges,
  extractEdgeSections,
  getElk,
  type LayoutFlowOptions,
  type LayoutFlowResult,
  type ElkEdgeRouting,
} from './elk.js';
export {
  useLayoutHistory,
  type PositionSnapshot,
  type UndoRedoResult,
  type UseLayoutHistoryOptions,
  type UseLayoutHistoryResult,
} from './useLayoutHistory.js';
export {
  diffGraphs,
  resolvePositions,
  incrementalLayout,
} from './positionStability.js';
export {
  useDiagramState,
  type ParsedGraph,
  type DiagramNode,
  type DiagramEdge,
  type UseDiagramStateOptions,
  type UseDiagramStateResult,
} from './useDiagramState.js';
export {
  measureText,
  computeNodeSize,
  computeUniformSizes,
  applyAdaptiveSizing,
} from './nodeSizing.js';
export {
  useAxisConstrain,
  type UseAxisConstrainResult,
} from './useAxisConstrain.js';
