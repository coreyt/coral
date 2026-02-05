/**
 * DiagramTabs Component
 *
 * Tab bar for switching between multiple diagrams.
 * Issue #22: CCD-REQ-002 Multi-Diagram View
 */

import { useCallback, useRef } from 'react';
import type { DiagramReference } from '../../types';

// ============================================================================
// Types
// ============================================================================

export interface DiagramTabsProps {
  /** List of diagrams to show as tabs */
  diagrams: DiagramReference[];
  /** ID of the active diagram */
  activeDiagramId: string | null;
  /** Callback when tab is clicked */
  onTabClick: (diagramId: string) => void;
  /** Callback when tab close button is clicked */
  onTabClose: (diagramId: string) => void;
  /** Callback when add tab button is clicked */
  onAddTab: () => void;
  /** Additional class name */
  className?: string;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    height: '36px',
    backgroundColor: 'var(--theme-bg-secondary, #f5f5f5)',
    borderBottom: '1px solid var(--theme-border, #e0e0e0)',
    overflow: 'hidden',
  },
  tabList: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    overflow: 'auto',
    height: '100%',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    height: '100%',
    padding: '0 12px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--theme-text-secondary, #666)',
    fontSize: '13px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    transition: 'background-color 0.15s, color 0.15s',
    borderRight: '1px solid var(--theme-border, #e0e0e0)',
  },
  tabActive: {
    backgroundColor: 'var(--theme-bg-primary, #fff)',
    color: 'var(--theme-text-primary, #333)',
    borderBottom: '2px solid var(--theme-primary, #1976d2)',
  },
  tabLabel: {
    maxWidth: '150px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--theme-text-secondary, #999)',
    fontSize: '12px',
    cursor: 'pointer',
    borderRadius: '2px',
    opacity: 0.6,
    transition: 'opacity 0.15s, background-color 0.15s',
  },
  closeButtonHover: {
    opacity: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    margin: '0 8px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--theme-text-secondary, #666)',
    fontSize: '18px',
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'background-color 0.15s',
  },
};

// ============================================================================
// Component
// ============================================================================

export function DiagramTabs({
  diagrams,
  activeDiagramId,
  onTabClick,
  onTabClose,
  onAddTab,
  className,
}: DiagramTabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, currentIndex: number) => {
      let newIndex = currentIndex;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        newIndex = Math.min(currentIndex + 1, diagrams.length - 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        newIndex = Math.max(currentIndex - 1, 0);
      } else if (event.key === 'Home') {
        event.preventDefault();
        newIndex = 0;
      } else if (event.key === 'End') {
        event.preventDefault();
        newIndex = diagrams.length - 1;
      }

      if (newIndex !== currentIndex) {
        onTabClick(diagrams[newIndex].id);
      }
    },
    [diagrams, onTabClick]
  );

  const handleCloseClick = useCallback(
    (event: React.MouseEvent, diagramId: string) => {
      event.stopPropagation();
      onTabClose(diagramId);
    },
    [onTabClose]
  );

  return (
    <div style={styles.container} className={className}>
      <div
        ref={tabListRef}
        role="tablist"
        aria-label="Diagram tabs"
        style={styles.tabList}
      >
        {diagrams.map((diagram, index) => {
          const isActive = diagram.id === activeDiagramId;
          return (
            <button
              key={diagram.id}
              role="tab"
              aria-selected={isActive}
              aria-label={diagram.name}
              tabIndex={isActive ? 0 : -1}
              style={{
                ...styles.tab,
                ...(isActive ? styles.tabActive : {}),
              }}
              onClick={() => onTabClick(diagram.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
            >
              <span style={styles.tabLabel}>{diagram.name}</span>
              <button
                type="button"
                aria-label={`Close ${diagram.name}`}
                style={styles.closeButton}
                onClick={(e) => handleCloseClick(e, diagram.id)}
                tabIndex={-1}
              >
                \u2715
              </button>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-label="Add diagram"
        style={styles.addButton}
        onClick={onAddTab}
      >
        +
      </button>
    </div>
  );
}
