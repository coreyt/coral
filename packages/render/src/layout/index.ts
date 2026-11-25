export {
  LayoutExecutionError,
  computeElkLayout,
  getElkLayoutEngine,
  normalizeLayoutOptions,
} from './engine.js';
export { userSymbolOutsideLabels029 } from './userSymbolOutsideLabels029.js';
export {
  authoredLabelLayerSpacing028,
  attachmentFromBoundaryPoint,
  classGeneralizationRankEdges028,
  codeBranchRoutingDefaults028,
  constrainFreePortAttachment,
  SpatialLayoutError,
  canPublishResolvedLayout,
  resolveSpatialLayout,
  resolveRouteContacts,
  validateRouteGeometryAtNodes,
} from './spatial.js';
export type {
  HierarchyHandling,
  LayoutAlgorithm,
  LayoutDefaults,
  LayoutDiagnostic,
  LayoutDiagnosticCode,
  LayoutDirection,
  LayoutEdge,
  LayoutEngine,
  LayoutExecution,
  LayoutNode,
  OutsideLabel029,
  LayoutOptionInput,
  LayoutPort,
  LayoutRequest,
  LayoutResult,
  LayoutRouting,
  LayoutSection,
  LayoutSpacingInput,
  NormalizedLayoutOptions,
  Point,
  ResolvedEdgeRoute,
  ResolvedLayout,
  ResolvedLayoutDiagnostic,
  ResolvedNodeRect,
  SpatialLayoutDiagnostic,
  SpatialLayoutDiagnosticCode,
  SpatialLayoutOperation,
  SpatialLayoutRequest,
} from './types.js';

export type { RouteContacts } from './spatial.js';

export { validateRouteSections, segmentIntersectsBox, RouteGeometryError } from './routeGeometry.js';
export type { RouteObstacle, RouteGeometryRequirements, RouteGeometryIssue, FixedGeometryRouteRequest } from './routeGeometry.js';

export { routeFixedGeometry } from './routeFixedGeometry.js';
