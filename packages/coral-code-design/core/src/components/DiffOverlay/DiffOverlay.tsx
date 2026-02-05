/**
 * DiffOverlay Component
 *
 * Displays changes since last refresh (added/removed/modified nodes).
 * Issue #27: CCD-REQ-005 Live Diagram Updates
 */

import React from 'react';

// ============================================================================
// Types
// ============================================================================

export interface DiagramDiff {
  /** Node IDs that were added */
  added: string[];
  /** Node IDs that were removed */
  removed: string[];
  /** Node IDs that were modified */
  modified: string[];
}

export interface DiffOverlayProps {
  /** The diff to display */
  diff: DiagramDiff;
  /** Callback when user dismisses the diff */
  onDismiss: () => void;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    backgroundColor: 'var(--surface, #ffffff)',
    border: '1px solid var(--border, #e0e0e0)',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  } as React.CSSProperties,
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 500,
  } as React.CSSProperties,
  addedBadge: {
    backgroundColor: '#e8f5e9',
    color: '#2e7d32',
  } as React.CSSProperties,
  removedBadge: {
    backgroundColor: '#ffebee',
    color: '#c62828',
  } as React.CSSProperties,
  modifiedBadge: {
    backgroundColor: '#fff8e1',
    color: '#f57f17',
  } as React.CSSProperties,
  dismissButton: {
    padding: '4px 8px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary, #666666)',
    cursor: 'pointer',
    fontSize: '12px',
  } as React.CSSProperties,
};

// ============================================================================
// Component
// ============================================================================

export function DiffOverlay({
  diff,
  onDismiss,
}: DiffOverlayProps): React.ReactElement | null {
  const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0;

  if (!hasChanges) {
    return null;
  }

  return (
    <div style={styles.container} role="status" aria-live="polite">
      {diff.added.length > 0 && (
        <span style={{ ...styles.badge, ...styles.addedBadge }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
          {diff.added.length} added
        </span>
      )}

      {diff.removed.length > 0 && (
        <span style={{ ...styles.badge, ...styles.removedBadge }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 13H5v-2h14v2z" />
          </svg>
          {diff.removed.length} removed
        </span>
      )}

      {diff.modified.length > 0 && (
        <span style={{ ...styles.badge, ...styles.modifiedBadge }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
          </svg>
          {diff.modified.length} modified
        </span>
      )}

      <button
        onClick={onDismiss}
        style={styles.dismissButton}
        aria-label="Dismiss changes"
      >
        Dismiss
      </button>
    </div>
  );
}
