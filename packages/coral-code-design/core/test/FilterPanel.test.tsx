/**
 * Tests for Filter and Focus components
 *
 * Issue #26: CCD-REQ-007 Filter and Focus
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { useFilteredDiagram } from '../src/hooks/useFilteredDiagram';
import { FilterPanel } from '../src/components/FilterPanel';
import type { GraphIR } from '../src/types';

// ============================================================================
// Mock Data
// ============================================================================

const mockGraphIR: GraphIR = {
  nodes: [
    { id: 'node1', label: 'AuthService', type: 'class', metadata: { file: 'src/auth/service.ts' } },
    { id: 'node2', label: 'UserRepository', type: 'class', metadata: { file: 'src/user/repo.ts' } },
    { id: 'node3', label: 'validateToken', type: 'function', metadata: { file: 'src/auth/validate.ts' } },
    { id: 'node4', label: 'DatabaseConnection', type: 'class', metadata: { file: 'src/db/connection.ts' } },
    { id: 'node5', label: 'Logger', type: 'module', metadata: { file: 'src/utils/logger.ts' } },
  ],
  edges: [
    { source: 'node1', target: 'node2', type: 'uses' },
    { source: 'node1', target: 'node3', type: 'calls' },
    { source: 'node2', target: 'node4', type: 'uses' },
    { source: 'node3', target: 'node5', type: 'imports' },
  ],
};

// ============================================================================
// useFilteredDiagram Hook Tests
// ============================================================================

describe('useFilteredDiagram', () => {
  describe('basic filtering', () => {
    it('should return all nodes when no filter is applied', () => {
      const { result } = renderHook(() => useFilteredDiagram(mockGraphIR));

      expect(result.current.filteredNodes).toHaveLength(5);
      expect(result.current.filteredEdges).toHaveLength(4);
    });

    it('should filter by node type', () => {
      const { result } = renderHook(() => useFilteredDiagram(mockGraphIR));

      act(() => {
        result.current.setFilter({ nodeTypes: ['class'] });
      });

      expect(result.current.filteredNodes).toHaveLength(3);
      expect(result.current.filteredNodes.every(n => n.type === 'class')).toBe(true);
    });

    it('should filter by path pattern', () => {
      const { result } = renderHook(() => useFilteredDiagram(mockGraphIR));

      act(() => {
        result.current.setFilter({ pathPatterns: ['src/auth/*'] });
      });

      expect(result.current.filteredNodes).toHaveLength(2);
    });

    it('should filter by exclude pattern', () => {
      const { result } = renderHook(() => useFilteredDiagram(mockGraphIR));

      act(() => {
        result.current.setFilter({ excludePatterns: ['src/utils/*'] });
      });

      expect(result.current.filteredNodes).toHaveLength(4);
    });

    it('should combine multiple filters with AND logic', () => {
      const { result } = renderHook(() => useFilteredDiagram(mockGraphIR));

      act(() => {
        result.current.setFilter({
          nodeTypes: ['class'],
          pathPatterns: ['src/auth/*'],
        });
      });

      expect(result.current.filteredNodes).toHaveLength(1);
      expect(result.current.filteredNodes[0].label).toBe('AuthService');
    });
  });

  describe('connected nodes filter', () => {
    it('should filter to show only nodes connected to a specific node', () => {
      const { result } = renderHook(() => useFilteredDiagram(mockGraphIR));

      act(() => {
        result.current.setFilter({ connectedTo: 'node1' });
      });

      // node1 is connected to node2 and node3
      expect(result.current.filteredNodes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('focus mode', () => {
    it('should enable focus mode with depth', () => {
      const { result } = renderHook(() => useFilteredDiagram(mockGraphIR));

      act(() => {
        result.current.setFocusMode('node1', 1);
      });

      expect(result.current.isFocusMode).toBe(true);
      expect(result.current.focusNodeId).toBe('node1');
      expect(result.current.focusDepth).toBe(1);
    });

    it('should show only focus node and connected nodes within depth', () => {
      const { result } = renderHook(() => useFilteredDiagram(mockGraphIR));

      act(() => {
        result.current.setFocusMode('node1', 1);
      });

      // node1 + directly connected (node2, node3)
      expect(result.current.filteredNodes.length).toBeLessThanOrEqual(3);
    });

    it('should exit focus mode', () => {
      const { result } = renderHook(() => useFilteredDiagram(mockGraphIR));

      act(() => {
        result.current.setFocusMode('node1', 1);
      });

      act(() => {
        result.current.exitFocusMode();
      });

      expect(result.current.isFocusMode).toBe(false);
      expect(result.current.filteredNodes).toHaveLength(5);
    });
  });

  describe('filter presets', () => {
    it('should save filter preset', () => {
      const { result } = renderHook(() => useFilteredDiagram(mockGraphIR));

      act(() => {
        result.current.setFilter({ nodeTypes: ['class'] });
        result.current.savePreset('Classes Only');
      });

      expect(result.current.presets).toHaveLength(1);
      expect(result.current.presets[0].name).toBe('Classes Only');
    });

    it('should apply saved preset', () => {
      const { result } = renderHook(() => useFilteredDiagram(mockGraphIR));

      // Set filter first
      act(() => {
        result.current.setFilter({ nodeTypes: ['class'] });
      });

      // Then save preset (in separate act so filter is updated)
      act(() => {
        result.current.savePreset('Classes Only');
      });

      // Clear filter
      act(() => {
        result.current.clearFilter();
      });

      expect(result.current.filteredNodes).toHaveLength(5);

      // Apply preset
      const presetId = result.current.presets[0].id;
      act(() => {
        result.current.applyPreset(presetId);
      });

      expect(result.current.filteredNodes).toHaveLength(3);
    });

    it('should delete preset', () => {
      const { result } = renderHook(() => useFilteredDiagram(mockGraphIR));

      act(() => {
        result.current.setFilter({ nodeTypes: ['class'] });
        result.current.savePreset('Classes Only');
      });

      const presetId = result.current.presets[0].id;
      act(() => {
        result.current.deletePreset(presetId);
      });

      expect(result.current.presets).toHaveLength(0);
    });
  });

  describe('edge filtering', () => {
    it('should only include edges between filtered nodes', () => {
      const { result } = renderHook(() => useFilteredDiagram(mockGraphIR));

      act(() => {
        result.current.setFilter({ pathPatterns: ['src/auth/*'] });
      });

      // Only edges between auth nodes
      result.current.filteredEdges.forEach(edge => {
        const sourceInFiltered = result.current.filteredNodes.some(n => n.id === edge.source);
        const targetInFiltered = result.current.filteredNodes.some(n => n.id === edge.target);
        expect(sourceInFiltered && targetInFiltered).toBe(true);
      });
    });
  });

  describe('clear filter', () => {
    it('should reset all filters', () => {
      const { result } = renderHook(() => useFilteredDiagram(mockGraphIR));

      act(() => {
        result.current.setFilter({ nodeTypes: ['class'], pathPatterns: ['src/auth/*'] });
      });

      expect(result.current.filteredNodes).toHaveLength(1);

      act(() => {
        result.current.clearFilter();
      });

      expect(result.current.filteredNodes).toHaveLength(5);
      expect(result.current.filter).toEqual({});
    });
  });
});

// ============================================================================
// FilterPanel Component Tests
// ============================================================================

describe('FilterPanel', () => {
  const defaultProps = {
    availableNodeTypes: ['class', 'function', 'module'],
    availableTags: ['core', 'deprecated', 'api'],
    filter: {},
    onFilterChange: vi.fn(),
    onFocusModeChange: vi.fn(),
    onClearFilter: vi.fn(),
    presets: [],
    onSavePreset: vi.fn(),
    onApplyPreset: vi.fn(),
    onDeletePreset: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render filter panel', () => {
      render(<FilterPanel {...defaultProps} />);

      expect(screen.getByText(/filter/i)).toBeInTheDocument();
    });

    it('should render node type checkboxes', () => {
      render(<FilterPanel {...defaultProps} />);

      expect(screen.getByRole('checkbox', { name: /class/i })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /function/i })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /module/i })).toBeInTheDocument();
    });

    it('should render path pattern input', () => {
      render(<FilterPanel {...defaultProps} />);

      expect(screen.getByPlaceholderText(/path pattern/i)).toBeInTheDocument();
    });

    it('should render clear filter button', () => {
      render(<FilterPanel {...defaultProps} />);

      expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
    });
  });

  describe('node type filter', () => {
    it('should call onFilterChange when node type is checked', () => {
      const onFilterChange = vi.fn();
      render(<FilterPanel {...defaultProps} onFilterChange={onFilterChange} />);

      fireEvent.click(screen.getByRole('checkbox', { name: /class/i }));

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ nodeTypes: ['class'] })
      );
    });

    it('should uncheck node type when clicked again', () => {
      const onFilterChange = vi.fn();
      render(
        <FilterPanel
          {...defaultProps}
          filter={{ nodeTypes: ['class'] }}
          onFilterChange={onFilterChange}
        />
      );

      fireEvent.click(screen.getByRole('checkbox', { name: /class/i }));

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ nodeTypes: [] })
      );
    });
  });

  describe('path pattern filter', () => {
    it('should call onFilterChange when path pattern is entered', () => {
      const onFilterChange = vi.fn();
      render(<FilterPanel {...defaultProps} onFilterChange={onFilterChange} />);

      const input = screen.getByPlaceholderText(/path pattern/i);
      fireEvent.change(input, { target: { value: 'src/auth/*' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ pathPatterns: ['src/auth/*'] })
      );
    });
  });

  describe('filter chips', () => {
    it('should show active filter as chip', () => {
      render(
        <FilterPanel
          {...defaultProps}
          filter={{ nodeTypes: ['class'] }}
        />
      );

      // Find chip container (has data-chip attribute)
      const chips = document.querySelectorAll('[data-chip]');
      expect(chips.length).toBeGreaterThanOrEqual(1);
      expect(chips[0].textContent).toContain('class');
    });

    it('should remove filter when chip close is clicked', () => {
      const onFilterChange = vi.fn();
      render(
        <FilterPanel
          {...defaultProps}
          filter={{ nodeTypes: ['class', 'function'] }}
          onFilterChange={onFilterChange}
        />
      );

      // Find the first chip's remove button
      const removeButton = screen.getByRole('button', { name: /remove class filter/i });
      fireEvent.click(removeButton);

      expect(onFilterChange).toHaveBeenCalled();
    });
  });

  describe('focus mode', () => {
    it('should render focus mode section', () => {
      render(<FilterPanel {...defaultProps} />);

      expect(screen.getByText(/focus mode/i)).toBeInTheDocument();
    });

    it('should call onFocusModeChange with depth', () => {
      const onFocusModeChange = vi.fn();
      render(<FilterPanel {...defaultProps} onFocusModeChange={onFocusModeChange} />);

      const depthInput = screen.getByLabelText(/depth/i);
      fireEvent.change(depthInput, { target: { value: '2' } });

      expect(onFocusModeChange).toHaveBeenCalledWith(2);
    });
  });

  describe('presets', () => {
    it('should show saved presets', () => {
      render(
        <FilterPanel
          {...defaultProps}
          presets={[{ id: 'preset1', name: 'Classes Only', filter: { nodeTypes: ['class'] } }]}
        />
      );

      expect(screen.getByText('Classes Only')).toBeInTheDocument();
    });

    it('should call onApplyPreset when preset is clicked', () => {
      const onApplyPreset = vi.fn();
      render(
        <FilterPanel
          {...defaultProps}
          presets={[{ id: 'preset1', name: 'Classes Only', filter: { nodeTypes: ['class'] } }]}
          onApplyPreset={onApplyPreset}
        />
      );

      fireEvent.click(screen.getByText('Classes Only'));

      expect(onApplyPreset).toHaveBeenCalledWith('preset1');
    });

    it('should call onSavePreset when save button is clicked', () => {
      const onSavePreset = vi.fn();
      render(<FilterPanel {...defaultProps} onSavePreset={onSavePreset} />);

      const saveButton = screen.getByRole('button', { name: /save preset/i });
      fireEvent.click(saveButton);

      // Should show input for preset name
      const nameInput = screen.getByPlaceholderText(/preset name/i);
      fireEvent.change(nameInput, { target: { value: 'My Filter' } });
      fireEvent.keyDown(nameInput, { key: 'Enter' });

      expect(onSavePreset).toHaveBeenCalledWith('My Filter');
    });
  });

  describe('clear filter', () => {
    it('should call onClearFilter when clear button is clicked', () => {
      const onClearFilter = vi.fn();
      render(
        <FilterPanel
          {...defaultProps}
          filter={{ nodeTypes: ['class'] }}
          onClearFilter={onClearFilter}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /clear/i }));

      expect(onClearFilter).toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should have accessible form controls', () => {
      render(<FilterPanel {...defaultProps} />);

      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach(checkbox => {
        expect(checkbox).toHaveAccessibleName();
      });
    });
  });
});
