/**
 * useEdgeCompatibility Hook (CORAL-REQ-010)
 *
 * React hook for managing edge compatibility state and providing
 * validation functions for the visual editor.
 */

import { useMemo, useCallback } from 'react';
import { notationRegistry, resolveNotationNode028, symbolRegistry, type DocumentCatalog029 } from '@coral-viz/render';
import { getEdgeCompatibility, validateConnection } from './validateConnection.js';
import type {
  CoralNode,
  CoralEdge,
  EdgeCompatibility,
  EdgeCompatibilityStatus,
  ConnectionValidation,
  NodeConnectionInfo,
  ConnectionValidationContext,
} from '../types.js';

/**
 * Options for the useEdgeCompatibility hook (CoralNode/CoralEdge mode)
 */
export interface UseEdgeCompatibilityOptionsNodes {
  /** Current nodes in the diagram */
  nodes: CoralNode[];
  /** Current edges in the diagram */
  edges: CoralEdge[];
  /** Notation ID for validation rules */
  notationId: string;
  /** Edition 0.2.9 documents refuse a connection beyond a resolved port limit. */
  portLimits029?: 'refuse';
}

/**
 * Options for the useEdgeCompatibility hook (context mode)
 * Use this when you have pre-built node info and edge arrays
 */
export interface UseEdgeCompatibilityOptionsContext {
  /** Notation ID for validation rules */
  notationId: string;
  /** Pre-built node connection info map */
  nodeInfo: Map<string, NodeConnectionInfo>;
  /** Pre-built existing edges array (with IDs for lookup) */
  existingEdges: Array<{ id: string; source: string; target: string; sourcePort?: string; targetPort?: string }>;
  /** Edition 0.2.9 documents refuse a connection beyond a resolved port limit. */
  portLimits029?: 'refuse';
}

/**
 * Options for the useEdgeCompatibility hook
 */
export type UseEdgeCompatibilityOptions = UseEdgeCompatibilityOptionsNodes | UseEdgeCompatibilityOptionsContext;

/**
 * Check if options are in context mode
 */
function isContextMode(options: UseEdgeCompatibilityOptions): options is UseEdgeCompatibilityOptionsContext {
  return 'nodeInfo' in options && 'existingEdges' in options;
}

/**
 * Result from the useEdgeCompatibility hook
 */
export interface UseEdgeCompatibilityResult {
  /** Compatibility info for all edges */
  edgeCompatibility: EdgeCompatibility[];
  /** Check if a proposed connection is valid */
  checkConnection: (sourceId: string, targetId: string, sourcePort?: string, targetPort?: string) => ConnectionValidation;
  /** Get list of incompatible edge IDs */
  getIncompatibleEdgeIds: () => string[];
  /** Get list of edges with warnings */
  getWarningEdgeIds: () => string[];
  /** Get status for a specific edge */
  getEdgeStatus: (edgeId: string) => EdgeCompatibilityStatus | undefined;
  /** Get validation result for a specific edge */
  getEdgeValidation: (edgeId: string) => ConnectionValidation | undefined;
}

/**
 * Extract symbol ID and variant from CoralNode
 */
function extractNodeInfo(node: CoralNode, notationId: string): NodeConnectionInfo {
  const data = node.data;
  const explicitSymbol = data.symbolId as string | undefined;
  // Only the explicit top-level variant has semantic meaning. Extension
  // properties may contain similarly named data but cannot change rules.
  const variant = typeof data.variant === 'string' ? data.variant : data.canonical?.variant;
  const projectedSymbol = Object.prototype.hasOwnProperty.call(data.canonical ?? {}, 'symbol')
    ? data.canonical?.symbol : explicitSymbol;
  const catalog = data.documentCatalog029 as DocumentCatalog029 | undefined;
  const interpretation = notationRegistry.has(notationId)
    ? resolveNotationNode028({ id: node.id, type: data.nodeType,
      ...(projectedSymbol !== undefined ? { symbol: projectedSymbol } : {}),
      ...(variant !== undefined ? { variant } : {}),
      ...(data.authoredSemanticPorts !== undefined ? { authoredPorts: data.authoredSemanticPorts } : {}),
    }, notationId, catalog)
    : undefined;
  const symbolWithoutProfile = projectedSymbol !== undefined
    ? projectedSymbol.startsWith('local.') ? undefined : symbolRegistry.get(projectedSymbol)
    : symbolRegistry.get(data.nodeType);
  const unresolvedWithoutProfile = interpretation === undefined
    ? projectedSymbol !== undefined && projectedSymbol !== '' && !symbolWithoutProfile
      ? { code: 'coral.symbol.unknown', message: `Unknown symbol ${projectedSymbol}` }
      : variant !== undefined && !symbolWithoutProfile?.variants?.[variant]
        ? { code: 'coral.variant.unknown',
          message: `Unknown variant ${variant} for ${projectedSymbol ?? data.nodeType}` }
        : undefined
    : undefined;
  let resolutionIssue: NodeConnectionInfo['resolutionIssue'];
  if (interpretation?.status === 'unknown-symbol' || interpretation?.status === 'unknown-variant') {
    resolutionIssue = interpretation.diagnostics[0];
  } else if (interpretation?.portCollisions.length) {
    resolutionIssue = interpretation.diagnostics.find((diagnostic) => diagnostic.code === 'coral.port.duplicate');
  } else if (data.authoredSemanticPorts !== undefined && data.canonical?.ports !== undefined) {
    resolutionIssue = { code: 'coral.port.legacy-conflict',
      message: 'Legacy geometric ports cannot replace semantic ports' };
  } else if (data.authoredSemanticPorts !== undefined && interpretation === undefined) {
    resolutionIssue = { code: 'coral.profile.unknown',
      message: `Cannot validate semantic ports without profile ${notationId}` };
  } else if (data.authoredSemanticPorts !== undefined && data.notationId !== notationId) {
    resolutionIssue = { code: 'coral.profile.projection-mismatch',
      message: `Semantic ports require the ${notationId} canvas profile projection` };
  } else resolutionIssue = unresolvedWithoutProfile;
  return {
    id: node.id,
    symbolId: interpretation?.effectiveSymbolId ?? projectedSymbol ?? explicitSymbol ?? data.nodeType ?? 'unknown',
    variant,
    ...(data.canonical?.ports !== undefined && data.authoredSemanticPorts === undefined
      ? { ports: data.canonical.ports } : {}),
    ...(interpretation ? { semanticPorts: interpretation.semanticPorts.map((port) => ({
      id: port.id, direction: port.direction,
      ...(port.label !== undefined ? { label: port.label } : {}),
      ...(port.maxConnections !== undefined ? { maxConnections: port.maxConnections } : {}),
    })) } : {}),
    ...(catalog ? { documentCatalog029: catalog } : {}),
    ...(resolutionIssue ? { resolutionIssue } : {}),
  };
}

/**
 * Build validation context from nodes and edges
 */
function buildContext(
  nodes: CoralNode[],
  edges: CoralEdge[],
  notationId: string,
  portLimits029?: 'refuse',
): ConnectionValidationContext {
  const nodeInfo = new Map<string, NodeConnectionInfo>();
  nodes.forEach((node) => {
    nodeInfo.set(node.id, extractNodeInfo(node, notationId));
  });

  const existingEdges = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourcePort: edge.sourceHandle || undefined,
    targetPort: edge.targetHandle || undefined,
  }));

  return {
    notationId,
    nodeInfo,
    existingEdges,
    ...(portLimits029 ? { portLimits029 } : {}),
  };
}

/**
 * Hook for managing edge compatibility in the visual editor
 *
 * @example
 * ```tsx
 * const { edgeCompatibility, checkConnection, getIncompatibleEdgeIds } = useEdgeCompatibility({
 *   nodes,
 *   edges,
 *   notationId: 'flowchart',
 * });
 *
 * // Style incompatible edges
 * const styledEdges = edges.map(edge => ({
 *   ...edge,
 *   style: getIncompatibleEdgeIds().includes(edge.id)
 *     ? { stroke: '#f59e0b' } // warning color
 *     : undefined,
 * }));
 *
 * // Validate during drag
 * const isValid = checkConnection(sourceId, targetId);
 * ```
 */
export function useEdgeCompatibility(
  options: UseEdgeCompatibilityOptions
): UseEdgeCompatibilityResult {
  // Build context for validation - supports both modes
  const context = useMemo((): ConnectionValidationContext => {
    if (isContextMode(options)) {
      // Context mode: use pre-built nodeInfo and existingEdges
      // Edge IDs let edition 0.2.9 limit checks exclude only the edge being re-checked
      return {
        notationId: options.notationId,
        nodeInfo: options.nodeInfo,
        ...(options.portLimits029 ? { portLimits029: options.portLimits029 } : {}),
        existingEdges: options.existingEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourcePort: e.sourcePort,
          targetPort: e.targetPort,
        })),
      };
    } else {
      // Nodes mode: build context from CoralNode/CoralEdge arrays
      return buildContext(options.nodes, options.edges, options.notationId, options.portLimits029);
    }
  }, [options]);

  // Get edges for validation - differs based on mode
  const edgesForValidation = useMemo(() => {
    if (isContextMode(options)) {
      // In context mode, use the provided edges with IDs
      return options.existingEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourcePort: e.sourcePort,
        targetPort: e.targetPort,
      }));
    } else {
      return options.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourcePort: edge.sourceHandle || undefined,
        targetPort: edge.targetHandle || undefined,
      }));
    }
  }, [options]);

  // Compute compatibility for all edges
  const edgeCompatibility = useMemo(() => {
    return getEdgeCompatibility(edgesForValidation, context);
  }, [edgesForValidation, context]);

  // Build a map for quick lookup
  const compatibilityMap = useMemo(() => {
    const map = new Map<string, EdgeCompatibility>();
    edgeCompatibility.forEach((ec) => map.set(ec.edgeId, ec));
    return map;
  }, [edgeCompatibility]);

  // Check a proposed connection (for drag validation).
  const checkConnection = useCallback(
    (
      sourceId: string,
      targetId: string,
      sourcePort?: string,
      targetPort?: string
    ): ConnectionValidation => {
      const exists = context.existingEdges.some(
        (e) => e.source === sourceId && e.target === targetId
      );

      if (exists) {
        return {
          valid: false,
          hasWarning: false,
          reason: 'constraint-violation',
          message: 'This connection already exists',
        };
      }

      return validateConnection(
        {
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          sourcePortId: sourcePort,
          targetPortId: targetPort,
        },
        context
      );
    },
    [context]
  );

  // Get list of incompatible edge IDs
  const getIncompatibleEdgeIds = useCallback((): string[] => {
    return edgeCompatibility
      .filter((ec) => ec.status === 'incompatible')
      .map((ec) => ec.edgeId);
  }, [edgeCompatibility]);

  // Get list of edges with warnings
  const getWarningEdgeIds = useCallback((): string[] => {
    return edgeCompatibility
      .filter((ec) => ec.status === 'warning')
      .map((ec) => ec.edgeId);
  }, [edgeCompatibility]);

  // Get status for a specific edge
  const getEdgeStatus = useCallback(
    (edgeId: string): EdgeCompatibilityStatus | undefined => {
      return compatibilityMap.get(edgeId)?.status;
    },
    [compatibilityMap]
  );

  // Get validation result for a specific edge
  const getEdgeValidation = useCallback(
    (edgeId: string): ConnectionValidation | undefined => {
      return compatibilityMap.get(edgeId)?.validation;
    },
    [compatibilityMap]
  );

  return {
    edgeCompatibility,
    checkConnection,
    getIncompatibleEdgeIds,
    getWarningEdgeIds,
    getEdgeStatus,
    getEdgeValidation,
  };
}
