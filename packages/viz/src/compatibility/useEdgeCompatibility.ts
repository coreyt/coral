/**
 * useEdgeCompatibility Hook (CORAL-REQ-010)
 *
 * React hook for managing edge compatibility state and providing
 * validation functions for the visual editor.
 */

import { useMemo, useCallback } from 'react';
import { getEdgeCompatibility, validateConnection } from './validateConnection';
import type {
  CoralNode,
  CoralEdge,
  EdgeCompatibility,
  EdgeCompatibilityStatus,
  ConnectionValidation,
  NodeConnectionInfo,
  ConnectionValidationContext,
} from '../types';

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
function extractNodeInfo(node: CoralNode): NodeConnectionInfo {
  const data = node.data;
  return {
    id: node.id,
    symbolId: (data.symbolId as string | undefined) || data.nodeType || 'unknown',
    variant: data.properties?.variant as string | undefined,
  };
}

/**
 * Build validation context from nodes and edges
 */
function buildContext(
  nodes: CoralNode[],
  edges: CoralEdge[],
  notationId: string
): ConnectionValidationContext {
  const nodeInfo = new Map<string, NodeConnectionInfo>();
  nodes.forEach((node) => {
    nodeInfo.set(node.id, extractNodeInfo(node));
  });

  const existingEdges = edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    sourcePort: edge.sourceHandle || undefined,
    targetPort: edge.targetHandle || undefined,
  }));

  return {
    notationId,
    nodeInfo,
    existingEdges,
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
      // Strip IDs from existingEdges since the validation context doesn't use them
      return {
        notationId: options.notationId,
        nodeInfo: options.nodeInfo,
        existingEdges: options.existingEdges.map((e) => ({
          source: e.source,
          target: e.target,
          sourcePort: e.sourcePort,
          targetPort: e.targetPort,
        })),
      };
    } else {
      // Nodes mode: build context from CoralNode/CoralEdge arrays
      return buildContext(options.nodes, options.edges, options.notationId);
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

  // Check a proposed connection (for drag validation)
  // If the connection already exists, we exclude it from the count
  // This handles both "can I add this?" and "is my existing connection valid?"
  const checkConnection = useCallback(
    (
      sourceId: string,
      targetId: string,
      sourcePort?: string,
      targetPort?: string
    ): ConnectionValidation => {
      // Check if this connection already exists
      const exists = context.existingEdges.some(
        (e) => e.source === sourceId && e.target === targetId
      );

      // If it exists, validate without counting this edge
      const contextToUse = exists
        ? {
            ...context,
            existingEdges: context.existingEdges.filter(
              (e) => !(e.source === sourceId && e.target === targetId)
            ),
          }
        : context;

      return validateConnection(
        {
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          sourcePortId: sourcePort,
          targetPortId: targetPort,
        },
        contextToUse
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
