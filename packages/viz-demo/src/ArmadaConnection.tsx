/**
 * Armada Connection Components
 *
 * UI for connecting to Armada's HTTP visualization API.
 * Requirement: CORAL-REQ-017 (Armada HTTP Datasource)
 */

import { useState, useCallback } from 'react';
import type { GraphMode, ArmadaConnectionConfig, ArmadaStats } from './useArmadaConnection';

/** Theme colors (passed from App) */
interface ThemeColors {
  dialogBg: string;
  dialogBorder: string;
  dialogText: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  buttonBg: string;
  buttonText: string;
  buttonHoverBg: string;
  errorBg: string;
  errorText: string;
  successBg: string;
  successText: string;
  mutedText: string;
}

/** Connection Dialog Props */
interface ArmadaConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  config: ArmadaConnectionConfig;
  onConnect: (config?: Partial<ArmadaConnectionConfig>) => Promise<void>;
  isConnecting: boolean;
  error: string | null;
  availableModes: GraphMode[];
  theme: ThemeColors;
}

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

/** Connection dialog component */
export function ArmadaConnectionDialog({
  isOpen,
  onClose,
  config,
  onConnect,
  isConnecting,
  error,
  availableModes,
  theme,
}: ArmadaConnectionDialogProps) {
  const [localUrl, setLocalUrl] = useState(config.serverUrl);
  const [localMode, setLocalMode] = useState<GraphMode>(config.mode);

  const handleConnect = useCallback(async () => {
    await onConnect({ serverUrl: localUrl, mode: localMode });
  }, [onConnect, localUrl, localMode]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && !isConnecting) {
      handleConnect();
    }
  }, [onClose, isConnecting, handleConnect]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="armada-dialog-title"
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: theme.dialogBg,
          border: `1px solid ${theme.dialogBorder}`,
          borderRadius: '8px',
          padding: '20px',
          minWidth: '400px',
          maxWidth: '500px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        }}
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
              color: theme.dialogText,
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
              color: theme.mutedText,
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
              color: theme.dialogText,
              marginBottom: '4px',
            }}
          >
            Server URL
          </label>
          <input
            id="armada-url"
            type="url"
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            placeholder="http://localhost:8765"
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '14px',
              border: `1px solid ${theme.inputBorder}`,
              borderRadius: '4px',
              background: theme.inputBg,
              color: theme.inputText,
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
              color: theme.dialogText,
              marginBottom: '4px',
            }}
          >
            Graph Mode
          </label>
          <select
            id="armada-mode"
            value={localMode}
            onChange={(e) => setLocalMode(e.target.value as GraphMode)}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '14px',
              border: `1px solid ${theme.inputBorder}`,
              borderRadius: '4px',
              background: theme.inputBg,
              color: theme.inputText,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          >
            {availableModes.map((mode) => (
              <option key={mode} value={mode}>
                {MODE_LABELS[mode]}
              </option>
            ))}
          </select>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '11px',
              color: theme.mutedText,
            }}
          >
            {MODE_DESCRIPTIONS[localMode]}
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              padding: '8px 12px',
              background: theme.errorBg,
              color: theme.errorText,
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
              border: `1px solid ${theme.inputBorder}`,
              borderRadius: '4px',
              background: 'transparent',
              color: theme.dialogText,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConnect}
            disabled={isConnecting || !localUrl}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              border: 'none',
              borderRadius: '4px',
              background: isConnecting ? theme.mutedText : theme.buttonBg,
              color: theme.buttonText,
              cursor: isConnecting ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isConnecting ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite' }}>⟳</span>
                Connecting...
              </>
            ) : (
              'Connect'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Status bar props */
interface ArmadaStatusBarProps {
  isConnected: boolean;
  serverUrl: string;
  mode: GraphMode;
  stats: ArmadaStats | null;
  isLoading: boolean;
  onModeChange: (mode: GraphMode) => Promise<void>;
  onRefresh: () => Promise<void>;
  onDisconnect: () => void;
  availableModes: GraphMode[];
  theme: ThemeColors;
}

/** Status bar shown when connected */
export function ArmadaStatusBar({
  isConnected,
  serverUrl,
  mode,
  stats,
  isLoading,
  onModeChange,
  onRefresh,
  onDisconnect,
  availableModes,
  theme,
}: ArmadaStatusBarProps) {
  if (!isConnected) return null;

  // Extract host from URL for display
  const host = (() => {
    try {
      const url = new URL(serverUrl);
      return url.host;
    } catch {
      return serverUrl;
    }
  })();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '4px 12px',
        background: theme.successBg,
        fontSize: '11px',
        color: theme.successText,
      }}
    >
      {/* Connection indicator */}
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ color: '#22c55e' }}>●</span>
        {host}
      </span>

      {/* Mode selector */}
      <select
        value={mode}
        onChange={(e) => onModeChange(e.target.value as GraphMode)}
        disabled={isLoading}
        style={{
          padding: '2px 6px',
          fontSize: '11px',
          border: `1px solid ${theme.inputBorder}`,
          borderRadius: '3px',
          background: theme.inputBg,
          color: theme.inputText,
          cursor: isLoading ? 'wait' : 'pointer',
        }}
      >
        {availableModes.map((m) => (
          <option key={m} value={m}>
            {MODE_LABELS[m]}
          </option>
        ))}
      </select>

      {/* Stats */}
      {stats && (
        <span style={{ color: theme.mutedText }}>
          {stats.nodes} nodes · {stats.edges} edges
        </span>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <span style={{ color: theme.mutedText }}>
          Loading...
        </span>
      )}

      {/* Spacer */}
      <span style={{ flex: 1 }} />

      {/* Refresh button */}
      <button
        onClick={onRefresh}
        disabled={isLoading}
        title="Refresh graph"
        style={{
          padding: '2px 8px',
          fontSize: '11px',
          border: 'none',
          borderRadius: '3px',
          background: 'transparent',
          color: theme.successText,
          cursor: isLoading ? 'wait' : 'pointer',
        }}
      >
        ↻
      </button>

      {/* Disconnect button */}
      <button
        onClick={onDisconnect}
        title="Disconnect from Armada"
        style={{
          padding: '2px 8px',
          fontSize: '11px',
          border: 'none',
          borderRadius: '3px',
          background: 'transparent',
          color: theme.errorText,
          cursor: 'pointer',
        }}
      >
        ✕
      </button>
    </div>
  );
}
