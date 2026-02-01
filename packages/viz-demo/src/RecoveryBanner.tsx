/**
 * Recovery Banner Component
 *
 * Displays when there's recoverable diagram data from a previous session.
 * Follows Coral Design Standard with dark theme and compact density.
 */

import { type RecoveryData, formatRecoveryTime } from './useAutoRecovery';

interface RecoveryBannerProps {
  /** The recovery data to display */
  recoveryData: RecoveryData;
  /** Called when user wants to restore the diagram */
  onRecover: () => void;
  /** Called when user wants to discard the recovery data */
  onDiscard: () => void;
}

export function RecoveryBanner({ recoveryData, onRecover, onDiscard }: RecoveryBannerProps) {
  const timeAgo = formatRecoveryTime(recoveryData.timestamp);

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        background: '#2d4a3e',
        borderBottom: '1px solid #3d5a4e',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontSize: '13px',
        color: '#d4d4d4',
      }}
    >
      {/* Icon */}
      <span
        style={{
          fontSize: '16px',
          color: '#89d185',
        }}
        aria-hidden="true"
      >
        ↺
      </span>

      {/* Message */}
      <div style={{ flex: 1 }}>
        <span style={{ color: '#fff', fontWeight: 500 }}>
          Recovered diagram found
        </span>
        <span style={{ color: '#a0a0a0', marginLeft: '8px' }}>
          "{recoveryData.documentName}" • {recoveryData.dslType} • saved {timeAgo}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={onRecover}
          aria-label="Restore recovered diagram"
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 500,
            borderRadius: '4px',
            border: 'none',
            background: '#007acc',
            color: '#fff',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#1a8ad4'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#007acc'}
        >
          Restore
        </button>
        <button
          onClick={onDiscard}
          aria-label="Discard recovered diagram"
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 500,
            borderRadius: '4px',
            border: '1px solid #555',
            background: 'transparent',
            color: '#a0a0a0',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#333';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#a0a0a0';
          }}
        >
          Discard
        </button>
      </div>
    </div>
  );
}

/**
 * Unsaved Changes Indicator
 *
 * Small indicator shown in the header when there are unsaved changes.
 */
interface UnsavedIndicatorProps {
  isDirty: boolean;
  lastSaveTime: number | null;
}

export function UnsavedIndicator({ isDirty, lastSaveTime }: UnsavedIndicatorProps) {
  if (!isDirty && !lastSaveTime) return null;

  return (
    <span
      style={{
        fontSize: '11px',
        color: isDirty ? '#f0ad4e' : '#888',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      }}
      title={isDirty ? 'Unsaved changes' : `Saved ${lastSaveTime ? formatRecoveryTime(lastSaveTime) : ''}`}
    >
      {isDirty ? (
        <>
          <span style={{ fontSize: '8px' }}>●</span>
          <span>Unsaved</span>
        </>
      ) : lastSaveTime ? (
        <span>Saved {formatRecoveryTime(lastSaveTime)}</span>
      ) : null}
    </span>
  );
}
