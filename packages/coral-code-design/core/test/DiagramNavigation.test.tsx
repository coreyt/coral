/**
 * Tests for Diagram Types and Navigation
 *
 * Issue #28: CCD-REQ-003 Diagram Types (C4-Inspired)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { useDiagramNavigation } from '../src/hooks/useDiagramNavigation';
import { Breadcrumbs } from '../src/components/Breadcrumbs';
import { DiagramTypeSelector } from '../src/components/DiagramTypeSelector';
import type { DiagramScope } from '../src/hooks/useDiagramNavigation';

// ============================================================================
// Mock Data
// ============================================================================

const mockScopes: DiagramScope[] = [
  { type: 'codebase-overview', label: 'Codebase', path: '/' },
  { type: 'module-graph', label: 'packages/viz', path: '/packages/viz' },
  { type: 'component-detail', label: 'DiagramRenderer', path: '/packages/viz/src/components/DiagramRenderer' },
];

// ============================================================================
// useDiagramNavigation Hook Tests
// ============================================================================

describe('useDiagramNavigation', () => {
  describe('initial state', () => {
    it('should start with empty history', () => {
      const { result } = renderHook(() => useDiagramNavigation());

      expect(result.current.history).toEqual([]);
      expect(result.current.currentScope).toBeNull();
    });

    it('should accept initial scope', () => {
      const initialScope: DiagramScope = { type: 'module-graph', label: 'Root', path: '/' };
      const { result } = renderHook(() => useDiagramNavigation({ initialScope }));

      expect(result.current.history).toHaveLength(1);
      expect(result.current.currentScope).toEqual(initialScope);
    });
  });

  describe('navigation', () => {
    it('should navigate to new scope (drill down)', () => {
      const { result } = renderHook(() => useDiagramNavigation());

      act(() => {
        result.current.navigateTo(mockScopes[0]);
      });

      expect(result.current.history).toHaveLength(1);
      expect(result.current.currentScope).toEqual(mockScopes[0]);

      act(() => {
        result.current.navigateTo(mockScopes[1]);
      });

      expect(result.current.history).toHaveLength(2);
      expect(result.current.currentScope).toEqual(mockScopes[1]);
    });

    it('should go back in history', () => {
      const { result } = renderHook(() => useDiagramNavigation());

      act(() => {
        result.current.navigateTo(mockScopes[0]);
      });

      act(() => {
        result.current.navigateTo(mockScopes[1]);
      });

      act(() => {
        result.current.goBack();
      });

      expect(result.current.currentScope).toEqual(mockScopes[0]);
      expect(result.current.canGoBack).toBe(false);
      expect(result.current.canGoForward).toBe(true);
    });

    it('should go forward in history', () => {
      const { result } = renderHook(() => useDiagramNavigation());

      act(() => {
        result.current.navigateTo(mockScopes[0]);
      });

      act(() => {
        result.current.navigateTo(mockScopes[1]);
      });

      act(() => {
        result.current.goBack();
      });

      act(() => {
        result.current.goForward();
      });

      expect(result.current.currentScope).toEqual(mockScopes[1]);
      expect(result.current.canGoForward).toBe(false);
    });

    it('should clear forward history when navigating to new scope', () => {
      const { result } = renderHook(() => useDiagramNavigation());

      act(() => {
        result.current.navigateTo(mockScopes[0]);
      });

      act(() => {
        result.current.navigateTo(mockScopes[1]);
      });

      act(() => {
        result.current.goBack();
      });

      expect(result.current.canGoForward).toBe(true);

      act(() => {
        result.current.navigateTo(mockScopes[2]);
      });

      expect(result.current.canGoForward).toBe(false);
      expect(result.current.history).toHaveLength(2);
    });

    it('should navigate to specific history index', () => {
      const { result } = renderHook(() => useDiagramNavigation());

      act(() => {
        result.current.navigateTo(mockScopes[0]);
      });

      act(() => {
        result.current.navigateTo(mockScopes[1]);
      });

      act(() => {
        result.current.navigateTo(mockScopes[2]);
      });

      act(() => {
        result.current.navigateToIndex(0);
      });

      expect(result.current.currentScope).toEqual(mockScopes[0]);
      expect(result.current.currentIndex).toBe(0);
    });
  });

  describe('drill down helpers', () => {
    it('should provide drillDown function', () => {
      const { result } = renderHook(() => useDiagramNavigation());

      act(() => {
        result.current.navigateTo({ type: 'module-graph', label: 'Root', path: '/' });
      });

      act(() => {
        result.current.drillDown('AuthService', 'component-detail', '/src/auth/AuthService');
      });

      expect(result.current.currentScope?.type).toBe('component-detail');
      expect(result.current.currentScope?.label).toBe('AuthService');
    });

    it('should provide drillUp function', () => {
      const { result } = renderHook(() => useDiagramNavigation());

      act(() => {
        result.current.navigateTo(mockScopes[0]);
      });

      act(() => {
        result.current.navigateTo(mockScopes[1]);
      });

      act(() => {
        result.current.navigateTo(mockScopes[2]);
      });

      act(() => {
        result.current.drillUp();
      });

      expect(result.current.currentScope).toEqual(mockScopes[1]);
    });
  });

  describe('diagram types', () => {
    it('should track current diagram type', () => {
      const { result } = renderHook(() => useDiagramNavigation());

      act(() => {
        result.current.navigateTo({ type: 'call-graph', label: 'Function', path: '/fn' });
      });

      expect(result.current.currentType).toBe('call-graph');
    });

    it('should suggest next drill-down type', () => {
      const { result } = renderHook(() => useDiagramNavigation());

      act(() => {
        result.current.navigateTo({ type: 'codebase-overview', label: 'Root', path: '/' });
      });

      expect(result.current.suggestedDrillDownType).toBe('module-graph');

      act(() => {
        result.current.navigateTo({ type: 'module-graph', label: 'Module', path: '/m' });
      });

      expect(result.current.suggestedDrillDownType).toBe('component-detail');
    });
  });

  describe('reset', () => {
    it('should reset navigation state', () => {
      const { result } = renderHook(() => useDiagramNavigation());

      act(() => {
        result.current.navigateTo(mockScopes[0]);
        result.current.navigateTo(mockScopes[1]);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.history).toEqual([]);
      expect(result.current.currentScope).toBeNull();
    });
  });
});

// ============================================================================
// Breadcrumbs Component Tests
// ============================================================================

describe('Breadcrumbs', () => {
  describe('rendering', () => {
    it('should render nothing when history is empty', () => {
      const { container } = render(
        <Breadcrumbs history={[]} currentIndex={-1} onNavigate={vi.fn()} />
      );

      expect(container.textContent).toBe('');
    });

    it('should render breadcrumb items', () => {
      render(
        <Breadcrumbs history={mockScopes} currentIndex={2} onNavigate={vi.fn()} />
      );

      expect(screen.getByText('Codebase')).toBeInTheDocument();
      expect(screen.getByText('packages/viz')).toBeInTheDocument();
      expect(screen.getByText('DiagramRenderer')).toBeInTheDocument();
    });

    it('should mark current item as active', () => {
      render(
        <Breadcrumbs history={mockScopes} currentIndex={1} onNavigate={vi.fn()} />
      );

      const currentItem = screen.getByText('packages/viz');
      expect(currentItem).toHaveAttribute('aria-current', 'page');
    });

    it('should render separators between items', () => {
      render(
        <Breadcrumbs history={mockScopes} currentIndex={2} onNavigate={vi.fn()} />
      );

      const separators = screen.getAllByText('/');
      expect(separators.length).toBe(2);
    });
  });

  describe('interactions', () => {
    it('should call onNavigate when breadcrumb is clicked', () => {
      const onNavigate = vi.fn();
      render(
        <Breadcrumbs history={mockScopes} currentIndex={2} onNavigate={onNavigate} />
      );

      fireEvent.click(screen.getByText('Codebase'));

      expect(onNavigate).toHaveBeenCalledWith(0);
    });

    it('should not call onNavigate for current item', () => {
      const onNavigate = vi.fn();
      render(
        <Breadcrumbs history={mockScopes} currentIndex={2} onNavigate={onNavigate} />
      );

      fireEvent.click(screen.getByText('DiagramRenderer'));

      expect(onNavigate).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should have navigation landmark', () => {
      render(
        <Breadcrumbs history={mockScopes} currentIndex={2} onNavigate={vi.fn()} />
      );

      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('should have breadcrumb list', () => {
      render(
        <Breadcrumbs history={mockScopes} currentIndex={2} onNavigate={vi.fn()} />
      );

      expect(screen.getByRole('list')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// DiagramTypeSelector Component Tests
// ============================================================================

describe('DiagramTypeSelector', () => {
  const allTypes = [
    'codebase-overview',
    'module-graph',
    'component-detail',
    'call-graph',
    'dependency-graph',
    'inheritance-tree',
  ];

  describe('rendering', () => {
    it('should render type selector', () => {
      render(
        <DiagramTypeSelector
          currentType="module-graph"
          availableTypes={allTypes}
          onTypeChange={vi.fn()}
        />
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('should show current type as selected', () => {
      render(
        <DiagramTypeSelector
          currentType="call-graph"
          availableTypes={allTypes}
          onTypeChange={vi.fn()}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toHaveValue('call-graph');
    });

    it('should render all available types as options', () => {
      render(
        <DiagramTypeSelector
          currentType="module-graph"
          availableTypes={allTypes}
          onTypeChange={vi.fn()}
        />
      );

      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(allTypes.length);
    });

    it('should display human-readable labels', () => {
      render(
        <DiagramTypeSelector
          currentType="module-graph"
          availableTypes={['module-graph', 'call-graph']}
          onTypeChange={vi.fn()}
        />
      );

      expect(screen.getByText('Module Graph')).toBeInTheDocument();
      expect(screen.getByText('Call Graph')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('should call onTypeChange when selection changes', () => {
      const onTypeChange = vi.fn();
      render(
        <DiagramTypeSelector
          currentType="module-graph"
          availableTypes={allTypes}
          onTypeChange={onTypeChange}
        />
      );

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'call-graph' } });

      expect(onTypeChange).toHaveBeenCalledWith('call-graph');
    });
  });

  describe('disabled state', () => {
    it('should disable selector when disabled prop is true', () => {
      render(
        <DiagramTypeSelector
          currentType="module-graph"
          availableTypes={allTypes}
          onTypeChange={vi.fn()}
          disabled={true}
        />
      );

      expect(screen.getByRole('combobox')).toBeDisabled();
    });
  });

  describe('compact variant', () => {
    it('should render compact variant with icons only', () => {
      render(
        <DiagramTypeSelector
          currentType="module-graph"
          availableTypes={allTypes}
          onTypeChange={vi.fn()}
          variant="compact"
        />
      );

      // In compact mode, should use buttons instead of select
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should highlight current type in compact mode', () => {
      render(
        <DiagramTypeSelector
          currentType="module-graph"
          availableTypes={['module-graph', 'call-graph']}
          onTypeChange={vi.fn()}
          variant="compact"
        />
      );

      const activeButton = screen.getByRole('button', { pressed: true });
      expect(activeButton).toBeInTheDocument();
    });
  });
});
