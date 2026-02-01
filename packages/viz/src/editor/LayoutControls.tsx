/**
 * LayoutControls - UI component for diagram reflow and undo/redo
 *
 * Provides buttons and keyboard shortcuts for:
 * - Reflow: Re-run automatic layout (ELK)
 * - Undo: Restore previous node positions
 * - Redo: Re-apply undone changes
 */

import { useEffect, useCallback, type CSSProperties } from 'react';

/** Props for the LayoutControls component */
export interface LayoutControlsProps {
  /** Callback to trigger reflow/re-layout */
  onReflow: () => void;
  /** Callback to undo last layout change */
  onUndo: () => void;
  /** Callback to redo undone change */
  onRedo: () => void;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Number of undo steps available */
  undoCount?: number;
  /** Number of redo steps available */
  redoCount?: number;
  /** Whether a reflow is currently in progress */
  isReflowing?: boolean;
  /** Custom styles for the container */
  style?: CSSProperties;
  /** Custom class name for the container */
  className?: string;
  /** Whether to show keyboard shortcut hints in tooltips */
  showShortcutHints?: boolean;
  /** Disable all controls */
  disabled?: boolean;
}

/** Default button styles */
const buttonStyle: CSSProperties = {
  padding: '6px 12px',
  fontSize: '13px',
  fontWeight: 500,
  borderRadius: '4px',
  border: '1px solid #ccc',
  background: '#fff',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  transition: 'all 0.15s ease',
};

const buttonStyleDisabled: CSSProperties = {
  ...buttonStyle,
  opacity: 0.5,
  cursor: 'not-allowed',
};

const buttonStylePrimary: CSSProperties = {
  ...buttonStyle,
  background: '#1976d2',
  borderColor: '#1976d2',
  color: '#fff',
};

const containerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

/**
 * LayoutControls component
 */
export function LayoutControls({
  onReflow,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  undoCount = 0,
  redoCount = 0,
  isReflowing = false,
  style,
  className,
  showShortcutHints = true,
  disabled = false,
}: LayoutControlsProps) {
  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (disabled) return;

      // Ctrl+Shift+L or Cmd+Shift+L for reflow
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        if (!isReflowing) {
          onReflow();
        }
        return;
      }

      // Ctrl+Z or Cmd+Z for undo (without shift)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        if (canUndo) {
          onUndo();
        }
        return;
      }

      // Ctrl+Shift+Z or Cmd+Shift+Z for redo
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (canRedo) {
          onRedo();
        }
        return;
      }

      // Ctrl+Y or Cmd+Y for redo (alternative)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        if (canRedo) {
          onRedo();
        }
        return;
      }
    },
    [disabled, isReflowing, canUndo, canRedo, onReflow, onUndo, onRedo]
  );

  // Attach keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const getReflowTitle = () => {
    let title = 'Re-apply automatic layout';
    if (showShortcutHints) {
      title += ' (Ctrl+Shift+L)';
    }
    return title;
  };

  const getUndoTitle = () => {
    let title = `Undo${undoCount > 0 ? ` (${undoCount} step${undoCount > 1 ? 's' : ''} available)` : ''}`;
    if (showShortcutHints) {
      title += ' (Ctrl+Z)';
    }
    return title;
  };

  const getRedoTitle = () => {
    let title = `Redo${redoCount > 0 ? ` (${redoCount} step${redoCount > 1 ? 's' : ''} available)` : ''}`;
    if (showShortcutHints) {
      title += ' (Ctrl+Shift+Z)';
    }
    return title;
  };

  return (
    <div style={{ ...containerStyle, ...style }} className={className}>
      {/* Reflow button */}
      <button
        onClick={onReflow}
        disabled={disabled || isReflowing}
        title={getReflowTitle()}
        style={disabled || isReflowing ? buttonStyleDisabled : buttonStylePrimary}
      >
        {isReflowing ? (
          <>
            <span
              style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                border: '2px solid #fff',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            Reflowing...
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Reflow
          </>
        )}
      </button>

      {/* Separator */}
      <div style={{ width: '1px', height: '20px', background: '#ddd' }} />

      {/* Undo button */}
      <button
        onClick={onUndo}
        disabled={disabled || !canUndo}
        title={getUndoTitle()}
        style={disabled || !canUndo ? buttonStyleDisabled : buttonStyle}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7v6h6" />
          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
        </svg>
        Undo
      </button>

      {/* Redo button */}
      <button
        onClick={onRedo}
        disabled={disabled || !canRedo}
        title={getRedoTitle()}
        style={disabled || !canRedo ? buttonStyleDisabled : buttonStyle}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 7v6h-6" />
          <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
        </svg>
        Redo
      </button>

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
