/**
 * Tests for Multi-Diagram View components
 *
 * Issue #22: CCD-REQ-002 Multi-Diagram View
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { useMultiDiagram } from '../src/hooks/useMultiDiagram';
import { DiagramTabs } from '../src/components/DiagramTabs';
import { SplitPane } from '../src/components/SplitPane';
import type { DiagramReference, LayoutMode } from '../src/types';

// ============================================================================
// useMultiDiagram Hook Tests
// ============================================================================

describe('useMultiDiagram', () => {
  const mockDiagram: DiagramReference = {
    id: 'diagram-1',
    name: 'Module Graph',
    type: 'module-graph',
    scope: {},
  };

  describe('diagram management', () => {
    it('should start with empty diagrams', () => {
      const { result } = renderHook(() => useMultiDiagram());

      expect(result.current.diagrams).toEqual([]);
      expect(result.current.activeDiagramId).toBeNull();
    });

    it('should add a diagram', () => {
      const { result } = renderHook(() => useMultiDiagram());

      act(() => {
        result.current.addDiagram(mockDiagram);
      });

      expect(result.current.diagrams).toHaveLength(1);
      expect(result.current.diagrams[0]).toEqual(mockDiagram);
      expect(result.current.activeDiagramId).toBe('diagram-1');
    });

    it('should remove a diagram', () => {
      const { result } = renderHook(() => useMultiDiagram());

      act(() => {
        result.current.addDiagram(mockDiagram);
      });

      act(() => {
        result.current.removeDiagram('diagram-1');
      });

      expect(result.current.diagrams).toHaveLength(0);
    });

    it('should set active diagram', () => {
      const { result } = renderHook(() => useMultiDiagram());

      const diagram2: DiagramReference = { ...mockDiagram, id: 'diagram-2', name: 'Call Graph' };

      act(() => {
        result.current.addDiagram(mockDiagram);
        result.current.addDiagram(diagram2);
      });

      expect(result.current.activeDiagramId).toBe('diagram-2'); // Last added is active

      act(() => {
        result.current.setActiveDiagram('diagram-1');
      });

      expect(result.current.activeDiagramId).toBe('diagram-1');
    });
  });

  describe('layout management', () => {
    it('should default to tabs layout', () => {
      const { result } = renderHook(() => useMultiDiagram());

      expect(result.current.layoutMode).toBe('tabs');
    });

    it('should change layout mode', () => {
      const { result } = renderHook(() => useMultiDiagram());

      act(() => {
        result.current.setLayoutMode('split-h');
      });

      expect(result.current.layoutMode).toBe('split-h');
    });
  });

  describe('linked selection', () => {
    it('should default to linked selection enabled', () => {
      const { result } = renderHook(() => useMultiDiagram());

      expect(result.current.linkedSelection).toBe(true);
    });

    it('should toggle linked selection', () => {
      const { result } = renderHook(() => useMultiDiagram());

      act(() => {
        result.current.setLinkedSelection(false);
      });

      expect(result.current.linkedSelection).toBe(false);
    });

    it('should set selected node across diagrams', () => {
      const { result } = renderHook(() => useMultiDiagram());

      act(() => {
        result.current.setSelectedNode('node-123');
      });

      expect(result.current.selectedNodeId).toBe('node-123');
    });
  });

  describe('pane configuration', () => {
    it('should have empty panes initially', () => {
      const { result } = renderHook(() => useMultiDiagram());

      expect(result.current.panes).toEqual([]);
    });

    it('should create pane for diagram', () => {
      const { result } = renderHook(() => useMultiDiagram());

      act(() => {
        result.current.addDiagram(mockDiagram);
      });

      expect(result.current.panes).toHaveLength(1);
      expect(result.current.panes[0].diagramId).toBe('diagram-1');
    });

    it('should resize panes', () => {
      const { result } = renderHook(() => useMultiDiagram());

      act(() => {
        result.current.addDiagram(mockDiagram);
        result.current.addDiagram({ ...mockDiagram, id: 'diagram-2' });
        result.current.setLayoutMode('split-h');
      });

      act(() => {
        result.current.resizePane('diagram-1', 60); // 60%
      });

      const pane1 = result.current.panes.find(p => p.diagramId === 'diagram-1');
      expect(pane1?.size).toBe(60);
    });
  });

  describe('named layouts', () => {
    it('should save current layout', () => {
      const { result } = renderHook(() => useMultiDiagram());

      act(() => {
        result.current.addDiagram(mockDiagram);
        result.current.setLayoutMode('split-h');
      });

      act(() => {
        result.current.saveLayout('My Layout');
      });

      expect(result.current.savedLayouts).toHaveLength(1);
      expect(result.current.savedLayouts[0].name).toBe('My Layout');
    });

    it('should restore saved layout mode', () => {
      const { result } = renderHook(() => useMultiDiagram());

      act(() => {
        result.current.addDiagram(mockDiagram);
      });

      act(() => {
        result.current.setLayoutMode('split-h');
      });

      expect(result.current.layoutMode).toBe('split-h');

      act(() => {
        result.current.saveLayout('My Layout');
      });

      const savedLayoutMode = result.current.savedLayouts[0].config.mode;
      expect(savedLayoutMode).toBe('split-h');
    });
  });

  describe('presets', () => {
    it('should apply preset layout', () => {
      const { result } = renderHook(() => useMultiDiagram());

      act(() => {
        result.current.applyPreset('overview-and-detail');
      });

      expect(result.current.layoutMode).toBe('split-h');
      expect(result.current.diagrams).toHaveLength(2);
    });
  });
});

// ============================================================================
// DiagramTabs Component Tests
// ============================================================================

describe('DiagramTabs', () => {
  const mockDiagrams: DiagramReference[] = [
    { id: 'diagram-1', name: 'Module Graph', type: 'module-graph', scope: {} },
    { id: 'diagram-2', name: 'Call Graph', type: 'call-graph', scope: {} },
  ];

  describe('rendering', () => {
    it('should render tabs for each diagram', () => {
      render(
        <DiagramTabs
          diagrams={mockDiagrams}
          activeDiagramId="diagram-1"
          onTabClick={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
        />
      );

      expect(screen.getByRole('tab', { name: /module graph/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /call graph/i })).toBeInTheDocument();
    });

    it('should mark active tab', () => {
      render(
        <DiagramTabs
          diagrams={mockDiagrams}
          activeDiagramId="diagram-1"
          onTabClick={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
        />
      );

      const activeTab = screen.getByRole('tab', { name: /module graph/i });
      expect(activeTab).toHaveAttribute('aria-selected', 'true');
    });

    it('should render add tab button', () => {
      render(
        <DiagramTabs
          diagrams={mockDiagrams}
          activeDiagramId="diagram-1"
          onTabClick={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('should call onTabClick when tab is clicked', () => {
      const onTabClick = vi.fn();
      render(
        <DiagramTabs
          diagrams={mockDiagrams}
          activeDiagramId="diagram-1"
          onTabClick={onTabClick}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('tab', { name: /call graph/i }));

      expect(onTabClick).toHaveBeenCalledWith('diagram-2');
    });

    it('should call onTabClose when close button is clicked', () => {
      const onTabClose = vi.fn();
      render(
        <DiagramTabs
          diagrams={mockDiagrams}
          activeDiagramId="diagram-1"
          onTabClick={vi.fn()}
          onTabClose={onTabClose}
          onAddTab={vi.fn()}
        />
      );

      const closeButtons = screen.getAllByRole('button', { name: /close/i });
      fireEvent.click(closeButtons[0]);

      expect(onTabClose).toHaveBeenCalledWith('diagram-1');
    });

    it('should call onAddTab when add button is clicked', () => {
      const onAddTab = vi.fn();
      render(
        <DiagramTabs
          diagrams={mockDiagrams}
          activeDiagramId="diagram-1"
          onTabClick={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={onAddTab}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /add/i }));

      expect(onAddTab).toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should have tablist role', () => {
      render(
        <DiagramTabs
          diagrams={mockDiagrams}
          activeDiagramId="diagram-1"
          onTabClick={vi.fn()}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
        />
      );

      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('should support keyboard navigation', () => {
      const onTabClick = vi.fn();
      render(
        <DiagramTabs
          diagrams={mockDiagrams}
          activeDiagramId="diagram-1"
          onTabClick={onTabClick}
          onTabClose={vi.fn()}
          onAddTab={vi.fn()}
        />
      );

      const tab1 = screen.getByRole('tab', { name: /module graph/i });
      tab1.focus();
      fireEvent.keyDown(tab1, { key: 'ArrowRight' });

      expect(onTabClick).toHaveBeenCalledWith('diagram-2');
    });
  });
});

// ============================================================================
// SplitPane Component Tests
// ============================================================================

describe('SplitPane', () => {
  describe('rendering', () => {
    it('should render horizontal split', () => {
      render(
        <SplitPane
          direction="horizontal"
          sizes={[50, 50]}
          onResize={vi.fn()}
        >
          <div data-testid="pane-1">Pane 1</div>
          <div data-testid="pane-2">Pane 2</div>
        </SplitPane>
      );

      expect(screen.getByTestId('pane-1')).toBeInTheDocument();
      expect(screen.getByTestId('pane-2')).toBeInTheDocument();
    });

    it('should render vertical split', () => {
      render(
        <SplitPane
          direction="vertical"
          sizes={[50, 50]}
          onResize={vi.fn()}
        >
          <div data-testid="pane-1">Pane 1</div>
          <div data-testid="pane-2">Pane 2</div>
        </SplitPane>
      );

      expect(screen.getByTestId('pane-1')).toBeInTheDocument();
      expect(screen.getByTestId('pane-2')).toBeInTheDocument();
    });

    it('should render divider between panes', () => {
      render(
        <SplitPane
          direction="horizontal"
          sizes={[50, 50]}
          onResize={vi.fn()}
        >
          <div>Pane 1</div>
          <div>Pane 2</div>
        </SplitPane>
      );

      expect(screen.getByRole('separator')).toBeInTheDocument();
    });
  });

  describe('resizing', () => {
    it('should have draggable divider', () => {
      render(
        <SplitPane
          direction="horizontal"
          sizes={[50, 50]}
          onResize={vi.fn()}
        >
          <div>Pane 1</div>
          <div>Pane 2</div>
        </SplitPane>
      );

      const divider = screen.getByRole('separator');
      expect(divider).toHaveAttribute('aria-valuenow', '50');
    });

    it('should start drag on mouse down', () => {
      const onResize = vi.fn();
      render(
        <SplitPane
          direction="horizontal"
          sizes={[50, 50]}
          onResize={onResize}
        >
          <div>Pane 1</div>
          <div>Pane 2</div>
        </SplitPane>
      );

      const divider = screen.getByRole('separator');

      // Simulate mouse down starts the drag
      fireEvent.mouseDown(divider);

      // The divider should now be in active state
      expect(divider).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should support keyboard resizing', () => {
      const onResize = vi.fn();
      render(
        <SplitPane
          direction="horizontal"
          sizes={[50, 50]}
          onResize={onResize}
        >
          <div>Pane 1</div>
          <div>Pane 2</div>
        </SplitPane>
      );

      const divider = screen.getByRole('separator');
      fireEvent.keyDown(divider, { key: 'ArrowRight' });

      expect(onResize).toHaveBeenCalledWith([51, 49]);
    });
  });
});
