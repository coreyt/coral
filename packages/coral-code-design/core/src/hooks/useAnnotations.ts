/**
 * useAnnotations Hook
 *
 * Manages annotation state for nodes, edges, and groups.
 * Issue #19: CCD-REQ-006 Annotation Layer
 */

import { useState, useCallback, useMemo } from 'react';
import type {
  AnnotationStore,
  NodeAnnotation,
  EdgeAnnotation,
  GroupAnnotation,
  TagDefinition,
  OrphanedAnnotation,
} from '../types';

// ============================================================================
// Types
// ============================================================================

export interface UseAnnotationsResult {
  /** Current annotations store */
  annotations: AnnotationStore;

  /** Whether annotations have changed since last save */
  isDirty: boolean;

  // Node operations
  getNodeAnnotation: (symbolId: string) => NodeAnnotation | undefined;
  setNodeAnnotation: (symbolId: string, annotation: NodeAnnotation) => void;
  removeNodeAnnotation: (symbolId: string) => void;

  // Edge operations
  getEdgeAnnotation: (sourceId: string, targetId: string) => EdgeAnnotation | undefined;
  setEdgeAnnotation: (sourceId: string, targetId: string, annotation: EdgeAnnotation) => void;
  removeEdgeAnnotation: (sourceId: string, targetId: string) => void;

  // Tag operations
  addTagDefinition: (tag: TagDefinition) => void;
  removeTagDefinition: (tagId: string) => void;
  getNodesByTag: (tagId: string) => NodeAnnotation[];

  // Group operations
  createGroup: (group: GroupAnnotation) => void;
  updateGroup: (groupId: string, updates: Partial<GroupAnnotation>) => void;
  deleteGroup: (groupId: string) => void;

  // Orphaned annotation operations
  markAsOrphaned: (symbolId: string, lastKnownName: string, lastKnownPath: string) => void;
  relinkOrphanedAnnotation: (originalSymbolId: string, newSymbolId: string) => void;
  deleteOrphanedAnnotation: (originalSymbolId: string) => void;

  // State management
  markClean: () => void;
  reset: (newStore?: AnnotationStore) => void;
}

// ============================================================================
// Default Store
// ============================================================================

function createDefaultStore(): AnnotationStore {
  return {
    version: '1.0.0',
    nodes: {},
    edges: {},
    groups: [],
    tags: [],
    orphaned: [],
  };
}

// ============================================================================
// Hook
// ============================================================================

export function useAnnotations(
  initialStore?: AnnotationStore
): UseAnnotationsResult {
  const [annotations, setAnnotations] = useState<AnnotationStore>(
    initialStore ?? createDefaultStore()
  );
  const [isDirty, setIsDirty] = useState(false);

  // Helper to create edge key
  const edgeKey = useCallback(
    (sourceId: string, targetId: string) => `${sourceId}->${targetId}`,
    []
  );

  // ============================================================================
  // Node Operations
  // ============================================================================

  const getNodeAnnotation = useCallback(
    (symbolId: string): NodeAnnotation | undefined => {
      return annotations.nodes[symbolId];
    },
    [annotations.nodes]
  );

  const setNodeAnnotation = useCallback(
    (symbolId: string, annotation: NodeAnnotation) => {
      setAnnotations((prev) => ({
        ...prev,
        nodes: {
          ...prev.nodes,
          [symbolId]: annotation,
        },
      }));
      setIsDirty(true);
    },
    []
  );

  const removeNodeAnnotation = useCallback((symbolId: string) => {
    setAnnotations((prev) => {
      const { [symbolId]: _, ...rest } = prev.nodes;
      return {
        ...prev,
        nodes: rest,
      };
    });
    setIsDirty(true);
  }, []);

  // ============================================================================
  // Edge Operations
  // ============================================================================

  const getEdgeAnnotation = useCallback(
    (sourceId: string, targetId: string): EdgeAnnotation | undefined => {
      return annotations.edges[edgeKey(sourceId, targetId)];
    },
    [annotations.edges, edgeKey]
  );

  const setEdgeAnnotation = useCallback(
    (sourceId: string, targetId: string, annotation: EdgeAnnotation) => {
      setAnnotations((prev) => ({
        ...prev,
        edges: {
          ...prev.edges,
          [edgeKey(sourceId, targetId)]: annotation,
        },
      }));
      setIsDirty(true);
    },
    [edgeKey]
  );

  const removeEdgeAnnotation = useCallback(
    (sourceId: string, targetId: string) => {
      const key = edgeKey(sourceId, targetId);
      setAnnotations((prev) => {
        const { [key]: _, ...rest } = prev.edges;
        return {
          ...prev,
          edges: rest,
        };
      });
      setIsDirty(true);
    },
    [edgeKey]
  );

  // ============================================================================
  // Tag Operations
  // ============================================================================

  const addTagDefinition = useCallback((tag: TagDefinition) => {
    setAnnotations((prev) => ({
      ...prev,
      tags: [...prev.tags.filter((t) => t.id !== tag.id), tag],
    }));
    setIsDirty(true);
  }, []);

  const removeTagDefinition = useCallback((tagId: string) => {
    setAnnotations((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t.id !== tagId),
    }));
    setIsDirty(true);
  }, []);

  const getNodesByTag = useCallback(
    (tagId: string): NodeAnnotation[] => {
      return Object.values(annotations.nodes).filter(
        (node) => node.tags?.includes(tagId)
      );
    },
    [annotations.nodes]
  );

  // ============================================================================
  // Group Operations
  // ============================================================================

  const createGroup = useCallback((group: GroupAnnotation) => {
    setAnnotations((prev) => ({
      ...prev,
      groups: [...prev.groups, group],
    }));
    setIsDirty(true);
  }, []);

  const updateGroup = useCallback(
    (groupId: string, updates: Partial<GroupAnnotation>) => {
      setAnnotations((prev) => ({
        ...prev,
        groups: prev.groups.map((g) =>
          g.id === groupId ? { ...g, ...updates } : g
        ),
      }));
      setIsDirty(true);
    },
    []
  );

  const deleteGroup = useCallback((groupId: string) => {
    setAnnotations((prev) => ({
      ...prev,
      groups: prev.groups.filter((g) => g.id !== groupId),
    }));
    setIsDirty(true);
  }, []);

  // ============================================================================
  // Orphaned Annotation Operations
  // ============================================================================

  const markAsOrphaned = useCallback(
    (symbolId: string, lastKnownName: string, lastKnownPath: string) => {
      setAnnotations((prev) => {
        const annotation = prev.nodes[symbolId];
        if (!annotation) return prev;

        const orphaned: OrphanedAnnotation = {
          originalSymbolId: symbolId,
          annotation,
          orphanedAt: new Date().toISOString(),
          lastKnownName,
          lastKnownPath,
        };

        const { [symbolId]: _, ...remainingNodes } = prev.nodes;

        return {
          ...prev,
          nodes: remainingNodes,
          orphaned: [...prev.orphaned, orphaned],
        };
      });
      setIsDirty(true);
    },
    []
  );

  const relinkOrphanedAnnotation = useCallback(
    (originalSymbolId: string, newSymbolId: string) => {
      setAnnotations((prev) => {
        const orphanedIndex = prev.orphaned.findIndex(
          (o) => o.originalSymbolId === originalSymbolId
        );
        if (orphanedIndex === -1) return prev;

        const orphaned = prev.orphaned[orphanedIndex];
        const restoredAnnotation: NodeAnnotation = {
          ...orphaned.annotation,
          symbolId: newSymbolId,
        };

        return {
          ...prev,
          nodes: {
            ...prev.nodes,
            [newSymbolId]: restoredAnnotation,
          },
          orphaned: prev.orphaned.filter(
            (o) => o.originalSymbolId !== originalSymbolId
          ),
        };
      });
      setIsDirty(true);
    },
    []
  );

  const deleteOrphanedAnnotation = useCallback((originalSymbolId: string) => {
    setAnnotations((prev) => ({
      ...prev,
      orphaned: prev.orphaned.filter(
        (o) => o.originalSymbolId !== originalSymbolId
      ),
    }));
    setIsDirty(true);
  }, []);

  // ============================================================================
  // State Management
  // ============================================================================

  const markClean = useCallback(() => {
    setIsDirty(false);
  }, []);

  const reset = useCallback((newStore?: AnnotationStore) => {
    setAnnotations(newStore ?? createDefaultStore());
    setIsDirty(false);
  }, []);

  // ============================================================================
  // Return
  // ============================================================================

  return useMemo(
    () => ({
      annotations,
      isDirty,
      getNodeAnnotation,
      setNodeAnnotation,
      removeNodeAnnotation,
      getEdgeAnnotation,
      setEdgeAnnotation,
      removeEdgeAnnotation,
      addTagDefinition,
      removeTagDefinition,
      getNodesByTag,
      createGroup,
      updateGroup,
      deleteGroup,
      markAsOrphaned,
      relinkOrphanedAnnotation,
      deleteOrphanedAnnotation,
      markClean,
      reset,
    }),
    [
      annotations,
      isDirty,
      getNodeAnnotation,
      setNodeAnnotation,
      removeNodeAnnotation,
      getEdgeAnnotation,
      setEdgeAnnotation,
      removeEdgeAnnotation,
      addTagDefinition,
      removeTagDefinition,
      getNodesByTag,
      createGroup,
      updateGroup,
      deleteGroup,
      markAsOrphaned,
      relinkOrphanedAnnotation,
      deleteOrphanedAnnotation,
      markClean,
      reset,
    ]
  );
}
