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
      className="coral-notice coral-notice--recovery"
      style={{
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontSize: '13px',
      }}
    >
      {/* Icon */}
      <span
        className="coral-notice__icon"
        style={{ fontSize: '16px' }}
        aria-hidden="true"
      >
        ↺
      </span>

      {/* Message */}
      <div style={{ flex: 1 }}>
        <span className="coral-notice__title" style={{ fontWeight: 500 }}>
          Recovered diagram found
        </span>
        <span className="coral-notice__meta" style={{ marginLeft: '8px' }}>
          "{recoveryData.documentName}" • {recoveryData.dslType} • saved {timeAgo}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={onRecover}
          aria-label="Restore recovered diagram"
          className="coral-button coral-button--primary"
          style={{
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          Restore
        </button>
        <button
          onClick={onDiscard}
          aria-label="Discard recovered diagram"
          className="coral-button"
          style={{
            fontSize: '12px',
            fontWeight: 500,
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
      className={isDirty ? 'coral-unsaved coral-unsaved--dirty' : 'coral-unsaved'}
      style={{
        fontSize: '11px',
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
