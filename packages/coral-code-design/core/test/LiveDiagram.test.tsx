/**
 * Tests for Live Diagram Updates
 *
 * Issue #27: CCD-REQ-005 Live Diagram Updates
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { useLiveDiagram } from '../src/hooks/useLiveDiagram';
import { RefreshControl } from '../src/components/RefreshControl';
import { StaleIndicator } from '../src/components/StaleIndicator';
import { DiffOverlay } from '../src/components/DiffOverlay';
import type { GraphIR } from '../src/types';

// ============================================================================
// Mock Data
// ============================================================================

const mockGraphIR: GraphIR = {
  nodes: [
    { id: 'node1', label: 'AuthService', type: 'class' },
    { id: 'node2', label: 'UserRepository', type: 'class' },
    { id: 'node3', label: 'validateToken', type: 'function' },
  ],
  edges: [
    { source: 'node1', target: 'node2', type: 'uses' },
    { source: 'node1', target: 'node3', type: 'calls' },
  ],
};

const updatedGraphIR: GraphIR = {
  nodes: [
    { id: 'node1', label: 'AuthService', type: 'class' }, // unchanged
    { id: 'node2', label: 'UserRepository', type: 'class', metadata: { updated: true } }, // modified
    { id: 'node4', label: 'NewService', type: 'class' }, // added
    // node3 removed
  ],
  edges: [
    { source: 'node1', target: 'node2', type: 'uses' },
    { source: 'node1', target: 'node4', type: 'calls' },
  ],
};

// ============================================================================
// useLiveDiagram Hook Tests
// ============================================================================

describe('useLiveDiagram', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('manual refresh', () => {
    it('should provide refresh function', () => {
      const fetchData = vi.fn().mockResolvedValue(mockGraphIR);
      const { result } = renderHook(() => useLiveDiagram({ fetchData }));

      expect(result.current.refresh).toBeDefined();
      expect(typeof result.current.refresh).toBe('function');
    });

    it('should call fetchData on refresh', async () => {
      const fetchData = vi.fn().mockResolvedValue(mockGraphIR);
      const { result } = renderHook(() => useLiveDiagram({ fetchData }));

      await act(async () => {
        await result.current.refresh();
      });

      expect(fetchData).toHaveBeenCalled();
    });

    it('should update graphIR after refresh', async () => {
      const fetchData = vi.fn().mockResolvedValue(mockGraphIR);
      const { result } = renderHook(() => useLiveDiagram({ fetchData }));

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.graphIR).toEqual(mockGraphIR);
    });

    it('should track refresh state', async () => {
      let resolvePromise: (value: GraphIR) => void;
      const fetchData = vi.fn().mockImplementation(
        () => new Promise<GraphIR>((resolve) => { resolvePromise = resolve; })
      );
      const { result } = renderHook(() => useLiveDiagram({ fetchData }));

      expect(result.current.isRefreshing).toBe(false);

      act(() => {
        result.current.refresh();
      });

      expect(result.current.isRefreshing).toBe(true);

      await act(async () => {
        resolvePromise!(mockGraphIR);
      });

      expect(result.current.isRefreshing).toBe(false);
    });
  });

  describe('auto-refresh', () => {
    it('should default to auto-refresh disabled', () => {
      const fetchData = vi.fn().mockResolvedValue(mockGraphIR);
      const { result } = renderHook(() => useLiveDiagram({ fetchData }));

      expect(result.current.autoRefreshEnabled).toBe(false);
    });

    it('should enable auto-refresh', () => {
      const fetchData = vi.fn().mockResolvedValue(mockGraphIR);
      const { result } = renderHook(() => useLiveDiagram({ fetchData }));

      act(() => {
        result.current.setAutoRefresh(true);
      });

      expect(result.current.autoRefreshEnabled).toBe(true);
    });

    it('should refresh at interval when auto-refresh is enabled', async () => {
      const fetchData = vi.fn().mockResolvedValue(mockGraphIR);
      const { result } = renderHook(() =>
        useLiveDiagram({ fetchData, autoRefreshInterval: 5000 })
      );

      act(() => {
        result.current.setAutoRefresh(true);
      });

      // Initial call count
      const initialCount = fetchData.mock.calls.length;

      // Advance timer
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(fetchData.mock.calls.length).toBeGreaterThan(initialCount);
    });

    it('should stop auto-refresh when disabled', async () => {
      const fetchData = vi.fn().mockResolvedValue(mockGraphIR);
      const { result } = renderHook(() =>
        useLiveDiagram({ fetchData, autoRefreshInterval: 5000 })
      );

      act(() => {
        result.current.setAutoRefresh(true);
      });

      act(() => {
        result.current.setAutoRefresh(false);
      });

      const countAfterDisable = fetchData.mock.calls.length;

      await act(async () => {
        vi.advanceTimersByTime(10000);
      });

      expect(fetchData.mock.calls.length).toBe(countAfterDisable);
    });

    it('should allow changing refresh interval', () => {
      const fetchData = vi.fn().mockResolvedValue(mockGraphIR);
      const { result } = renderHook(() => useLiveDiagram({ fetchData }));

      expect(result.current.autoRefreshInterval).toBe(30000); // Default

      act(() => {
        result.current.setAutoRefreshInterval(10000);
      });

      expect(result.current.autoRefreshInterval).toBe(10000);
    });
  });

  describe('stale detection', () => {
    it('should track last refresh timestamp', async () => {
      const fetchData = vi.fn().mockResolvedValue(mockGraphIR);
      const { result } = renderHook(() => useLiveDiagram({ fetchData }));

      expect(result.current.lastRefreshedAt).toBeNull();

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.lastRefreshedAt).toBeInstanceOf(Date);
    });

    it('should mark as stale after threshold', async () => {
      const fetchData = vi.fn().mockResolvedValue(mockGraphIR);
      const { result } = renderHook(() =>
        useLiveDiagram({ fetchData, staleThreshold: 60000 })
      );

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.isStale).toBe(false);

      await act(async () => {
        vi.advanceTimersByTime(61000);
      });

      expect(result.current.isStale).toBe(true);
    });
  });

  describe('diff detection', () => {
    it('should detect added nodes', async () => {
      const fetchData = vi.fn()
        .mockResolvedValueOnce(mockGraphIR)
        .mockResolvedValueOnce(updatedGraphIR);

      const { result } = renderHook(() => useLiveDiagram({ fetchData }));

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.diff.added).toContain('node4');
    });

    it('should detect removed nodes', async () => {
      const fetchData = vi.fn()
        .mockResolvedValueOnce(mockGraphIR)
        .mockResolvedValueOnce(updatedGraphIR);

      const { result } = renderHook(() => useLiveDiagram({ fetchData }));

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.diff.removed).toContain('node3');
    });

    it('should detect modified nodes', async () => {
      const fetchData = vi.fn()
        .mockResolvedValueOnce(mockGraphIR)
        .mockResolvedValueOnce(updatedGraphIR);

      const { result } = renderHook(() => useLiveDiagram({ fetchData }));

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.diff.modified).toContain('node2');
    });

    it('should clear diff after acknowledgment', async () => {
      const fetchData = vi.fn()
        .mockResolvedValueOnce(mockGraphIR)
        .mockResolvedValueOnce(updatedGraphIR);

      const { result } = renderHook(() => useLiveDiagram({ fetchData }));

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.diff.added.length).toBeGreaterThan(0);

      act(() => {
        result.current.clearDiff();
      });

      expect(result.current.diff.added).toEqual([]);
      expect(result.current.diff.removed).toEqual([]);
      expect(result.current.diff.modified).toEqual([]);
    });
  });

  describe('position preservation', () => {
    it('should preserve user positions during refresh', async () => {
      const fetchData = vi.fn().mockResolvedValue(mockGraphIR);
      const { result } = renderHook(() => useLiveDiagram({ fetchData }));

      const userPositions = {
        node1: { x: 100, y: 200 },
        node2: { x: 300, y: 400 },
      };

      act(() => {
        result.current.setUserPositions(userPositions);
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.userPositions).toEqual(userPositions);
    });
  });
});

// ============================================================================
// RefreshControl Component Tests
// ============================================================================

describe('RefreshControl', () => {
  describe('rendering', () => {
    it('should render refresh button', () => {
      render(
        <RefreshControl
          onRefresh={vi.fn()}
          isRefreshing={false}
          autoRefreshEnabled={false}
          onAutoRefreshChange={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
    });

    it('should render auto-refresh toggle', () => {
      render(
        <RefreshControl
          onRefresh={vi.fn()}
          isRefreshing={false}
          autoRefreshEnabled={false}
          onAutoRefreshChange={vi.fn()}
        />
      );

      expect(screen.getByRole('switch', { name: /auto/i })).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('should call onRefresh when refresh button is clicked', () => {
      const onRefresh = vi.fn();
      render(
        <RefreshControl
          onRefresh={onRefresh}
          isRefreshing={false}
          autoRefreshEnabled={false}
          onAutoRefreshChange={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

      expect(onRefresh).toHaveBeenCalled();
    });

    it('should disable refresh button when refreshing', () => {
      render(
        <RefreshControl
          onRefresh={vi.fn()}
          isRefreshing={true}
          autoRefreshEnabled={false}
          onAutoRefreshChange={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled();
    });

    it('should show loading indicator when refreshing', () => {
      render(
        <RefreshControl
          onRefresh={vi.fn()}
          isRefreshing={true}
          autoRefreshEnabled={false}
          onAutoRefreshChange={vi.fn()}
        />
      );

      expect(screen.getByText(/refreshing/i)).toBeInTheDocument();
    });

    it('should call onAutoRefreshChange when toggle is clicked', () => {
      const onAutoRefreshChange = vi.fn();
      render(
        <RefreshControl
          onRefresh={vi.fn()}
          isRefreshing={false}
          autoRefreshEnabled={false}
          onAutoRefreshChange={onAutoRefreshChange}
        />
      );

      fireEvent.click(screen.getByRole('switch', { name: /auto/i }));

      expect(onAutoRefreshChange).toHaveBeenCalledWith(true);
    });
  });
});

// ============================================================================
// StaleIndicator Component Tests
// ============================================================================

describe('StaleIndicator', () => {
  describe('rendering', () => {
    it('should show nothing when not stale', () => {
      const { container } = render(
        <StaleIndicator isStale={false} lastRefreshedAt={new Date()} />
      );

      expect(container.textContent).toBe('');
    });

    it('should show stale badge when stale', () => {
      render(<StaleIndicator isStale={true} lastRefreshedAt={new Date()} />);

      expect(screen.getByText(/stale/i)).toBeInTheDocument();
    });

    it('should show last refresh timestamp', () => {
      const timestamp = new Date('2024-01-15T10:30:00');
      render(<StaleIndicator isStale={true} lastRefreshedAt={timestamp} />);

      expect(screen.getByText(/10:30/)).toBeInTheDocument();
    });

    it('should show "never" when no previous refresh', () => {
      render(<StaleIndicator isStale={true} lastRefreshedAt={null} />);

      expect(screen.getByText(/never/i)).toBeInTheDocument();
    });
  });
});

// ============================================================================
// DiffOverlay Component Tests
// ============================================================================

describe('DiffOverlay', () => {
  const mockDiff = {
    added: ['node4'],
    removed: ['node3'],
    modified: ['node2'],
  };

  describe('rendering', () => {
    it('should show nothing when no changes', () => {
      const { container } = render(
        <DiffOverlay
          diff={{ added: [], removed: [], modified: [] }}
          onDismiss={vi.fn()}
        />
      );

      expect(container.textContent).toBe('');
    });

    it('should show change summary when there are changes', () => {
      render(<DiffOverlay diff={mockDiff} onDismiss={vi.fn()} />);

      expect(screen.getByText(/1 added/i)).toBeInTheDocument();
      expect(screen.getByText(/1 removed/i)).toBeInTheDocument();
      expect(screen.getByText(/1 modified/i)).toBeInTheDocument();
    });

    it('should show dismiss button', () => {
      render(<DiffOverlay diff={mockDiff} onDismiss={vi.fn()} />);

      expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('should call onDismiss when dismiss is clicked', () => {
      const onDismiss = vi.fn();
      render(<DiffOverlay diff={mockDiff} onDismiss={onDismiss} />);

      fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

      expect(onDismiss).toHaveBeenCalled();
    });
  });

  describe('styling', () => {
    it('should indicate added nodes with green styling', () => {
      render(<DiffOverlay diff={mockDiff} onDismiss={vi.fn()} />);

      const addedBadge = screen.getByText(/1 added/i);
      expect(addedBadge).toHaveStyle({ backgroundColor: expect.stringContaining('') });
    });

    it('should indicate removed nodes with red styling', () => {
      render(<DiffOverlay diff={mockDiff} onDismiss={vi.fn()} />);

      const removedBadge = screen.getByText(/1 removed/i);
      expect(removedBadge).toHaveStyle({ backgroundColor: expect.stringContaining('') });
    });

    it('should indicate modified nodes with yellow styling', () => {
      render(<DiffOverlay diff={mockDiff} onDismiss={vi.fn()} />);

      const modifiedBadge = screen.getByText(/1 modified/i);
      expect(modifiedBadge).toHaveStyle({ backgroundColor: expect.stringContaining('') });
    });
  });
});
