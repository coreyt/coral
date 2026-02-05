/**
 * StaleIndicator Component
 *
 * Visual indicator when diagram data may be outdated.
 * Issue #27: CCD-REQ-005 Live Diagram Updates
 */

import React from 'react';

// ============================================================================
// Types
// ============================================================================

export interface StaleIndicatorProps {
  /** Whether the data is stale */
  isStale: boolean;
  /** When the data was last refreshed */
  lastRefreshedAt: Date | null;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    backgroundColor: 'var(--warning-light, #fff3e0)',
    border: '1px solid var(--warning, #ff9800)',
    borderRadius: '4px',
    fontSize: '12px',
    color: 'var(--warning-dark, #e65100)',
  } as React.CSSProperties,
  icon: {
    width: '14px',
    height: '14px',
  } as React.CSSProperties,
  timestamp: {
    fontWeight: 500,
  } as React.CSSProperties,
};

// ============================================================================
// Helpers
// ============================================================================

function formatTime(date: Date | null): string {
  if (!date) {
    return 'never';
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// Component
// ============================================================================

export function StaleIndicator({
  isStale,
  lastRefreshedAt,
}: StaleIndicatorProps): React.ReactElement | null {
  if (!isStale) {
    return null;
  }

  return (
    <div style={styles.container} role="status" aria-live="polite">
      <svg
        style={styles.icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>
        Stale (last refresh: <span style={styles.timestamp}>{formatTime(lastRefreshedAt)}</span>)
      </span>
    </div>
  );
}
