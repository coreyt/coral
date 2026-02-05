/**
 * Tests for useAnnotations hook
 *
 * Issue #19: CCD-REQ-006 Annotation Layer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnnotations } from '../src/hooks/useAnnotations';
import type { AnnotationStore, NodeAnnotation } from '../src/types';

describe('useAnnotations', () => {
  const mockInitialStore: AnnotationStore = {
    version: '1.0.0',
    nodes: {},
    edges: {},
    groups: [],
    tags: [],
    orphaned: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with empty store', () => {
      const { result } = renderHook(() => useAnnotations());

      expect(result.current.annotations.nodes).toEqual({});
      expect(result.current.annotations.edges).toEqual({});
      expect(result.current.annotations.groups).toEqual([]);
    });

    it('should initialize with provided store', () => {
      const initialStore: AnnotationStore = {
        ...mockInitialStore,
        nodes: {
          'symbol-1': {
            symbolId: 'symbol-1',
            note: 'Test note',
          },
        },
      };

      const { result } = renderHook(() => useAnnotations(initialStore));

      expect(result.current.annotations.nodes['symbol-1'].note).toBe('Test note');
    });
  });

  describe('node annotations', () => {
    it('should add annotation to a node', () => {
      const { result } = renderHook(() => useAnnotations());

      act(() => {
        result.current.setNodeAnnotation('symbol-1', {
          symbolId: 'symbol-1',
          note: 'Important function',
          color: '#ff0000',
        });
      });

      expect(result.current.annotations.nodes['symbol-1']).toEqual({
        symbolId: 'symbol-1',
        note: 'Important function',
        color: '#ff0000',
      });
    });

    it('should update existing node annotation', () => {
      const { result } = renderHook(() => useAnnotations());

      act(() => {
        result.current.setNodeAnnotation('symbol-1', {
          symbolId: 'symbol-1',
          note: 'Original note',
        });
      });

      act(() => {
        result.current.setNodeAnnotation('symbol-1', {
          symbolId: 'symbol-1',
          note: 'Updated note',
          color: '#00ff00',
        });
      });

      expect(result.current.annotations.nodes['symbol-1'].note).toBe('Updated note');
      expect(result.current.annotations.nodes['symbol-1'].color).toBe('#00ff00');
    });

    it('should remove node annotation', () => {
      const { result } = renderHook(() => useAnnotations());

      act(() => {
        result.current.setNodeAnnotation('symbol-1', {
          symbolId: 'symbol-1',
          note: 'Test',
        });
      });

      act(() => {
        result.current.removeNodeAnnotation('symbol-1');
      });

      expect(result.current.annotations.nodes['symbol-1']).toBeUndefined();
    });

    it('should get annotation for a node', () => {
      const { result } = renderHook(() => useAnnotations());

      act(() => {
        result.current.setNodeAnnotation('symbol-1', {
          symbolId: 'symbol-1',
          note: 'Test note',
        });
      });

      const annotation = result.current.getNodeAnnotation('symbol-1');
      expect(annotation?.note).toBe('Test note');
    });

    it('should return undefined for non-existent node annotation', () => {
      const { result } = renderHook(() => useAnnotations());

      const annotation = result.current.getNodeAnnotation('non-existent');
      expect(annotation).toBeUndefined();
    });
  });

  describe('edge annotations', () => {
    it('should add annotation to an edge', () => {
      const { result } = renderHook(() => useAnnotations());

      act(() => {
        result.current.setEdgeAnnotation('source-1', 'target-1', {
          sourceSymbolId: 'source-1',
          targetSymbolId: 'target-1',
          note: 'Data flow',
        });
      });

      const key = 'source-1->target-1';
      expect(result.current.annotations.edges[key]).toEqual({
        sourceSymbolId: 'source-1',
        targetSymbolId: 'target-1',
        note: 'Data flow',
      });
    });

    it('should remove edge annotation', () => {
      const { result } = renderHook(() => useAnnotations());

      act(() => {
        result.current.setEdgeAnnotation('source-1', 'target-1', {
          sourceSymbolId: 'source-1',
          targetSymbolId: 'target-1',
          note: 'Test',
        });
      });

      act(() => {
        result.current.removeEdgeAnnotation('source-1', 'target-1');
      });

      const key = 'source-1->target-1';
      expect(result.current.annotations.edges[key]).toBeUndefined();
    });
  });

  describe('tags', () => {
    it('should add tag to a node', () => {
      const { result } = renderHook(() => useAnnotations());

      act(() => {
        result.current.setNodeAnnotation('symbol-1', {
          symbolId: 'symbol-1',
          tags: ['important'],
        });
      });

      expect(result.current.annotations.nodes['symbol-1'].tags).toContain('important');
    });

    it('should add tag definition', () => {
      const { result } = renderHook(() => useAnnotations());

      act(() => {
        result.current.addTagDefinition({
          id: 'needs-review',
          name: 'Needs Review',
          color: '#ff9900',
        });
      });

      expect(result.current.annotations.tags).toContainEqual({
        id: 'needs-review',
        name: 'Needs Review',
        color: '#ff9900',
      });
    });

    it('should get nodes by tag', () => {
      const { result } = renderHook(() => useAnnotations());

      act(() => {
        result.current.setNodeAnnotation('symbol-1', {
          symbolId: 'symbol-1',
          tags: ['important', 'core'],
        });
        result.current.setNodeAnnotation('symbol-2', {
          symbolId: 'symbol-2',
          tags: ['important'],
        });
        result.current.setNodeAnnotation('symbol-3', {
          symbolId: 'symbol-3',
          tags: ['deprecated'],
        });
      });

      const importantNodes = result.current.getNodesByTag('important');
      expect(importantNodes).toHaveLength(2);
      expect(importantNodes.map(n => n.symbolId)).toContain('symbol-1');
      expect(importantNodes.map(n => n.symbolId)).toContain('symbol-2');
    });
  });

  describe('groups', () => {
    it('should create a group', () => {
      const { result } = renderHook(() => useAnnotations());

      act(() => {
        result.current.createGroup({
          id: 'group-1',
          label: 'Auth Module',
          symbolIds: ['symbol-1', 'symbol-2'],
          color: '#0066cc',
        });
      });

      expect(result.current.annotations.groups).toHaveLength(1);
      expect(result.current.annotations.groups[0].label).toBe('Auth Module');
    });

    it('should delete a group', () => {
      const { result } = renderHook(() => useAnnotations());

      act(() => {
        result.current.createGroup({
          id: 'group-1',
          label: 'Test Group',
          symbolIds: ['symbol-1'],
        });
      });

      act(() => {
        result.current.deleteGroup('group-1');
      });

      expect(result.current.annotations.groups).toHaveLength(0);
    });

    it('should update a group', () => {
      const { result } = renderHook(() => useAnnotations());

      act(() => {
        result.current.createGroup({
          id: 'group-1',
          label: 'Original',
          symbolIds: ['symbol-1'],
        });
      });

      act(() => {
        result.current.updateGroup('group-1', {
          label: 'Updated',
          symbolIds: ['symbol-1', 'symbol-2'],
        });
      });

      expect(result.current.annotations.groups[0].label).toBe('Updated');
      expect(result.current.annotations.groups[0].symbolIds).toHaveLength(2);
    });
  });

  describe('orphaned annotations', () => {
    it('should mark annotation as orphaned', () => {
      const { result } = renderHook(() => useAnnotations());

      act(() => {
        result.current.setNodeAnnotation('symbol-1', {
          symbolId: 'symbol-1',
          note: 'Important note',
        });
      });

      act(() => {
        result.current.markAsOrphaned('symbol-1', 'AuthService', 'src/auth/service.ts');
      });

      expect(result.current.annotations.orphaned).toHaveLength(1);
      expect(result.current.annotations.orphaned[0].lastKnownName).toBe('AuthService');
      expect(result.current.annotations.nodes['symbol-1']).toBeUndefined();
    });

    it('should relink orphaned annotation', () => {
      const { result } = renderHook(() => useAnnotations());

      // Create and orphan an annotation
      act(() => {
        result.current.setNodeAnnotation('old-symbol', {
          symbolId: 'old-symbol',
          note: 'Important note',
        });
        result.current.markAsOrphaned('old-symbol', 'OldName', 'old/path.ts');
      });

      // Relink to new symbol
      act(() => {
        result.current.relinkOrphanedAnnotation('old-symbol', 'new-symbol');
      });

      expect(result.current.annotations.orphaned).toHaveLength(0);
      expect(result.current.annotations.nodes['new-symbol'].note).toBe('Important note');
    });

    it('should delete orphaned annotation', () => {
      const { result } = renderHook(() => useAnnotations());

      act(() => {
        result.current.setNodeAnnotation('symbol-1', {
          symbolId: 'symbol-1',
          note: 'Test',
        });
        result.current.markAsOrphaned('symbol-1', 'Test', 'test.ts');
      });

      act(() => {
        result.current.deleteOrphanedAnnotation('symbol-1');
      });

      expect(result.current.annotations.orphaned).toHaveLength(0);
    });
  });

  describe('dirty tracking', () => {
    it('should track dirty state', () => {
      const { result } = renderHook(() => useAnnotations());

      expect(result.current.isDirty).toBe(false);

      act(() => {
        result.current.setNodeAnnotation('symbol-1', {
          symbolId: 'symbol-1',
          note: 'Test',
        });
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should clear dirty state when reset', () => {
      const { result } = renderHook(() => useAnnotations());

      act(() => {
        result.current.setNodeAnnotation('symbol-1', {
          symbolId: 'symbol-1',
          note: 'Test',
        });
      });

      act(() => {
        result.current.markClean();
      });

      expect(result.current.isDirty).toBe(false);
    });
  });
});
