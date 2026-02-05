/**
 * Breadcrumbs Component
 *
 * Navigation breadcrumb trail for diagram abstraction levels.
 * Issue #28: CCD-REQ-003 Diagram Types (C4-Inspired)
 */

import React from 'react';
import type { DiagramScope } from '../../hooks/useDiagramNavigation';

// ============================================================================
// Types
// ============================================================================

export interface BreadcrumbsProps {
  /** Navigation history */
  history: DiagramScope[];
  /** Current position in history */
  currentIndex: number;
  /** Callback when a breadcrumb is clicked */
  onNavigate: (index: number) => void;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  nav: {
    padding: '8px 12px',
  } as React.CSSProperties,
  list: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    listStyle: 'none',
    margin: 0,
    padding: 0,
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties,
  link: {
    color: 'var(--primary, #1976d2)',
    textDecoration: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '14px',
    border: 'none',
    background: 'none',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  linkHover: {
    backgroundColor: 'var(--surface-variant, #f5f5f5)',
  } as React.CSSProperties,
  current: {
    color: 'var(--text-primary, #1a1a1a)',
    fontWeight: 500,
    padding: '4px 8px',
    fontSize: '14px',
  } as React.CSSProperties,
  separator: {
    color: 'var(--text-secondary, #666666)',
    fontSize: '12px',
    userSelect: 'none' as const,
  } as React.CSSProperties,
};

// ============================================================================
// Component
// ============================================================================

export function Breadcrumbs({
  history,
  currentIndex,
  onNavigate,
}: BreadcrumbsProps): React.ReactElement | null {
  if (history.length === 0) {
    return null;
  }

  // Only show items up to current index
  const visibleHistory = history.slice(0, currentIndex + 1);

  return (
    <nav aria-label="Breadcrumb" style={styles.nav}>
      <ol role="list" style={styles.list}>
        {visibleHistory.map((scope, index) => {
          const isCurrent = index === currentIndex;
          const isLast = index === visibleHistory.length - 1;

          return (
            <li key={`${scope.path}-${index}`} style={styles.item}>
              {isCurrent ? (
                <span style={styles.current} aria-current="page">
                  {scope.label}
                </span>
              ) : (
                <button
                  onClick={() => onNavigate(index)}
                  style={styles.link}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor =
                      'var(--surface-variant, #f5f5f5)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {scope.label}
                </button>
              )}
              {!isLast && <span style={styles.separator} aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
