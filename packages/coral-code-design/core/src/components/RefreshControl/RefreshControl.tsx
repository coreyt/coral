/**
 * RefreshControl Component
 *
 * UI controls for refreshing diagrams manually or automatically.
 * Issue #27: CCD-REQ-005 Live Diagram Updates
 */

import React from 'react';

// ============================================================================
// Types
// ============================================================================

export interface RefreshControlProps {
  /** Callback to trigger a refresh */
  onRefresh: () => void;
  /** Whether a refresh is in progress */
  isRefreshing: boolean;
  /** Whether auto-refresh is enabled */
  autoRefreshEnabled: boolean;
  /** Callback when auto-refresh toggle changes */
  onAutoRefreshChange: (enabled: boolean) => void;
  /** Optional auto-refresh interval in ms */
  autoRefreshInterval?: number;
  /** Optional callback when interval changes */
  onIntervalChange?: (interval: number) => void;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px',
  } as React.CSSProperties,
  refreshButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    border: '1px solid var(--border, #e0e0e0)',
    borderRadius: '4px',
    backgroundColor: 'var(--surface, #ffffff)',
    cursor: 'pointer',
    fontSize: '14px',
    color: 'var(--text-primary, #1a1a1a)',
  } as React.CSSProperties,
  refreshButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  } as React.CSSProperties,
  spinner: {
    width: '14px',
    height: '14px',
    border: '2px solid var(--border, #e0e0e0)',
    borderTopColor: 'var(--primary, #1976d2)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  } as React.CSSProperties,
  autoRefreshContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  switch: {
    position: 'relative' as const,
    width: '36px',
    height: '20px',
    backgroundColor: 'var(--border, #e0e0e0)',
    borderRadius: '10px',
    cursor: 'pointer',
    border: 'none',
    padding: 0,
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  switchActive: {
    backgroundColor: 'var(--primary, #1976d2)',
  } as React.CSSProperties,
  switchThumb: {
    position: 'absolute' as const,
    top: '2px',
    left: '2px',
    width: '16px',
    height: '16px',
    backgroundColor: 'white',
    borderRadius: '50%',
    transition: 'transform 0.2s',
  } as React.CSSProperties,
  switchThumbActive: {
    transform: 'translateX(16px)',
  } as React.CSSProperties,
  label: {
    fontSize: '14px',
    color: 'var(--text-secondary, #666666)',
  } as React.CSSProperties,
  refreshingText: {
    fontSize: '12px',
    color: 'var(--text-secondary, #666666)',
    fontStyle: 'italic',
  } as React.CSSProperties,
};

// ============================================================================
// Component
// ============================================================================

export function RefreshControl({
  onRefresh,
  isRefreshing,
  autoRefreshEnabled,
  onAutoRefreshChange,
}: RefreshControlProps): React.ReactElement {
  const handleToggle = () => {
    onAutoRefreshChange(!autoRefreshEnabled);
  };

  return (
    <div style={styles.container}>
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        style={{
          ...styles.refreshButton,
          ...(isRefreshing ? styles.refreshButtonDisabled : {}),
        }}
        aria-label="Refresh"
      >
        {isRefreshing ? (
          <>
            <span style={styles.spinner} />
            <span style={styles.refreshingText}>Refreshing...</span>
          </>
        ) : (
          <>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
              <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
            </svg>
            Refresh
          </>
        )}
      </button>

      <div style={styles.autoRefreshContainer}>
        <button
          role="switch"
          aria-checked={autoRefreshEnabled}
          aria-label="Auto-refresh"
          onClick={handleToggle}
          style={{
            ...styles.switch,
            ...(autoRefreshEnabled ? styles.switchActive : {}),
          }}
        >
          <span
            style={{
              ...styles.switchThumb,
              ...(autoRefreshEnabled ? styles.switchThumbActive : {}),
            }}
          />
        </button>
        <span style={styles.label}>Auto</span>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
