/**
 * Armada Connection Dialog
 *
 * UI for connecting to Armada's HTTP visualization API.
 * Ported from viz-demo for coral-code-design.
 */

import { useState, useCallback } from 'react';
import type { GraphMode, ArmadaConnectionConfig } from '../../types';
import type { BranchProjectionConfig } from '../../providers/ArmadaProvider';
import { BranchSelector } from '../BranchSelector';

/** Mode display names */
const MODE_LABELS: Record<GraphMode, string> = {
  'call-graph': 'Call Graph',
  'dependency-graph': 'Dependency Graph',
  'inheritance-tree': 'Inheritance Tree',
  'impact-graph': 'Impact Graph',
  'full-graph': 'Full Graph',
};

/** Mode descriptions */
const MODE_DESCRIPTIONS: Record<GraphMode, string> = {
  'call-graph': 'Function and method call relationships',
  'dependency-graph': 'Module and package dependencies',
  'inheritance-tree': 'Class inheritance hierarchy',
  'impact-graph': 'Change blast radius analysis',
  'full-graph': 'Complete code graph',
};

export interface ArmadaConnectionDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;

  /** Called when dialog should close */
  onClose: () => void;

  /** Initial server URL */
  initialServerUrl: string;

  /** Initial graph mode */
  initialMode: GraphMode;

  /** Called when Connect button is clicked */
  onConnect: (config: ArmadaConnectionConfig) => void;

  /** Whether a connection attempt is in progress */
  isConnecting: boolean;

  /** Error message to display */
  error: string | null;

  /** Available graph modes */
  availableModes: GraphMode[];

  /** Available branches (for branch projection) */
  availableBranches?: string[];

  /** Current branch projection */
  branchProjection?: BranchProjectionConfig | null;

  /** Called when branch projection changes */
  onBranchProjectionChange?: (projection: BranchProjectionConfig | null) => void;

  /** Called to fetch branches */
  onFetchBranches?: () => Promise<string[]>;
}

export function ArmadaConnectionDialog({
  isOpen,
  onClose,
  initialServerUrl,
  initialMode,
  onConnect,
  isConnecting,
  error,
  availableModes,
  availableBranches = [],
  branchProjection,
  onBranchProjectionChange,
  onFetchBranches,
}: ArmadaConnectionDialogProps) {
  const [serverUrl, setServerUrl] = useState(initialServerUrl);
  const [mode, setMode] = useState<GraphMode>(initialMode);

  // Whether to show branch selector
  const showBranchSelector = onBranchProjectionChange && onFetchBranches;

  const handleConnect = useCallback(() => {
    onConnect({ serverUrl, mode });
  }, [onConnect, serverUrl, mode]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && !isConnecting && serverUrl) {
      handleConnect();
    }
  }, [onClose, isConnecting, serverUrl, handleConnect]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) return null;

  const isValid = serverUrl.trim().length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="armada-dialog-title"
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--dialog-bg, #fff)',
          border: '1px solid var(--dialog-border, #e0e0e0)',
          borderRadius: '8px',
          padding: '20px',
          minWidth: '400px',
          maxWidth: '500px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '18px', marginRight: '8px' }}>⚓</span>
          <h2
            id="armada-dialog-title"
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-color, #333)',
            }}
          >
            Connect to Armada
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: 'var(--text-muted, #666)',
              padding: '4px 8px',
            }}
          >
            ×
          </button>
        </div>

        {/* Server URL */}
        <div style={{ marginBottom: '16px' }}>
          <label
            htmlFor="armada-url"
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-color, #333)',
              marginBottom: '4px',
            }}
          >
            Server URL
          </label>
          <input
            id="armada-url"
            type="url"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://localhost:8765"
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid var(--input-border, #ccc)',
              borderRadius: '4px',
              background: 'var(--input-bg, #fff)',
              color: 'var(--input-text, #333)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Graph Mode */}
        <div style={{ marginBottom: '16px' }}>
          <label
            htmlFor="armada-mode"
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-color, #333)',
              marginBottom: '4px',
            }}
          >
            Graph Mode
          </label>
          <select
            id="armada-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as GraphMode)}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid var(--input-border, #ccc)',
              borderRadius: '4px',
              background: 'var(--input-bg, #fff)',
              color: 'var(--input-text, #333)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          >
            {availableModes.map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </select>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '11px',
              color: 'var(--text-muted, #666)',
            }}
          >
            {MODE_DESCRIPTIONS[mode]}
          </p>
        </div>

        {/* Branch Selector (optional) */}
        {showBranchSelector && (
          <BranchSelector
            availableBranches={availableBranches}
            currentProjection={branchProjection ?? null}
            onChange={onBranchProjectionChange!}
            onFetchBranches={onFetchBranches!}
          />
        )}

        {/* Error message */}
        {error && (
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--error-bg, #fee2e2)',
              color: 'var(--error-text, #dc2626)',
              borderRadius: '4px',
              fontSize: '12px',
              marginBottom: '16px',
            }}
          >
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              border: '1px solid var(--input-border, #ccc)',
              borderRadius: '4px',
              background: 'transparent',
              color: 'var(--text-color, #333)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConnect}
            disabled={isConnecting || !isValid}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              border: 'none',
              borderRadius: '4px',
              background: isConnecting || !isValid ? 'var(--button-disabled-bg, #ccc)' : 'var(--button-primary-bg, #2563eb)',
              color: 'var(--button-primary-text, #fff)',
              cursor: isConnecting || !isValid ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isConnecting ? (
              <>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                Connecting...
              </>
            ) : (
              'Connect'
            )}
          </button>
        </div>
      </div>

      {/* Keyframe animation for spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
