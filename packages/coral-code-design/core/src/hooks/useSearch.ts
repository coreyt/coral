/**
 * useSearch Hook
 *
 * Manages search state with debouncing, history, and keyboard navigation.
 * Issue #29: CCD-REQ-008 Search and Discovery
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface SearchResult {
  /** Unique result ID */
  id: string;
  /** Symbol ID for navigation */
  symbolId: string;
  /** Display name */
  name: string;
  /** Symbol type (class, function, etc.) */
  type: string;
  /** File path */
  file: string;
  /** Line number */
  line: number;
  /** Preview snippet */
  preview?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface UseSearchOptions {
  /** Function to execute search */
  searchFn: (query: string) => Promise<SearchResult[]>;
  /** Debounce delay in milliseconds */
  debounceMs?: number;
  /** Maximum history size */
  maxHistory?: number;
  /** Minimum query length to trigger search */
  minQueryLength?: number;
}

export interface UseSearchResult {
  /** Current search query */
  query: string;
  /** Search results */
  results: SearchResult[];
  /** Whether search is in progress */
  isSearching: boolean;
  /** Recent search queries */
  recentSearches: string[];
  /** Currently selected result index (-1 if none) */
  selectedIndex: number;
  /** Error message if search failed */
  error: string | null;

  // Actions
  /** Set search query */
  setQuery: (query: string) => void;
  /** Set selected index */
  setSelectedIndex: (index: number) => void;
  /** Move selection down */
  moveSelectionDown: () => void;
  /** Move selection up */
  moveSelectionUp: () => void;
  /** Add query to history */
  addToHistory: (query: string) => void;
  /** Clear search history */
  clearHistory: () => void;
  /** Clear search state */
  clear: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_MAX_HISTORY = 10;
const DEFAULT_MIN_QUERY_LENGTH = 2;

// ============================================================================
// Hook
// ============================================================================

export function useSearch(options: UseSearchOptions): UseSearchResult {
  const {
    searchFn,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    maxHistory = DEFAULT_MAX_HISTORY,
    minQueryLength = DEFAULT_MIN_QUERY_LENGTH,
  } = options;

  const [query, setQueryState] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchFnRef = useRef(searchFn);
  searchFnRef.current = searchFn;

  // Set query and trigger debounced search
  const setQuery = useCallback(
    (newQuery: string) => {
      setQueryState(newQuery);
      setSelectedIndex(-1);
      setError(null);

      // Clear previous timeout
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Don't search for short queries
      if (newQuery.length < minQueryLength) {
        setResults([]);
        return;
      }

      // Debounce search
      debounceRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const searchResults = await searchFnRef.current(newQuery);
          setResults(searchResults);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Search failed');
          setResults([]);
        } finally {
          setIsSearching(false);
        }
      }, debounceMs);
    },
    [debounceMs, minQueryLength]
  );

  // Selection navigation
  const moveSelectionDown = useCallback(() => {
    setSelectedIndex((prev) => {
      if (results.length === 0) return -1;
      return prev >= results.length - 1 ? 0 : prev + 1;
    });
  }, [results.length]);

  const moveSelectionUp = useCallback(() => {
    setSelectedIndex((prev) => {
      if (results.length === 0) return -1;
      return prev <= 0 ? results.length - 1 : prev - 1;
    });
  }, [results.length]);

  // History management
  const addToHistory = useCallback(
    (searchQuery: string) => {
      setRecentSearches((prev) => {
        const filtered = prev.filter((q) => q !== searchQuery);
        const updated = [searchQuery, ...filtered];
        return updated.slice(0, maxHistory);
      });
    },
    [maxHistory]
  );

  const clearHistory = useCallback(() => {
    setRecentSearches([]);
  }, []);

  // Clear everything
  const clear = useCallback(() => {
    setQueryState('');
    setResults([]);
    setSelectedIndex(-1);
    setError(null);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return useMemo(
    () => ({
      query,
      results,
      isSearching,
      recentSearches,
      selectedIndex,
      error,
      setQuery,
      setSelectedIndex,
      moveSelectionDown,
      moveSelectionUp,
      addToHistory,
      clearHistory,
      clear,
    }),
    [
      query,
      results,
      isSearching,
      recentSearches,
      selectedIndex,
      error,
      setQuery,
      moveSelectionDown,
      moveSelectionUp,
      addToHistory,
      clearHistory,
      clear,
    ]
  );
}
