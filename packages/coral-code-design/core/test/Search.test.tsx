/**
 * Tests for Search and Discovery
 *
 * Issue #29: CCD-REQ-008 Search and Discovery
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { useSearch } from '../src/hooks/useSearch';
import { SearchDialog } from '../src/components/SearchDialog';
import { SearchResults } from '../src/components/SearchResults';

// ============================================================================
// Mock Data
// ============================================================================

const mockSearchResults = [
  {
    id: 'result-1',
    symbolId: 'AuthService',
    name: 'AuthService',
    type: 'class',
    file: 'src/auth/AuthService.ts',
    line: 10,
    preview: 'export class AuthService {',
  },
  {
    id: 'result-2',
    symbolId: 'validateToken',
    name: 'validateToken',
    type: 'function',
    file: 'src/auth/validate.ts',
    line: 25,
    preview: 'export function validateToken(token: string): boolean {',
  },
  {
    id: 'result-3',
    symbolId: 'UserRepository',
    name: 'UserRepository',
    type: 'class',
    file: 'src/user/UserRepository.ts',
    line: 5,
    preview: 'export class UserRepository {',
  },
];

// ============================================================================
// useSearch Hook Tests
// ============================================================================

describe('useSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic search', () => {
    it('should start with empty state', () => {
      const searchFn = vi.fn().mockResolvedValue([]);
      const { result } = renderHook(() => useSearch({ searchFn }));

      expect(result.current.query).toBe('');
      expect(result.current.results).toEqual([]);
      expect(result.current.isSearching).toBe(false);
    });

    it('should update query', () => {
      const searchFn = vi.fn().mockResolvedValue([]);
      const { result } = renderHook(() => useSearch({ searchFn }));

      act(() => {
        result.current.setQuery('Auth');
      });

      expect(result.current.query).toBe('Auth');
    });

    it('should debounce search', async () => {
      const searchFn = vi.fn().mockResolvedValue(mockSearchResults);
      const { result } = renderHook(() => useSearch({ searchFn, debounceMs: 300 }));

      act(() => {
        result.current.setQuery('Auth');
      });

      expect(searchFn).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(searchFn).toHaveBeenCalledWith('Auth');
    });

    it('should return search results', async () => {
      const searchFn = vi.fn().mockResolvedValue(mockSearchResults);
      const { result } = renderHook(() => useSearch({ searchFn, debounceMs: 0 }));

      await act(async () => {
        result.current.setQuery('Auth');
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.results).toEqual(mockSearchResults);
    });

    it('should track searching state', async () => {
      let resolveSearch: (value: typeof mockSearchResults) => void;
      const searchFn = vi.fn().mockImplementation(
        () => new Promise((resolve) => { resolveSearch = resolve; })
      );
      const { result } = renderHook(() => useSearch({ searchFn, debounceMs: 0 }));

      act(() => {
        result.current.setQuery('Auth');
      });

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      expect(result.current.isSearching).toBe(true);

      await act(async () => {
        resolveSearch!(mockSearchResults);
      });

      expect(result.current.isSearching).toBe(false);
    });
  });

  describe('search history', () => {
    it('should track recent searches', async () => {
      const searchFn = vi.fn().mockResolvedValue(mockSearchResults);
      const { result } = renderHook(() => useSearch({ searchFn, debounceMs: 0 }));

      await act(async () => {
        result.current.setQuery('Auth');
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.results.length).toBeGreaterThan(0);

      act(() => {
        result.current.addToHistory('Auth');
      });

      expect(result.current.recentSearches).toContain('Auth');
    });

    it('should limit history size', () => {
      const searchFn = vi.fn().mockResolvedValue([]);
      const { result } = renderHook(() => useSearch({ searchFn, maxHistory: 3 }));

      act(() => {
        result.current.addToHistory('search1');
        result.current.addToHistory('search2');
        result.current.addToHistory('search3');
        result.current.addToHistory('search4');
      });

      expect(result.current.recentSearches).toHaveLength(3);
      expect(result.current.recentSearches).not.toContain('search1');
    });

    it('should clear history', () => {
      const searchFn = vi.fn().mockResolvedValue([]);
      const { result } = renderHook(() => useSearch({ searchFn }));

      act(() => {
        result.current.addToHistory('search1');
        result.current.addToHistory('search2');
      });

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.recentSearches).toEqual([]);
    });
  });

  describe('selected result', () => {
    it('should track selected result index', () => {
      const searchFn = vi.fn().mockResolvedValue(mockSearchResults);
      const { result } = renderHook(() => useSearch({ searchFn }));

      expect(result.current.selectedIndex).toBe(-1);

      act(() => {
        result.current.setSelectedIndex(0);
      });

      expect(result.current.selectedIndex).toBe(0);
    });

    it('should move selection down', async () => {
      const searchFn = vi.fn().mockResolvedValue(mockSearchResults);
      const { result } = renderHook(() => useSearch({ searchFn, debounceMs: 0 }));

      await act(async () => {
        result.current.setQuery('Auth');
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.results.length).toBeGreaterThan(0);

      act(() => {
        result.current.moveSelectionDown();
      });

      expect(result.current.selectedIndex).toBe(0);

      act(() => {
        result.current.moveSelectionDown();
      });

      expect(result.current.selectedIndex).toBe(1);
    });

    it('should move selection up', async () => {
      const searchFn = vi.fn().mockResolvedValue(mockSearchResults);
      const { result } = renderHook(() => useSearch({ searchFn, debounceMs: 0 }));

      await act(async () => {
        result.current.setQuery('Auth');
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.results.length).toBeGreaterThan(0);

      act(() => {
        result.current.setSelectedIndex(2);
      });

      act(() => {
        result.current.moveSelectionUp();
      });

      expect(result.current.selectedIndex).toBe(1);
    });

    it('should wrap selection', async () => {
      const searchFn = vi.fn().mockResolvedValue(mockSearchResults);
      const { result } = renderHook(() => useSearch({ searchFn, debounceMs: 0 }));

      await act(async () => {
        result.current.setQuery('Auth');
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.results.length).toBeGreaterThan(0);

      act(() => {
        result.current.setSelectedIndex(2);
      });

      act(() => {
        result.current.moveSelectionDown();
      });

      expect(result.current.selectedIndex).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear search state', async () => {
      const searchFn = vi.fn().mockResolvedValue(mockSearchResults);
      const { result } = renderHook(() => useSearch({ searchFn, debounceMs: 0 }));

      await act(async () => {
        result.current.setQuery('Auth');
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(result.current.results.length).toBeGreaterThan(0);

      act(() => {
        result.current.clear();
      });

      expect(result.current.query).toBe('');
      expect(result.current.results).toEqual([]);
      expect(result.current.selectedIndex).toBe(-1);
    });
  });
});

// ============================================================================
// SearchDialog Component Tests
// ============================================================================

describe('SearchDialog', () => {
  describe('rendering', () => {
    it('should not render when closed', () => {
      const { container } = render(
        <SearchDialog
          isOpen={false}
          onClose={vi.fn()}
          onSelect={vi.fn()}
          searchFn={vi.fn().mockResolvedValue([])}
        />
      );

      expect(container.textContent).toBe('');
    });

    it('should render when open', () => {
      render(
        <SearchDialog
          isOpen={true}
          onClose={vi.fn()}
          onSelect={vi.fn()}
          searchFn={vi.fn().mockResolvedValue([])}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should render search input', () => {
      render(
        <SearchDialog
          isOpen={true}
          onClose={vi.fn()}
          onSelect={vi.fn()}
          searchFn={vi.fn().mockResolvedValue([])}
        />
      );

      expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });

    it('should focus input when opened', () => {
      render(
        <SearchDialog
          isOpen={true}
          onClose={vi.fn()}
          onSelect={vi.fn()}
          searchFn={vi.fn().mockResolvedValue([])}
        />
      );

      expect(screen.getByRole('searchbox')).toHaveFocus();
    });
  });

  describe('interactions', () => {
    it('should call onClose when Escape is pressed', () => {
      const onClose = vi.fn();
      render(
        <SearchDialog
          isOpen={true}
          onClose={onClose}
          onSelect={vi.fn()}
          searchFn={vi.fn().mockResolvedValue([])}
        />
      );

      fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });

      expect(onClose).toHaveBeenCalled();
    });

    it('should call onSelect when result is clicked', async () => {
      vi.useRealTimers(); // Use real timers for this test
      const onSelect = vi.fn();
      const searchFn = vi.fn().mockResolvedValue(mockSearchResults);

      render(
        <SearchDialog
          isOpen={true}
          onClose={vi.fn()}
          onSelect={onSelect}
          searchFn={searchFn}
        />
      );

      // Type in search
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Auth' } });

      // Wait for results
      await waitFor(() => {
        expect(screen.getByText('AuthService')).toBeInTheDocument();
      });

      // Click result
      fireEvent.click(screen.getByText('AuthService'));

      expect(onSelect).toHaveBeenCalledWith(mockSearchResults[0]);
    });
  });

  describe('keyboard navigation', () => {
    it('should navigate with arrow keys', async () => {
      vi.useRealTimers();
      const searchFn = vi.fn().mockResolvedValue(mockSearchResults);

      render(
        <SearchDialog
          isOpen={true}
          onClose={vi.fn()}
          onSelect={vi.fn()}
          searchFn={searchFn}
        />
      );

      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Auth' } });

      await waitFor(() => {
        expect(screen.getByText('AuthService')).toBeInTheDocument();
      });

      fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'ArrowDown' });

      // First item should be selected
      const firstResult = screen.getByText('AuthService').closest('[data-selected]');
      expect(firstResult).toHaveAttribute('data-selected', 'true');
    });
  });
});

// ============================================================================
// SearchResults Component Tests
// ============================================================================

describe('SearchResults', () => {
  describe('rendering', () => {
    it('should render empty state when no results', () => {
      render(
        <SearchResults
          results={[]}
          selectedIndex={-1}
          onSelect={vi.fn()}
          onHover={vi.fn()}
        />
      );

      expect(screen.getByText(/no results/i)).toBeInTheDocument();
    });

    it('should render results list', () => {
      render(
        <SearchResults
          results={mockSearchResults}
          selectedIndex={-1}
          onSelect={vi.fn()}
          onHover={vi.fn()}
        />
      );

      expect(screen.getByText('AuthService')).toBeInTheDocument();
      expect(screen.getByText('validateToken')).toBeInTheDocument();
      expect(screen.getByText('UserRepository')).toBeInTheDocument();
    });

    it('should show result type', () => {
      render(
        <SearchResults
          results={mockSearchResults}
          selectedIndex={-1}
          onSelect={vi.fn()}
          onHover={vi.fn()}
        />
      );

      expect(screen.getAllByText('class').length).toBe(2);
      expect(screen.getByText('function')).toBeInTheDocument();
    });

    it('should show file path', () => {
      render(
        <SearchResults
          results={mockSearchResults}
          selectedIndex={-1}
          onSelect={vi.fn()}
          onHover={vi.fn()}
        />
      );

      expect(screen.getByText('src/auth/AuthService.ts')).toBeInTheDocument();
    });

    it('should highlight selected item', () => {
      render(
        <SearchResults
          results={mockSearchResults}
          selectedIndex={1}
          onSelect={vi.fn()}
          onHover={vi.fn()}
        />
      );

      const selectedItem = screen.getByText('validateToken').closest('[data-selected]');
      expect(selectedItem).toHaveAttribute('data-selected', 'true');
    });
  });

  describe('interactions', () => {
    it('should call onSelect when result is clicked', () => {
      const onSelect = vi.fn();
      render(
        <SearchResults
          results={mockSearchResults}
          selectedIndex={-1}
          onSelect={onSelect}
          onHover={vi.fn()}
        />
      );

      fireEvent.click(screen.getByText('AuthService'));

      expect(onSelect).toHaveBeenCalledWith(mockSearchResults[0]);
    });

    it('should call onHover when result is hovered', () => {
      const onHover = vi.fn();
      render(
        <SearchResults
          results={mockSearchResults}
          selectedIndex={-1}
          onSelect={vi.fn()}
          onHover={onHover}
        />
      );

      fireEvent.mouseEnter(screen.getByText('AuthService').closest('[data-result]')!);

      expect(onHover).toHaveBeenCalledWith(0);
    });
  });

  describe('grouping', () => {
    it('should group results by type when groupByType is true', () => {
      render(
        <SearchResults
          results={mockSearchResults}
          selectedIndex={-1}
          onSelect={vi.fn()}
          onHover={vi.fn()}
          groupByType={true}
        />
      );

      // Should have group headers
      expect(screen.getByText('Classes')).toBeInTheDocument();
      expect(screen.getByText('Functions')).toBeInTheDocument();
    });
  });
});
