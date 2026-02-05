/**
 * Tests for AnnotationPanel component
 *
 * Issue #23: CCD-REQ-006 Annotation Panel and Orphan Manager UI
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AnnotationPanel } from '../src/components/AnnotationPanel';
import type { NodeAnnotation, AnnotationStore, TagDefinition } from '../src/types';

// Mock data
const mockSelectedNode = {
  id: 'node1',
  symbolId: 'scip:src/auth/svc.ts:AuthService#',
  label: 'AuthService',
  type: 'class',
  file: 'src/auth/svc.ts',
  lines: { start: 10, end: 50 },
};

const mockAnnotation: NodeAnnotation = {
  symbolId: 'scip:src/auth/svc.ts:AuthService#',
  note: 'Main authentication service',
  color: '#ff5722',
  tags: ['core', 'auth'],
};

const mockTags: TagDefinition[] = [
  { id: 'core', name: 'Core', color: '#1976d2' },
  { id: 'auth', name: 'Auth', color: '#7b1fa2' },
  { id: 'deprecated', name: 'Deprecated', color: '#d32f2f' },
];

const mockAnnotations: AnnotationStore = {
  version: '1.0.0',
  nodes: {
    'scip:src/auth/svc.ts:AuthService#': mockAnnotation,
  },
  edges: {},
  groups: [],
  tags: mockTags,
  orphaned: [
    {
      originalSymbolId: 'scip:src/old/legacy.ts:LegacyService#',
      annotation: {
        symbolId: 'scip:src/old/legacy.ts:LegacyService#',
        note: 'Old legacy code',
        tags: ['deprecated'],
      },
      orphanedAt: '2024-01-15T10:00:00Z',
      lastKnownName: 'LegacyService',
      lastKnownPath: 'src/old/legacy.ts',
    },
  ],
};

describe('AnnotationPanel', () => {
  const defaultProps = {
    selectedNode: mockSelectedNode,
    annotations: mockAnnotations,
    onAnnotationChange: vi.fn(),
    onTagAdd: vi.fn(),
    onTagRemove: vi.fn(),
    onOrphanRelink: vi.fn(),
    onOrphanDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render panel header', () => {
      render(<AnnotationPanel {...defaultProps} />);

      expect(screen.getByText('Annotations')).toBeInTheDocument();
    });

    it('should show selected node info', () => {
      render(<AnnotationPanel {...defaultProps} />);

      expect(screen.getByText('AuthService')).toBeInTheDocument();
      expect(screen.getByText(/class/i)).toBeInTheDocument();
    });

    it('should show empty state when no node selected', () => {
      render(<AnnotationPanel {...defaultProps} selectedNode={null} />);

      expect(screen.getByText(/select a node/i)).toBeInTheDocument();
    });
  });

  describe('note editing', () => {
    it('should display existing note', () => {
      render(<AnnotationPanel {...defaultProps} />);

      const noteTextarea = screen.getByRole('textbox', { name: /note/i });
      expect(noteTextarea).toHaveValue('Main authentication service');
    });

    it('should call onAnnotationChange when note is updated', async () => {
      const onAnnotationChange = vi.fn();
      render(<AnnotationPanel {...defaultProps} onAnnotationChange={onAnnotationChange} />);

      const noteTextarea = screen.getByRole('textbox', { name: /note/i });
      fireEvent.change(noteTextarea, { target: { value: 'Updated note' } });

      // Wait for debounce
      await waitFor(() => {
        expect(onAnnotationChange).toHaveBeenCalledWith(
          mockSelectedNode.symbolId,
          expect.objectContaining({ note: 'Updated note' })
        );
      }, { timeout: 1000 });
    });
  });

  describe('color picker', () => {
    it('should display current color', () => {
      render(<AnnotationPanel {...defaultProps} />);

      const colorInput = screen.getByRole('button', { name: /color/i });
      expect(colorInput).toBeInTheDocument();
    });

    it('should show color picker when clicked', () => {
      render(<AnnotationPanel {...defaultProps} />);

      const colorButton = screen.getByRole('button', { name: /color/i });
      fireEvent.click(colorButton);

      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('should call onAnnotationChange when color is selected', () => {
      const onAnnotationChange = vi.fn();
      render(<AnnotationPanel {...defaultProps} onAnnotationChange={onAnnotationChange} />);

      const colorButton = screen.getByRole('button', { name: /color/i });
      fireEvent.click(colorButton);

      // Click a color option
      const colorOptions = screen.getAllByRole('option');
      fireEvent.click(colorOptions[0]);

      expect(onAnnotationChange).toHaveBeenCalled();
    });
  });

  describe('tag management', () => {
    it('should display current tags', () => {
      render(<AnnotationPanel {...defaultProps} />);

      expect(screen.getByText('Core')).toBeInTheDocument();
      expect(screen.getByText('Auth')).toBeInTheDocument();
    });

    it('should show available tags in selector', () => {
      render(<AnnotationPanel {...defaultProps} />);

      const tagSelector = screen.getByRole('combobox', { name: /add tag/i });
      fireEvent.click(tagSelector);

      expect(screen.getByRole('option', { name: /deprecated/i })).toBeInTheDocument();
    });

    it('should call onAnnotationChange when tag is added via select', () => {
      const onAnnotationChange = vi.fn();
      render(<AnnotationPanel {...defaultProps} onAnnotationChange={onAnnotationChange} />);

      const tagSelector = screen.getByRole('combobox', { name: /add tag/i });
      fireEvent.change(tagSelector, { target: { value: 'deprecated' } });

      expect(onAnnotationChange).toHaveBeenCalledWith(
        mockSelectedNode.symbolId,
        expect.objectContaining({ tags: expect.arrayContaining(['deprecated']) })
      );
    });

    it('should call onAnnotationChange when tag is removed', () => {
      const onAnnotationChange = vi.fn();
      render(<AnnotationPanel {...defaultProps} onAnnotationChange={onAnnotationChange} />);

      // Click remove on the 'Core' tag
      const removeButtons = screen.getAllByRole('button', { name: /remove tag/i });
      fireEvent.click(removeButtons[0]);

      expect(onAnnotationChange).toHaveBeenCalled();
    });
  });

  describe('orphan manager', () => {
    it('should show orphan indicator when orphaned annotations exist', () => {
      render(<AnnotationPanel {...defaultProps} />);

      expect(screen.getByText(/orphaned/i)).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument(); // Count badge
    });

    it('should expand orphan list when clicked', () => {
      render(<AnnotationPanel {...defaultProps} />);

      const orphanSection = screen.getByRole('button', { name: /orphaned/i });
      fireEvent.click(orphanSection);

      expect(screen.getByText('LegacyService')).toBeInTheDocument();
      expect(screen.getByText('Old legacy code')).toBeInTheDocument();
    });

    it('should show relink button for orphaned annotation', () => {
      render(<AnnotationPanel {...defaultProps} />);

      const orphanSection = screen.getByRole('button', { name: /orphaned/i });
      fireEvent.click(orphanSection);

      expect(screen.getByRole('button', { name: /re-link/i })).toBeInTheDocument();
    });

    it('should show delete button for orphaned annotation', () => {
      render(<AnnotationPanel {...defaultProps} />);

      const orphanSection = screen.getByRole('button', { name: /orphaned/i });
      fireEvent.click(orphanSection);

      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('should call onOrphanDelete when delete is clicked', () => {
      const onOrphanDelete = vi.fn();
      render(<AnnotationPanel {...defaultProps} onOrphanDelete={onOrphanDelete} />);

      const orphanSection = screen.getByRole('button', { name: /orphaned/i });
      fireEvent.click(orphanSection);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      expect(onOrphanDelete).toHaveBeenCalledWith('scip:src/old/legacy.ts:LegacyService#');
    });

    it('should not show orphan section when no orphans exist', () => {
      const annotationsNoOrphans = { ...mockAnnotations, orphaned: [] };
      render(<AnnotationPanel {...defaultProps} annotations={annotationsNoOrphans} />);

      expect(screen.queryByText(/orphaned/i)).not.toBeInTheDocument();
    });
  });

  describe('symbol ID display', () => {
    it('should show symbol ID in collapsed state', () => {
      render(<AnnotationPanel {...defaultProps} />);

      expect(screen.getByText(/symbol id/i)).toBeInTheDocument();
    });

    it('should expand to show full symbol ID', () => {
      render(<AnnotationPanel {...defaultProps} />);

      const symbolIdSection = screen.getByRole('button', { name: /symbol id/i });
      fireEvent.click(symbolIdSection);

      expect(screen.getByText('scip:src/auth/svc.ts:AuthService#')).toBeInTheDocument();
    });

    it('should have copy button for symbol ID', () => {
      render(<AnnotationPanel {...defaultProps} />);

      const symbolIdSection = screen.getByRole('button', { name: /symbol id/i });
      fireEvent.click(symbolIdSection);

      expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
    });
  });

  describe('tag creation', () => {
    it('should allow creating new tags', () => {
      const onTagAdd = vi.fn();
      render(<AnnotationPanel {...defaultProps} onTagAdd={onTagAdd} />);

      const tagSelector = screen.getByRole('combobox', { name: /add tag/i });
      fireEvent.click(tagSelector);

      // Type a new tag name
      const input = screen.getByPlaceholderText(/new tag/i);
      fireEvent.change(input, { target: { value: 'new-feature' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onTagAdd).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'new-feature' })
      );
    });
  });

  describe('accessibility', () => {
    it('should have accessible form controls', () => {
      render(<AnnotationPanel {...defaultProps} />);

      expect(screen.getByRole('textbox', { name: /note/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /color/i })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /add tag/i })).toBeInTheDocument();
    });

    it('should support keyboard navigation', () => {
      render(<AnnotationPanel {...defaultProps} />);

      const noteTextarea = screen.getByRole('textbox', { name: /note/i });
      noteTextarea.focus();
      expect(document.activeElement).toBe(noteTextarea);
    });
  });
});
