/**
 * SearchPalette Component
 *
 * Command palette for searching symbols, files, and commands.
 * Activated via Cmd+P / Ctrl+P.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export interface SearchPaletteProps {
  /** Whether the palette is open */
  isOpen: boolean;

  /** Called when palette should close */
  onClose: () => void;

  /** Called when a result is selected */
  onSelect: (result: SearchResult) => void;

  /** Search function */
  onSearch: (query: string) => Promise<SearchResult[]>;

  /** Placeholder text */
  placeholder?: string;
}

export interface SearchResult {
  id: string;
  type: 'symbol' | 'file' | 'command' | 'diagram';
  title: string;
  subtitle?: string;
  icon?: string;
  symbolId?: string;
  file?: string;
  line?: number;
}

export function SearchPalette({
  isOpen,
  onClose,
  onSelect,
  onSearch,
  placeholder = 'Search symbols, files, commands...',
}: SearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Search on query change
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const searchResults = await onSearch(query);
        setResults(searchResults);
        setSelectedIndex(0);
      } finally {
        setIsSearching(false);
      }
    }, 150); // Debounce

    return () => clearTimeout(searchTimeout);
  }, [query, onSearch]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          onSelect(results[selectedIndex]);
          onClose();
        }
        break;
    }
  }, [results, selectedIndex, onSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '15vh',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          maxHeight: '60vh',
          backgroundColor: 'var(--palette-bg, white)',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Search input */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-color, #e0e0e0)',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid var(--border-color, #e0e0e0)',
              borderRadius: '4px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Results */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
          }}
        >
          {isSearching && (
            <div
              style={{
                padding: '16px',
                textAlign: 'center',
                color: 'var(--text-muted, #666)',
              }}
            >
              Searching...
            </div>
          )}

          {!isSearching && results.length === 0 && query && (
            <div
              style={{
                padding: '16px',
                textAlign: 'center',
                color: 'var(--text-muted, #666)',
              }}
            >
              No results found
            </div>
          )}

          {!isSearching && results.length === 0 && !query && (
            <div
              style={{
                padding: '16px',
                textAlign: 'center',
                color: 'var(--text-muted, #666)',
              }}
            >
              Start typing to search
            </div>
          )}

          {results.map((result, index) => (
            <SearchResultItem
              key={result.id}
              result={result}
              isSelected={index === selectedIndex}
              onClick={() => {
                onSelect(result);
                onClose();
              }}
            />
          ))}
        </div>

        {/* Footer with keyboard hints */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--border-color, #e0e0e0)',
            backgroundColor: 'var(--footer-bg, #f5f5f5)',
            fontSize: '11px',
            color: 'var(--text-muted, #666)',
            display: 'flex',
            gap: '16px',
          }}
        >
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Select</span>
          <span><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Search Result Item
// ============================================================================

interface SearchResultItemProps {
  result: SearchResult;
  isSelected: boolean;
  onClick: () => void;
}

function SearchResultItem({ result, isSelected, onClick }: SearchResultItemProps) {
  const icon = result.icon ?? getDefaultIcon(result.type);

  return (
    <div
      style={{
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        cursor: 'pointer',
        backgroundColor: isSelected ? 'var(--selected-bg, #e8f0fe)' : 'transparent',
      }}
      onClick={onClick}
    >
      <span style={{ marginRight: '12px', fontSize: '16px' }}>{icon}</span>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div
          style={{
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {result.title}
        </div>
        {result.subtitle && (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-muted, #666)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {result.subtitle}
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: '11px',
          color: 'var(--text-muted, #999)',
          textTransform: 'capitalize',
        }}
      >
        {result.type}
      </span>
    </div>
  );
}

function getDefaultIcon(type: SearchResult['type']): string {
  switch (type) {
    case 'symbol': return '🔷';
    case 'file': return '📄';
    case 'command': return '⚡';
    case 'diagram': return '📊';
    default: return '•';
  }
}
