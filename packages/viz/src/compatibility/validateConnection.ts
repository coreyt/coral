/**
 * Connection Validation Utilities (CORAL-REQ-010)
 *
 * Validates connections against notation rules and provides
 * compatibility information for visual feedback.
 */

import type {
  ConnectionInfo,
  ConnectionValidation,
  ConnectionValidationContext,
  EdgeCompatibility,
  EdgeCompatibilityStatus,
  NodeConnectionInfo,
} from '../types';
import { getNotation } from '../notations';
import { symbolRegistry } from '../symbols';
import type { ConnectionRule, NotationDefinition, SymbolPort } from '../types';

// ============================================================================
// Port Direction Validation
// ============================================================================

/**
 * Check if port directions are compatible
 *
 * @param sourceDirection - Direction of source port (in/out/inout)
 * @param targetDirection - Direction of target port (in/out/inout)
 */
export function checkPortDirection(
  sourceDirection: 'in' | 'out' | 'inout',
  targetDirection: 'in' | 'out' | 'inout'
): ConnectionValidation {
  // Source must be 'out' or 'inout'
  if (sourceDirection === 'in') {
    return {
      valid: false,
      hasWarning: false,
      reason: 'port-direction-mismatch',
      message: "Input port cannot be used as source; only 'out' or 'inout' ports can originate connections",
    };
  }

  // Target must be 'in' or 'inout'
  if (targetDirection === 'out') {
    return {
      valid: false,
      hasWarning: false,
      reason: 'port-direction-mismatch',
      message: "Output port cannot be used as target; only 'in' or 'inout' ports can receive connections",
    };
  }

  return { valid: true, hasWarning: false };
}

// ============================================================================
// Max Connections Validation
// ============================================================================

/**
 * Check if adding a connection would exceed max connections
 *
 * @param nodeId - Node ID to check
 * @param portId - Port ID (optional)
 * @param maxConnections - Maximum allowed connections (undefined = unlimited)
 * @param existingEdges - Current edges in the diagram
 * @param checkAs - Check as 'source' (outgoing) or 'target' (incoming)
 */
export function checkMaxConnections(
  nodeId: string,
  portId: string | undefined,
  maxConnections: number | undefined,
  existingEdges: Array<{ source: string; target: string; sourcePort?: string; targetPort?: string }>,
  checkAs: 'source' | 'target'
): ConnectionValidation {
  if (maxConnections === undefined) {
    return { valid: true, hasWarning: false };
  }

  // Count existing connections
  let count: number;
  if (checkAs === 'source') {
    count = existingEdges.filter((e) => {
      if (e.source !== nodeId) return false;
      if (portId && e.sourcePort && e.sourcePort !== portId) return false;
      return true;
    }).length;
  } else {
    count = existingEdges.filter((e) => {
      if (e.target !== nodeId) return false;
      if (portId && e.targetPort && e.targetPort !== portId) return false;
      return true;
    }).length;
  }

  if (count >= maxConnections) {
    const direction = checkAs === 'source' ? 'outgoing' : 'incoming';
    return {
      valid: false,
      hasWarning: false,
      reason: 'max-connections-exceeded',
      message: `Node has reached maximum ${direction} connections (${maxConnections})`,
    };
  }

  return { valid: true, hasWarning: false };
}

// ============================================================================
// Symbol Connection Rules
// ============================================================================

/**
 * Find ALL matching connection rules for source symbol/variant
 */
function findConnectionRules(
  notation: NotationDefinition,
  sourceSymbolId: string,
  sourceVariant?: string
): ConnectionRule[] {
  const rules: ConnectionRule[] = [];

  // First try to find rules with matching variant
  if (sourceVariant) {
    const variantRules = notation.connectionRules.filter(
      (rule) => rule.from === sourceSymbolId && rule.fromVariant === sourceVariant
    );
    if (variantRules.length > 0) {
      return variantRules; // Variant-specific rules take precedence
    }
  }

  // Fall back to rules without variant
  return notation.connectionRules.filter(
    (rule) => rule.from === sourceSymbolId && !rule.fromVariant
  );
}

/**
 * Find a single matching connection rule (for backward compatibility)
 */
function findConnectionRule(
  notation: NotationDefinition,
  sourceSymbolId: string,
  sourceVariant?: string
): ConnectionRule | undefined {
  const rules = findConnectionRules(notation, sourceSymbolId, sourceVariant);
  return rules[0];
}

/**
 * Check if source symbol can connect to target symbol
 */
function checkSymbolConnection(
  notation: NotationDefinition,
  sourceInfo: NodeConnectionInfo,
  targetInfo: NodeConnectionInfo,
  existingEdges: ConnectionValidationContext['existingEdges']
): ConnectionValidation {
  const rules = findConnectionRules(notation, sourceInfo.symbolId, sourceInfo.variant);

  // No rules found for source - warn but allow
  if (rules.length === 0) {
    return {
      valid: true,
      hasWarning: true,
      message: `No connection rules defined for ${sourceInfo.symbolId}`,
    };
  }

  // Check if ANY rule allows this target
  // Also collect all allowed targets for error message
  const allAllowedTargets = new Set<string>();
  let matchingRule: ConnectionRule | undefined;

  for (const rule of rules) {
    rule.to.forEach((t) => allAllowedTargets.add(t));
    if (rule.to.includes(targetInfo.symbolId)) {
      matchingRule = rule;
      break;
    }
  }

  // Check if all rules have empty 'to' arrays (no outgoing allowed)
  if (allAllowedTargets.size === 0) {
    return {
      valid: false,
      hasWarning: false,
      reason: 'symbol-not-allowed',
      message: `${sourceInfo.symbolId}${sourceInfo.variant ? ` (${sourceInfo.variant})` : ''} cannot have outgoing connections`,
    };
  }

  // Target not allowed by any rule
  if (!matchingRule) {
    return {
      valid: false,
      hasWarning: false,
      reason: 'symbol-not-allowed',
      message: `${sourceInfo.symbolId} cannot connect to ${targetInfo.symbolId}`,
    };
  }

  // Check constraints on the matching rule
  if (matchingRule.constraints) {
    // Check maxOutgoing
    if (matchingRule.constraints.maxOutgoing !== undefined) {
      const outgoingCount = existingEdges.filter(
        (e) => e.source === sourceInfo.id
      ).length;
      if (outgoingCount >= matchingRule.constraints.maxOutgoing) {
        return {
          valid: false,
          hasWarning: false,
          reason: 'max-connections-exceeded',
          message: `${sourceInfo.symbolId} has reached maximum outgoing connections (${matchingRule.constraints.maxOutgoing})`,
        };
      }
    }
  }

  // Check if target symbol has maxIncoming constraint
  const targetRule = findConnectionRule(notation, targetInfo.symbolId, targetInfo.variant);
  if (targetRule?.constraints?.maxIncoming !== undefined) {
    const maxIncoming = targetRule.constraints.maxIncoming;
    const incomingCount = existingEdges.filter(
      (e) => e.target === targetInfo.id
    ).length;

    // maxIncoming: 0 means "never allowed" - use symbol-not-allowed
    if (maxIncoming === 0) {
      return {
        valid: false,
        hasWarning: false,
        reason: 'symbol-not-allowed',
        message: `${targetInfo.symbolId}${targetInfo.variant ? ` (${targetInfo.variant})` : ''} cannot receive incoming connections`,
      };
    }

    if (incomingCount >= maxIncoming) {
      return {
        valid: false,
        hasWarning: false,
        reason: 'max-connections-exceeded',
        message: `${targetInfo.symbolId} has reached maximum incoming connections (${maxIncoming})`,
      };
    }
  }

  return { valid: true, hasWarning: false };
}

// ============================================================================
// Port-Level Validation
// ============================================================================

/**
 * Get ports for a symbol
 */
function getSymbolPorts(symbolId: string, variant?: string): SymbolPort[] {
  const symbol = symbolRegistry.get(symbolId);
  if (!symbol) {
    return [
      { id: 'in', anchor: 'NORTH', direction: 'in' },
      { id: 'out', anchor: 'SOUTH', direction: 'out' },
    ];
  }

  // Check for variant-specific ports
  if (variant && symbol.variants?.[variant]?.ports) {
    return symbol.variants[variant].ports!;
  }

  // Fall back to symbol ports
  if (symbol.ports && symbol.ports.length > 0) {
    return symbol.ports;
  }

  // Default ports
  return [
    { id: 'in', anchor: 'NORTH', direction: 'in' },
    { id: 'out', anchor: 'SOUTH', direction: 'out' },
  ];
}

/**
 * Validate port-level compatibility
 */
function validatePorts(
  sourceInfo: NodeConnectionInfo,
  targetInfo: NodeConnectionInfo,
  sourcePortId?: string,
  targetPortId?: string,
  existingEdges: ConnectionValidationContext['existingEdges'] = []
): ConnectionValidation {
  const sourcePorts = getSymbolPorts(sourceInfo.symbolId, sourceInfo.variant);
  const targetPorts = getSymbolPorts(targetInfo.symbolId, targetInfo.variant);

  // Find the specific ports if IDs provided
  const sourcePort = sourcePortId
    ? sourcePorts.find((p) => p.id === sourcePortId)
    : sourcePorts.find((p) => p.direction === 'out' || p.direction === 'inout');

  const targetPort = targetPortId
    ? targetPorts.find((p) => p.id === targetPortId)
    : targetPorts.find((p) => p.direction === 'in' || p.direction === 'inout');

  // Check port directions if we have both ports
  if (sourcePort && targetPort) {
    const directionCheck = checkPortDirection(sourcePort.direction, targetPort.direction);
    if (!directionCheck.valid) {
      return directionCheck;
    }

    // Check max connections on source port
    if (sourcePort.maxConnections !== undefined) {
      const maxCheck = checkMaxConnections(
        sourceInfo.id,
        sourcePort.id,
        sourcePort.maxConnections,
        existingEdges,
        'source'
      );
      if (!maxCheck.valid) {
        return maxCheck;
      }
    }

    // Check max connections on target port
    if (targetPort.maxConnections !== undefined) {
      const maxCheck = checkMaxConnections(
        targetInfo.id,
        targetPort.id,
        targetPort.maxConnections,
        existingEdges,
        'target'
      );
      if (!maxCheck.valid) {
        return maxCheck;
      }
    }
  }

  return { valid: true, hasWarning: false };
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validate a connection against notation rules
 *
 * @param connection - The connection to validate
 * @param context - Validation context with notation and node info
 * @returns Validation result with compatibility status and message
 */
export function validateConnection(
  connection: ConnectionInfo,
  context: ConnectionValidationContext
): ConnectionValidation {
  const { sourceNodeId, targetNodeId, sourcePortId, targetPortId } = connection;
  const { notationId, nodeInfo, existingEdges } = context;

  // Check for self-connection
  if (sourceNodeId === targetNodeId) {
    return {
      valid: false,
      hasWarning: false,
      reason: 'self-connection',
      message: 'A node cannot connect to itself',
    };
  }

  // Get node info
  const sourceInfo = nodeInfo.get(sourceNodeId);
  const targetInfo = nodeInfo.get(targetNodeId);

  // Handle unknown nodes (warn but allow)
  if (!sourceInfo) {
    return {
      valid: true,
      hasWarning: true,
      message: `Unknown source node: ${sourceNodeId}`,
    };
  }

  if (!targetInfo) {
    return {
      valid: true,
      hasWarning: true,
      message: `Unknown target node: ${targetNodeId}`,
    };
  }

  // Get notation
  const notation = getNotation(notationId);
  if (!notation) {
    return {
      valid: true,
      hasWarning: true,
      message: `Unknown notation: ${notationId}. Connection allowed but not validated.`,
    };
  }

  // Check symbol-level rules
  const symbolCheck = checkSymbolConnection(notation, sourceInfo, targetInfo, existingEdges);
  if (!symbolCheck.valid) {
    return symbolCheck;
  }

  // Check port-level rules
  const portCheck = validatePorts(
    sourceInfo,
    targetInfo,
    sourcePortId,
    targetPortId,
    existingEdges
  );
  if (!portCheck.valid) {
    return portCheck;
  }

  // Merge any warnings
  if (symbolCheck.hasWarning || portCheck.hasWarning) {
    return {
      valid: true,
      hasWarning: true,
      message: symbolCheck.message || portCheck.message,
    };
  }

  return { valid: true, hasWarning: false };
}

// ============================================================================
// Batch Validation for Edges
// ============================================================================

/**
 * Get compatibility status for multiple edges
 *
 * When validating existing edges, we exclude the edge being validated from
 * the existingEdges count. This prevents false positives where an edge at
 * the maxConnections limit would fail validation because it counts itself.
 *
 * @param edges - Edges to check
 * @param context - Validation context
 * @returns Array of edge compatibility info
 */
export function getEdgeCompatibility(
  edges: Array<{ id: string; source: string; target: string; sourcePort?: string; targetPort?: string }>,
  context: ConnectionValidationContext
): EdgeCompatibility[] {
  return edges.map((edge) => {
    // Create a modified context that excludes the current edge
    // This is needed because when validating an EXISTING edge,
    // we shouldn't count it in the max connections check
    const otherEdges = context.existingEdges.filter(
      (e) => !(e.source === edge.source && e.target === edge.target)
    );
    const edgeContext: ConnectionValidationContext = {
      ...context,
      existingEdges: otherEdges,
    };

    const validation = validateConnection(
      {
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        sourcePortId: edge.sourcePort,
        targetPortId: edge.targetPort,
      },
      edgeContext
    );

    let status: EdgeCompatibilityStatus;
    if (!validation.valid) {
      status = 'incompatible';
    } else if (validation.hasWarning) {
      status = 'warning';
    } else {
      status = 'compatible';
    }

    return {
      edgeId: edge.id,
      status,
      validation,
    };
  });
}
