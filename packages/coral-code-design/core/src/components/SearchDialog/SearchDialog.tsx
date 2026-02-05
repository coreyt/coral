/**
 * SearchDialog Component
 *
 * Modal dialog for global symbol search with keyboard navigation.
 * Issue #29: CCD-REQ-008 Search and Discovery
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { useSearch } from '../../hooks/useSearch';
import { SearchResults } from '../SearchResults';
import type { SearchResult } from '../../hooks/useSearch';

// ============================================================================
// Types
// ============================================================================

export interface SearchDialogProps {
  /** Whether dialog is open */
  isOpen: boolean;
  /** Callback to close dialog */
  onClose: () => void;
  /** Callback when result is selected */
  onSelect: (result: SearchResult) => void;
  /** Search function */
  searchFn: (query: string) => Promise<SearchResult[]>;
  /** Placeholder text */
  placeholder?: string;
  /** Group results by type */
  groupByType?: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '100px',
    zIndex: 1000,
  } as React.CSSProperties,
  dialog: {
    width: '100%',
    maxWidth: '600px',
    backgroundColor: 'var(--surface, #ffffff)',
    borderRadius: '12px',
    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.2)',
    overflow: 'hidden',
  } as React.CSSProperties,
  inputContainer: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border, #e0e0e0)',
  } as React.CSSProperties,
  searchIcon: {
    marginRight: '12px',
    color: 'var(--text-secondary, #666666)',
  } as React.CSSProperties,
  input: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: '16px',
    backgroundColor: 'transparent',
    color: 'var(--text-primary, #1a1a1a)',
  } as React.CSSProperties,
  shortcut: {
    padding: '4px 8px',
    borderRadius: '4px',
    backgroundColor: 'var(--surface-variant, #f5f5f5)',
    fontSize: '12px',
    color: 'var(--text-secondary, #666666)',
  } as React.CSSProperties,
  loadingIndicator: {
    padding: '16px',
    textAlign: 'center' as const,
    color: 'var(--text-secondary, #666666)',
    fontSize: '14px',
  } as React.CSSProperties,
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '8px 16px',
    borderTop: '1px solid var(--border, #e0e0e0)',
    fontSize: '12px',
    color: 'var(--text-secondary, #666666)',
  } as React.CSSProperties,
  footerShortcut: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties,
  kbd: {
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: 'var(--surface-variant, #f5f5f5)',
    fontSize: '11px',
    fontFamily: 'monospace',
  } as React.CSSProperties,
};

// ============================================================================
// Component
// ============================================================================

export function SearchDialog({
  isOpen,
  onClose,
  onSelect,
  searchFn,
  placeholder = 'Search symbols...',
  groupByType = false,
}: SearchDialogProps): React.ReactElement | null {
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useSearch({ searchFn, debounceMs: 200 });

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Clear search when closed
  useEffect(() => {
    if (!isOpen) {
      search.clear();
    }
  }, [isOpen]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          search.moveSelectionDown();
          break;
        case 'ArrowUp':
          e.preventDefault();
          search.moveSelectionUp();
          break;
        case 'Enter':
          e.preventDefault();
          if (search.selectedIndex >= 0 && search.results[search.selectedIndex]) {
            const result = search.results[search.selectedIndex];
            search.addToHistory(search.query);
            onSelect(result);
            onClose();
          }
          break;
      }
    },
    [search, onClose, onSelect]
  );

  // Handle result selection
  const handleSelect = useCallback(
    (result: SearchResult) => {
      search.addToHistory(search.query);
      onSelect(result);
      onClose();
    },
    [search, onSelect, onClose]
  );

  // Handle overlay click
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div
      style={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Search symbols"
    >
      <div style={styles.dialog}>
        <div style={styles.inputContainer}>
          <svg
            style={styles.searchIcon}
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            role="searchbox"
            placeholder={placeholder}
            value={search.query}
            onChange={(e) => search.setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={styles.input}
          />
          <span style={styles.shortcut}>esc</span>
        </div>

        {search.isSearching ? (
          <div style={styles.loadingIndicator}>Searching...</div>
        ) : (
          <SearchResults
            results={search.results}
            selectedIndex={search.selectedIndex}
            onSelect={handleSelect}
            onHover={search.setSelectedIndex}
            groupByType={groupByType}
          />
        )}

        {search.results.length > 0 && (
          <div style={styles.footer}>
            <span style={styles.footerShortcut}>
              <span style={styles.kbd}>↑</span>
              <span style={styles.kbd}>↓</span>
              to navigate
            </span>
            <span style={styles.footerShortcut}>
              <span style={styles.kbd}>↵</span>
              to select
            </span>
            <span style={styles.footerShortcut}>
              <span style={styles.kbd}>esc</span>
              to close
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
