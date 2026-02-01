/**
 * Compatibility Module (CORAL-REQ-010)
 *
 * Provides connection validation and port compatibility checking.
 */

export {
  validateConnection,
  checkPortDirection,
  checkMaxConnections,
  getEdgeCompatibility,
} from './validateConnection.js';

export {
  useEdgeCompatibility,
  type UseEdgeCompatibilityOptions,
  type UseEdgeCompatibilityOptionsNodes,
  type UseEdgeCompatibilityOptionsContext,
  type UseEdgeCompatibilityResult,
} from './useEdgeCompatibility.js';

export {
  IncompatibilityTooltip,
  type IncompatibilityTooltipProps,
} from './IncompatibilityTooltip.js';

export {
  CompatibilityEdge,
  getEdgeStyleForStatus,
  type CompatibilityEdgeProps,
  type CompatibilityEdgeData,
} from './CompatibilityEdge.js';
