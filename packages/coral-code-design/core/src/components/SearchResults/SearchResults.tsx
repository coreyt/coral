/**
 * SearchResults Component
 *
 * Displays search results with type grouping and selection.
 * Issue #29: CCD-REQ-008 Search and Discovery
 */

import React, { useMemo } from 'react';
import type { SearchResult } from '../../hooks/useSearch';

// ============================================================================
// Types
// ============================================================================

export interface SearchResultsProps {
  /** Search results to display */
  results: SearchResult[];
  /** Currently selected index */
  selectedIndex: number;
  /** Callback when result is selected */
  onSelect: (result: SearchResult) => void;
  /** Callback when result is hovered */
  onHover: (index: number) => void;
  /** Whether to group by type */
  groupByType?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const TYPE_LABELS: Record<string, string> = {
  class: 'Classes',
  function: 'Functions',
  method: 'Methods',
  interface: 'Interfaces',
  type: 'Types',
  variable: 'Variables',
  constant: 'Constants',
  module: 'Modules',
  namespace: 'Namespaces',
};

const TYPE_ICONS: Record<string, string> = {
  class: '📦',
  function: '⚡',
  method: '🔧',
  interface: '📋',
  type: '📝',
  variable: '📊',
  constant: '🔒',
  module: '📁',
  namespace: '🗂️',
};

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    maxHeight: '400px',
    overflowY: 'auto' as const,
  } as React.CSSProperties,
  emptyState: {
    padding: '24px',
    textAlign: 'center' as const,
    color: 'var(--text-secondary, #666666)',
    fontSize: '14px',
  } as React.CSSProperties,
  groupHeader: {
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary, #666666)',
    backgroundColor: 'var(--surface-variant, #f5f5f5)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  } as React.CSSProperties,
  resultItem: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: '10px 12px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border, #e0e0e0)',
    transition: 'background-color 0.1s',
  } as React.CSSProperties,
  resultItemSelected: {
    backgroundColor: 'var(--primary-light, #e3f2fd)',
  } as React.CSSProperties,
  resultIcon: {
    fontSize: '16px',
    marginRight: '10px',
    marginTop: '2px',
  } as React.CSSProperties,
  resultContent: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  resultName: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--text-primary, #1a1a1a)',
    marginBottom: '2px',
  } as React.CSSProperties,
  resultMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: 'var(--text-secondary, #666666)',
  } as React.CSSProperties,
  resultType: {
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: 'var(--surface-variant, #f5f5f5)',
    fontSize: '11px',
    fontWeight: 500,
  } as React.CSSProperties,
  resultFile: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  resultPreview: {
    marginTop: '4px',
    fontSize: '12px',
    color: 'var(--text-secondary, #666666)',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
};

// ============================================================================
// Component
// ============================================================================

export function SearchResults({
  results,
  selectedIndex,
  onSelect,
  onHover,
  groupByType = false,
}: SearchResultsProps): React.ReactElement {
  // Group results by type if requested
  const groupedResults = useMemo(() => {
    if (!groupByType) {
      return null;
    }

    const groups: Record<string, SearchResult[]> = {};
    for (const result of results) {
      const type = result.type || 'other';
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(result);
    }
    return groups;
  }, [results, groupByType]);

  if (results.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>No results found</div>
      </div>
    );
  }

  // Calculate global index for grouped items
  const getGlobalIndex = (type: string, localIndex: number): number => {
    if (!groupedResults) return localIndex;

    let globalIndex = 0;
    for (const [groupType, groupResults] of Object.entries(groupedResults)) {
      if (groupType === type) {
        return globalIndex + localIndex;
      }
      globalIndex += groupResults.length;
    }
    return -1;
  };

  const renderResult = (result: SearchResult, index: number) => {
    const isSelected = index === selectedIndex;

    return (
      <div
        key={result.id}
        data-result
        data-selected={isSelected}
        style={{
          ...styles.resultItem,
          ...(isSelected ? styles.resultItemSelected : {}),
        }}
        onClick={() => onSelect(result)}
        onMouseEnter={() => onHover(index)}
      >
        <span style={styles.resultIcon}>
          {TYPE_ICONS[result.type] || '📄'}
        </span>
        <div style={styles.resultContent}>
          <div style={styles.resultName}>{result.name}</div>
          <div style={styles.resultMeta}>
            <span style={styles.resultType}>{result.type}</span>
            <span style={styles.resultFile}>{result.file}</span>
          </div>
          {result.preview && (
            <div style={styles.resultPreview}>{result.preview}</div>
          )}
        </div>
      </div>
    );
  };

  if (groupByType && groupedResults) {
    return (
      <div style={styles.container}>
        {Object.entries(groupedResults).map(([type, groupResults]) => (
          <div key={type}>
            <div style={styles.groupHeader}>
              {TYPE_LABELS[type] || type}
            </div>
            {groupResults.map((result, localIndex) =>
              renderResult(result, getGlobalIndex(type, localIndex))
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {results.map((result, index) => renderResult(result, index))}
    </div>
  );
}
